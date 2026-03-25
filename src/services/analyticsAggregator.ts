/**
 * Analytics Aggregation Pipeline -- WO-ANALYTICS-PIPELINE
 *
 * Runs every Sunday 10pm PT. Reads behavioral_events for the past 7 days.
 * Produces a weekly_metrics record.
 *
 * This table feeds:
 * - Revenue Dashboard NRR trend chart
 * - Weekly Digest Agent "THE NUMBER" section
 * - Founder Mode Panel 1 performance metrics
 * - FYM and Unicorn confidence score calculations
 */

import { db } from "../database/connection";

// ─── Types ───

export interface WeeklyMetrics {
  week_start: string;
  new_signups: number;
  active_accounts: number;
  trial_conversions: number;
  churns: number;
  first_wins: number;
  ttfv_yes_rate: number;
  avg_engagement_score: number;
  top_event_type: string | null;
  top_performing_org_id: number | null;
}

// ─── Helper: get week start (Monday) ───

function getWeekStart(date: Date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

// ─── Main Function ───

/**
 * Aggregate weekly metrics from behavioral_events and organizations.
 * Idempotent: upserts by week_start.
 */
export async function aggregateWeeklyMetrics(
  weekStart?: string,
): Promise<WeeklyMetrics> {
  const week = weekStart || getWeekStart();
  const weekEnd = new Date(week);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const weekStartDate = new Date(week);

  // 1. New signups (account.created or checkup.account_created)
  const signupResult = await db("behavioral_events")
    .whereIn("event_type", ["account.created", "checkup.account_created"])
    .where("created_at", ">=", weekStartDate)
    .where("created_at", "<", weekEnd)
    .count("id as count")
    .first();
  const newSignups = Number(signupResult?.count || 0);

  // 2. Active accounts (distinct org_ids with any event)
  const activeResult = await db("behavioral_events")
    .where("created_at", ">=", weekStartDate)
    .where("created_at", "<", weekEnd)
    .whereNotNull("org_id")
    .countDistinct("org_id as count")
    .first();
  const activeAccounts = Number(activeResult?.count || 0);

  // 3. Trial conversions
  const conversionResult = await db("behavioral_events")
    .where({ event_type: "billing.subscription_created" })
    .where("created_at", ">=", weekStartDate)
    .where("created_at", "<", weekEnd)
    .count("id as count")
    .first();
  const trialConversions = Number(conversionResult?.count || 0);

  // 4. Churns
  const churnResult = await db("behavioral_events")
    .where({ event_type: "billing.subscription_cancelled" })
    .where("created_at", ">=", weekStartDate)
    .where("created_at", "<", weekEnd)
    .count("id as count")
    .first();
  const churns = Number(churnResult?.count || 0);

  // 5. First wins
  const firstWinResult = await db("behavioral_events")
    .where({ event_type: "first_win.achieved" })
    .where("created_at", ">=", weekStartDate)
    .where("created_at", "<", weekEnd)
    .count("id as count")
    .first();
  const firstWins = Number(firstWinResult?.count || 0);

  // 6. TTFV yes rate
  const ttfvYes = await db("behavioral_events")
    .where({ event_type: "ttfv.yes" })
    .where("created_at", ">=", weekStartDate)
    .where("created_at", "<", weekEnd)
    .count("id as count")
    .first();
  const ttfvNo = await db("behavioral_events")
    .where({ event_type: "ttfv.not_yet" })
    .where("created_at", ">=", weekStartDate)
    .where("created_at", "<", weekEnd)
    .count("id as count")
    .first();
  const yesCount = Number(ttfvYes?.count || 0);
  const noCount = Number(ttfvNo?.count || 0);
  const ttfvYesRate = (yesCount + noCount) > 0
    ? Math.round((yesCount / (yesCount + noCount)) * 10000) / 100
    : 0;

  // 7. Average engagement score across active orgs
  const engagementResult = await db("organizations")
    .whereNotNull("engagement_score")
    .where("engagement_score", ">", 0)
    .avg("engagement_score as avg")
    .first();
  const avgEngagementScore = Math.round(Number(engagementResult?.avg || 0) * 100) / 100;

  // 8. Top event type this week
  const topEventResult = await db("behavioral_events")
    .where("created_at", ">=", weekStartDate)
    .where("created_at", "<", weekEnd)
    .select("event_type")
    .count("id as count")
    .groupBy("event_type")
    .orderBy("count", "desc")
    .first();
  const topEventType = (topEventResult?.event_type as string) || null;

  // 9. Top performing org (highest engagement score)
  const topOrgResult = await db("organizations")
    .whereNotNull("engagement_score")
    .orderBy("engagement_score", "desc")
    .select("id")
    .first();
  const topPerformingOrgId = topOrgResult?.id || null;

  const metrics: WeeklyMetrics = {
    week_start: week,
    new_signups: newSignups,
    active_accounts: activeAccounts,
    trial_conversions: trialConversions,
    churns,
    first_wins: firstWins,
    ttfv_yes_rate: ttfvYesRate,
    avg_engagement_score: avgEngagementScore,
    top_event_type: topEventType,
    top_performing_org_id: topPerformingOrgId,
  };

  // Upsert into weekly_metrics
  const hasTable = await db.schema.hasTable("weekly_metrics");
  if (hasTable) {
    const existing = await db("weekly_metrics").where({ week_start: week }).first();
    if (existing) {
      await db("weekly_metrics").where({ week_start: week }).update(metrics);
    } else {
      await db("weekly_metrics").insert(metrics);
    }
  }

  console.log(
    `[Analytics] Week ${week}: ${newSignups} signups, ${activeAccounts} active, ${trialConversions} conversions, ${churns} churns, ${firstWins} first wins, TTFV ${ttfvYesRate}%`,
  );

  return metrics;
}

/**
 * Get the most recent weekly metrics (for dashboards).
 */
export async function getLatestWeeklyMetrics(): Promise<WeeklyMetrics | null> {
  const hasTable = await db.schema.hasTable("weekly_metrics");
  if (!hasTable) return null;

  const row = await db("weekly_metrics")
    .orderBy("week_start", "desc")
    .first();

  return row || null;
}

/**
 * Get weekly metrics for a date range (for trend charts).
 */
export async function getWeeklyMetricsRange(
  weeks: number = 12,
): Promise<WeeklyMetrics[]> {
  const hasTable = await db.schema.hasTable("weekly_metrics");
  if (!hasTable) return [];

  return db("weekly_metrics")
    .orderBy("week_start", "desc")
    .limit(weeks);
}
