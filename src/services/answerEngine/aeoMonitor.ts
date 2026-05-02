/**
 * AEO Monitor (Continuous Answer Engine Loop, Phase 1).
 *
 * For each active practice and each active aeo_test_queries row matching
 * the practice's specialty, fetch the Google AI Overview for the query,
 * detect whether the practice is cited (or whether a competitor is cited
 * instead), record the result in aeo_citations, and emit a signal_event
 * row whenever the citation status changes vs the most recent prior row.
 *
 * Phase 1 platform: 'google_ai_overviews' only. Phase 3 adds ChatGPT,
 * Perplexity, Claude, Gemini, Siri.
 *
 * Citation detection (Phase 1):
 *   - Tries SerpAPI first when SERPAPI_API_KEY is present (it returns a
 *     structured AI Overview block with sources).
 *   - Falls back to a direct fetch of the Google search results page and
 *     a Haiku-tier parse of the HTML to extract the AI Overview block.
 *   - In both cases, emits a CitationResult with cited / citation_url /
 *     competitor_cited / raw_response.
 *
 * The Haiku parse step is the AR-003 cost-discipline tier. It runs only
 * on the HTML fallback path. Both paths produce the same CitationResult
 * shape.
 */

import Anthropic from "@anthropic-ai/sdk";
import { db } from "../../database/connection";
import { fetchPage } from "../webFetch";
import { emitSignalEvent } from "./signalWatcher";
import type {
  AeoMonitorRunResult,
  AeoPlatform,
  CitationResult,
  Severity,
} from "./types";

// ── Config ──────────────────────────────────────────────────────────

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const PLATFORM: AeoPlatform = "google_ai_overviews";
const SERPAPI_BASE = "https://serpapi.com/search.json";

// ── Practice + query loaders ────────────────────────────────────────

export interface AeoMonitorPractice {
  id: number;
  name: string;
  /** Domain or canonical practice URL used for citation matching. */
  domain: string | null;
  city: string | null;
  state: string | null;
  /** vocabulary_configs.specialty when present, defaults to 'general'. */
  specialty: string;
  /** Competitor names to detect (best-effort; pulled from rankings_snapshots / business_data). */
  competitorNames: string[];
}

export async function loadAeoActivePractices(
  practiceIdsOverride?: number[],
): Promise<AeoMonitorPractice[]> {
  const baseQuery = db("organizations as o")
    .leftJoin("vocabulary_configs as vc", "vc.org_id", "o.id")
    .select(
      "o.id as id",
      "o.name as name",
      "o.domain as domain",
      "o.business_data as business_data",
      "vc.vertical as vertical",
    );

  const rows: Array<{
    id: number;
    name: string;
    domain: string | null;
    business_data: unknown;
    vertical: string | null;
  }> = practiceIdsOverride
    ? await baseQuery.whereIn("o.id", practiceIdsOverride)
    : await baseQuery.whereIn("o.patientpath_status", [
        "preview_ready",
        "live",
      ]);

  return rows.map((r) => {
    const businessData =
      typeof r.business_data === "string"
        ? safeParse(r.business_data)
        : (r.business_data as Record<string, unknown> | null);
    const city =
      (businessData?.city as string | undefined) ??
      (businessData?.location as string | undefined) ??
      null;
    const state = (businessData?.state as string | undefined) ?? null;
    const competitors = extractCompetitorNames(businessData);
    // Map vocabulary_configs.vertical to specialty bucket. The
    // aeo_test_queries table stores rows under specialty in
    // ('endodontics', 'orthodontics', 'general'); vertical strings
    // ('endodontist', 'orthodontist') need normalization.
    const specialty = normalizeSpecialty(r.vertical);
    return {
      id: r.id,
      name: r.name,
      domain: r.domain,
      city,
      state,
      specialty,
      competitorNames: competitors,
    };
  });
}

function normalizeSpecialty(vertical: string | null): string {
  if (!vertical) return "general";
  const v = vertical.toLowerCase();
  if (v.includes("endo")) return "endodontics";
  if (v.includes("ortho")) return "orthodontics";
  return "general";
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  } catch {
    /* ignore */
  }
  return null;
}

function extractCompetitorNames(bd: Record<string, unknown> | null): string[] {
  if (!bd) return [];
  const out: string[] = [];
  const c = bd.competitors;
  if (Array.isArray(c)) {
    for (const item of c) {
      if (typeof item === "string") out.push(item);
      else if (item && typeof item === "object" && "name" in item) {
        const n = (item as { name?: unknown }).name;
        if (typeof n === "string") out.push(n);
      }
    }
  }
  return out;
}

