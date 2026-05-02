/**
 * ChatGPT adapter (Phase 3, cost-discipline activated).
 *
 * **Default model (cost-disciplined path):** `gpt-5-search-api`. Per
 * the AR-006 cost discipline activation (May 2 2026), the lightweight
 * search-api model is the default at ~$0.004 per query. When the
 * `OPENAI_USE_FLAGSHIP=true` env var is set, the adapter switches to
 * `gpt-5.5` flagship at ~$0.03 per query for cases that need the
 * deeper reasoning depth.
 *
 * Returns CitationResult with cited / competitor_cited derived from the
 * synthesized text.
 */

import {
  composeCitationResult,
  type CitationCheckInput,
  type PlatformAdapter,
} from "./types";

const FLAGSHIP_MODEL = "gpt-5.5";
const SEARCH_API_MODEL = "gpt-5-search-api";

export const chatGPTAdapter: PlatformAdapter = {
  platform: "chatgpt",
  label: "ChatGPT",
  // Cost-disciplined default (AR-006 activation 2026-05-02).
  estimatedCostUsd: 0.004,
  isAvailable(): boolean {
    return !!process.env.OPENAI_API_KEY;
  },
  async checkCitation(input: CitationCheckInput) {
    const start = Date.now();
    if (input.rawResponseOverride) {
      return composeCitationResult({
        text: input.rawResponseOverride.text,
        citationUrls: input.rawResponseOverride.citationUrls,
        practice: input.practice,
        startedAt: start,
        rawResponse: { source: "override", model_routed: resolveModel() },
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      return {
        cited: false,
        raw_response: { source: "chatgpt", error: "OPENAI_API_KEY not set" },
        latency_ms: Date.now() - start,
      };
    }
    const model = resolveModel();
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: input.query,
            },
          ],
          tools: [
            {
              type: "web_search",
            },
          ],
        }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const text = extractAssistantText(json);
      const citationUrls = extractCitationUrls(json);
      return composeCitationResult({
        text,
        citationUrls,
        practice: input.practice,
        startedAt: start,
        rawResponse: { source: "chatgpt", model, raw: json },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        cited: false,
        raw_response: { source: "chatgpt", error: message },
        latency_ms: Date.now() - start,
      };
    }
  },
};

/**
 * Resolve which OpenAI model to call. Default is the lightweight
 * search-api (cost-disciplined). Setting OPENAI_USE_FLAGSHIP=true
 * routes to gpt-5.5.
 */
export function resolveModel(): string {
  return process.env.OPENAI_USE_FLAGSHIP === "true"
    ? FLAGSHIP_MODEL
    : SEARCH_API_MODEL;
}

function extractAssistantText(response: Record<string, unknown>): string {
  const choices = response.choices as
    | Array<{ message?: { content?: string } }>
    | undefined;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  return choices[0]?.message?.content ?? "";
}

function extractCitationUrls(response: Record<string, unknown>): string[] {
  // Inspect the response for a tool_calls / annotations / sources section.
  // Shape varies; pick first non-empty URL list we find.
  const candidates: string[] = [];
  const visit = (val: unknown): void => {
    if (!val) return;
    if (typeof val === "string") {
      if (/^https?:\/\//.test(val)) candidates.push(val);
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(visit);
      return;
    }
    if (typeof val === "object") {
      for (const v of Object.values(val as Record<string, unknown>)) visit(v);
    }
  };
  visit(response.choices);
  visit((response as { annotations?: unknown }).annotations);
  visit((response as { sources?: unknown }).sources);
  return Array.from(new Set(candidates)).slice(0, 10);
}
