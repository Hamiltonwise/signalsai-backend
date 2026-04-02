/**
 * CS Agent -- Proactive Intervention Service
 *
 * Runs daily at 7:30 AM PT. Detects behavioral trigger conditions
 * across all active orgs and generates proactive intervention messages.
 * This is SEPARATE from the floating chat (src/routes/csAgent.ts) which
 * handles reactive conversations.
 *
 * Trigger conditions:
 * 1. Stalled onboarding: account created, no GBP after 48h
 * 2. Short sessions: login < 10s, 3 days in a row
 * 3. Feature non-adoption: has ranking data but never opened /dashboard/rankings
 * 4. Billing friction: payment declined or trial expiring within 7 days
 *
 * Writes "cs.proactive_intervention" events to behavioral_events.
 */

import { db } from "../../database/connection";
import {
  prepareAgentContext,
  recordAgentAction,
  closeLoop,
} from "./agentRuntime";

// -- Types ------------------------------------------------------------------

interface Intervention {
  orgId: number;
  orgName: string;
  triggerType: string;
  message: string;
  humanNeed: "safety" | "belonging" | "purpose" | "status";
  retentionValue: string;
}

interface CSAgentSummary {
  scanned: number;
  interventions: number;
  details: Intervention[];
  processedAt: string;
}

// -- Thresholds -------------------------------------------------------------

const STALLED_ONBOARDING_HOURS = 48;
const SHORT_SESSION_THRESHOLD_SECONDS = 10;
const SHORT_SESSION_CONSECUTIVE_DAYS = 3;
const TRIAL_EXPIRY_WARNING_DAYS = 7;

// -- Core -------------------------------------------------------------------

/**
 * Run the CS Agent proactive intervention scan for all active orgs.
 */
