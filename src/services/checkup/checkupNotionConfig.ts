/**
 * Notion-driven copy config for the Checkup Tool.
 *
 * Loads from "Checkup Tool Copy v1" page under Alloro HQ.
 * 24h stale-while-revalidate cache. Falls back to defaults.
 */

import axios from "axios";

const CHECKUP_COPY_PAGE_ID = "34afdaf1-20c4-81a4-b262-d89fc40bdf9a";
const NOTION_API_VERSION = "2022-06-28";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const STALE_GRACE = 24 * 60 * 60 * 1000;

export interface CheckupCopyConfig {
  headline: string;
  subheadline: string;
  ctaLabel: string;
  ctaDescription: string;
  disclaimer: string;
  scoreLabels: Record<string, string>;
  summaryTemplates: Record<string, string>;
  source: "notion" | "fallback";
  loadedAt: string;
}

const DEFAULT_CONFIG: CheckupCopyConfig = {
  headline: "",
  subheadline: "",
  ctaLabel: "See the full report",
  ctaDescription:
    "Get your complete Recognition Report with competitor comparison, specific recommendations, and a weekly update showing your progress.",
  disclaimer:
    "Scores are based on publicly available data from Google and your website. No login required. No data stored without your permission.",
  scoreLabels: {
    strong: "Strong",
    developing: "Developing",
    needs_attention: "Needs attention",
  },
  summaryTemplates: {},
  source: "fallback",
  loadedAt: new Date().toISOString(),
};

let cache: CheckupCopyConfig | null = null;
let cacheExpiry = 0;
let staleCacheExpiry = 0;

function getNotionToken(): string | null {
  return process.env.NOTION_TOKEN ?? process.env.N8N_NOTION_TOKEN ?? null;
}

export async function loadCheckupCopyConfig(): Promise<CheckupCopyConfig> {
  if (cache && Date.now() < cacheExpiry) return cache;
  if (cache && Date.now() < staleCacheExpiry) {
    refreshInBackground();
    return cache;
  }
  return await refreshConfig();
}

async function refreshConfig(): Promise<CheckupCopyConfig> {
  const token = getNotionToken();
  if (!token || !CHECKUP_COPY_PAGE_ID) {
    cache = { ...DEFAULT_CONFIG, loadedAt: new Date().toISOString() };
    cacheExpiry = Date.now() + CACHE_TTL;
    staleCacheExpiry = Date.now() + CACHE_TTL + STALE_GRACE;
    return cache;
  }

  try {
    const blocks = await fetchBlocks(CHECKUP_COPY_PAGE_ID, token);
    const pageText = blocks.map(blockToText).join("\n");

    const configMatch = pageText.match(
      /```(?:json)?\s*alloro:checkup-copy\s+([\s\S]+?)```/i
    );

    if (configMatch) {
      const parsed = JSON.parse(configMatch[1]);
      cache = {
        headline: parsed.headline ?? DEFAULT_CONFIG.headline,
        subheadline: parsed.subheadline ?? DEFAULT_CONFIG.subheadline,
        ctaLabel: parsed.ctaLabel ?? DEFAULT_CONFIG.ctaLabel,
        ctaDescription: parsed.ctaDescription ?? DEFAULT_CONFIG.ctaDescription,
        disclaimer: parsed.disclaimer ?? DEFAULT_CONFIG.disclaimer,
        scoreLabels: { ...DEFAULT_CONFIG.scoreLabels, ...(parsed.scoreLabels ?? {}) },
        summaryTemplates: { ...DEFAULT_CONFIG.summaryTemplates, ...(parsed.summaryTemplates ?? {}) },
        source: "notion",
        loadedAt: new Date().toISOString(),
      };
    } else {
      cache = { ...DEFAULT_CONFIG, source: "notion", loadedAt: new Date().toISOString() };
    }

    cacheExpiry = Date.now() + CACHE_TTL;
    staleCacheExpiry = Date.now() + CACHE_TTL + STALE_GRACE;
    return cache;
  } catch {
    cache = { ...DEFAULT_CONFIG, loadedAt: new Date().toISOString() };
    cacheExpiry = Date.now() + CACHE_TTL;
    staleCacheExpiry = Date.now() + CACHE_TTL + STALE_GRACE;
    return cache;
  }
}

function refreshInBackground(): void {
  refreshConfig().catch(() => {});
}

async function fetchBlocks(pageId: string, token: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;
  do {
    const url = new URL(`https://api.notion.com/v1/blocks/${pageId}/children`);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const response = await axios.get(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_API_VERSION },
      timeout: 8000,
    });
    blocks.push(...response.data.results);
    cursor = response.data.has_more ? response.data.next_cursor ?? undefined : undefined;
  } while (cursor);
  return blocks;
}

function blockToText(block: any): string {
  const t = block.type;
  const data = block[t];
  if (!data) return "";
  if (Array.isArray(data.rich_text)) {
    return data.rich_text.map((r: any) => r?.plain_text ?? "").join("");
  }
  return data.plain_text ?? "";
}
