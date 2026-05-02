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

import { db } from "../../database/connection";
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
import { isEnabled } from "../featureFlags";
import type { CitationResult, AeoPlatform } from "./types";

export type PollingMode = "full" | "movement_only";

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
  /**
   * Cost-discipline knob. "full" polls every (practice, query, platform)
   * cell on each run -- intended for the daily cron. "movement_only"
   * filters queries per (practice, platform) to only those that have
   * had a citation delta in the last MOVEMENT_LOOKBACK_DAYS days --
   * intended for the hourly cron. Defaults to "full" so behavior is
   * unchanged unless caller opts in.
   */
  pollingMode?: PollingMode;
  /**
   * Override the per-adapter samplingRate. Use 1.0 in tests to make
   * Opus sampling deterministic; otherwise rely on the adapter default.
   */
  samplingRateOverride?: Partial<Record<AeoPlatform, number>>;
  /**
   * Skip the answer_engine_multiplatform per-practice flag check.
   * Used for smoke tests; the production cron leaves this off so
   * unflagged practices are skipped silently.
   */
  bypassFeatureFlag?: boolean;
}

const MOVEMENT_LOOKBACK_DAYS = 7;

export interface MultiplatformRunResult {
  practicesChecked: number;
  practicesSkippedFlag: number;
  totalCalls: number;
  callsSampledOut: number;
  queriesSkippedNoMovement: number;
  citationsRecorded: number;
  signalsEmitted: number;
  perPlatform: Array<{
    platform: AeoPlatform;
    label: string;
    callsAttempted: number;
    callsSucceeded: number;
    callsSampledOut: number;
    skipped: boolean;
    skipReason?: string;
  }>;
}

export async function runAeoMonitorAcrossPlatforms(
  input: MultiplatformRunInput = {},
): Promise<MultiplatformRunResult> {
  const practices = await loadAeoActivePractices(input.practiceIdsOverride);
  const adapters = filterAdapters(input.platformsOverride);
  const pollingMode: PollingMode = input.pollingMode ?? "full";

  const out: MultiplatformRunResult = {
    practicesChecked: 0,
    practicesSkippedFlag: 0,
    totalCalls: 0,
    callsSampledOut: 0,
    queriesSkippedNoMovement: 0,
    citationsRecorded: 0,
    signalsEmitted: 0,
    perPlatform: adapters.map((a) => ({
      platform: a.platform,
      label: a.label,
      callsAttempted: 0,
      callsSucceeded: 0,
      callsSampledOut: 0,
      skipped: !a.isAvailable() && !hasOverride(input, a.platform),
      skipReason: !a.isAvailable() && !hasOverride(input, a.platform)
        ? "adapter not available (missing API key or manual platform)"
        : undefined,
    })),
  };

  for (const practice of practices) {
    // Per-practice feature flag gate. Skip practices that have not been
    // flipped on for the multi-platform monitor.
    if (!input.bypassFeatureFlag) {
      const flagOn = await isEnabled("answer_engine_multiplatform", practice.id);
      if (!flagOn) {
        out.practicesSkippedFlag += 1;
        continue;
      }
    }

    out.practicesChecked += 1;
    const queries = await loadActiveQueries(practice.specialty);
    for (const adapter of adapters) {
      const summary = out.perPlatform.find((p) => p.platform === adapter.platform);
      if (!summary || summary.skipped) continue;

      // Movement-gated polling: filter queries to those with citation
      // movement on this (practice, platform) in the last 7 days. The
      // first call per cell always runs (no prior row to gate on).
      const eligibleQueries =
        pollingMode === "movement_only"
          ? await filterQueriesByMovement(practice.id, adapter.platform, queries.map((q) => q.query))
          : queries.map((q) => q.query);

      const skippedThisAdapter =
        queries.length - eligibleQueries.length;
      if (skippedThisAdapter > 0) {
        out.queriesSkippedNoMovement += skippedThisAdapter;
      }

      // Per-adapter sampling: when sampling rate < 1, roll a die per
      // call. Override via samplingRateOverride for deterministic tests.
      const samplingRate = resolveSamplingRate(input, adapter);

      for (const query of eligibleQueries) {
        // Sampling decision (1.0 always passes).
        if (samplingRate < 1 && Math.random() >= samplingRate) {
          summary.callsSampledOut += 1;
          out.callsSampledOut += 1;
          continue;
        }
        summary.callsAttempted += 1;
        out.totalCalls += 1;
        const override = input.rawResponseOverrides?.[adapter.platform]?.[query];
        let result: CitationResult;
        try {
          result = await adapter.checkCitation({
            query,
            practice,
            rawResponseOverride: override,
          });
          summary.callsSucceeded += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[AeoMultiplatform] ${adapter.label} failed for practice ${practice.id} q="${query}": ${message}`,
          );
          continue;
        }
        if (input.dryRun) continue;
        await processCitation({
          practice,
          query,
          platform: adapter.platform,
          result,
          counters: out,
        });
      }
    }
  }

  return out;
}

function resolveSamplingRate(
  input: MultiplatformRunInput,
  adapter: { platform: AeoPlatform; samplingRate?: number },
): number {
  if (input.samplingRateOverride && input.samplingRateOverride[adapter.platform] !== undefined) {
    return input.samplingRateOverride[adapter.platform]!;
  }
  return adapter.samplingRate ?? 1;
}

/**
 * Movement-gated polling helper. Returns the subset of `queries` that
 * have had at least one citation status change for this
 * (practice, platform) in the last MOVEMENT_LOOKBACK_DAYS days.
 *
 * The first poll for a (practice, platform, query) cell has no prior
 * row, so it is always considered "moved" and runs.
 */
export async function filterQueriesByMovement(
  practiceId: number,
  platform: AeoPlatform,
  queries: string[],
): Promise<string[]> {
  if (queries.length === 0) return [];
  const since = new Date(Date.now() - MOVEMENT_LOOKBACK_DAYS * 24 * 3600 * 1000);

  // Two-pass: which queries have ANY row, and of those, which have ≥2
  // distinct citation states in the lookback window. Queries with no
  // rows fall through (first-run -> always poll).
  const rows = await db("aeo_citations")
    .where("practice_id", practiceId)
    .andWhere("platform", platform)
    .andWhere("checked_at", ">=", since)
    .whereIn("query", queries)
    .select("query", "cited", "competitor_cited", "checked_at")
    .orderBy("checked_at", "desc");

  const byQuery = new Map<string, Array<{ cited: boolean; competitor_cited: string | null }>>();
  for (const r of rows as Array<{
    query: string;
    cited: boolean;
    competitor_cited: string | null;
  }>) {
    const arr = byQuery.get(r.query) || [];
    arr.push({ cited: r.cited, competitor_cited: r.competitor_cited });
    byQuery.set(r.query, arr);
  }

  return queries.filter((q) => {
    const history = byQuery.get(q);
    if (!history || history.length === 0) return true; // first run = poll
    const hasMovement = history.some(
      (h, i) =>
        i > 0 &&
        (h.cited !== history[i - 1].cited ||
          h.competitor_cited !== history[i - 1].competitor_cited),
    );
    return hasMovement;
  });
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
