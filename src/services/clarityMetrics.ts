/**
 * Clarity Metrics -- The 1% Engine Foundation
 *
 * Reads behavioral_events and agent_results to compute the metrics
 * that drive the Learning Agent's feedback loops. This is the
 * measurement layer. Without measurement, improvement is guessing.
 *
 * James Clear: "You do not rise to the level of your goals.
 * You fall to the level of your systems." This is the system.
 *
 * Kenji Lopez-Alt: Hypothesis, test, measure, learn, repeat.
 * This service provides the MEASURE step.
 *
 * Runs: Daily at 7am PT (after all agents have completed their runs)
 * Output: clarity_metrics row in behavioral_events + dashboard data
 */

import { db } from "../database/connection";

export interface ClaritySnapshot {
  date: string;
  // Funnel metrics
  checkupsStarted: number;
  checkupsCompleted: number;
  accountsCreated: number;
  trialStarts: number;
  trialConversions: number;
  // Engagement metrics
  mondayEmailsSent: number;
  mondayEmailOpens: number;
  dashboardLogins: number;
  oneActionCardClicks: number;
  // Retention metrics
  activeAccountsLast7Days: number;
  activeAccountsLast30Days: number;
  churnedAccounts: number;
  // Agent metrics
  agentRunsSuccessful: number;
  agentRunsFailed: number;
  findingsGenerated: number;
  // Quality metrics
  avgCheckupScore: number;
  avgTimeToFirstValue: number;
  // Compound rate
  compoundRate: number | null;
}

/**
 * Compute a daily clarity snapshot from behavioral_events.
 * This is the raw data that powers the Learning Agent's loops.
 */
