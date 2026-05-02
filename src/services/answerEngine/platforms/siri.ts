/**
 * Siri adapter (Phase 3).
 *
 * No public API. Per spec, Phase 3 ships a manual-queue placeholder:
 * citation checks are recorded as `not_polled` and a row is inserted
 * into a manual-verification queue (the existing dream_team_tasks
 * table) for Corey or a designated reviewer to fill in weekly via
 * Apple Business Connect data.
 *
 * `checkCitation` returns a CitationResult with `cited: false` and
 * `raw_response.source: "siri_manual_queue"` so consumers can
 * distinguish "we tried but the platform has no API" from "we did not
 * try yet" (the not_polled cell state). The aeo_citations writer can
 * choose to skip recording these rows when the orchestrator passes
 * `skipManualPlatforms: true` (default behavior).
 */

import {
  type CitationCheckInput,
  type PlatformAdapter,
} from "./types";

export const siriAdapter: PlatformAdapter = {
  platform: "siri",
  label: "Siri",
  estimatedCostUsd: 0,
  isAvailable(): boolean {
    return false; // Manual platform; no automated availability.
  },
  async checkCitation(input: CitationCheckInput) {
    const start = Date.now();
    if (input.rawResponseOverride) {
      // Test override path: act as if a manual reviewer entered the
      // result. Used in smoke tests to validate downstream wiring.
      return {
        cited: !!input.rawResponseOverride.text
          .toLowerCase()
          .includes(input.practice.name.toLowerCase()),
        citation_url: input.rawResponseOverride.citationUrls?.[0],
        raw_response: { source: "siri_manual_override", text: input.rawResponseOverride.text },
        latency_ms: Date.now() - start,
      };
    }
    return {
      cited: false,
      raw_response: {
        source: "siri_manual_queue",
        note: "Siri has no public API. Phase 3 ships a manual verification queue; see dream_team_tasks rows tagged 'aeo_siri_manual_check'.",
      },
      latency_ms: Date.now() - start,
    };
  },
};
