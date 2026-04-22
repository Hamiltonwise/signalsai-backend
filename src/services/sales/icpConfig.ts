/**
 * Manifest v2 Card 6 (Sales Agent Brick 1) — ICP Definition loader.
 *
 * Source of truth: Notion page "ICP Definition v1"
 *   34afdaf1-20c4-819d-9a81-e70f146f37bb
 * (sibling of "Standard Rubric v1" under Alloro HQ).
 *
 * Adaptability (memory rule 30): the Notion page is the source of truth.
 * Update the page, the Sales Agent picks up the new vertical / threshold
 * / disqualifier on next cache refresh. No code deploy.
 *
 * Cache: 24h stale-while-revalidate. If the Notion fetch fails *and* we
 * have stale cache, we serve the stale value and re-attempt next call.
 * If we have no cache and Notion fails, we return the local fallback so
 * the scanner never gets blocked by a Notion outage.
 *
 * Pattern mirrors src/services/rubric/notionLoader.ts and
 * src/services/patientpath/stages/dataGapResolver.ts (loadSourcePriority).
 */

import axios from "axios";

export const ICP_PAGE_ID = "34afdaf1-20c4-819d-9a81-e70f146f37bb";
const NOTION_API_VERSION = "2022-06-28";
const PAGE_FETCH_TIMEOUT_MS = 8000;

const ICP_CONFIG_FENCE = /```(?:json)?\s*alloro:icp-config\s+([\s\S]+?)```/i;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// ── Types ────────────────────────────────────────────────────────────

export type Vertical =
  | "endo"
  | "ortho"
  | "chiro"
  | "optometry"
  | "legal"
  | "cpa"
  | "vet"
  | "financial_advisor";

export type PracticeSize = "solo" | "small" | "medium";

export type WatcherSignalPattern =
  | "review_velocity_change"
  | "gbp_completeness_change"
  | "ranking_move"
  | "competitor_activity"
  | "recognition_score_regression"
  | "cross_practice_collision"
  | "milestone_detected"
  | "pattern_detected";

export interface VerticalRule {
  vertical: Vertical;
  practiceSizeRange: PracticeSize[];
  recognitionScoreThreshold: number;
  triggerSignals: WatcherSignalPattern[];
}

export interface LocationScope {
  metros: string[];
  excludeMarkets: string[];
}

export interface DisqualifierRules {
  existingClientCheck: boolean;
  optOutDomains: string[];
  competitorReferral: boolean;
}

export interface IcpConfig {
  verticals: VerticalRule[];
  locationScope: LocationScope;
  recognitionScoreThreshold: number;
  disqualifiers: DisqualifierRules;
  source: "notion" | "fallback" | "stale";
  loadedAt: string;
}

// ── Local fallback ───────────────────────────────────────────────────
// Ships with the binary so a Notion outage never blocks the scanner.
// Mirrors the seeded JSON in the Notion page.

const FALLBACK_ICP: IcpConfig = {
  verticals: [
    {
      vertical: "endo",
      practiceSizeRange: ["solo", "small", "medium"],
      recognitionScoreThreshold: 50,
      triggerSignals: [
        "recognition_score_regression",
        "review_velocity_change",
        "competitor_activity",
      ],
    },
    {
      vertical: "ortho",
      practiceSizeRange: ["solo", "small", "medium"],
      recognitionScoreThreshold: 50,
      triggerSignals: [
        "recognition_score_regression",
        "review_velocity_change",
        "competitor_activity",
      ],
    },
  ],
  locationScope: {
    metros: ["Los Angeles", "Orange County", "Phoenix", "Dallas"],
    excludeMarkets: [],
  },
  recognitionScoreThreshold: 50,
  disqualifiers: {
    existingClientCheck: true,
    optOutDomains: [],
    competitorReferral: true,
  },
  source: "fallback",
  loadedAt: new Date(0).toISOString(),
};

// ── Cache ────────────────────────────────────────────────────────────

interface CacheEntry {
  config: IcpConfig;
  expires: number;
}

let cache: CacheEntry | null = null;

// ── Notion fetch ─────────────────────────────────────────────────────

interface NotionBlockResponse {
  results: Array<{ id: string; type: string; [key: string]: unknown }>;
  has_more: boolean;
  next_cursor: string | null;
}

