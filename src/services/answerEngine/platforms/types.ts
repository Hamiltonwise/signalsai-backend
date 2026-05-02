/**
 * Per-platform AEO Monitor adapters (Continuous Answer Engine Loop, Phase 3).
 *
 * Common contract: each adapter takes (query, practiceContext) and returns a
 * CitationResult shaped like Phase 1's `CitationResult`. Differences are
 * isolated in the adapter -- detection, model selection, parsing.
 *
 * Architecture spec AR-009, Component 6.
 */

import type { AeoPlatform, CitationResult } from "../types";
import type { AeoMonitorPractice } from "../aeoMonitor";

export interface CitationCheckInput {
  query: string;
  practice: AeoMonitorPractice;
  /**
   * Test-only override. When set, the adapter skips the real API call and
   * uses this content as if returned by the platform. Used to keep smoke
   * tests cheap and deterministic.
   */
  rawResponseOverride?: {
    text: string;
    /** Optional citation URLs the override should include. */
    citationUrls?: string[];
  };
}

export interface PlatformAdapter {
  platform: AeoPlatform;
  /** Display name for live activity entries and proof files. */
  label: string;
  /**
   * Returns false when the adapter is not configured to run (missing API
   * key, manual-queue platform, etc.). The orchestrator will skip without
   * recording aeo_citations rows.
   */
  isAvailable(): boolean;
  /**
   * Per-call estimated cost in USD. Used in cost projection. Pricing
   * sources: provider docs as of May 2026.
   */
  estimatedCostUsd: number;
  /**
   * Probability the adapter actually runs on a given (practice, query)
   * call when invoked by the multi-platform monitor. AR-003 + AR-006
   * cost discipline: Opus-tier adapters may run on a sampled subset.
   * 1.0 = always run. 0.1 = 10% of calls. Defaults to 1.0 if omitted.
   *
   * The orchestrator rolls a uniform random number per call; if outside
   * the rate, NEITHER the API call NOR the aeo_citations write occurs
   * (the cell shows as not_polled in the doctor-facing grid).
   */
  samplingRate?: number;
  checkCitation(input: CitationCheckInput): Promise<CitationResult>;
}

/**
 * Determine whether a given response text cites the practice. Common
 * helper used by adapters that return free-text answers (no structured
 * source list). Practice is cited when the practice name appears, the
 * canonical domain appears, or the PatientPath subdomain appears.
 */
export function detectPracticeInText(
  text: string,
  practice: AeoMonitorPractice,
): { cited: boolean; matchedTerm: string | null } {
  const haystack = text.toLowerCase();
  // Name match: lowercased substring; trim whitespace and require at
  // least 6 characters of practice name to avoid false positives.
  const nameLc = practice.name.toLowerCase();
  if (nameLc.length >= 6 && haystack.includes(nameLc)) {
    return { cited: true, matchedTerm: practice.name };
  }
  // Domain match.
  if (practice.domain) {
    const domainLc = practice.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (domainLc.length >= 6 && haystack.includes(domainLc)) {
      return { cited: true, matchedTerm: practice.domain };
    }
  }
  return { cited: false, matchedTerm: null };
}

/**
 * Find the first known competitor mentioned in the text. Used to
 * populate `competitor_cited` when the practice itself is not cited.
 */
export function detectCompetitorInText(
  text: string,
  practice: AeoMonitorPractice,
): string | null {
  const haystack = text.toLowerCase();
  for (const c of practice.competitorNames) {
    const cLc = c.toLowerCase();
    if (cLc.length >= 6 && haystack.includes(cLc)) {
      return c;
    }
  }
  return null;
}

/**
 * Compose a final CitationResult given the parsed text + matched
 * fields. Standardized across adapters so the recorder logic is
 * uniform.
 */
export function composeCitationResult(input: {
  text: string;
  citationUrls?: string[];
  practice: AeoMonitorPractice;
  startedAt: number;
  rawResponse: Record<string, unknown>;
}): CitationResult {
  const { cited, matchedTerm } = detectPracticeInText(input.text, input.practice);
  const competitor = !cited ? detectCompetitorInText(input.text, input.practice) : null;
  const citationUrl = pickCitationUrlFor(input.citationUrls, input.practice, matchedTerm);
  return {
    cited,
    citation_url: citationUrl ?? undefined,
    competitor_cited: competitor ?? undefined,
    raw_response: input.rawResponse,
    latency_ms: Date.now() - input.startedAt,
  };
}

function pickCitationUrlFor(
  urls: string[] | undefined,
  practice: AeoMonitorPractice,
  matchedTerm: string | null,
): string | null {
  if (!urls || urls.length === 0) return null;
  if (!matchedTerm) return null;
  const domain = practice.domain
    ? practice.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")
    : "";
  for (const u of urls) {
    const lc = u.toLowerCase();
    if (domain && lc.includes(domain)) return u;
  }
  // Fallback to first URL when present.
  return urls[0];
}