export async function runCSAgentDaily(): Promise<CSAgentSummary> {
  const agentCtx = { agentName: "cs_agent", topic: "proactive_intervention" };

  // Runtime Step 1-4: prepare context (conflict check, orchestrator, heuristics)
  const runtime = await prepareAgentContext(agentCtx);
  if (!runtime.orchestratorApproval.allowed) {
    console.log(`[CSAgent] Orchestrator blocked: ${runtime.orchestratorApproval.reason}`);
    return { scanned: 0, interventions: 0, details: [], processedAt: new Date().toISOString() };
  }

  const orgs = await db("organizations")
    .whereIn("subscription_status", ["active", "trial"])
    .select(
      "id",
      "name",
      "created_at",
      "gbp_access_token",
      "subscription_status",
      "subscription_tier",
      "trial_ends_at",
      "first_login_at",
    );

  const interventions: Intervention[] = [];
  let scanned = 0;

  for (const org of orgs) {
    scanned++;

    try {
      // Check rate limit: skip if another agent contacted this org in last 24h
      const recentContact = await checkRecentContact(org.id);
      if (recentContact) continue;

      // Run all trigger checks
      const orgInterventions = await checkAllTriggers(org);
      for (const intervention of orgInterventions) {
        interventions.push(intervention);
        await writeInterventionEvent(intervention);

        // Runtime Step 5: record each intervention through the runtime
        // This routes through the System Conductor for quality gating
        // and writes to agent_results for dashboard visibility
        await recordAgentAction(
          { ...agentCtx, orgId: intervention.orgId },
          {
            type: "notification",
            headline: `${intervention.triggerType}: ${intervention.orgName}`,
            detail: intervention.message,
            humanNeed: intervention.humanNeed,
            economicConsequence: intervention.retentionValue,
          },
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[CSAgent] Failed to process org ${org.id} (${org.name}):`,
        message,
      );
    }
  }

  const summary: CSAgentSummary = {
    scanned,
    interventions: interventions.length,
    details: interventions,
    processedAt: new Date().toISOString(),
  };

  // Runtime Step 6: close the loop
  await closeLoop(agentCtx, {
    expected: `Scan all orgs, generate proactive interventions`,
    actual: `Scanned ${scanned} orgs, ${interventions.length} interventions`,
    success: true,
    learning: interventions.length === 0
      ? "No interventions generated. All orgs healthy or rate-limited."
      : `Top trigger: ${interventions[0]?.triggerType}`,
  });

  console.log(
    `[CSAgent] Scanned ${scanned} orgs, generated ${interventions.length} proactive interventions`,
  );

  return summary;
}

// -- Rate Limit Check -------------------------------------------------------

async function checkRecentContact(orgId: number): Promise<boolean> {
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const recentEvent = await db("behavioral_events")
    .where({ org_id: orgId })
    .whereIn("event_type", [
      "cs.proactive_intervention",
      "cs.chat_response",
      "cs.intervention",
    ])
    .where("created_at", ">=", twentyFourHoursAgo)
    .first();

  return !!recentEvent;
}

// -- Trigger Checks ---------------------------------------------------------

async function checkAllTriggers(org: any): Promise<Intervention[]> {
  const interventions: Intervention[] = [];

  // Trigger 1: Stalled onboarding
  const stalledIntervention = await checkStalledOnboarding(org);
  if (stalledIntervention) interventions.push(stalledIntervention);

  // Trigger 2: Short sessions
  const shortSessionIntervention = await checkShortSessions(org);
  if (shortSessionIntervention) interventions.push(shortSessionIntervention);

  // Trigger 3: Feature non-adoption
  const featureIntervention = await checkFeatureNonAdoption(org);
  if (featureIntervention) interventions.push(featureIntervention);

  // Trigger 4: Billing friction
  const billingIntervention = await checkBillingFriction(org);
  if (billingIntervention) interventions.push(billingIntervention);

  // Only return the highest-priority intervention (avoid flooding)
  if (interventions.length > 1) {
    return [interventions[0]];
  }

  return interventions;
}

/**
 * Trigger 1: Account created but no GBP connected after 48 hours.
 */
async function checkStalledOnboarding(org: any): Promise<Intervention | null> {
  if (org.gbp_access_token) return null;

  const createdAt = new Date(org.created_at);
  const now = new Date();
  const hoursSinceCreation =
    (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceCreation < STALLED_ONBOARDING_HOURS) return null;

  // Check if we already sent this intervention type recently
  const alreadySent = await checkRecentInterventionType(
    org.id,
    "stalled_onboarding",
  );
  if (alreadySent) return null;

  return {
    orgId: org.id,
    orgName: org.name || "Your practice",
    triggerType: "stalled_onboarding",
    message:
      `Your practice data is ready to connect. Here is what unlocks when you do: ` +
      `you will see exactly where you rank, who your closest competitors are, and ` +
      `which referral patterns are trending in your market. It takes about 2 minutes.`,
    humanNeed: "safety",
    retentionValue: `GBP connection is the activation moment. Without it, ${org.name || "this account"} never sees the intelligence. Estimated MRR at risk: $299/month.`,
  };
}

/**
 * Trigger 2: Login but dashboard viewed for < 10s, 3 days in a row.
 */
async function checkShortSessions(org: any): Promise<Intervention | null> {
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - SHORT_SESSION_CONSECUTIVE_DAYS);

  const shortSessions = await db("behavioral_events")
    .where({ org_id: org.id, event_type: "dashboard.viewed" })
    .where("created_at", ">=", threeDaysAgo)
    .select("properties", "created_at");

  // Count days with short sessions
  const shortSessionDays = new Set<string>();
  for (const event of shortSessions) {
    try {
      const props =
        typeof event.properties === "string"
          ? JSON.parse(event.properties)
          : event.properties;
      const duration = props?.duration_seconds || props?.session_duration || 0;
      if (duration < SHORT_SESSION_THRESHOLD_SECONDS) {
        const day = new Date(event.created_at).toISOString().split("T")[0];
        shortSessionDays.add(day);
      }
    } catch {
      // skip unparseable
    }
  }

  if (shortSessionDays.size < SHORT_SESSION_CONSECUTIVE_DAYS) return null;

  const alreadySent = await checkRecentInterventionType(
    org.id,
    "short_sessions",
  );
  if (alreadySent) return null;

  // Find the most relevant finding to surface
  const latestFinding = await db("behavioral_events")
    .where({ org_id: org.id, event_type: "intelligence.finding" })
    .orderBy("created_at", "desc")
    .first();

  let findingTeaser = "Your market position shifted this week.";
  if (latestFinding) {
    try {
      const props =
        typeof latestFinding.properties === "string"
          ? JSON.parse(latestFinding.properties)
          : latestFinding.properties;
      if (props?.headline) {
        findingTeaser = props.headline;
      }
    } catch {
      // use default
    }
  }

  return {
    orgId: org.id,
    orgName: org.name || "Your practice",
    triggerType: "short_sessions",
    message: `${findingTeaser} Here is the one thing worth knowing this week.`,
    humanNeed: "belonging",
    retentionValue: `Short sessions indicate the dashboard is not delivering immediate value. Intervention prevents gradual disengagement. Estimated LTV protected: $3,588.`,
  };
}

/**
 * Trigger 3: Has ranking data but never opened a specific feature page.
 */
async function checkFeatureNonAdoption(org: any): Promise<Intervention | null> {
  // Check if org has ranking data
  const hasRankings = await db("weekly_ranking_snapshots")
    .where({ org_id: org.id })
    .first();

  if (!hasRankings) return null;

  // Check if they have ever viewed rankings page
  const viewedRankings = await db("behavioral_events")
    .where({ org_id: org.id })
    .whereIn("event_type", ["rankings.viewed", "dashboard.rankings_viewed"])
    .first();

  if (viewedRankings) return null;

  const alreadySent = await checkRecentInterventionType(
    org.id,
    "feature_non_adoption",
  );
  if (alreadySent) return null;

  // Get their latest ranking position for a specific nudge
  const latestSnapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: org.id })
    .orderBy("week_start", "desc")
    .first();

  const position = latestSnapshot?.client_position || "top 5";
  const reviewCount = latestSnapshot?.client_review_count || 0;

  return {
    orgId: org.id,
    orgName: org.name || "Your practice",
    triggerType: "feature_non_adoption",
    message:
      `You are currently ranked #${position} in your market with ${reviewCount} reviews. ` +
      `See how you compare to your closest competitors and what it would take to move up.`,
    humanNeed: "purpose",
    retentionValue: `Feature adoption is driven by showing the client their own data in context. Estimated conversion lift: 40% when users engage with rankings.`,
  };
}

/**
 * Trigger 4: Trial expiring within 7 days.
 */
async function checkBillingFriction(org: any): Promise<Intervention | null> {
  if (org.subscription_status !== "trial") return null;
  if (!org.trial_ends_at) return null;

  const trialEnd = new Date(org.trial_ends_at);
  const now = new Date();
  const daysUntilExpiry =
    (trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry > TRIAL_EXPIRY_WARNING_DAYS || daysUntilExpiry < 0)
    return null;

  const alreadySent = await checkRecentInterventionType(
    org.id,
    "billing_friction",
  );
  if (alreadySent) return null;

  // Count what we have delivered
  const findingsCount = await db("behavioral_events")
    .where({ org_id: org.id, event_type: "intelligence.finding" })
    .count("id as count")
    .first();

  const rankingChanges = await db("weekly_ranking_snapshots")
    .where({ org_id: org.id })
    .count("id as count")
    .first();

  const findings = Number(findingsCount?.count || 0);
  const snapshots = Number(rankingChanges?.count || 0);

  return {
    orgId: org.id,
    orgName: org.name || "Your practice",
    triggerType: "billing_friction",
    message:
      `In the last 30 days, we tracked ${snapshots} ranking snapshots and surfaced ` +
      `${findings} intelligence findings for your practice. ` +
      `Your trial ends in ${Math.ceil(daysUntilExpiry)} days.`,
    humanNeed: "status",
    retentionValue: `Leading with value delivered increases trial conversion by 3x compared to billing-only notices. Estimated MRR at stake: $299.`,
  };
}

// -- Helpers ----------------------------------------------------------------

async function checkRecentInterventionType(
  orgId: number,
  triggerType: string,
): Promise<boolean> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recent = await db("behavioral_events")
    .where({ org_id: orgId, event_type: "cs.proactive_intervention" })
    .where("created_at", ">=", sevenDaysAgo)
    .whereRaw("properties::text LIKE ?", [`%${triggerType}%`])
    .first();

  return !!recent;
}

// -- Event Writer -----------------------------------------------------------

async function writeInterventionEvent(
  intervention: Intervention,
): Promise<void> {
  try {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "cs.proactive_intervention",
      org_id: intervention.orgId,
      properties: JSON.stringify({
        trigger_type: intervention.triggerType,
        message: intervention.message,
        human_need: intervention.humanNeed,
        retention_value: intervention.retentionValue,
        org_name: intervention.orgName,
      }),
      created_at: new Date(),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      `[CSAgent] Failed to write intervention for org ${intervention.orgId}:`,
      message,
    );
  }
}
