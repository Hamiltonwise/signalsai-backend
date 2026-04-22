/**
 * Loads The Standard — Runtime Principle Rubric v1 from the Notion page of
 * record. Parses the page body, extracts the rubric version, and applies any
 * mode-weight overrides that appear in a fenced JSON block tagged
 * `alloro:mode-weights`.
 *
 * Adaptability (memory rule 30): the Notion page is the source of truth.
 * Update the page, agents pick up the new version on next cache refresh.
 * No code deploy.
 *
 * Fallback: if NOTION_TOKEN is missing, or the page fetch fails, the local
 * fallback from localFallback.ts is returned with source='fallback'. The
 * service logs that adaptability is degraded.
 */

import axios from "axios";
import {
  FALLBACK_MODE_WEIGHTS,
  FALLBACK_VERSION_ID,
  META_DIMENSION,
  SUB_DIMENSIONS,
  buildFallbackConfig,
} from "./localFallback";
import type { ModeWeights, RubricConfig, ScoringMode } from "./types";

const RUBRIC_PAGE_ID = "349fdaf1-20c4-8170-acfa-ef33f723e957";
const NOTION_API_VERSION = "2022-06-28";
const PAGE_FETCH_TIMEOUT_MS = 8000;

const MODE_WEIGHTS_FENCE = /```(?:json)?\s*alloro:mode-weights\s+([\s\S]+?)```/i;
const VERSION_REGEX = /(?:^|\s)v(\d+\.\d+(?:\.\d+)?)[^\n]*?([A-Z][a-z]+ \d+, \d{4})/;

interface NotionBlockResponse {
  results: Array<{
    id: string;
    type: string;
    [key: string]: unknown;
  }>;
  has_more: boolean;
  next_cursor: string | null;
}

async function fetchAllBlocks(pageId: string, token: string): Promise<any[]> {
  const blocks: any[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(
      `https://api.notion.com/v1/blocks/${pageId}/children`
    );
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

function richTextToPlain(rich: any[]): string {
  if (!Array.isArray(rich)) return "";
  return rich.map((r) => (typeof r?.plain_text === "string" ? r.plain_text : "")).join("");
}

function blockToText(block: any): string {
  const t = block.type;
  const data = block[t];
  if (!data) return "";
  if (Array.isArray(data.rich_text)) return richTextToPlain(data.rich_text);
  if (typeof data.plain_text === "string") return data.plain_text;
  return "";
}

function extractVersion(pageText: string): string {
  const match = pageText.match(VERSION_REGEX);
  if (!match) return FALLBACK_VERSION_ID;
  return `standard-rubric-v${match[1]}-notion-${match[2].replace(/[, ]+/g, "-").toLowerCase()}`;
}

function extractModeWeights(
  pageText: string
): Partial<Record<ScoringMode, ModeWeights>> {
  const match = pageText.match(MODE_WEIGHTS_FENCE);
  if (!match) return {};
  try {
    const parsed = JSON.parse(match[1]);
    const out: Partial<Record<ScoringMode, ModeWeights>> = {};
    for (const mode of ["runtime", "seo", "aeo", "cro"] as ScoringMode[]) {
      const raw = parsed?.[mode];
      if (!raw) continue;
      const weights: ModeWeights = {
        dimensionWeights:
          raw.dimensionWeights && typeof raw.dimensionWeights === "object"
            ? raw.dimensionWeights
            : {},
        passThreshold:
          typeof raw.passThreshold === "number"
            ? raw.passThreshold
            : FALLBACK_MODE_WEIGHTS[mode].passThreshold,
        emphasis:
          typeof raw.emphasis === "string"
            ? raw.emphasis
            : FALLBACK_MODE_WEIGHTS[mode].emphasis,
      };
      out[mode] = weights;
    }
    return out;
  } catch {
    return {};
  }
}

function mergeModeWeights(
  overrides: Partial<Record<ScoringMode, ModeWeights>>
): Record<ScoringMode, ModeWeights> {
  return {
    runtime: overrides.runtime ?? FALLBACK_MODE_WEIGHTS.runtime,
    seo: overrides.seo ?? FALLBACK_MODE_WEIGHTS.seo,
    aeo: overrides.aeo ?? FALLBACK_MODE_WEIGHTS.aeo,
    cro: overrides.cro ?? FALLBACK_MODE_WEIGHTS.cro,
  };
}

export interface LoadRubricResult {
  config: RubricConfig;
  warning?: string;
}

/**
 * Fetch the rubric config from Notion. Returns a fallback config and a warning
 * string when Notion is unavailable. Never throws — the engine cannot be
 * blocked by rubric fetch failure, because that would block all scoring.
 */
export async function loadRubricFromNotion(): Promise<LoadRubricResult> {
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    return {
      config: buildFallbackConfig(),
      warning:
        "NOTION_TOKEN missing — rubric loaded from local fallback. Adaptability DEGRADED.",
    };
  }

  try {
    const blocks = await fetchAllBlocks(RUBRIC_PAGE_ID, token);
    const pageText = blocks.map(blockToText).join("\n");

    if (!pageText.trim()) {
      return {
        config: buildFallbackConfig(),
        warning: "Notion page returned empty content — using fallback rubric.",
      };
    }

    const versionId = extractVersion(pageText);
    const modeWeightOverrides = extractModeWeights(pageText);

    return {
      config: {
        versionId,
        metaDimension: META_DIMENSION,
        subDimensions: SUB_DIMENSIONS,
        modeWeights: mergeModeWeights(modeWeightOverrides),
        source: "notion",
        loadedAt: new Date().toISOString(),
      },
    };
  } catch (err: any) {
    return {
      config: buildFallbackConfig(),
      warning: `Notion rubric fetch failed (${err?.message ?? "unknown"}) — using fallback rubric.`,
    };
  }
}
