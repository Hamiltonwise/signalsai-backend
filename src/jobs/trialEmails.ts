/**
 * 7-Day Trial Email Chain
 *
 * WO-TRIAL-CRON: Onboarding sequence triggered at account creation.
 * NOT a cron -- a scheduled job chain. Seven emails at exact intervals.
 *
 * Stops if org.subscription_status = 'active' (they converted).
 * Logs each send to behavioral_events as 'trial_email.sent'.
 */

import axios from "axios";
import { db } from "../database/connection";
import { BehavioralEventModel } from "../models/BehavioralEventModel";

// ─── Email Schedule ─────────────────────────────────────────────────

interface TrialEmail {
  sequenceNumber: number;
  delayHours: number;
  subject: string;
  emailType: string;
}

const TRIAL_SEQUENCE: TrialEmail[] = [
  { sequenceNumber: 1, delayHours: 0,   subject: "Welcome. Here's what we found.",         emailType: "welcome" },
  { sequenceNumber: 2, delayHours: 24,  subject: "Your first finding, explained.",          emailType: "first_finding" },
  { sequenceNumber: 3, delayHours: 48,  subject: "The competitor you should know about.",   emailType: "competitor" },
  { sequenceNumber: 4, delayHours: 72,  subject: "What happens Monday morning.",            emailType: "monday_preview" },
  { sequenceNumber: 5, delayHours: 96,  subject: "One question.",                           emailType: "one_question" },
  { sequenceNumber: 6, delayHours: 120, subject: "Here's what moved this week.",              emailType: "market_update" },
  { sequenceNumber: 7, delayHours: 144, subject: "Your Monday emails start here.",           emailType: "trial_ending" },
];

// ─── Enqueue Trial Chain ────────────────────────────────────────────

/**
 * Start the 7-day trial email chain for an org.
 * Called when account_created fires.
 * Sets trial_emails_started_at and begins processing.
 */
export async function enqueueTrialEmailChain(orgId: number): Promise<void> {
  try {
    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) return;

    // Don't restart if already started
    if (org.trial_emails_started_at) {
      console.log(`[TrialEmails] Chain already started for org ${orgId}, skipping`);
      return;
    }

    // Mark chain as started
    await db("organizations")
      .where({ id: orgId })
      .update({
        trial_emails_started_at: new Date(),
        trial_email_sequence_position: 0,
      });

    console.log(`[TrialEmails] Chain enqueued for org ${orgId}`);

    // Send email 1 immediately
    await processTrialEmail(orgId, 1);
  } catch (error: any) {
    console.error(`[TrialEmails] Failed to enqueue chain for org ${orgId}:`, error.message);
  }
}

// ─── Process Single Email ───────────────────────────────────────────

/**
 * Send a single trial email for an org at a given sequence position.
 * Called by the chain processor or BullMQ delayed job.
 */
