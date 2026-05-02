/**
 * Multi-Platform AEO Monitor (Continuous Answer Engine Loop, Phase 3).
 *
 * Iterates the platform registry for each (practice, query) pair,
 * records aeo_citations rows, and detects citation deltas vs the most
 * recent prior row per (practice, query, platform). Emits signal_events
 * on every delta classified by the existing Phase 1 logic
 * (`classifyCitationDelta`).
 *
 * Platforms with `isAvailable() === false` are skipped silently (e.g.
 * Siri without a manual override; ChatGPT without OPENAI_API_KEY). The
 * Phase 1 single-platform `runAeoMonitor` entry point remains for the
 * existing daily Google AI Overviews cron; this multi-platform monitor
 * is invoked separately when the answer_engine_multiplatform feature
 * flag flips on per practice.
 */

import {
  classifyCitationDelta,
  composeAeoRecommendedAction,
  getLatestCitation,
  loadActiveQueries,
  loadAeoActivePractices,
  recordCitation,
  type AeoMonitorPractice,
} from "./aeoMonitor";
import { emitSignalEvent } from "./signalWatcher";
import { PLATFORM_ADAPTERS } from "./platforms/registry";
import type { CitationResult, AeoPlatform } from "./types";

export interface MultiplatformRunInput {
  practiceIdsOverride?: number[];
  /**
   * Limit polling to this subset of platforms. Default: all platforms
   * for which `isAvailable()` returns true.
   */
  platformsOverride?: AeoPlatform[];
  /**
   * Per-platform per-query test override. Lets smoke tests inject a
   * deterministic CitationResult without burning provider tokens.
   *
   * Map shape: `{ chatgpt: { 'query string': { text, citationUrls } } }`
   */
  rawResponseOverrides?: Partial<
    Record<AeoPlatform, Record<string, { text: string; citationUrls?: string[] }>>
  >;
  /** Skip writing aeo_citations rows + signal_events (dry run). */
  dryRun?: boolean;
}

export interface MultiplatformRunResult {
  practicesChecked: number;
  totalCalls: number;
  citationsRecorded: number;
  signalsEmitted: number;
  perPlatform: Array<{
    platform: AeoPlatform;
    label: string;
    callsAttempted: number;
    callsSucceeded: number;
    skipped: boolean;
    skipReason?: string;
  }>;
}

export async function runAeoMonitorAcrossPlatforms(
  input: MultiplatformRunInput = {},
): Promise<MultiplatformRunResult> {
  const practices = await loadAeoActivePractices(input.practiceIdsOverride);
  const adapters = filterAdapters(input.platformsOverride);

  const out: MultiplatformRunResult = {
    practicesChecked: 0,
    totalCalls: 0,
    citationsRecorded: 0,
    signalsEmitted: 0,
    perPlatform: adapters.map((a) => ({
      platform: a.platform,
      label: a.label,
      callsAttempted: 0,
      callsSucceeded: 0,
      skipped: !a.isAvailable() && !hasOverride(input, a.platform),
      skipReason: !a.isAvailable() && !hasOverride(input, a.platform)
        ? "adapter not available (missing API key or manual platform)"
        : undefined,
    })),
  };

  for (const practice of practices) {
    out.practicesChecked += 1;
    const queries = await loadActiveQueries(practice.specialty);
    for (const adapter of adapters) {
      const summary = out.perPlatform.find((p) => p.platform === adapter.platform);
      if (!summary || summary.skipped) continue;
      for (const queryRow of queries) {
        summary.callsAttempted += 1;
        out.totalCalls += 1;
        const override = input.rawResponseOverrides?.[adapter.platform]?.[queryRow.query];
        let result: CitationResult;
        try {
          result = await adapter.checkCitation({
            query: queryRow.query,
            practice,
            rawResponseOverride: override,
          });
          summary.callsSucceeded += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[AeoMultiplatform] ${adapter.label} failed for practice ${practice.id} q="${queryRow.query}": ${message}`,
          );
          continue;
        }
        if (input.dryRun) continue;
        await processCitation({
          practice,
          query: queryRow.query,
          platform: adapter.platform,
          result,
          counters: out,
        });
      }
    }
  }

  return out;
}

async function processCitation(input: {
  practice: AeoMonitorPractice;
  query: string;
  platform: AeoPlatform;
  result: CitationResult;
  counters: MultiplatformRunResult;
}): Promise<void> {
  const prior = await getLatestCitation(
    input.practice.id,
    input.query,
    input.platform,
  );
  await recordCitation({
    practice_id: input.practice.id,
    query: input.query,
    platform: input.platform,
    result: input.result,
  });
  input.counters.citationsRecorded += 1;

  const classification = classifyCitationDelta(prior, input.result);
  if (classification.signalType) {
    await emitSignalEvent({
      practice_id: input.practice.id,
      signal_type: classification.signalType,
      signal_data: {
        query: input.query,
        platform: input.platform,
        cited: input.result.cited,
        competitor_cited: input.result.competitor_cited,
        prior_cited: prior?.cited ?? null,
        prior_competitor: prior?.competitor_cited ?? null,
      },
      severity: classification.severity,
      recommended_action: composeAeoRecommendedAction(
        classification.signalType,
        input.query,
      ),
    });
    input.counters.signalsEmitted += 1;
  }
}

function filterAdapters(platforms?: AeoPlatform[]) {
  if (!platforms || platforms.length === 0) return PLATFORM_ADAPTERS;
  return PLATFORM_ADAPTERS.filter((a) => platforms.includes(a.platform));
}

function hasOverride(
  input: MultiplatformRunInput,
  platform: AeoPlatform,
): boolean {
  const map = input.rawResponseOverrides?.[platform];
  if (!map) return false;
  return Object.keys(map).length > 0;
}
