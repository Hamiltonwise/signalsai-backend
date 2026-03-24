/**
 * Referral Analytics Service -- WO-REFERRAL-ANALYTICS
 *
 * Powers the GP Referral Intelligence screen with real calculations.
 * Four functions: trends, drift alerts, top referrers, this week's move.
 *
 * // T2 registers GET /api/user/referral-analytics endpoint
 * // that calls these four functions and returns combined response
 */

import { db } from "../database/connection";

// ─── Helpers ───

async function getAvgCaseValue(orgId: number): Promise<number> {
  try {
    const config = await db("vocabulary_configs").where({ org_id: orgId }).first();
    if (config?.vertical) {
      const defaults = await db("vocabulary_defaults").where({ vertical: config.vertical }).first();
      if (defaults?.config) {
        const parsed = typeof defaults.config === "string"
          ? JSON.parse(defaults.config)
          : defaults.config;
        if (parsed.avgCaseValue) return parsed.avgCaseValue;
      }
    }
  } catch {
    // vocabulary tables may not exist yet
  }
  return 1500;
}

async function hasReferralSourcesTable(): Promise<boolean> {
  return db.schema.hasTable("referral_sources");
}

// ─── Types ───

export interface ReferralTrend {
  source_name: string;
  source_id: number;
  monthly_counts: number[];
  trend_direction: "up" | "flat" | "down";
  avg_per_month: number;
  estimated_annual_value: number;
}

export interface DriftAlert {
  source_name: string;
  source_id: number;
  last_referral_date: string | null;
  days_silent: number;
  prior_3month_count: number;
  annual_value_at_risk: number;
  surprise_catch_dismissed: boolean;
}

export interface TopReferrer {
  rank: number;
  source_name: string;
  source_id: number;
  total_referrals: number;
  trend_arrow: "up" | "flat" | "down";
  estimated_annual_value: number;
  last_referral_date: string | null;
}

// ─── getReferralTrends ───

/**
 * For each referral source: group by month, compute 3-month rolling average,
 * return trend direction and estimated annual value.
 */
export async function getReferralTrends(
  orgId: number,
  months: number = 6,
): Promise<ReferralTrend[]> {
  if (!(await hasReferralSourcesTable())) return [];

  const sources = await db("referral_sources")
    .where({ organization_id: orgId })
    .select("*");

  if (sources.length === 0) return [];

  const avgCaseValue = await getAvgCaseValue(orgId);
  const trends: ReferralTrend[] = [];

  for (const source of sources) {
    const name = source.gp_name || source.name || source.provider_name || "Unknown";

    // Build monthly counts from available fields
    // Sources may have month_1_count through month_6_count or similar
    const monthlyCounts: number[] = [];
    for (let i = 1; i <= months; i++) {
      const key = `referral_count_month_${i}` in source
        ? `referral_count_month_${i}`
        : `month_${i}_count`;
      monthlyCounts.push(source[key] ?? 0);
    }

    // 3-month rolling average (most recent 3)
    const recent3 = monthlyCounts.slice(0, 3);
    const prior3 = monthlyCounts.slice(3, 6);
    const recentAvg = recent3.reduce((s, v) => s + v, 0) / Math.max(recent3.length, 1);
    const priorAvg = prior3.length > 0
      ? prior3.reduce((s, v) => s + v, 0) / prior3.length
      : recentAvg;

    // Trend direction
    let trendDirection: "up" | "flat" | "down" = "flat";
    if (recentAvg > priorAvg * 1.1) trendDirection = "up";
    else if (recentAvg < priorAvg * 0.9) trendDirection = "down";

    // Fallback: use prior_3_month_avg or monthly_average if month fields are all 0
    const totalFromMonths = monthlyCounts.reduce((s, v) => s + v, 0);
    const effectiveAvg = totalFromMonths > 0
      ? recentAvg
      : (source.prior_3_month_avg ?? source.monthly_average ?? 0);

    trends.push({
      source_name: name,
      source_id: source.id,
      monthly_counts: monthlyCounts,
      trend_direction: trendDirection,
      avg_per_month: Math.round(effectiveAvg * 10) / 10,
      estimated_annual_value: Math.round(effectiveAvg * 12 * avgCaseValue),
    });
  }

  // Sort by estimated annual value descending
  trends.sort((a, b) => b.estimated_annual_value - a.estimated_annual_value);

  return trends;
}

// ─── getDriftAlerts ───

/**
 * Find sources with 3+ referrals in any prior 3-month window AND 0 in last 60 days.
 */