export async function computeDailySnapshot(
  date: Date = new Date(),
): Promise<ClaritySnapshot> {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const weekAgo = new Date(date);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(date);
  monthAgo.setDate(monthAgo.getDate() - 30);

  try {
    // Count events by type for today
    const todayEvents = await db("behavioral_events")
      .where("created_at", ">=", dayStart)
      .where("created_at", "<=", dayEnd)
      .select("event_type")
      .count("id as count")
      .groupBy("event_type");

    const eventCount = (type: string): number => {
      const found = todayEvents.find((e: any) =>
        e.event_type === type || e.event_type?.startsWith(type + ".")
      );
      return Number(found?.count || 0);
    };

    // Funnel metrics
    const checkupsStarted = eventCount("checkup.started") + eventCount("checkup_started");
    const checkupsCompleted = eventCount("checkup.scan_completed") + eventCount("checkup_scan_completed");
    const accountsCreated = eventCount("account.created") + eventCount("account_created");
    const trialStarts = eventCount("trial.started");
    const trialConversions = eventCount("billing.subscription_created");

    // Engagement
    const mondayEmailsSent = eventCount("monday_email.sent");
    const mondayEmailOpens = eventCount("monday_email.opened");
    const dashboardLogins = eventCount("session.started") + eventCount("marketing.page_view");
    const oneActionCardClicks = eventCount("one_action.clicked");

    // Active accounts (last 7 and 30 days)
    const active7 = await db("behavioral_events")
      .where("created_at", ">=", weekAgo)
      .whereNotNull("org_id")
      .countDistinct("org_id as count")
      .first();

    const active30 = await db("behavioral_events")
      .where("created_at", ">=", monthAgo)
      .whereNotNull("org_id")
      .countDistinct("org_id as count")
      .first();

    // Churned: active 30 days ago but not in last 7
    const churnedResult = await db.raw(`
      SELECT COUNT(DISTINCT be_old.org_id) as count
      FROM behavioral_events be_old
      WHERE be_old.created_at >= ? AND be_old.created_at < ?
        AND be_old.org_id IS NOT NULL
        AND be_old.org_id NOT IN (
          SELECT DISTINCT org_id FROM behavioral_events
          WHERE created_at >= ? AND org_id IS NOT NULL
        )
    `, [monthAgo, weekAgo, weekAgo]).catch(() => ({ rows: [{ count: 0 }] }));

    // Agent metrics
    const agentSuccess = await db("agent_results")
      .where("created_at", ">=", dayStart)
      .where("created_at", "<=", dayEnd)
      .where("status", "success")
      .count("id as count")
      .first();

    const agentFailed = await db("agent_results")
      .where("created_at", ">=", dayStart)
      .where("created_at", "<=", dayEnd)
      .where("status", "error")
      .count("id as count")
      .first();

    // Compute compound rate (this week vs last week)
    const lastWeekStart = new Date(weekAgo);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    const thisWeekCheckups = await db("behavioral_events")
      .where("created_at", ">=", weekAgo)
      .where("event_type", "like", "checkup%")
      .count("id as count")
      .first();

    const lastWeekCheckups = await db("behavioral_events")
      .where("created_at", ">=", lastWeekStart)
      .where("created_at", "<", weekAgo)
      .where("event_type", "like", "checkup%")
      .count("id as count")
      .first();

    const thisWeekCount = Number(thisWeekCheckups?.count || 0);
    const lastWeekCount = Number(lastWeekCheckups?.count || 0);
    const compoundRate = lastWeekCount > 0
      ? Math.round((thisWeekCount / lastWeekCount) * 100) / 100
      : null;

    const snapshot: ClaritySnapshot = {
      date: dayStart.toISOString().split("T")[0],
      checkupsStarted,
      checkupsCompleted,
      accountsCreated,
      trialStarts,
      trialConversions,
      mondayEmailsSent,
      mondayEmailOpens,
      dashboardLogins,
      oneActionCardClicks,
      activeAccountsLast7Days: Number(active7?.count || 0),
      activeAccountsLast30Days: Number(active30?.count || 0),
      churnedAccounts: Number(churnedResult?.rows?.[0]?.count || 0),
      agentRunsSuccessful: Number(agentSuccess?.count || 0),
      agentRunsFailed: Number(agentFailed?.count || 0),
      findingsGenerated: 0, // TODO: count findings from agent_results output
      avgCheckupScore: 0, // TODO: compute from checkup results
      avgTimeToFirstValue: 0, // TODO: compute from TTFV events
      compoundRate,
    };

    // Log the snapshot as a behavioral event (so it's in the same system)
    await db("behavioral_events").insert({
      event_type: "clarity_metrics.daily_snapshot",
      properties: JSON.stringify(snapshot),
      created_at: new Date(),
    }).catch(() => {});

    return snapshot;
  } catch (err: any) {
    console.error("[ClarityMetrics] Snapshot error:", err.message);
    return {
      date: dayStart.toISOString().split("T")[0],
      checkupsStarted: 0,
      checkupsCompleted: 0,
      accountsCreated: 0,
      trialStarts: 0,
      trialConversions: 0,
      mondayEmailsSent: 0,
      mondayEmailOpens: 0,
      dashboardLogins: 0,
      oneActionCardClicks: 0,
      activeAccountsLast7Days: 0,
      activeAccountsLast30Days: 0,
      churnedAccounts: 0,
      agentRunsSuccessful: 0,
      agentRunsFailed: 0,
      findingsGenerated: 0,
      avgCheckupScore: 0,
      avgTimeToFirstValue: 0,
      compoundRate: null,
    };
  }
}

/**
 * Detect anomalies by comparing today's snapshot to the 7-day average.
 * If any metric drops more than 30% below the average, flag it.
 */
export async function detectAnomalies(
  today: ClaritySnapshot,
): Promise<{ metric: string; current: number; average: number; dropPct: number }[]> {
  try {
    // Get last 7 snapshots
    const recent = await db("behavioral_events")
      .where("event_type", "clarity_metrics.daily_snapshot")
      .orderBy("created_at", "desc")
      .limit(7)
      .select("properties");

    if (recent.length < 3) return []; // Not enough data for anomaly detection

    const snapshots: ClaritySnapshot[] = recent.map((r: any) =>
      typeof r.properties === "string" ? JSON.parse(r.properties) : r.properties
    );

    const anomalies: { metric: string; current: number; average: number; dropPct: number }[] = [];

    const metricsToWatch: (keyof ClaritySnapshot)[] = [
      "checkupsCompleted",
      "accountsCreated",
      "dashboardLogins",
      "agentRunsSuccessful",
      "activeAccountsLast7Days",
    ];

    for (const metric of metricsToWatch) {
      const values = snapshots.map((s) => Number(s[metric] || 0));
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      const current = Number(today[metric] || 0);

      if (avg > 0 && current < avg * 0.7) {
        anomalies.push({
          metric,
          current,
          average: Math.round(avg * 10) / 10,
          dropPct: Math.round((1 - current / avg) * 100),
        });
      }
    }

    return anomalies;
  } catch {
    return [];
  }
}
