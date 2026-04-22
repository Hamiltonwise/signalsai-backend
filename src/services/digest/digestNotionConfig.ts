/**
 * Notion-driven config for the Weekly Digest structure.
 *
 * Loads from "Weekly Digest — Structure v1" page under Alloro HQ.
 * 24h stale-while-revalidate cache. Falls back to defaults if Notion
 * is unavailable. Uses existing NOTION_TOKEN env var; if N8N token
 * still present, uses it as fallback. Logs which integration served.
 */

import axios from "axios";

const DIGEST_CONFIG_PAGE_ID = "34afdaf1-20c4-81d4-af64-f12e82311e25";
const NOTION_API_VERSION = "2022-06-28";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const STALE_GRACE = 24 * 60 * 60 * 1000; // 24h stale-while-revalidate

export interface DigestStructureConfig {
  subjectTemplate: string;
  sectionTitles: Record<string, string>;
  voiceTone: string;
  sendTimeLocal: string; // "07:00" in practice timezone
  sendDayOfWeek: number; // 1 = Monday
  source: "notion" | "fallback";
  loadedAt: string;
}

const DEFAULT_CONFIG: DigestStructureConfig = {
  subjectTemplate: "{orgName} — Your Weekly Recognition Report",
  sectionTitles: {
    tri_score: "Your Recognition Score",
    signals: "What we noticed this week",
    actions: "What Alloro did for you",
    recommendations: "What we recommend",
    patient_quote: "What your patients said",
  },
  voiceTone: "Trusted colleague, not marketing. Plain English. Specific to this practice.",
  sendTimeLocal: "07:00",
  sendDayOfWeek: 1, // Monday
  source: "fallback",
  loadedAt: new Date().toISOString(),
};

let cache: DigestStructureConfig | null = null;
let cacheExpiry = 0;
let staleCacheExpiry = 0;

function getNotionToken(): string | null {
  // Primary: use existing NOTION_TOKEN
  const primary = process.env.NOTION_TOKEN;
  if (primary) {
    return primary;
  }

  // Fallback: N8N-provisioned token (if Dave hasn't swapped yet)
  const n8nToken = process.env.N8N_NOTION_TOKEN;
  if (n8nToken) {
    console.log(
      "[DIGEST-CONFIG] Using N8N_NOTION_TOKEN as fallback — NOTION_TOKEN not set"
    );
    return n8nToken;
  }

  return null;
}

export async function loadDigestStructureConfig(): Promise<DigestStructureConfig> {
  // Serve from cache if fresh
  if (cache && Date.now() < cacheExpiry) {
    return cache;
  }

  // Serve stale while revalidating in background
  if (cache && Date.now() < staleCacheExpiry) {
    refreshInBackground();
    return cache;
  }

  return await refreshConfig();
}

async function refreshConfig(): Promise<DigestStructureConfig> {
  const token = getNotionToken();
  if (!token || !DIGEST_CONFIG_PAGE_ID) {
    cache = { ...DEFAULT_CONFIG, loadedAt: new Date().toISOString() };
    cacheExpiry = Date.now() + CACHE_TTL;
    staleCacheExpiry = Date.now() + CACHE_TTL + STALE_GRACE;
    return cache;
  }

  try {
    const blocks = await fetchBlocks(DIGEST_CONFIG_PAGE_ID, token);
    const pageText = blocks.map(blockToText).join("\n");

    const configMatch = pageText.match(
      /```(?:json)?\s*alloro:digest-structure\s+([\s\S]+?)```/i
    );

    if (configMatch) {
      const parsed = JSON.parse(configMatch[1]);
      cache = {
        subjectTemplate:
          parsed.subjectTemplate ?? DEFAULT_CONFIG.subjectTemplate,
        sectionTitles: {
          ...DEFAULT_CONFIG.sectionTitles,
          ...(parsed.sectionTitles ?? {}),
        },
        voiceTone: parsed.voiceTone ?? DEFAULT_CONFIG.voiceTone,
        sendTimeLocal: parsed.sendTimeLocal ?? DEFAULT_CONFIG.sendTimeLocal,
        sendDayOfWeek: parsed.sendDayOfWeek ?? DEFAULT_CONFIG.sendDayOfWeek,
        source: "notion",
        loadedAt: new Date().toISOString(),
      };

      const tokenSource = process.env.NOTION_TOKEN
        ? "NOTION_TOKEN"
        : "N8N_NOTION_TOKEN";
      console.log(
        `[DIGEST-CONFIG] Loaded from Notion via ${tokenSource}`
      );
    } else {
      cache = { ...DEFAULT_CONFIG, source: "notion", loadedAt: new Date().toISOString() };
    }

    cacheExpiry = Date.now() + CACHE_TTL;
    staleCacheExpiry = Date.now() + CACHE_TTL + STALE_GRACE;
    return cache;
  } catch (err: any) {
    console.warn(
      `[DIGEST-CONFIG] Notion fetch failed (${err?.message ?? "unknown"}) — using fallback`
    );
    cache = { ...DEFAULT_CONFIG, loadedAt: new Date().toISOString() };
    cacheExpiry = Date.now() + CACHE_TTL;
    staleCacheExpiry = Date.now() + CACHE_TTL + STALE_GRACE;
    return cache;
  }
}

function refreshInBackground(): void {
  refreshConfig().catch(() => {
    // Background refresh failure is non-fatal
  });
}

async function fetchBlocks(pageId: string, token: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(
      `https://api.notion.com/v1/blocks/${pageId}/children`
    );
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const response = await axios.get(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_API_VERSION,
      },
      timeout: 8000,
    });

    blocks.push(...response.data.results);
    cursor = response.data.has_more
      ? response.data.next_cursor ?? undefined
      : undefined;
  } while (cursor);

  return blocks;
}

function blockToText(block: any): string {
  const t = block.type;
  const data = block[t];
  if (!data) return "";
  if (Array.isArray(data.rich_text)) {
    return data.rich_text
      .map((r: any) => (typeof r?.plain_text === "string" ? r.plain_text : ""))
      .join("");
  }
  if (typeof data.plain_text === "string") return data.plain_text;
  return "";
}
