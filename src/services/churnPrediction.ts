/**
 * Churn Prediction Service
 *
 * Mathematical backbone of the Account Health Agent.
 * Five signals, each scored 0-20, composited to 0-100.
 *
 * Run after every behavioral_event logged for that org.
 * Debounce: max once per 4 hours per org.
 *
 * // No routes needed -- called internally by Account Health Agent
 * // and CS Pulse cron
 */

import { db } from "../database/connection";

// ─── Types ──────────────────────────────────────────────────────────

export interface ChurnScore {
  score: number; // 0-100
  health_status: "healthy" | "watch" | "at_risk" | "critical";
  signals: Record<string, number>; // individual signal scores
  top_risk_factor: string; // plain English
  recommended_action: string; // one sentence, actionable
}

// ─── Debounce Cache ─────────────────────────────────────────────────

const lastRunCache = new Map<number, number>(); // orgId → timestamp
const DEBOUNCE_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── Main Export ────────────────────────────────────────────────────

export async function getChurnScore(orgId: number): Promise<ChurnScore> {
  const org = await db("organizations").where({ id: orgId }).first();
  if (!org) {
    return {
      score: 0,
      health_status: "critical",
      signals: {},
      top_risk_factor: "Organization not found",
      recommended_action: "Verify the account exists",
    };
  }

  const signals: Record<string, number> = {};

  // ─── Signal 1: Days since last login (0-20) ─────────────────────

  const lastLogin = org.last_login_at || org.first_login_at || null;
  let daysSinceLogin = 999;
  if (lastLogin) {
    daysSinceLogin = Math.floor((Date.now() - new Date(lastLogin).getTime()) / (1000 * 60 * 60 * 24));
  }

  if (daysSinceLogin === 0) signals.login_recency = 20;
  else if (daysSinceLogin <= 7) signals.login_recency = 15;
  else if (daysSinceLogin <= 14) signals.login_recency = 10;
  else if (daysSinceLogin <= 21) signals.login_recency = 5;
  else if (daysSinceLogin <= 30) signals.login_recency = 2;
  else signals.login_recency = 0;

  // ─── Signal 2: TTFV response (0-20) ────────────────────────────

  const accountAgeDays = Math.floor(
    (Date.now() - new Date(org.created_at).getTime()) / (1000 * 60 * 60 * 24),
  );

  if (org.ttfv_response === "yes") {
    signals.ttfv = 20;
  } else if (org.ttfv_response === "not_yet") {
    signals.ttfv = 10;
  } else if (!org.ttfv_response && accountAgeDays <= 7) {
    signals.ttfv = 15; // grace period
  } else {
    signals.ttfv = 0;
  }

  // ─── Signal 3: Engagement score (0-20) ──────────────────────────

  // Use existing engagement_score if available, otherwise estimate from behavioral_events
  let engagementScore = org.engagement_score ?? null;

  if (engagementScore === null) {
    // Estimate from recent behavioral events
    const recentEvents = await db("behavioral_events")
      .where({ org_id: orgId })
      .where("created_at", ">=", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .count("* as count")
      .first();
    const eventCount = parseInt((recentEvents as any)?.count || "0", 10);
    // Rough: 0 events = 0, 1-5 = 20, 6-15 = 40, 16-30 = 60, 31+ = 80
    engagementScore = eventCount === 0 ? 0 : eventCount <= 5 ? 20 : eventCount <= 15 ? 40 : eventCount <= 30 ? 60 : 80;
  }

  if (engagementScore >= 60) signals.engagement = 20;
  else if (engagementScore >= 40) signals.engagement = 15;
  else if (engagementScore >= 20) signals.engagement = 10;
  else if (engagementScore >= 10) signals.engagement = 5;
  else signals.engagement = 0;

  // ─── Signal 4: PMS data uploaded (0-20) ─────────────────────────

  // Check if org has any PMS jobs
  const hasPmsData = await db.schema.hasTable("pms_jobs");
  let pmsUploaded = false;
  let pmsUploadAge = 999;

  if (hasPmsData) {
    const latestPms = await db("pms_jobs")
      .where({ organization_id: orgId })
      .orderBy("created_at", "desc")
      .first();
    if (latestPms) {
      pmsUploaded = true;
      pmsUploadAge = Math.floor(
        (Date.now() - new Date(latestPms.created_at).getTime()) / (1000 * 60 * 60 * 24),
      );
    }
  }

  if (pmsUploaded && pmsUploadAge <= 14) signals.pms_data = 20;
  else if (pmsUploaded) signals.pms_data = 15;
  else if (!pmsUploaded && accountAgeDays <= 14) signals.pms_data = 10; // grace
  else signals.pms_data = 0;

  // ─── Signal 5: Billing status (0-20) ───────────────────────────

  if (org.subscription_status === "active") {
    signals.billing = 20;
  } else if (org.subscription_status === "trial") {
    // Estimate days left in trial (7-day trial from created_at)
    const trialDaysLeft = 7 - accountAgeDays;
    if (trialDaysLeft > 5) signals.billing = 10;
    else if (trialDaysLeft > 0) signals.billing = 5;
    else signals.billing = 0; // trial expired
  } else {
    signals.billing = 0;
  }

  // ─── Composite ─────────────────────────────────────────────────

  const score = Object.values(signals).reduce((sum, v) => sum + v, 0);

  const health_status: ChurnScore["health_status"] =
    score >= 80 ? "healthy"
    : score >= 60 ? "watch"
    : score >= 40 ? "at_risk"
    : "critical";

  // ─── Top Risk Factor ──────────────────────────────────────────

  const { topRisk, action } = identifyTopRisk(signals, org, daysSinceLogin, accountAgeDays, pmsUploaded);

  // ─── Store Result ─────────────────────────────────────────────

  await db("organizations")
    .where({ id: orgId })
    .update({
      client_health_status: health_status,
    })
    .catch(() => {}); // column may not exist yet

  return {
    score,
    health_status,
    signals,
    top_risk_factor: topRisk,
    recommended_action: action,
  };
}

// ─── Debounced Version ──────────────────────────────────────────────

/**
 * Same as getChurnScore but debounced to max once per 4 hours per org.
 * Use this for event-triggered calls to avoid excessive computation.
 */
export async function getChurnScoreDebounced(orgId: number): Promise<ChurnScore | null> {
  const lastRun = lastRunCache.get(orgId);
  if (lastRun && Date.now() - lastRun < DEBOUNCE_MS) {
    return null; // skipped, too recent
  }

  lastRunCache.set(orgId, Date.now());
  return getChurnScore(orgId);
}

// ─── Helpers ────────────────────────────────────────────────────────

function identifyTopRisk(
  signals: Record<string, number>,
  org: any,
  daysSinceLogin: number,
  accountAgeDays: number,
  pmsUploaded: boolean,
): { topRisk: string; action: string } {
  // Find the lowest-scoring signal
  const sorted = Object.entries(signals).sort((a, b) => a[1] - b[1]);
  const [worstSignal, worstScore] = sorted[0];

  switch (worstSignal) {
    case "login_recency":
      return {
        topRisk: daysSinceLogin > 30
          ? `hasn't logged in for ${daysSinceLogin} days`
          : `last login was ${daysSinceLogin} days ago`,
        action: `Text ${org.name || "the doctor"} with their latest ranking change. Give them a reason to open the app.`,
      };

    case "ttfv":
      return {
        topRisk: "never acknowledged first value",
        action: `Send a personal message highlighting one specific finding from their Checkup. Make it about their practice, not about Alloro.`,
      };

    case "engagement":
      return {
        topRisk: "very low engagement with the platform",
        action: `Check if their One Action Card is relevant. If it's showing a generic message, there may be no ranking data yet. Trigger a manual ranking scan.`,
      };

    case "pms_data":
      if (!pmsUploaded && accountAgeDays > 14) {
        return {
          topRisk: "hasn't uploaded scheduling data after 14 days",
          action: `Ask if they need help with the upload. Most doctors don't know they can just take a photo of a report. Send the 3-option upload screen.`,
        };
      }
      return {
        topRisk: "PMS data is stale",
        action: `Prompt for a fresh data upload. The referral intelligence is only as current as the last upload.`,
      };

    case "billing":
      if (org.subscription_status === "trial") {
        return {
          topRisk: "trial is expiring soon with no conversion signal",
          action: `Send the progress report showing what Alloro found during the trial. Lead with their score improvement, not with pricing.`,
        };
      }
      return {
        topRisk: "billing is not active",
        action: `Check if there was a payment failure. If voluntary cancellation, surface the dollar value of intelligence they'll lose.`,
      };

    default:
      return {
        topRisk: "multiple signals flagged",
        action: `Schedule a personal check-in. Something isn't landing.`,
      };
  }
}

// No routes needed -- called internally by Account Health Agent and CS Pulse cron
