/**
 * Platform Adapter Registry (Phase 3).
 *
 * Single source of truth for the per-platform AEO Monitor adapters.
 * Iteration order matches the AI Visibility grid columns rendered on
 * the doctor-facing Live Activity feed (Phase 4).
 */

import type { AeoPlatform } from "../types";
import type { PlatformAdapter } from "./types";
import { googleAIOverviewsAdapter } from "./googleAIOverviews";
import { chatGPTAdapter } from "./chatGPT";
import { perplexityAdapter } from "./perplexity";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { siriAdapter } from "./siri";

export const PLATFORM_ADAPTERS: PlatformAdapter[] = [
  googleAIOverviewsAdapter,
  chatGPTAdapter,
  perplexityAdapter,
  claudeAdapter,
  geminiAdapter,
  siriAdapter,
];

export function getAdapter(platform: AeoPlatform): PlatformAdapter | null {
  return PLATFORM_ADAPTERS.find((a) => a.platform === platform) ?? null;
}

/**
 * Estimated daily cost for the AEO Monitor across `practiceCount`
 * practices and `queryCount` queries per practice. Each adapter
 * reports its per-call cost; daily polling = 1 call per (practice,
 * query, platform) per day under the spec.
 *
 * Cost-discipline activation 2026-05-02 (AR-006): the projector now
 * factors in per-adapter samplingRate (Claude default 0.1) and an
 * optional movementHitRate to estimate the saving from movement-gated
 * polling. With `movementHitRate=0.3`, 70% of stable queries are
 * skipped on the hourly cron. Daily cron runs at hitRate=1.0.
 */
export interface ProjectionInput {
  practiceCount: number;
  queryCount: number;
  /**
   * Fraction of the (practice, query, platform) cells that the hourly
   * cron actually polls. 1.0 = full polling. 0.3 = only the 30% of
   * cells that have shown movement in the last 7 days. Use 1.0 for the
   * once-daily full cron projection.
   */
  movementHitRate?: number;
  /** Number of cron runs per day. Hourly = 24, daily = 1. */
  runsPerDay?: number;
}

export function projectDailyCostUsd(
  inputOrPractices: number | ProjectionInput,
  queryCountLegacy?: number,
): {
  total: number;
  byPlatform: Array<{
    platform: AeoPlatform;
    perCall: number;
    samplingRate: number;
    movementHitRate: number;
    runsPerDay: number;
    calls: number;
    subtotal: number;
  }>;
} {
  // Legacy positional shape: (practiceCount, queryCount). Treat as a
  // single full daily run with no sampling savings beyond the adapter
  // defaults (Claude still samples at 0.1 by default).
  const params: ProjectionInput =
    typeof inputOrPractices === "number"
      ? {
          practiceCount: inputOrPractices,
          queryCount: queryCountLegacy ?? 0,
          movementHitRate: 1.0,
          runsPerDay: 1,
        }
      : {
          ...inputOrPractices,
          movementHitRate: inputOrPractices.movementHitRate ?? 1.0,
          runsPerDay: inputOrPractices.runsPerDay ?? 1,
        };

  const byPlatform = PLATFORM_ADAPTERS.map((a) => {
    const samplingRate = a.samplingRate ?? 1;
    const baseCells = params.practiceCount * params.queryCount;
    const calls =
      baseCells *
      samplingRate *
      (params.movementHitRate ?? 1) *
      (params.runsPerDay ?? 1);
    const subtotal = a.estimatedCostUsd * calls;
    return {
      platform: a.platform,
      perCall: a.estimatedCostUsd,
      samplingRate,
      movementHitRate: params.movementHitRate ?? 1,
      runsPerDay: params.runsPerDay ?? 1,
      calls,
      subtotal,
    };
  });
  const total = byPlatform.reduce((sum, b) => sum + b.subtotal, 0);
  return { total, byPlatform };
}
