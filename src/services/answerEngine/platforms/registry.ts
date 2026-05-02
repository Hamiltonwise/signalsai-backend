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
 */
export function projectDailyCostUsd(
  practiceCount: number,
  queryCount: number,
): {
  total: number;
  byPlatform: Array<{ platform: AeoPlatform; perCall: number; calls: number; subtotal: number }>;
} {
  const byPlatform = PLATFORM_ADAPTERS.map((a) => {
    const calls = practiceCount * queryCount;
    return {
      platform: a.platform,
      perCall: a.estimatedCostUsd,
      calls,
      subtotal: a.estimatedCostUsd * calls,
    };
  });
  const total = byPlatform.reduce((sum, b) => sum + b.subtotal, 0);
  return { total, byPlatform };
}
