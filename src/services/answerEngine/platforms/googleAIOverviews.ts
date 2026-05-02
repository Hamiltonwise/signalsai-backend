/**
 * Google AI Overviews adapter (Phase 3).
 *
 * Reuses the SerpAPI + HTML scrape detection path that shipped in Phase 1
 * (`aeoMonitor.ts:defaultCitationFetcher`). Phase 3 wraps it as a
 * PlatformAdapter so the multi-platform monitor can dispatch uniformly.
 *
 * Continues using SerpAPI as the primary data source. Estimated cost per
 * query: ~$0.005 SerpAPI (5 cents per 10k credits at $50/month plan).
 */

import { fetchCitationViaPhase1 } from "../aeoMonitor";
import type { PlatformAdapter, CitationCheckInput } from "./types";

export const googleAIOverviewsAdapter: PlatformAdapter = {
  platform: "google_ai_overviews",
  label: "Google AI Overviews",
  estimatedCostUsd: 0.005,
  isAvailable(): boolean {
    // Available whenever SerpAPI key OR Anthropic key (HTML fallback) is set.
    return !!(process.env.SERPAPI_API_KEY || process.env.ANTHROPIC_API_KEY);
  },
  async checkCitation(input: CitationCheckInput) {
    return await fetchCitationViaPhase1({
      query: input.query,
      practice: input.practice,
      rawResponseOverride: input.rawResponseOverride,
    });
  },
};
