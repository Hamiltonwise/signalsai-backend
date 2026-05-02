/**
 * Pure delta-detection logic. Extracted from signalWatcher.ts so unit
 * tests can exercise it without importing the database module.
 *
 * Thresholds (architecture spec AR-009, Component 1):
 *   - rank position delta of 3+ positions
 *   - impression spike of 50%+
 *   - new query above 100 impressions
 */

import type { GscDelta, GscQueryRow } from "./types";

export const RANK_DELTA_THRESHOLD = 3;
export const IMPRESSION_SPIKE_PCT = 50;
export const NEW_QUERY_IMPRESSION_FLOOR = 100;

/**
 * Compute the set of deltas between a prior 7-day GSC window and the
 * current 7-day window. Returns one row per emitted signal candidate.
 *
 * Notes:
 *  - "rankDelta" is `current.position - prior.position`. Negative = improved.
 *  - "impressionPct" uses prior as denominator. If prior was 0, the delta
 *    is suppressed in favor of `gsc_new_query` (which has a higher floor).
 *  - A query that appears in current but not prior, with impressions
 *    >= NEW_QUERY_IMPRESSION_FLOOR, emits one `gsc_new_query` row. A
 *    new query below the floor emits nothing.
 *  - Multiple delta types can fire on the same query (e.g. rank moved AND
 *    impressions spiked). Each emits a separate row so the trigger router
 *    can route each signal independently.
 */
export function computeGscDeltas(
  prior: GscQueryRow[],
  current: GscQueryRow[],
): GscDelta[] {
  const priorByQuery = new Map(prior.map((r) => [r.query, r]));
  const out: GscDelta[] = [];

  for (const c of current) {
    if (!c.query) continue;
    const p = priorByQuery.get(c.query);

    // New query path.
    if (!p) {
      if (c.impressions >= NEW_QUERY_IMPRESSION_FLOOR) {
        out.push({
          query: c.query,
          signal_type: "gsc_new_query",
          impressionsBefore: 0,
          impressionsAfter: c.impressions,
          severity: "watch",
        });
      }
      continue;
    }

    // Rank delta.
    const rankDelta = c.position - p.position;
    if (Math.abs(rankDelta) >= RANK_DELTA_THRESHOLD) {
      out.push({
        query: c.query,
        signal_type: "gsc_rank_delta",
        rankBefore: p.position,
        rankAfter: c.position,
        rankDelta,
        severity: Math.abs(rankDelta) >= 5 ? "action" : "watch",
      });
    }

    // Impression spike.
    if (p.impressions > 0) {
      const pct = ((c.impressions - p.impressions) / p.impressions) * 100;
      if (Math.abs(pct) >= IMPRESSION_SPIKE_PCT) {
        out.push({
          query: c.query,
          signal_type: "gsc_impression_spike",
          impressionsBefore: p.impressions,
          impressionsAfter: c.impressions,
          impressionPct: pct,
          severity: Math.abs(pct) >= 100 ? "action" : "watch",
        });
      }
    }
  }

  return out;
}
