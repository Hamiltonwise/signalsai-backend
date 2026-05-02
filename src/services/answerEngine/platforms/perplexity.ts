/**
 * Perplexity adapter (Phase 3).
 *
 * Uses sonar-pro (current production flagship, May 2026). Perplexity API
 * is OpenAI-compatible: /chat/completions with model="sonar-pro".
 * Citations are returned in a `citations` array on the response.
 *
 * Estimated cost: ~$0.005 per query at sonar-pro pricing.
 */

import {
  composeCitationResult,
  type CitationCheckInput,
  type PlatformAdapter,
} from "./types";

const MODEL = "sonar-pro";

export const perplexityAdapter: PlatformAdapter = {
  platform: "perplexity",
  label: "Perplexity",
  estimatedCostUsd: 0.005,
  isAvailable(): boolean {
    return !!process.env.PERPLEXITY_API_KEY;
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
    if (!process.env.PERPLEXITY_API_KEY) {
      return {
        cited: false,
        raw_response: { source: "perplexity", error: "PERPLEXITY_API_KEY not set" },
        latency_ms: Date.now() - start,
      };
    }
    try {
      const res = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: input.query }],
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
        rawResponse: { source: "perplexity", model: MODEL, raw: json },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        cited: false,
        raw_response: { source: "perplexity", error: message },
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
  const c = response.citations as unknown;
  if (Array.isArray(c)) {
    return c
      .filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x))
      .slice(0, 10);
  }
  return [];
}