export async function processTrialEmail(
  orgId: number,
  sequenceNumber: number,
): Promise<boolean> {
  try {
    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) return false;

    // Stop if they converted
    if (org.subscription_status === "active") {
      console.log(`[TrialEmails] Org ${orgId} converted, stopping chain at email ${sequenceNumber}`);
      return false;
    }

    const emailDef = TRIAL_SEQUENCE.find((e) => e.sequenceNumber === sequenceNumber);
    if (!emailDef) return false;

    // Get practice data for email content
    const user = org.owner_user_id
      ? await db("users").where({ id: org.owner_user_id }).first()
      : await db("organization_users")
          .where({ organization_id: orgId, role: "admin" })
          .join("users", "users.id", "organization_users.user_id")
          .first();

    // Get latest ranking data
    const latestRanking = await db("practice_rankings")
      .where({ organization_id: orgId, status: "completed" })
      .orderBy("created_at", "desc")
      .first();

    const rawData = latestRanking?.raw_data
      ? typeof latestRanking.raw_data === "string"
        ? JSON.parse(latestRanking.raw_data)
        : latestRanking.raw_data
      : null;

    const topCompetitor = rawData?.competitors?.[0];

    // Calculate trial end date (7 days from start)
    const trialStart = org.trial_emails_started_at || org.created_at;
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + 7);

    // Build n8n payload
    const webhookUrl = process.env.ALLORO_N8N_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn(`[TrialEmails] ALLORO_N8N_WEBHOOK_URL not set, skipping email ${sequenceNumber} for org ${orgId}`);
      // Still update position so chain doesn't stall
      await updateSequencePosition(orgId, sequenceNumber);
      return true;
    }

    const payload = {
      email_sequence_number: sequenceNumber,
      email_type: "trial",
      practice_name: org.name || "Your Practice",
      doctor_name: user?.first_name || user?.name || "Doctor",
      recipient_email: user?.email || null,
      subject_line: emailDef.subject,
      checkup_score: latestRanking?.rank_score ? Number(latestRanking.rank_score) : null,
      top_competitor_name: topCompetitor?.name || topCompetitor?.displayName?.text || null,
      finding_headline: latestRanking
        ? `${latestRanking.competitor_name ? `${latestRanking.competitor_name} is your top competitor` : "Your market is being tracked"}`
        : "Your first market scan is running",
      action_text: getActionText(sequenceNumber),
      action_url: getActionUrl(sequenceNumber),
      trial_end_date: trialEnd.toISOString().split("T")[0],
    };

    // Send to n8n
    await axios.post(webhookUrl, payload, { timeout: 15000 }).catch((err) => {
      console.error(`[TrialEmails] n8n webhook failed for org ${orgId} email ${sequenceNumber}:`, err.message);
    });

    // Update sequence position
    await updateSequencePosition(orgId, sequenceNumber);

    // Log to behavioral_events
    BehavioralEventModel.create({
      event_type: "trial_email.sent",
      org_id: orgId,
      properties: {
        sequence_number: sequenceNumber,
        email_type: emailDef.emailType,
        subject: emailDef.subject,
      },
    }).catch(() => {});

    console.log(`[TrialEmails] Sent email ${sequenceNumber}/7 to org ${orgId}`);
    return true;
  } catch (error: any) {
    console.error(`[TrialEmails] Failed to process email ${sequenceNumber} for org ${orgId}:`, error.message);
    return false;
  }
}

// ─── Chain Runner (for BullMQ or manual trigger) ────────────────────

/**
 * Process pending trial emails for all orgs.
 * Called by BullMQ repeatable job every hour, or manually.
 * Checks which orgs have emails due based on elapsed time.
 */
export async function processAllPendingTrialEmails(): Promise<{
  processed: number;
  skipped: number;
  converted: number;
}> {
  let processed = 0;
  let skipped = 0;
  let converted = 0;

  try {
    // Find all orgs with active trial chains that haven't finished
    const orgs = await db("organizations")
      .whereNotNull("trial_emails_started_at")
      .where("trial_email_sequence_position", "<", 7)
      .select("id", "trial_emails_started_at", "trial_email_sequence_position", "subscription_status");

    for (const org of orgs) {
      // Stop if converted
      if (org.subscription_status === "active") {
        converted++;
        continue;
      }

      const startTime = new Date(org.trial_emails_started_at).getTime();
      const currentPosition = org.trial_email_sequence_position || 0;
      const nextEmail = TRIAL_SEQUENCE.find((e) => e.sequenceNumber === currentPosition + 1);

      if (!nextEmail) {
        skipped++;
        continue;
      }

      // Check if enough time has elapsed for the next email
      const dueTime = startTime + nextEmail.delayHours * 60 * 60 * 1000;
      if (Date.now() >= dueTime) {
        const sent = await processTrialEmail(org.id, nextEmail.sequenceNumber);
        if (sent) processed++;
        else skipped++;
      } else {
        skipped++;
      }
    }
  } catch (error: any) {
    console.error("[TrialEmails] processAllPending error:", error.message);
  }

  console.log(`[TrialEmails] Processed: ${processed}, Skipped: ${skipped}, Converted: ${converted}`);
  return { processed, skipped, converted };
}

// ─── Helpers ────────────────────────────────────────────────────────

async function updateSequencePosition(orgId: number, position: number): Promise<void> {
  await db("organizations")
    .where({ id: orgId })
    .update({ trial_email_sequence_position: position });
}

function getActionText(seq: number): string {
  switch (seq) {
    case 1: return "See your readings";
    case 2: return "View your finding";
    case 3: return "See the comparison";
    case 4: return "Preview your Monday brief";
    case 5: return "Answer one question";
    case 6: return "See what changed";
    case 7: return "Keep your Monday emails coming";
    default: return "Open your dashboard";
  }
}

function getActionUrl(seq: number): string {
  switch (seq) {
    case 1: return "/dashboard";
    case 2: return "/dashboard";
    case 3: return "/dashboard/rankings";
    case 4: return "/dashboard";
    case 5: return "/dashboard";
    case 6: return "/dashboard/rankings";
    case 7: return "/settings/billing";
    default: return "/dashboard";
  }
}

// T2 registers any new endpoints