export interface AeoTestQuery {
  id: number;
  query: string;
  specialty: string;
  vertical: string | null;
  active: boolean;
}

export async function loadActiveQueries(specialty: string): Promise<AeoTestQuery[]> {
  return await db("aeo_test_queries")
    .select("id", "query", "specialty", "vertical", "active")
    .where("active", true)
    .andWhere(function () {
      this.where("specialty", specialty).orWhere("specialty", "general");
    });
}

// ── Citation detection ─────────────────────────────────────────────

export type CitationFetcher = (input: {
  query: string;
  practice: AeoMonitorPractice;
}) => Promise<CitationResult>;

const defaultCitationFetcher: CitationFetcher = async ({ query, practice }) => {
  const start = Date.now();
  // SerpAPI path (preferred when key is set).
  if (process.env.SERPAPI_API_KEY) {
    return await fetchViaSerpApi(query, practice, start);
  }
  // HTML fallback.
  return await fetchViaHtmlScrape(query, practice, start);
};

/**
 * Phase 3 export: lets the platform adapter wrap the Phase 1 detection
 * path uniformly. Adds a `rawResponseOverride` shortcut for testing
 * (smoke-test path bypasses real SerpAPI calls).
 */
export async function fetchCitationViaPhase1(input: {
  query: string;
  practice: AeoMonitorPractice;
  rawResponseOverride?: { text: string; citationUrls?: string[] };
}): Promise<CitationResult> {
  if (input.rawResponseOverride) {
    const start = Date.now();
    const text = input.rawResponseOverride.text;
    const haystack = text.toLowerCase();
    const nameLc = input.practice.name.toLowerCase();
    const cited = nameLc.length >= 6 && haystack.includes(nameLc);
    let competitor: string | null = null;
    if (!cited) {
      for (const c of input.practice.competitorNames) {
        if (c.length >= 6 && haystack.includes(c.toLowerCase())) {
          competitor = c;
          break;
        }
      }
    }
    const urls = input.rawResponseOverride.citationUrls ?? [];
    return {
      cited,
      citation_url: urls[0],
      competitor_cited: competitor ?? undefined,
      raw_response: { source: "override", text, urls },
      latency_ms: Date.now() - start,
    };
  }
  return await defaultCitationFetcher({ query: input.query, practice: input.practice });
}

async function fetchViaSerpApi(
  query: string,
  practice: AeoMonitorPractice,
  start: number,
): Promise<CitationResult> {
  const url = new URL(SERPAPI_BASE);
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", process.env.SERPAPI_API_KEY!);
  if (practice.city) url.searchParams.set("location", `${practice.city}${practice.state ? ", " + practice.state : ""}`);
  url.searchParams.set("hl", "en");
  try {
    const res = await fetch(url.toString());
    const json = (await res.json()) as Record<string, unknown>;
    const overview = json["ai_overview"] as Record<string, unknown> | undefined;
    const result = matchCitationInSerpApiOverview(overview ?? {}, practice);
    return {
      ...result,
      raw_response: { source: "serpapi", overview: overview ?? null },
      latency_ms: Date.now() - start,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      cited: false,
      raw_response: { source: "serpapi", error: message },
      latency_ms: Date.now() - start,
    };
  }
}

