/**
 * ChatGPT adapter (Phase 3).
 *
 * Calls OpenAI's Chat Completions API with `gpt-5.5` (current flagship,
 * May 2026) and a web_search tool to retrieve a synthesized answer to
 * the AEO test query. Falls back to `gpt-5-search-api` when the
 * `OPENAI_USE_LIGHTWEIGHT` env var is set (cost discipline path).
 *
 * Returns CitationResult with cited / competitor_cited derived from the
 * synthesized text.
 *
 * Estimated cost: ~$0.03 per query at gpt-5.5 reasoning depth, drops to
 * ~$0.004 with the search-api fallback. Tunable via env.
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
  estimatedCostUsd: 0.03,
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
        rawResponse: { source: "override" },
      });
    }
    if (!process.env.OPENAI_API_KEY) {
      return {
        cited: false,
        raw_response: { source: "chatgpt", error: "OPENAI_API_KEY not set" },
        latency_ms: Date.now() - start,
      };
    }
    const model =
      process.env.OPENAI_USE_LIGHTWEIGHT === "true"
        ? SEARCH_API_MODEL
        : FLAGSHIP_MODEL;
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
