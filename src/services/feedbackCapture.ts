/**
 * Client Feedback Capture Service
 *
 * Three feedback triggers that build the full feedback loop:
 * 1. Post-Monday-email: one-question email 48h after first Monday email
 * 2. Post-PatientPath: in-app prompt when preview is ready
 * 3. 30-day NPS: email at 30 days active
 *
 * All responses logged to behavioral_events.
 * NPS >= 9 triggers CS Expander. NPS <= 6 creates Corey task.
 */

import axios from "axios";
import { db } from "../database/connection";
import { BehavioralEventModel } from "../models/BehavioralEventModel";

const N8N_WEBHOOK_URL = process.env.ALLORO_N8N_WEBHOOK_URL;

// ─── Types ──────────────────────────────────────────────────────────

export interface FeedbackResult {
  orgId: number;
  feedbackType: "monday_email" | "patientpath_preview" | "nps";
  response: string;
  score?: number;
}

// ─── Trigger 1: Post-Monday-Email Feedback ──────────────────────────

/**
 * Send one-question feedback email 48 hours after first Monday email.
 * "Did this week's email tell you something you didn't know? Reply YES or NO."
 *
 * Called by Monday email cron when week_number = 1, scheduled +48h.
 */
export async function sendMondayEmailFeedbackRequest(orgId: number): Promise<void> {
  try {
    const org = await db("organizations").where({ id: orgId }).first();
    if (!org) return;

    const adminUser = await db("organization_users")
      .where({ organization_id: orgId, role: "admin" })
      .join("users", "users.id", "organization_users.user_id")
      .first();

    if (!adminUser?.email) return;

    if (!N8N_WEBHOOK_URL) {
      console.warn("[Feedback] N8N webhook not set, skipping monday email feedback");
      return;
    }

    await axios.post(N8N_WEBHOOK_URL, {
      email_type: "feedback_monday",
      recipient_email: adminUser.email,
      practice_name: org.name,
      doctor_name: adminUser.first_name || adminUser.name || "Doctor",
      subject_line: "Quick question about this week's email",
      question: "Did this week's email tell you something you didn't know? Reply YES or NO.",
    }, { timeout: 15000 }).catch((err: any) => {
      console.error("[Feedback] Monday email feedback send failed:", err.message);
    });

    // Log that we sent the request
    await BehavioralEventModel.create({
      event_type: "feedback.monday_email_requested",
      org_id: orgId,
      properties: { week_number: 1 },
    });

    console.log(`[Feedback] Monday email feedback request sent to org ${orgId}`);
  } catch (error: any) {
    console.error("[Feedback] sendMondayEmailFeedbackRequest error:", error.message);
  }
}

// ─── Trigger 2: PatientPath Preview Feedback ────────────────────────

/**
 * Check if an org should see the PatientPath feedback prompt.
 * Returns the prompt config if patientpath_status = 'preview_ready'
 * and feedback hasn't been captured yet.
 *
 * Called by the dashboard context endpoint to include in response.
 */
export async function getPatientPathFeedbackPrompt(orgId: number): Promise<{
  show: boolean;
  question: string;
  options: string[];
} | null> {
  try {
    const org = await db("organizations").where({ id: orgId }).first();
    if (!org || org.patientpath_status !== "preview_ready") return null;

    // Check if feedback already captured
    const existing = await db("behavioral_events")
      .where({ org_id: orgId, event_type: "feedback.patientpath_preview" })
      .first();

    if (existing) return null;

    return {
      show: true,
      question: "Your PatientPath site is ready. Does it sound like you?",
      options: ["Yes, it does", "Not quite"],
    };
  } catch {
    return null;
  }
}

/**
 * Record PatientPath preview feedback.
 */
export async function recordPatientPathFeedback(
  orgId: number,
  response: "yes" | "not_quite",
): Promise<void> {
  await BehavioralEventModel.create({
    event_type: "feedback.patientpath_preview",
    org_id: orgId,
    properties: { response, sounds_like_them: response === "yes" },
  });

  console.log(`[Feedback] PatientPath preview feedback for org ${orgId}: ${response}`);
}