async function fetchViaHtmlScrape(
  query: string,
  practice: AeoMonitorPractice,
  start: number,
): Promise<CitationResult> {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en`;
  const page = await fetchPage(url);
  if (!page.success || !page.html) {
    return {
      cited: false,
      raw_response: { source: "html_scrape", error: page.error || "fetch failed" },
      latency_ms: Date.now() - start,
    };
  }
  // Phase 1 simplification: AI Overviews are JS-rendered and absent from
  // the static HTML. We record this as a non-cited result with a marker
  // so the data surfaces honestly (rather than fabricating). Production
  // callers should set SERPAPI_API_KEY.
  const html = page.html;
  const haikuParse = await parseHtmlForCitations(html, practice).catch(() => null);
  return {
    cited: haikuParse?.cited ?? false,
    citation_url: haikuParse?.citation_url,
    competitor_cited: haikuParse?.competitor_cited,
    raw_response: {
      source: "html_scrape",
      note: "Static HTML rarely contains AI Overview blocks; SERPAPI_API_KEY is the recommended path.",
      haiku_parse: haikuParse,
    },
    latency_ms: Date.now() - start,
  };
}

async function parseHtmlForCitations(
  html: string,
  practice: AeoMonitorPractice,
): Promise<{ cited: boolean; citation_url?: string; competitor_cited?: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const client = new Anthropic({ apiKey });
  const sample = html.slice(0, 12000);
  const competitorList = practice.competitorNames.join(", ") || "(none provided)";
  const prompt = [
    `Practice name: ${practice.name}`,
    `Practice domain: ${practice.domain ?? "(unknown)"}`,
    `Known competitors: ${competitorList}`,
    "",
    "Inspect this Google search results HTML. Determine:",
    "1. Does an AI Overview block reference the practice (by name or domain)?",
    "2. If not, does it reference a known competitor by name?",
    "3. If a citation is present, what is the source URL?",
    "",
    "Return JSON with shape: { \"cited\": boolean, \"citation_url\": string|null, \"competitor_cited\": string|null }.",
    "Return ONLY the JSON object, no surrounding text.",
    "",
    "HTML:",
    sample,
  ].join("\n");
  try {
    const message = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 256,
      messages: [{ role: "user", content: prompt }],
    });
    const block = message.content[0];
    if (!block || block.type !== "text") return null;
    return parseJsonObject(block.text);
  } catch {
    return null;
  }
}

function parseJsonObject(
  text: string,
): { cited: boolean; citation_url?: string; competitor_cited?: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const json = JSON.parse(text.slice(start, end + 1));
    if (typeof json.cited !== "boolean") return null;
    return {
      cited: json.cited,
      citation_url: typeof json.citation_url === "string" ? json.citation_url : undefined,
      competitor_cited: typeof json.competitor_cited === "string" ? json.competitor_cited : undefined,
    };
  } catch {
    return null;
  }
}

/** Pure logic: examine a SerpAPI ai_overview block for practice/competitor matches. */
export function matchCitationInSerpApiOverview(
  overview: Record<string, unknown>,
  practice: AeoMonitorPractice,
): {
  cited: boolean;
  citation_url?: string;
  citation_position?: number;
  competitor_cited?: string;
} {
  const sources = (overview.references || overview.sources || []) as Array<{
    title?: string;
    link?: string;
    source?: string;
    domain?: string;
  }>;
  if (!Array.isArray(sources) || sources.length === 0) return { cited: false };

  const practiceMarkers: string[] = [practice.name.toLowerCase()];
  if (practice.domain) practiceMarkers.push(practice.domain.toLowerCase());
  const competitors = practice.competitorNames.map((c) => c.toLowerCase());

  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const blob = [s.title, s.link, s.source, s.domain]
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.toLowerCase())
      .join(" ");
    if (practiceMarkers.some((m) => m && blob.includes(m))) {
      return { cited: true, citation_url: s.link, citation_position: i + 1 };
    }
  }

  // Practice not cited; look for competitor.
  for (const s of sources) {
    const blob = [s.title, s.link, s.source, s.domain]
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.toLowerCase())
      .join(" ");
    for (const c of competitors) {
      if (c && blob.includes(c)) {
        return { cited: false, competitor_cited: c };
      }
    }
  }
  return { cited: false };
}

// ── Persistence + delta detection ──────────────────────────────────

interface CitationRowSnapshot {
  cited: boolean;
  citation_url: string | null;
  competitor_cited: string | null;
}

export async function getLatestCitation(
  practiceId: number,
  query: string,
  platform: AeoPlatform,
): Promise<CitationRowSnapshot | null> {
  const row = await db("aeo_citations")
    .select("cited", "citation_url", "competitor_cited")
    .where({ practice_id: practiceId, query, platform })
    .orderBy("checked_at", "desc")
    .first();
  if (!row) return null;
  return {
    cited: row.cited,
    citation_url: row.citation_url,
    competitor_cited: row.competitor_cited,
  };
}

export async function recordCitation(input: {
  practice_id: number;
  query: string;
  platform: AeoPlatform;
  result: CitationResult;
}): Promise<string> {
  const [row] = await db("aeo_citations")
    .insert({
      practice_id: input.practice_id,
      query: input.query,
      platform: input.platform,
      cited: input.result.cited,
      citation_url: input.result.citation_url ?? null,
      citation_position: input.result.citation_position ?? null,
      competitor_cited: input.result.competitor_cited ?? null,
      raw_response: JSON.stringify(input.result.raw_response),
    })
    .returning(["id"]);
  return (row as { id: string }).id;
}

/** Compute the citation-change classification between prior and current. */
export function classifyCitationDelta(
  prior: CitationRowSnapshot | null,
  current: CitationResult,
): {
  signalType: "aeo_citation_lost" | "aeo_citation_new" | "aeo_citation_competitor" | null;
  severity: Severity;
} {
  if (!prior) {
    if (current.cited) return { signalType: "aeo_citation_new", severity: "watch" };
    return { signalType: null, severity: "info" };
  }
  if (prior.cited && !current.cited) return { signalType: "aeo_citation_lost", severity: "action" };
  if (!prior.cited && current.cited) return { signalType: "aeo_citation_new", severity: "watch" };
  if (
    !current.cited &&
    current.competitor_cited &&
    current.competitor_cited !== prior.competitor_cited
  ) {
    return { signalType: "aeo_citation_competitor", severity: "action" };
  }
  return { signalType: null, severity: "info" };
}

// ── Run entry point ─────────────────────────────────────────────────

export interface RunAeoMonitorInput {
  citationFetcher?: CitationFetcher;
  practiceIdsOverride?: number[];
  /** Limit queries per practice (for smoke tests). Default: all. */
  maxQueriesPerPractice?: number;
  /** When true, do not write aeo_citations or signal_events rows; return data for inspection. */
  dryRun?: boolean;
}

export interface RunAeoMonitorResult extends AeoMonitorRunResult {
  /** Set when dryRun=true. */
  inspect?: Array<{
    practiceId: number;
    query: string;
    result: CitationResult;
    classification: ReturnType<typeof classifyCitationDelta>;
  }>;
}

export async function runAeoMonitor(
  input: RunAeoMonitorInput = {},
): Promise<RunAeoMonitorResult> {
  const fetcher = input.citationFetcher ?? defaultCitationFetcher;
  const practices = await loadAeoActivePractices(input.practiceIdsOverride);

  const out: RunAeoMonitorResult = {
    practicesChecked: 0,
    queriesChecked: 0,
    citationsRecorded: 0,
    signalsEmitted: 0,
    perPractice: [],
    inspect: input.dryRun ? [] : undefined,
  };

  for (const p of practices) {
    let queriesChecked = 0;
    let citedCount = 0;
    let competitorCitedCount = 0;
    let deltas = 0;
    let skipReason: string | undefined;

    try {
      const allQueries = await loadActiveQueries(p.specialty);
      const queries = input.maxQueriesPerPractice
        ? allQueries.slice(0, input.maxQueriesPerPractice)
        : allQueries;

      for (const q of queries) {
        const result = await fetcher({ query: q.query, practice: p });
        const prior = await getLatestCitation(p.id, q.query, PLATFORM);
        const classification = classifyCitationDelta(prior, result);

        queriesChecked += 1;
        if (result.cited) citedCount += 1;
        if (result.competitor_cited) competitorCitedCount += 1;

        if (input.dryRun) {
          out.inspect!.push({
            practiceId: p.id,
            query: q.query,
            result,
            classification,
          });
          continue;
        }

        await recordCitation({
          practice_id: p.id,
          query: q.query,
          platform: PLATFORM,
          result,
        });
        out.citationsRecorded += 1;

        if (classification.signalType) {
          await emitSignalEvent({
            practice_id: p.id,
            signal_type: classification.signalType,
            signal_data: {
              query: q.query,
              platform: PLATFORM,
              cited: result.cited,
              competitor_cited: result.competitor_cited,
              prior_cited: prior?.cited ?? null,
              prior_competitor: prior?.competitor_cited ?? null,
            },
            severity: classification.severity,
            recommended_action: composeAeoRecommendedAction(classification.signalType, q.query),
          });
          out.signalsEmitted += 1;
          deltas += 1;
        }
      }
      out.practicesChecked += 1;
    } catch (err: unknown) {
      skipReason = err instanceof Error ? err.message : String(err);
    }

    out.queriesChecked += queriesChecked;
    out.perPractice.push({
      practiceId: p.id,
      name: p.name,
      queriesChecked,
      citedCount,
      competitorCitedCount,
      deltas,
      skipReason,
    });
  }

  return out;
}

export function composeAeoRecommendedAction(
  signalType: "aeo_citation_lost" | "aeo_citation_new" | "aeo_citation_competitor",
  query: string,
): string {
  switch (signalType) {
    case "aeo_citation_lost":
      return `AI engine stopped citing the practice for "${query}". Phase 2: route to Research Agent in AEO_recovery mode to identify content gap and propose FAQ + schema fix.`;
    case "aeo_citation_new":
      return `AI engine started citing the practice for "${query}". Phase 2: monitor for sustained presence over 7 days; promote to case study if held.`;
    case "aeo_citation_competitor":
      return `Competitor took the AI citation for "${query}". Phase 2: route to Research Agent in AEO_recovery + competitive_recalibration modes.`;
  }
}

export const ANSWER_ENGINE_AEO_PLATFORM: AeoPlatform = PLATFORM;
