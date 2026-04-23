/**
 * Card K — Copy Rewrite hipaa_mode gate tests.
 *
 * (c) Healthcare org with hipaa_mode = true: prompt includes HIPAA instruction.
 * (d) Non-healthcare org with hipaa_mode = false: prompt uses generic privacy
 *     instruction and zero instances of the string "HIPAA" appear.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  _resetRubricCache,
  _seedRubricCache,
} from "../../src/services/rubric/standardRubric";
import { buildFallbackConfig } from "../../src/services/rubric/localFallback";
import { _resetFlagCache } from "../../src/services/rubric/gateFlag";
import { _resetRewriteFlagCache } from "../../src/services/rewrite/rewriteFlag";
import { _resetCopyRewriteConfigCache } from "../../src/services/rewrite/copyRewriteConfig";

// webFetch stub — no HTTP.
vi.mock("../../src/services/webFetch", () => ({
  fetchPage: async () => ({
    success: true,
    html: "<html><body>Current hero copy about advanced care.</body></html>",
  }),
  extractText: async (html: string) =>
    html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
}));

// DB stub: only vocabulary_configs matters for the capability lookup.
interface VocabState {
  hipaaMode: boolean;
}
const vocabState: VocabState = { hipaaMode: true };

vi.mock("../../src/database/connection", () => {
  const db: any = (table: string) => ({
    _where: {},
    where(criteria: Record<string, unknown>) {
      this._where = { ...this._where, ...criteria };
      return this;
    },
    async first() {
      if (table === "vocabulary_configs") {
        return {
          capabilities: {
            referral_tracking: true,
            gp_network: true,
            hipaa_mode: vocabState.hipaaMode,
          },
        };
      }
      return undefined;
    },
    insert() {
      return { returning: async () => [{ id: "noop" }] };
    },
  });
  db.raw = (s: string) => s;
  return { db };
});

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: { create: async () => ({}) },
}));

// Stub Redis so vocabLoader cache always misses and reads from the mocked DB.
vi.mock("../../src/services/redis", () => ({
  getSharedRedis: () => ({
    get: async () => null,
    set: async () => "OK",
    del: async () => 0,
  }),
}));

// Capture prompts sent to Anthropic so we can assert on the rendered content.
interface Capture {
  system: string;
  user: string;
}
const captured: Capture[] = [];

const GOOD_REWRITE =
  "If you walked in dreading this, you're in the right place. Maria told us she didn't need her anxiety medication here.";

vi.mock("@anthropic-ai/sdk", () => {
  class MockClient {
    messages = {
      create: async (args: any) => {
        const system = args.system ?? "";
        const user = args.messages?.[0]?.content ?? "";
        // Only capture compose calls (skip rubric judge calls if any).
        if (!system.includes("judge") && !system.includes("terse QA reviewer")) {
          captured.push({ system, user });
          return { content: [{ type: "text", text: GOOD_REWRITE }] };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dimensions: [
                  { key: "meta_question", score: 38 },
                  { key: "recognition_test", score: 9 },
                  { key: "patient_voice_match", score: 10 },
                  { key: "recipe_compliance", score: 0, na: true },
                  { key: "cesar_millan", score: 9 },
                  { key: "mom_test", score: 9 },
                  { key: "provenance", score: 0, na: true },
                  { key: "never_blank", score: 5 },
                  { key: "public_safe", score: 5 },
                ],
                repair_instructions: [],
              }),
            },
          ],
        };
      },
    };
  }
  return { default: MockClient };
});

const SAMPLE_MISSING: any[] = [
  {
    phrase: "ninja accuracy",
    sourceReview:
      "Dr. Olson has ninja accuracy. I didn't even need my usual anxiety medication.",
    reviewerName: "Maria V.",
    verified: true,
    verificationReasoning: "Site doesn't surface this.",
  },
];

describe("Card K — Copy Rewrite hipaa_mode gate", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.FREEFORM_CONCERN_GATE_ENABLED = "true";
    process.env.COPY_REWRITE_ENABLED = "true";
    delete process.env.NOTION_TOKEN;
    _resetRubricCache();
    _seedRubricCache(buildFallbackConfig());
    _resetFlagCache();
    _resetRewriteFlagCache();
    _resetCopyRewriteConfigCache();
    captured.length = 0;
  });

  test("(c) healthcare org with hipaa_mode=true: prompt includes HIPAA instruction", async () => {
    vocabState.hipaaMode = true;
    const { runCopyRewrite } = await import(
      "../../src/services/rewrite/copyRewriteService"
    );
    await runCopyRewrite({
      url: "https://surfcityendo.com",
      triScore: { seo_composite: 30, aeo_composite: 28, cro_composite: 25 },
      missingExamples: SAMPLE_MISSING,
      practiceContext: {
        orgId: 1,
        practiceName: "Surf City Endodontics",
        specialty: "endodontics",
        location: "Huntington Beach, CA",
      },
      targetSections: ["hero"],
    });

    expect(captured.length).toBeGreaterThan(0);
    const first = captured[0];
    const combined = `${first.system}\n\n${first.user}`;
    // The HIPAA instruction (or HIPAA marker) must be present for healthcare.
    expect(combined).toMatch(/HIPAA/);
    // Healthcare prompt should not carry the generic privacy sentence.
    expect(combined).not.toMatch(
      /Use first name only for a personal touch\. No full names in published content\./
    );
  });

  test("(d) non-healthcare org with hipaa_mode=false: generic privacy, zero HIPAA", async () => {
    vocabState.hipaaMode = false;
    const { runCopyRewrite } = await import(
      "../../src/services/rewrite/copyRewriteService"
    );
    await runCopyRewrite({
      url: "https://sharperbarbers.com",
      triScore: { seo_composite: 30, aeo_composite: 28, cro_composite: 25 },
      missingExamples: SAMPLE_MISSING,
      practiceContext: {
        orgId: 2,
        practiceName: "Sharper Barbers",
        specialty: "barbershop",
        location: "Austin, TX",
      },
      targetSections: ["hero"],
    });

    expect(captured.length).toBeGreaterThan(0);
    const first = captured[0];
    const combined = `${first.system}\n\n${first.user}`;
    // Zero instances of "HIPAA" (case-sensitive literal the task called out).
    expect(combined.includes("HIPAA")).toBe(false);
    // Generic privacy instruction present.
    expect(combined).toContain(
      "Use first name only for a personal touch. No full names in published content."
    );
  });
});
