/**
 * Continuous Answer Engine Loop — shared types.
 *
 * Architecture spec AR-009. Phase 1.
 */

export type SignalType =
  | "gsc_rank_delta"
  | "gsc_impression_spike"
  | "gsc_new_query"
  | "gbp_review_new"
  | "gbp_rating_shift"
  | "competitor_top10"
  | "aeo_citation_lost"
  | "aeo_citation_new"
  | "aeo_citation_competitor";

export type Severity = "info" | "watch" | "action";

export type AeoPlatform =
  | "google_ai_overviews"
  | "chatgpt"
  | "perplexity"
  | "claude"
  | "gemini"
  | "siri";

export type LiveActivityEntryType =
  | "signal_received"
  | "regeneration_attempted"
  | "regeneration_published"
  | "regeneration_held"
  | "citation_recovered"
  | "citation_lost"
  | "watching_started";

export interface SignalEventRow {
  id: string;
  practice_id: number;
  signal_type: SignalType;
  signal_data: Record<string, unknown>;
  severity: Severity;
  recommended_action: string | null;
  processed: boolean;
  processed_at: Date | null;
  created_at: Date;
}

/** GSC query row as returned by the searchconsole API. */
export interface GscQueryRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

export interface GscWindowResult {
  startDate: string;
  endDate: string;
  rows: GscQueryRow[];
}

export interface GscDelta {
  query: string;
  signal_type: "gsc_rank_delta" | "gsc_impression_spike" | "gsc_new_query";
  /** -ve = improved (lower position is better); +ve = worsened. */
  rankDelta?: number;
  rankBefore?: number;
  rankAfter?: number;
  /** % delta in impressions (current / prior - 1) * 100; null if prior was 0. */
  impressionPct?: number;
  impressionsBefore?: number;
  impressionsAfter?: number;
  severity: Severity;
}

export interface SignalWatcherRunResult {
  practicesChecked: number;
  practicesSkipped: number;
  signalsEmitted: number;
  perPractice: Array<{
    practiceId: number;
    name: string;
    queriesFetchedCurrent: number;
    queriesFetchedPrior: number;
    deltasFound: number;
    skipReason?: string;
  }>;
}

export interface CitationResult {
  cited: boolean;
  citation_url?: string;
  citation_position?: number;
  competitor_cited?: string;
  raw_response: Record<string, unknown>;
  /** Latency of the fetch (ms). */
  latency_ms: number;
}

export interface AeoMonitorRunResult {
  practicesChecked: number;
  queriesChecked: number;
  citationsRecorded: number;
  signalsEmitted: number;
  perPractice: Array<{
    practiceId: number;
    name: string;
    queriesChecked: number;
    citedCount: number;
    competitorCitedCount: number;
    deltas: number;
    skipReason?: string;
  }>;
}

export interface TriggerRouterRunResult {
  eventsConsidered: number;
  eventsRouted: number;
  eventsSkippedIdempotent: number;
  eventsFailed: number;
}
