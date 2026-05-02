/**
 * Anthropic Claude adapter (Phase 3).
 *
 * Uses claude-opus-4-7 with the web_search_20260209 tool (dynamic
 * filtering tool version current as of May 2026). Returns the
 * synthesized answer plus the citations the tool surfaced.
 *
 * Estimated cost: ~$0.06 per query at Opus 4.7 pricing with tool calls.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  composeCitationResult,
  type CitationCheckInput,
  type PlatformAdapter,
} from "./types";

const MODEL = "claude-opus-4-7";
const TOOL_VERSION = "web_search_20260209";

export const claudeAdapter: PlatformAdapter = {
  platform: "claude",
  label: "Claude",
  estimatedCostUsd: 0.06,
  // AR-003 says "Opus only for cross-practice strategic patterns."
  // Cost-discipline activation 2026-05-02 sets a 10% random sample as
  // the default so the Claude adapter still surfaces a representative
  // citation distribution without polling every (practice, query) cell.
  samplingRate: 0.1,
  isAvailable(): boolean {
    return !!process.env.ANTHROPIC_API_KEY;
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
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        cited: false,
        raw_response: { source: "claude", error: "ANTHROPIC_API_KEY not set" },
        latency_ms: Date.now() - start,
      };
    }
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      // The Anthropic SDK 0.20.9 in this repo predates the typed
      // web_search_20260209 tool; we send the tool definition via a
      // typed-as-any payload so the SDK validation does not reject it.
      // SDK 0.92.0+ exports the typed WebSearchTool20260209 interface.
      const webSearchTool: Anthropic.WebSearchTool20260209 = {
        type: TOOL_VERSION,
        name: "web_search",
      };
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: input.query }],
        tools: [webSearchTool],
      });
      const text = extractTextFromMessage(message);
      const citationUrls = extractCitationUrlsFromMessage(message);
      return composeCitationResult({
        text,
        citationUrls,
        practice: input.practice,
        startedAt: start,
        rawResponse: { source: "claude", model: MODEL, raw: message },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        cited: false,
        raw_response: { source: "claude", error: message },
        latency_ms: Date.now() - start,
      };
    }
  },
};

function extractTextFromMessage(msg: Anthropic.Message): string {
  const blocks = msg.content || [];
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === "text") out.push(b.text);
  }
  return out.join("\n");
}

function extractCitationUrlsFromMessage(msg: Anthropic.Message): string[] {
  const candidates: string[] = [];
  const visit = (val: unknown): void => {
    if (!val) return;
    if (typeof val === "string") {
      if (/^https?:\/\//.test(val)) candidates.push(val);
      return;
    }
    if (Array.isArray(val)) val.forEach(visit);
    else if (typeof val === "object") {
      for (const v of Object.values(val as Record<string, unknown>)) visit(v);
    }
  };
  visit(msg.content);
  return Array.from(new Set(candidates)).slice(0, 10);
}
