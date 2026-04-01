/**
 * Feedback Loop Service -- The Karpathy Loop for Monday Emails
 *
 * Recommend one action. Track whether the metric improved.
 * Feed the data back into the heuristics. The system gets smarter every week.
 *
 * Phase 1 (this build): Track and log. Data collection starts immediately.
 * Phase 2 (after 4+ weeks of data): Heuristic weight adjustments.
 */

import { db } from "../database/connection";

// ---- Types ----------------------------------------------------------------

export type ActionType =
  | "review_response"
  | "referral_outreach"
  | "competitor_monitor"
  | "gbp_optimize";

export interface EmailOutcomeInsert {
  org_id: number;
  email_sent_at: Date;
  action_type: ActionType;
  recommended_action: string;
  metric_name: string;
  metric_baseline: number;
}

export interface ActionTypeStats {
  action_type: string;
  total_measured: number;
  avg_improvement_pct: number;
  positive_outcome_rate: number;
}

// ---- Metric Name Mapping --------------------------------------------------

const ACTION_METRIC_MAP: Record<ActionType, string> = {
  review_response: "review_count",
  referral_outreach: "referral_source_count",
  competitor_monitor: "ranking_position",
  gbp_optimize: "gbp_completeness_score",
};

export function getMetricNameForAction(actionType: ActionType): string {
  return ACTION_METRIC_MAP[actionType] || "unknown";
}

// ---- Record Outcome at Send Time ------------------------------------------

export async function recordEmailOutcome(
  outcome: EmailOutcomeInsert
): Promise<string | null> {
  const hasTable = await db.schema.hasTable("email_outcomes");
  if (!hasTable) {
    console.warn("[FeedbackLoop] email_outcomes table does not exist yet, skipping");
    return null;
  }

  try {
    const [row] = await db("email_outcomes")
      .insert({
        org_id: outcome.org_id,
        email_sent_at: outcome.email_sent_at,
        action_type: outcome.action_type,
        recommended_action: outcome.recommended_action,
        metric_name: outcome.metric_name,
        metric_baseline: outcome.metric_baseline,
      })
      .returning("id");

    const id = typeof row === "object" ? row.id : row;
    console.log(
      `[FeedbackLoop] Recorded outcome for org ${outcome.org_id}: ${outcome.action_type} (baseline: ${outcome.metric_baseline})`
    );
    return id;
  } catch (err: any) {
    console.error("[FeedbackLoop] Failed to record outcome:", err.message);
    return null;
  }
}

// ---- Measure Outcomes (runs Tuesday, 7+ days after email) -----------------

export async function measurePendingOutcomes(): Promise<{
  measured: number;
  errors: number;
}> {
  const hasTable = await db.schema.hasTable("email_outcomes");
  if (!hasTable) return { measured: 0, errors: 0 };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Find unmeasured outcomes where the email was sent 7+ days ago
  const pending = await db("email_outcomes")
    .whereNull("outcome_measured_at")
    .where("email_sent_at", "<=", sevenDaysAgo)
    .select("*");

  if (pending.length === 0) {
    console.log("[FeedbackLoop] No pending outcomes to measure");
    return { measured: 0, errors: 0 };
  }

  console.log(`[FeedbackLoop] Measuring ${pending.length} pending outcome(s)`);

  let measured = 0;
  let errors = 0;

  for (const outcome of pending) {
    try {
      const currentValue = await getCurrentMetricValue(
        outcome.org_id,
        outcome.action_type as ActionType
      );

      if (currentValue === null) {
        console.warn(
          `[FeedbackLoop] Could not fetch current metric for org ${outcome.org_id}, action ${outcome.action_type}`
        );
        errors++;
        continue;
      }

      const baseline = parseFloat(outcome.metric_baseline);
      let improvementPct = 0;

      if (baseline !== 0) {
        // For ranking_position, lower is better, so invert the calculation
        if (outcome.action_type === "competitor_monitor") {
          improvementPct = ((baseline - currentValue) / baseline) * 100;
        } else {
          improvementPct = ((currentValue - baseline) / baseline) * 100;
        }
      } else if (currentValue > 0) {
        improvementPct = 100; // went from 0 to something
      }

      await db("email_outcomes").where({ id: outcome.id }).update({
        metric_current: currentValue,
        outcome_measured_at: new Date(),
        improvement_pct: Math.round(improvementPct * 100) / 100,
      });

      // Log to behavioral_events
      await logBehavioralEvent(outcome.org_id, "feedback_loop.outcome_measured", {
        email_outcome_id: outcome.id,
        action_type: outcome.action_type,
        metric_name: outcome.metric_name,
        baseline,
        current: currentValue,
        improvement_pct: Math.round(improvementPct * 100) / 100,
      });

      measured++;
      console.log(
        `[FeedbackLoop] Measured org ${outcome.org_id}: ${outcome.action_type} baseline=${baseline} current=${currentValue} improvement=${improvementPct.toFixed(1)}%`
      );
    } catch (err: any) {
      console.error(
        `[FeedbackLoop] Error measuring outcome ${outcome.id}:`,
        err.message
      );
      errors++;
    }
  }

  return { measured, errors };
}