export async function getDriftAlerts(orgId: number): Promise<DriftAlert[]> {
  if (!(await hasReferralSourcesTable())) return [];

  const sources = await db("referral_sources")
    .where({ organization_id: orgId })
    .select("*");

  const avgCaseValue = await getAvgCaseValue(orgId);
  const alerts: DriftAlert[] = [];

  for (const source of sources) {
    const priorAvg = source.prior_3_month_avg ?? source.monthly_average ?? 0;
    const totalPrior = source.total_prior_3_months ?? Math.round(priorAvg * 3);

    // Must have had 3+ referrals in a prior 3-month window
    if (totalPrior < 3) continue;

    // Must have 0 in last 60 days
    const recentCount = source.recent_referral_count
      ?? source.referral_count_last_30d
      ?? source.current_month_count
      ?? 0;
    if (recentCount > 0) continue;

    const lastDate = source.last_referral_date || source.last_referral_at || source.updated_at;
    const daysSilent = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
      : 60;

    if (daysSilent < 60) continue;

    const name = source.gp_name || source.name || source.provider_name || "Unknown";

    alerts.push({
      source_name: name,
      source_id: source.id,
      last_referral_date: lastDate ? new Date(lastDate).toISOString().split("T")[0] : null,
      days_silent: daysSilent,
      prior_3month_count: totalPrior,
      annual_value_at_risk: Math.round(priorAvg * 12 * avgCaseValue),
      surprise_catch_dismissed: !!source.surprise_catch_dismissed_at,
    });
  }

  // Sort by value at risk descending
  alerts.sort((a, b) => b.annual_value_at_risk - a.annual_value_at_risk);

  return alerts;
}

// ─── getTopReferrers ───

/**
 * Rank all referral sources by total count. Return top N with trend arrow.
 */
export async function getTopReferrers(
  orgId: number,
  limit: number = 10,
): Promise<TopReferrer[]> {
  if (!(await hasReferralSourcesTable())) return [];

  const sources = await db("referral_sources")
    .where({ organization_id: orgId })
    .select("*");

  const avgCaseValue = await getAvgCaseValue(orgId);

  const ranked = sources
    .map((source) => {
      const name = source.gp_name || source.name || source.provider_name || "Unknown";
      const totalReferrals = source.total_referral_count ?? source.total_referrals ?? 0;
      const priorAvg = source.prior_3_month_avg ?? source.monthly_average ?? 0;
      const recentCount = source.recent_referral_count
        ?? source.referral_count_last_30d
        ?? source.current_month_count
        ?? 0;

      // Trend: compare current rate to prior average
      let trendArrow: "up" | "flat" | "down" = "flat";
      if (priorAvg > 0) {
        if (recentCount > priorAvg * 1.1) trendArrow = "up";
        else if (recentCount < priorAvg * 0.9) trendArrow = "down";
      }

      const lastDate = source.last_referral_date || source.last_referral_at || null;

      return {
        source_name: name,
        source_id: source.id,
        total_referrals: totalReferrals,
        trend_arrow: trendArrow,
        estimated_annual_value: Math.round(
          (priorAvg > 0 ? priorAvg : totalReferrals / 12) * 12 * avgCaseValue,
        ),
        last_referral_date: lastDate ? new Date(lastDate).toISOString().split("T")[0] : null,
      };
    })
    .sort((a, b) => b.total_referrals - a.total_referrals)
    .slice(0, limit);

  return ranked.map((r, i) => ({ rank: i + 1, ...r }));
}

// ─── getThisWeeksMove ───

/**
 * Returns one plain English action sentence for the GP Referral Intelligence screen.
 */
export async function getThisWeeksMove(orgId: number): Promise<string> {
  if (!(await hasReferralSourcesTable())) {
    return "Upload 90 days of scheduling data to see which GPs are your strongest referrers.";
  }

  const avgCaseValue = await getAvgCaseValue(orgId);

  // Priority 1: drift alert exists
  const driftAlerts = await getDriftAlerts(orgId);
  const undismissedDrift = driftAlerts.filter((a) => !a.surprise_catch_dismissed);

  if (undismissedDrift.length > 0) {
    const top = undismissedDrift[0];
    return `Dr. ${top.source_name.replace(/^Dr\.?\s*/i, "")} sent ${top.prior_3month_count} referrals previously. They've been quiet ${top.days_silent} days. A call this week could recover an estimated $${top.annual_value_at_risk.toLocaleString()}/year.`;
  }

  // Priority 2: highest-growth referrer
  const sources = await db("referral_sources")
    .where({ organization_id: orgId })
    .select("*");

  let bestGrowth: { name: string; currentMonth: number; growthPct: number } | null = null;

  for (const source of sources) {
    const priorAvg = source.prior_3_month_avg ?? source.monthly_average ?? 0;
    const recentCount = source.recent_referral_count
      ?? source.referral_count_last_30d
      ?? source.current_month_count
      ?? 0;

    if (recentCount > 0 && priorAvg > 0 && recentCount > priorAvg) {
      const growthPct = Math.round(((recentCount - priorAvg) / priorAvg) * 100);
      const name = source.gp_name || source.name || source.provider_name || "Unknown";

      if (!bestGrowth || growthPct > bestGrowth.growthPct) {
        bestGrowth = { name, currentMonth: recentCount, growthPct };
      }
    }
  }

  if (bestGrowth) {
    return `Dr. ${bestGrowth.name.replace(/^Dr\.?\s*/i, "")} sent ${bestGrowth.currentMonth} referrals this month, up ${bestGrowth.growthPct}% from last month. Follow up to strengthen this relationship.`;
  }

  // Priority 3: no data
  if (sources.length === 0) {
    return "Upload 90 days of scheduling data to see which GPs are your strongest referrers.";
  }

  return "Your referral base is steady this month. Consider reaching out to your top referrer to stay top-of-mind.";
}
