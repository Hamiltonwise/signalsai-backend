/**
 * Checkup Funnel Measurement Service
 *
 * Calculates conversion rates across the checkup-to-account funnel.
 * Used by the AAE Dashboard and VisionaryView to show real conversion data.
 *
 * All events are linked by session_id so we can track individual journeys,
 * but the aggregate counts work even for events without session linkage
 * (backward compatible with pre-session events).
 */

import { db } from "../database/connection";

export interface CheckupFunnelResult {
  scansStarted: number;
  scansCompleted: number;
  accountsCreated: number;
  scanToCompleteRate: number;
  completeToAccountRate: number;
  /** End-to-end: scan started to account created */
  startToAccountRate: number;
}

/**
 * Calculate checkup funnel metrics for a given time window.
 *
 * @param days - Number of days to look back (default 7)
 * @param since - Optional explicit start date (overrides days)
 * @returns Funnel counts and conversion rates (rates are 0-100 percentages)
 */
export async function calculateCheckupFunnel(
  options: { days?: number; since?: Date } = {}
): Promise<CheckupFunnelResult> {
  const since = options.since || new Date(Date.now() - (options.days || 7) * 86_400_000);

  const hasTable = await db.schema.hasTable("behavioral_events");
  if (!hasTable) {
    return {
      scansStarted: 0,
      scansCompleted: 0,
      accountsCreated: 0,
      scanToCompleteRate: 0,
      completeToAccountRate: 0,
      startToAccountRate: 0,
    };
  }

  // Count each stage. Include legacy event names for backward compat.
  const [startedResult, completedResult, accountsResult] = await Promise.all([
    db("behavioral_events")
      .whereIn("event_type", ["checkup.scan_started", "checkup.started"])
      .where("created_at", ">=", since)
      .count("id as count")
      .first(),
    db("behavioral_events")
      .whereIn("event_type", [
        "checkup.scan_completed",
        "checkup.analyzed",
        "checkup_complete",
        "checkup.completed",
      ])
      .where("created_at", ">=", since)
      .count("id as count")
      .first(),
    db("behavioral_events")
      .whereIn("event_type", ["checkup.account_created", "account.created"])
      .where("created_at", ">=", since)
      .count("id as count")
      .first(),
  ]);

  const scansStarted = Number(startedResult?.count || 0);
  const scansCompleted = Number(completedResult?.count || 0);
  const accountsCreated = Number(accountsResult?.count || 0);

  const scanToCompleteRate = scansStarted > 0
    ? Math.round((scansCompleted / scansStarted) * 100)
    : 0;

  const completeToAccountRate = scansCompleted > 0
    ? Math.round((accountsCreated / scansCompleted) * 100)
    : 0;

  const startToAccountRate = scansStarted > 0
    ? Math.round((accountsCreated / scansStarted) * 100)
    : 0;

  return {
    scansStarted,
    scansCompleted,
    accountsCreated,
    scanToCompleteRate,
    completeToAccountRate,
    startToAccountRate,
  };
}
