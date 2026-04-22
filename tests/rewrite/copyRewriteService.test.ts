/**
 * Tests for the Copy Rewrite Service (Card 5 Run 4).
 *
 * Anthropic SDK, Notion fetch, and webFetch are all stubbed so these run
 * offline and deterministically. The Freeform Concern Gate is exercised
 * via the real gate code with env flag on.
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

// Stub webFetch so no real HTTP happens.
vi.mock("../../src/services/webFetch", () => ({
  fetchPage: async () => ({
    success: true,
    html: "<html><body>Advanced orthodontic care utilizing state-of-the-art technology.</body></html>",
  }),
  extractText: async (html: string) =>
    html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
}));

vi.mock("../../src/database/connection", () => ({
  db: Object.assign(
    () => ({
      where: () => ({ first: async () => ({}) }),
      insert: () => ({ returning: async () => [{ id: "noop" }] }),
    }),
    { raw: (s: string) => s }
  ),
}));

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: { create: async () => ({}) },
}));

// Anthropic SDK router — rubric judge vs compose are the two callers.
interface Router {
  composeResponses: string[];
  gateResponse: any;
}
const router: Router = { composeResponses: [], gateResponse: null };

vi.mock("@anthropic-ai/sdk", () => {
  class MockClient {
    messages = {
      create: async (args: any) => {
        const user = args.messages?.[0]?.content ?? "";
        const system = args.system ?? "";
        if (system.includes("terse QA reviewer") || system.includes("judge") || user.includes("Rubric dimensions:")) {
          if (router.gateResponse == null) {
            throw new Error("no gate response configured");
          }
          return {
            content: [{ type: "text", text: JSON.stringify(router.gateResponse) }],
          };
        }
        // Rewrite compose
        const text = router.composeResponses.shift();
        if (!text) throw new Error("no compose response left");
        return { content: [{ type: "text", text }] };
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

const GOOD_REWRITE =
  "If you walked in dreading this, you're in the right place. Maria told us she didn't need her anxiety medication here. That's the kind of calm we build for.";

function passingGate() {
  return {
    dimensions: [
      { key: "meta_question", score: 38, reasoning: "ok" },
      { key: "recognition_test", score: 9, reasoning: "ok" },
      { key: "patient_voice_match", score: 10, reasoning: "real language" },
      { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A" },
      { key: "cesar_millan", score: 9, reasoning: "hero is the doctor" },
      { key: "mom_test", score: 9, reasoning: "plain" },
      { key: "provenance", score: 0, na: true, reasoning: "N/A" },
      { key: "never_blank", score: 5, reasoning: "pass" },
      { key: "public_safe", score: 5, reasoning: "pass" },
    ],
    repair_instructions: [],
  };
}

function failingGate() {
  return {
    dimensions: [
      { key: "meta_question", score: 8, reasoning: "tech-first" },
      { key: "recognition_test", score: 1, reasoning: "template" },
      { key: "patient_voice_match", score: 0, reasoning: "no voice" },
      { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A" },
      { key: "cesar_millan", score: 4, reasoning: "neutral" },
      { key: "mom_test", score: 4, reasoning: "jargon" },
      { key: "provenance", score: 0, na: true, reasoning: "N/A" },
      { key: "never_blank", score: 5, reasoning: "pass" },
      { key: "public_safe", score: 5, reasoning: "pass" },
    ],
    repair_instructions: [
      { dimension: "patient_voice_match", instruction: "Use Maria's words." },
    ],
  };
}

describe("Copy Rewrite Service", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.FREEFORM_CONCERN_GATE_ENABLED = "true";
    process.env.COPY_REWRITE_ENABLED = "true";
    delete process.env.NOTION_TOKEN; // force fallback config
    _resetRubricCache();
    _seedRubricCache(buildFallbackConfig());
    _resetFlagCache();
    _resetRewriteFlagCache();
    _resetCopyRewriteConfigCache();
    router.composeResponses = [];
    router.gateResponse = null;
  });

  test("happy path: hero rewrite passes gate on first attempt", async () => {
    router.composeResponses = [GOOD_REWRITE];
    router.gateResponse = passingGate();
    const { runCopyRewrite } = await import(
      "../../src/services/rewrite/copyRewriteService"
    );
    const result = await runCopyRewrite({
      url: "https://surfcityendo.com",
      triScore: {
        seo_composite: 30,
        aeo_composite: 28,
        cro_composite: 25,
      },
      missingExamples: SAMPLE_MISSING,
      practiceContext: {
        orgId: 1,
        practiceName: "Surf City Endodontics",
        specialty: "endodontics",
        location: "Huntington Beach, CA",
        differentiator: "honest second-opinion conscience",
        doctorBackground: "BYU, banking pivot, DDS USC, wife + kids through both pivots",
      },
      targetSections: ["hero"],
    });
    const hero = result.sectionResults[0];
    expect(hero.section).toBe("hero");
    expect(hero.passed).toBe(true);
    expect(hero.newContent).toBe(GOOD_REWRITE);
    expect(hero.composite).toBeGreaterThanOrEqual(80);
    expect(result.contentReadyForPublish).toBe(true);
    expect(result.overallScoreProjection.cro).toBeGreaterThan(25);
  });

  test("gate blocks after 3 failed attempts and escalates", async () => {
    router.composeResponses = [
      "Advanced orthodontic care utilizing state-of-the-art technology.",
      "Advanced orthodontic care with cutting-edge technology.",
      "Comprehensive world-class orthodontics.",
    ];
    router.gateResponse = failingGate();
    const { runCopyRewrite } = await import(
      "../../src/services/rewrite/copyRewriteService"
    );
    const result = await runCopyRewrite({
      url: "https://surfcityendo.com",
      triScore: {
        seo_composite: 30,
        aeo_composite: 28,
        cro_composite: 25,
      },
      missingExamples: SAMPLE_MISSING,
      practiceContext: {
        orgId: 1,
        practiceName: "Surf City Endodontics",
      },
      targetSections: ["hero"],
    });
    const hero = result.sectionResults[0];
    expect(hero.passed).toBe(false);
    expect(hero.attempts).toBe(3);
    expect(hero.blocked).toBe(true);
    expect(hero.escalated).toBe(true);
    expect(result.contentReadyForPublish).toBe(false);
  });

  test("shadow mode (flag off): contentReadyForPublish always false", async () => {
    delete process.env.COPY_REWRITE_ENABLED;
    delete process.env.FREEFORM_CONCERN_GATE_ENABLED;
    router.composeResponses = [GOOD_REWRITE];
    // When gate is off (no flag, no SHADOW_OBSERVE), the gate short-circuits
    // as passed=true, so the rewrite appears successful but shadow=true forces
    // contentReadyForPublish=false.
    const { runCopyRewrite } = await import(
      "../../src/services/rewrite/copyRewriteService"
    );
    const result = await runCopyRewrite({
      url: "https://surfcityendo.com",
      triScore: {
        seo_composite: 30,
        aeo_composite: 28,
        cro_composite: 25,
      },
      missingExamples: SAMPLE_MISSING,
      practiceContext: {
        orgId: 1,
        practiceName: "Surf City Endodontics",
      },
      targetSections: ["hero"],
    });
    expect(result.shadow).toBe(true);
    expect(result.contentReadyForPublish).toBe(false);
  });

  test("config-change-without-redeploy: custom section survives fallback", async () => {
    router.composeResponses = [GOOD_REWRITE];
    router.gateResponse = passingGate();
    const { runCopyRewrite } = await import(
      "../../src/services/rewrite/copyRewriteService"
    );
    const result = await runCopyRewrite({
      url: "https://surfcityendo.com",
      triScore: {
        seo_composite: 30,
        aeo_composite: 28,
        cro_composite: 25,
      },
      missingExamples: SAMPLE_MISSING,
      practiceContext: {
        orgId: 1,
        practiceName: "Surf City Endodontics",
      },
      targetSections: ["unknown_section"],
    });
    // Unknown section: no compose call, clear error explanation
    expect(result.sectionResults[0].newContent).toBeNull();
    expect(result.sectionResults[0].whatChanged).toMatch(/Unknown section id/);
  });
});