// ─── Trigger 3: 30-Day NPS ──────────────────────────────────────────

/**
 * Check all orgs that hit 30 days active and haven't received NPS yet.
 * Called by a daily cron (or manually).
 */
export async function sendPendingNPSRequests(): Promise<number> {
  let sent = 0;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Find orgs created ~30 days ago that are active and haven't gotten NPS
    const eligibleOrgs = await db("organizations")
      .where("created_at", "<=", thirtyDaysAgo)
      .whereIn("subscription_status", ["active", "trial"])
      .select("id", "name", "created_at");

    for (const org of eligibleOrgs) {
      // Check if NPS already sent
      const existing = await db("behavioral_events")
        .where({ org_id: org.id })
        .whereIn("event_type", ["feedback.nps", "feedback.nps_requested"])
        .first();

      if (existing) continue;

      await sendNPSEmail(org.id);
      sent++;
    }
  } catch (error: any) {
    console.error("[Feedback] sendPendingNPSRequests error:", error.message);
  }

  console.log(`[Feedback] Sent ${sent} NPS requests`);
  return sent;
}

async function sendNPSEmail(orgId: number): Promise<void> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) return;

  const adminUser = await db("organization_users")
    .where({ organization_id: orgId, role: "admin" })
    .join("users", "users.id", "organization_users.user_id")
    .first();

  if (!adminUser?.email || !N8N_WEBHOOK_URL) return;

  await axios.post(N8N_WEBHOOK_URL, {
    email_type: "feedback_nps",
    recipient_email: adminUser.email,
    practice_name: org.name,
    doctor_name: adminUser.first_name || adminUser.name || "Doctor",
    subject_line: "One number, 2 seconds",
    question: "How likely are you to recommend Alloro to a colleague? (1-10)",
  }, { timeout: 15000 }).catch((err: any) => {
    console.error("[Feedback] NPS email send failed:", err.message);
  });

  await BehavioralEventModel.create({
    event_type: "feedback.nps_requested",
    org_id: orgId,
    properties: {},
  });
}

/**
 * Record an NPS response. Triggers downstream actions.
 * Score >= 9: trigger CS Expander for this org
 * Score <= 6: create dream_team_task for Corey
 */
export async function recordNPSResponse(
  orgId: number,
  score: number,
): Promise<void> {
  // Validate score
  const clampedScore = Math.max(1, Math.min(10, Math.round(score)));

  await BehavioralEventModel.create({
    event_type: "feedback.nps",
    org_id: orgId,
    properties: { score: clampedScore },
  });

  const org = await db("organizations").where({ id: orgId }).first();
  const orgName = org?.name || `Org #${orgId}`;

  console.log(`[Feedback] NPS response for ${orgName}: ${clampedScore}`);

  // Promoter: trigger expansion opportunity
  if (clampedScore >= 9) {
    // Log expansion trigger for CS Expander agent to pick up
    await BehavioralEventModel.create({
      event_type: "expansion.nps_promoter",
      org_id: orgId,
      properties: { nps_score: clampedScore, org_name: orgName },
    });

    console.log(`[Feedback] Promoter detected: ${orgName} (NPS ${clampedScore}). CS Expander will pick up.`);
  }

  // Detractor: create task for Corey
  if (clampedScore <= 6) {
    const hasDreamTeamTasks = await db.schema.hasTable("dream_team_tasks");
    if (hasDreamTeamTasks) {
      await db("dream_team_tasks")
        .insert({
          owner: "Corey",
          title: `Detractor -- ${orgName} -- score ${clampedScore} -- personal outreach`,
          description: `NPS score ${clampedScore}/10. This client needs a personal conversation about what isn't landing.`,
          status: "pending",
          source: "feedback_nps",
          organization_id: orgId,
        })
        .catch((err: any) => {
          console.error("[Feedback] Failed to create detractor task:", err.message);
        });
    }

    console.log(`[Feedback] Detractor detected: ${orgName} (NPS ${clampedScore}). Task created for Corey.`);
  }
}

// T2 registers feedback webhook if needed