async function fetchAllBlocks(pageId: string, token: string): Promise<unknown[]> {
  const blocks: unknown[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const response = await axios.get<NotionBlockResponse>(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_API_VERSION,
      },
      timeout: PAGE_FETCH_TIMEOUT_MS,
    });

    blocks.push(...response.data.results);
    cursor = response.data.has_more ? response.data.next_cursor ?? undefined : undefined;
  } while (cursor);

  return blocks;
}

function richTextToPlain(rich: unknown): string {
  if (!Array.isArray(rich)) return "";
  return rich
    .map((r: any) => (typeof r?.plain_text === "string" ? r.plain_text : ""))
    .join("");
}

function blockToText(block: any): string {
  const t = block.type;
  const data = block[t];
  if (!data) return "";
  if (Array.isArray(data.rich_text)) return richTextToPlain(data.rich_text);
  if (typeof data.plain_text === "string") return data.plain_text;
  return "";
}

function parseConfigFromText(pageText: string): IcpConfig | null {
  const match = pageText.match(ICP_CONFIG_FENCE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed?.verticals)) return null;
    return {
      verticals: parsed.verticals as VerticalRule[],
      locationScope: {
        metros: Array.isArray(parsed?.locationScope?.metros)
          ? (parsed.locationScope.metros as string[])
          : [],
        excludeMarkets: Array.isArray(parsed?.locationScope?.excludeMarkets)
          ? (parsed.locationScope.excludeMarkets as string[])
          : [],
      },
      recognitionScoreThreshold:
        typeof parsed?.recognitionScoreThreshold === "number"
          ? parsed.recognitionScoreThreshold
          : 50,
      disqualifiers: {
        existingClientCheck: Boolean(parsed?.disqualifiers?.existingClientCheck ?? true),
        optOutDomains: Array.isArray(parsed?.disqualifiers?.optOutDomains)
          ? (parsed.disqualifiers.optOutDomains as string[])
          : [],
        competitorReferral: Boolean(parsed?.disqualifiers?.competitorReferral ?? true),
      },
      source: "notion",
      loadedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────

export interface LoadIcpResult {
  config: IcpConfig;
  warning?: string;
}

/**
 * Load the ICP definition from Notion with a 24h stale-while-revalidate
 * cache. Never throws — degrades to stale, then to local fallback.
 */
export async function loadIcpConfig(): Promise<LoadIcpResult> {
  const now = Date.now();

  // Fresh cache hit
  if (cache && cache.expires > now) {
    return { config: cache.config };
  }

  const token = process.env.NOTION_TOKEN;
  if (!token) {
    if (cache) {
      // Stale hit — serve and re-attempt next call (TTL stays expired)
      return {
        config: { ...cache.config, source: "stale" },
        warning: "NOTION_TOKEN missing — serving stale ICP config.",
      };
    }
    return {
      config: FALLBACK_ICP,
      warning: "NOTION_TOKEN missing — ICP loaded from local fallback. Adaptability DEGRADED.",
    };
  }

  try {
    const blocks = await fetchAllBlocks(ICP_PAGE_ID, token);
    const pageText = blocks.map(blockToText).join("\n");

    const parsed = parseConfigFromText(pageText);
    if (!parsed) {
      if (cache) {
        return {
          config: { ...cache.config, source: "stale" },
          warning: "ICP page missing alloro:icp-config block — serving stale.",
        };
      }
      return {
        config: FALLBACK_ICP,
        warning: "ICP page missing alloro:icp-config block — using fallback.",
      };
    }

    cache = { config: parsed, expires: now + CACHE_TTL_MS };
    return { config: parsed };
  } catch (err: any) {
    if (cache) {
      return {
        config: { ...cache.config, source: "stale" },
        warning: `Notion ICP fetch failed (${err?.message ?? "unknown"}) — serving stale.`,
      };
    }
    return {
      config: FALLBACK_ICP,
      warning: `Notion ICP fetch failed (${err?.message ?? "unknown"}) — using fallback.`,
    };
  }
}

// ── Test hooks ───────────────────────────────────────────────────────

export function _resetIcpCache(): void {
  cache = null;
}

export function _seedIcpCache(config: IcpConfig): void {
  cache = { config, expires: Date.now() + CACHE_TTL_MS };
}

export function _getFallbackIcp(): IcpConfig {
  return FALLBACK_ICP;
}