// ---- Aggregate Heuristic Stats --------------------------------------------

export async function aggregateHeuristicStats(): Promise<ActionTypeStats[]> {
  const hasTable = await db.schema.hasTable("email_outcomes");
  if (!hasTable) return [];

  const stats = await db("email_outcomes")
    .whereNotNull("outcome_measured_at")
    .select("action_type")
    .count("* as total_measured")
    .avg("improvement_pct as avg_improvement_pct")
    .select(
      db.raw(
        "ROUND(COUNT(CASE WHEN improvement_pct > 0 THEN 1 END)::numeric / NULLIF(COUNT(*)::numeric, 0) * 100, 2) as positive_outcome_rate"
      )
    )
    .groupBy("action_type")
    .orderBy("avg_improvement_pct", "desc");

  // Log aggregated stats to behavioral_events
  if (stats.length > 0) {
    await logBehavioralEvent(null, "feedback_loop.heuristic_update", {
      stats: stats.map((s: any) => ({
        action_type: s.action_type,
        total_measured: parseInt(s.total_measured, 10),
        avg_improvement_pct: parseFloat(s.avg_improvement_pct) || 0,
        positive_outcome_rate: parseFloat(s.positive_outcome_rate) || 0,
      })),
      measured_at: new Date().toISOString(),
    });
  }

  return stats.map((s: any) => ({
    action_type: s.action_type,
    total_measured: parseInt(s.total_measured, 10),
    avg_improvement_pct: parseFloat(s.avg_improvement_pct) || 0,
    positive_outcome_rate: parseFloat(s.positive_outcome_rate) || 0,
  }));
}

// ---- Current Metric Fetchers ----------------------------------------------

async function getCurrentMetricValue(
  orgId: number,
  actionType: ActionType
): Promise<number | null> {
  switch (actionType) {
    case "review_response":
      return getReviewCount(orgId);
    case "referral_outreach":
      return getReferralSourceCount(orgId);
    case "competitor_monitor":
      return getRankingPosition(orgId);
    case "gbp_optimize":
      return getGbpCompletenessScore(orgId);
    default:
      return null;
  }
}

async function getReviewCount(orgId: number): Promise<number | null> {
  const snapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .first();

  return snapshot?.client_review_count ?? null;
}

async function getReferralSourceCount(orgId: number): Promise<number | null> {
  const hasTable = await db.schema.hasTable("referral_sources");
  if (!hasTable) return null;

  const result = await db("referral_sources")
    .where({ organization_id: orgId })
    .count("* as cnt")
    .first();

  return result ? parseInt(String(result.cnt), 10) : null;
}

async function getRankingPosition(orgId: number): Promise<number | null> {
  const snapshot = await db("weekly_ranking_snapshots")
    .where({ org_id: orgId })
    .orderBy("week_start", "desc")
    .first();

  return snapshot?.position ?? null;
}

async function getGbpCompletenessScore(orgId: number): Promise<number | null> {
  // GBP completeness can come from checkup_data or the org record
  const org = await db("organizations")
    .where({ id: orgId })
    .select("checkup_data", "current_clarity_score")
    .first();

  if (!org) return null;

  // Use clarity score as a proxy for GBP completeness
  if (org.current_clarity_score != null) {
    return parseFloat(org.current_clarity_score);
  }

  // Fall back to checkup score breakdown
  const checkup = org.checkup_data
    ? typeof org.checkup_data === "string"
      ? tryParseJSON(org.checkup_data)
      : org.checkup_data
    : null;

  if (checkup?.score?.localVisibility != null) {
    return checkup.score.localVisibility;
  }

  return null;
}

// ---- Baseline Metric Fetcher (for recording at send time) -----------------

export async function getBaselineMetric(
  orgId: number,
  actionType: ActionType
): Promise<number> {
  const value = await getCurrentMetricValue(orgId, actionType);
  return value ?? 0;
}

// ---- Detect Action Type from Monday Email Content -------------------------

export function detectActionType(
  reviewGap: number,
  hasDriftGP: boolean,
  hasRankingDrop: boolean
): ActionType {
  if (hasDriftGP) return "referral_outreach";
  if (hasRankingDrop) return "competitor_monitor";
  if (reviewGap > 0) return "review_response";
  return "gbp_optimize";
}

// ---- Helpers --------------------------------------------------------------

async function logBehavioralEvent(
  orgId: number | null,
  eventType: string,
  properties: Record<string, unknown>
): Promise<void> {
  const hasTable = await db.schema.hasTable("behavioral_events");
  if (!hasTable) return;

  try {
    await db("behavioral_events").insert({
      event_type: eventType,
      org_id: orgId,
      properties: JSON.stringify(properties),
    });
  } catch (err: any) {
    console.error("[FeedbackLoop] Failed to log behavioral event:", err.message);
  }
}

function tryParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}
