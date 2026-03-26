/**
 * GP Drift Detection Service
 *
 * T3-F: Full GP gone dark + drift implementation.
 *
 * Gone Dark: GP had 1+ referrals in each of prior 3 months, now 0 for 30 days.
 * Drift: 30%+ decline over 60 days, not yet zero.
 *
 * Runs after every PMS upload and weekly Sunday with rankings cron.
 */

import { db } from "../database/connection";
import { BehavioralEventModel } from "../models/BehavioralEventModel";

// ─── Types ──────────────────────────────────────────────────────────

export interface GoneDarkAlert {
  type: "gone_dark";
  sourceId: number;
  gpName: string;
  gpPractice: string;
  priorMonthlyAvg: number;
  totalPrior3Months: number;
  daysSilent: number;
  estimatedAnnualRisk: number;
}

export interface DriftAlert {
  type: "drift";
  sourceId: number;
  gpName: string;
  gpPractice: string;
  declinePct: number;
  currentMonthlyRate: number;
  priorMonthlyRate: number;
  estimatedZeroDate: string;
  estimatedMonthlyRisk: number;
}

export type DriftAlertResult = GoneDarkAlert | DriftAlert;

// ─── Gone Dark Check ────────────────────────────────────────────────

/**
 * Check all referral sources for an org against the Gone Dark definition:
 * GP had 1+ referrals in each of prior 3 months, now 0 for 30 consecutive days.
 *
 * Fires Surprise Catch banner. Logs 'gp.gone_dark' to behavioral_events.
 */
export async function runGoneDarkCheck(orgId: number): Promise<GoneDarkAlert[]> {
  const hasTable = await db.schema.hasTable("referral_sources");
  if (!hasTable) return [];

  const sources = await db("referral_sources")
    .where({ organization_id: orgId })
    .whereNull("surprise_catch_dismissed_at")
    .select("*");

  const alerts: GoneDarkAlert[] = [];
  const avgCaseValue = await getAvgCaseValue(orgId);

  for (const source of sources) {
    // Check if GP was consistently active in prior 3 months
    const month1 = source.referral_count_month_1 ?? source.month_1_count ?? null;
    const month2 = source.referral_count_month_2 ?? source.month_2_count ?? null;
    const month3 = source.referral_count_month_3 ?? source.month_3_count ?? null;

    // Alternative: use prior_3_month_avg or monthly_average
    const priorAvg = source.prior_3_month_avg ?? source.monthly_average ?? 0;
    const totalPrior = source.total_prior_3_months ?? Math.round(priorAvg * 3);

    // Check if individual months were all active (if data available)
    const wasConsistentlyActive = (month1 !== null && month2 !== null && month3 !== null)
      ? (month1 >= 1 && month2 >= 1 && month3 >= 1)
      : priorAvg >= 1; // fallback: average >= 1 means at least some consistency

    if (!wasConsistentlyActive) continue;

    // Check current: zero referrals for 30+ days
    const recentCount = source.recent_referral_count
      ?? source.referral_count_last_30d
      ?? source.current_month_count
      ?? 0;

    if (recentCount > 0) continue;

    // Calculate days silent
    const lastDate = source.last_referral_date || source.last_referral_at || source.updated_at;
    const daysSilent = lastDate
      ? Math.floor((Date.now() - new Date(lastDate).getTime()) / (1000 * 60 * 60 * 24))
      : 30;

    if (daysSilent < 30) continue;

    const gpName = source.gp_name || source.name || source.provider_name || "Unknown GP";
    const gpPractice = source.gp_practice || source.practice_name || source.provider_practice || "";
    const estimatedAnnualRisk = Math.round(priorAvg * 12 * avgCaseValue);

    alerts.push({
      type: "gone_dark",
      sourceId: source.id,
      gpName,
      gpPractice,
      priorMonthlyAvg: Math.round(priorAvg),
      totalPrior3Months: totalPrior,
      daysSilent,
      estimatedAnnualRisk,
    });

    // Log to behavioral_events (fire-and-forget)
    BehavioralEventModel.create({
      event_type: "gp.gone_dark",
      org_id: orgId,
      properties: {
        gp_name: gpName,
        gp_practice: gpPractice,
        days_silent: daysSilent,
        prior_monthly_avg: priorAvg,
        estimated_annual_risk: estimatedAnnualRisk,
      },
    }).catch(() => {});
  }

  return alerts;
}

