/**
 * Material Event Thresholds config loader.
 *
 * Loads the Notion page "Material Event Thresholds v1" and parses the
 * fenced JSON block `alloro:material-event-thresholds`. Falls back to a
 * local copy when Notion is unavailable. 24h cache.
 */

import axios from "axios";

const NOTION_API_VERSION = "2022-06-28";
const CONFIG_PAGE_SEARCH_QUERY = "Material Event Thresholds v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type MaterialEventType =
  | "low_rating_review"
  | "recognition_regression"
  | "competitor_overtake"
  | "gbp_critical_field_change"
  | "gbp_verification_loss";

export interface MaterialEventThresholdSpec {
  enabled: boolean;
  severity: "info" | "warning" | "critical";
  subjectTemplate: string;
  summaryTemplate: string;
  [key: string]: unknown;
}

export interface MaterialEventThresholdsConfig {
  versionId: string;
  source: "notion" | "fallback";
  debounceHours: number;
  quietHoursLocal: { startHour: number; endHour: number };
  batchWindowMinutes: number;
  thresholds: Record<MaterialEventType, MaterialEventThresholdSpec>;
  emailStyle: {
    sender: string;
    replyTo: string;
    signatureLine: string;
    requireOneClickActions: boolean;
    allowedActionTypes: string[];
  };
  loadedAt: string;
}

interface CacheEntry {
  value: MaterialEventThresholdsConfig;
  fetchedAt: number;
}
let cache: CacheEntry | null = null;

export function _resetMaterialEventThresholdsCache(): void {
  cache = null;
}

export async function loadMaterialEventThresholds(): Promise<MaterialEventThresholdsConfig> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  const value = await fetchFromNotion();
  cache = { value, fetchedAt: Date.now() };
  return value;
}

async function fetchFromNotion(): Promise<MaterialEventThresholdsConfig> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return fallback();

  try {
    const searchResp = await axios.post(
      "https://api.notion.com/v1/search",
      {
        query: CONFIG_PAGE_SEARCH_QUERY,
        filter: { property: "object", value: "page" },
        page_size: 5,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_API_VERSION,
          "Content-Type": "application/json",
        },
        timeout: 8000,
      }
    );
    const pageId: string | undefined = searchResp.data?.results?.[0]?.id;
    if (!pageId) return fallback();

    const blocksResp = await axios.get(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Notion-Version": NOTION_API_VERSION,
        },
        timeout: 8000,
      }
    );
    const blocks: any[] = blocksResp.data?.results ?? [];
    let body = "";
    for (const b of blocks) {
      if (b.type === "code" && Array.isArray(b.code?.rich_text)) {
        body += b.code.rich_text.map((r: any) => r.plain_text ?? "").join("") + "\n";
      }
      const data = b?.[b.type];
      if (data && Array.isArray(data.rich_text)) {
        body += data.rich_text.map((r: any) => r.plain_text ?? "").join("") + "\n";
      }
    }
    const match = body.match(/alloro:material-event-thresholds\s+([\s\S]+?)(?=```|$)/);
    if (!match) return fallback();
    const parsed = JSON.parse(match[1]);
    return {
      versionId: parsed.versionId ?? "material-event-thresholds-notion-unknown",
      source: "notion",
      debounceHours:
        typeof parsed.debounceHours === "number" ? parsed.debounceHours : fallback().debounceHours,
      quietHoursLocal: parsed.quietHoursLocal ?? fallback().quietHoursLocal,
      batchWindowMinutes:
        typeof parsed.batchWindowMinutes === "number"
          ? parsed.batchWindowMinutes
          : fallback().batchWindowMinutes,
      thresholds: {
        ...fallback().thresholds,
        ...(parsed.thresholds ?? {}),
      },
      emailStyle: { ...fallback().emailStyle, ...(parsed.emailStyle ?? {}) },
      loadedAt: new Date().toISOString(),
    };
  } catch {
    return fallback();
  }
}

function fallback(): MaterialEventThresholdsConfig {
  return {
    versionId: "material-event-thresholds-v1-local-fallback",
    source: "fallback",
    debounceHours: 24,
    quietHoursLocal: { startHour: 22, endHour: 7 },
    batchWindowMinutes: 60,
    thresholds: {
      low_rating_review: {
        enabled: true,
        maxStars: 2,
        maxAgeHours: 24,
        severity: "critical",
        subjectTemplate: "{orgName} — new {stars}-star review needs your eye",
        summaryTemplate:
          "{reviewerFirstName} left a {stars}-star review about {orgName} {relativeTime}. Before anything else: this one needs your eyes, not ours.",
      },
      recognition_regression: {
        enabled: true,
        minDimensionDropPoints: 10,
        dimensions: ["seo", "aeo", "cro"],
        severity: "warning",
        subjectTemplate: "{orgName} — {dimension} Recognition dropped {dropPoints} points",
        summaryTemplate:
          "Your {dimension} Recognition Score dropped from {prior} to {current} this week. The three likely drivers: {drivers}.",
      },
      competitor_overtake: {
        enabled: true,
        trackedRankings: ["local_pack", "organic_serp"],
        severity: "warning",
        subjectTemplate: "{orgName} — {competitorName} moved ahead in {ranking}",
        summaryTemplate:
          "{competitorName} overtook you in {ranking} this week. Here's what changed on their side and what Alloro can do about it.",
      },
      gbp_critical_field_change: {
        enabled: true,
        watchedFields: ["phone", "hours", "address", "primary_category"],
        severity: "critical",
        subjectTemplate: "{orgName} — your GBP {field} changed unexpectedly",
        summaryTemplate:
          "Your Google Business Profile {field} changed from '{priorValue}' to '{currentValue}'. If you didn't make this change, someone else did.",
      },
      gbp_verification_loss: {
        enabled: true,
        severity: "critical",
        subjectTemplate: "{orgName} — GBP verification was removed",
        summaryTemplate:
          "Your Google Business Profile lost its verification badge. You won't appear in local pack until it's restored. Alloro is holding steps ready — one click to initiate reverification.",
      },
    },
    emailStyle: {
      sender: "Alloro <noreply@getalloro.com>",
      replyTo: "corey@getalloro.com",
      signatureLine: "— Alloro",
      requireOneClickActions: true,
      allowedActionTypes: ["respond", "ignore", "defer_to_digest"],
    },
    loadedAt: new Date().toISOString(),
  };
}
