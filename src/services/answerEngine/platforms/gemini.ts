/**
 * Google Gemini adapter (Phase 3).
 *
 * Uses gemini-3.1-pro-preview with the google_search tool (grounding via
 * Google Search). Parses groundingMetadata for citation extraction.
 *
 * Estimated cost: ~$0.012 per query at gemini-3.1-pro-preview pricing
 * with grounding enabled.
 */

import {
  composeCitationResult,
  type CitationCheckInput,
  type PlatformAdapter,
} from "./types";

const MODEL = "gemini-3.1-pro-preview";

export const geminiAdapter: PlatformAdapter = {
  platform: "gemini",
  label: "Gemini",
  estimatedCostUsd: 0.012,
  isAvailable(): boolean {
    return !!(process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
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
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        cited: false,
        raw_response: { source: "gemini", error: "GOOGLE_API_KEY / GEMINI_API_KEY not set" },
        latency_ms: Date.now() - start,
      };
    }
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: input.query }] }],
          tools: [{ google_search: {} }],
        }),
      });
      const json = (await res.json()) as Record<string, unknown>;
      const text = extractGeminiText(json);
      const citationUrls = extractGeminiCitationUrls(json);
      return composeCitationResult({
        text,
        citationUrls,
        practice: input.practice,
        startedAt: start,
        rawResponse: { source: "gemini", model: MODEL, raw: json },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        cited: false,
        raw_response: { source: "gemini", error: message },
        latency_ms: Date.now() - start,
      };
    }
  },
};

function extractGeminiText(response: Record<string, unknown>): string {
  const candidates = response.candidates as
    | Array<{ content?: { parts?: Array<{ text?: string }> } }>
    | undefined;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const parts = candidates[0]?.content?.parts ?? [];
  return parts
    .map((p) => p.text)
    .filter((t): t is string => typeof t === "string")
    .join("\n");
}

function extractGeminiCitationUrls(response: Record<string, unknown>): string[] {
  const candidates = response.candidates as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(candidates)) return [];
  const urls: string[] = [];
  for (const c of candidates) {
    const grounding = c.groundingMetadata as
      | { groundingChunks?: Array<{ web?: { uri?: string } }> }
      | undefined;
    const chunks = grounding?.groundingChunks ?? [];
    for (const chunk of chunks) {
      const u = chunk.web?.uri;
      if (typeof u === "string" && /^https?:\/\//.test(u)) urls.push(u);
    }
  }
  return Array.from(new Set(urls)).slice(0, 10);
}