// ─── Drift Check ────────────────────────────────────────────────────

/**
 * Check all referral sources for 30%+ decline over 60 days (not yet zero).
 *
 * Creates drift record. Logs 'gp.drift_detected' to behavioral_events.
 */
export async function runDriftCheck(orgId: number): Promise<DriftAlert[]> {
  const hasTable = await db.schema.hasTable("referral_sources");
  if (!hasTable) return [];

  const sources = await db("referral_sources")
    .where({ organization_id: orgId })
    .whereNull("gp_drift_dismissed_at")
    .select("*");

  const alerts: DriftAlert[] = [];
  const avgCaseValue = await getAvgCaseValue(orgId);

  for (const source of sources) {
    const priorAvg = source.prior_3_month_avg ?? source.monthly_average ?? 0;
    const recentCount = source.recent_referral_count
      ?? source.referral_count_last_30d
      ?? source.current_month_count
      ?? 0;

    // Must have prior activity and current activity (not zero -- that's gone_dark)
    if (priorAvg <= 0 || recentCount <= 0) continue;

    // Check for 30%+ decline
    const declinePct = Math.round((1 - recentCount / priorAvg) * 100);
    if (declinePct < 30) continue;

    const gpName = source.gp_name || source.name || source.provider_name || "Unknown GP";
    const gpPractice = source.gp_practice || source.practice_name || source.provider_practice || "";

    // Estimate when they'll hit zero at current decline rate
    // If declining at declinePct% over ~60 days, project forward
    const monthsToZero = recentCount > 0
      ? Math.ceil(recentCount / (priorAvg - recentCount) * 2) // rough estimate
      : 1;
    const estimatedZeroDate = new Date();
    estimatedZeroDate.setMonth(estimatedZeroDate.getMonth() + Math.max(1, monthsToZero));

    const estimatedMonthlyRisk = Math.round((priorAvg - recentCount) * avgCaseValue);

    alerts.push({
      type: "drift",
      sourceId: source.id,
      gpName,
      gpPractice,
      declinePct,
      currentMonthlyRate: recentCount,
      priorMonthlyRate: Math.round(priorAvg),
      estimatedZeroDate: estimatedZeroDate.toISOString().split("T")[0],
      estimatedMonthlyRisk,
    });

    // Log to behavioral_events
    BehavioralEventModel.create({
      event_type: "gp.drift_detected",
      org_id: orgId,
      properties: {
        gp_name: gpName,
        gp_practice: gpPractice,
        decline_pct: declinePct,
        current_rate: recentCount,
        prior_rate: priorAvg,
        estimated_zero_date: estimatedZeroDate.toISOString().split("T")[0],
        estimated_monthly_risk: estimatedMonthlyRisk,
      },
    }).catch(() => {});
  }

  return alerts;
}

// ─── Combined Check ─────────────────────────────────────────────────

/**
 * Run both checks for an org. Returns all alerts sorted by severity.
 * Gone dark alerts come first (more urgent).
 */
export async function runAllDriftChecks(orgId: number): Promise<DriftAlertResult[]> {
  const [goneDark, drift] = await Promise.all([
    runGoneDarkCheck(orgId),
    runDriftCheck(orgId),
  ]);

  return [...goneDark, ...drift];
}

// ─── Dismiss ────────────────────────────────────────────────────────

/**
 * Dismiss an alert for a specific referral source.
 * Sets the appropriate dismissed_at timestamp so it doesn't reappear.
 */
export async function dismissAlert(
  sourceId: number,
  alertType: "gone_dark" | "drift",
): Promise<void> {
  const field = alertType === "gone_dark"
    ? "surprise_catch_dismissed_at"
    : "gp_drift_dismissed_at";

  await db("referral_sources")
    .where({ id: sourceId })
    .update({ [field]: new Date() });
}

// ─── Helpers ────────────────────────────────────────────────────────

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
  return 1500; // default
}

// T2 registers the routes for these services
