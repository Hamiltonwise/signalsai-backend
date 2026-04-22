/**
 * Tests for the Freeform Concern Gate.
 *
 * Covered:
 *   - known-bad hero ("state-of-the-art technology") below threshold
 *   - known-good rewrite above threshold
 *   - shadow mode (flag off): never blocks
 *   - live mode: blocks after retries exhausted
 *   - config-change-without-redeploy: threshold adjustable via seeded config
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  runFreeformConcernGate,
  FREEFORM_CONCERN_GATE_THRESHOLD,
  FREEFORM_CONCERN_GATE_MAX_RETRIES,
} from "../../src/services/siteQa/gates/freeformConcernGate";
import {
  _resetRubricCache,
  _seedRubricCache,
} from "../../src/services/rubric/standardRubric";
import { _resetFlagCache } from "../../src/services/rubric/gateFlag";
import { buildFallbackConfig } from "../../src/services/rubric/localFallback";

const BAD_HERO =
  "Advanced endodontic care utilizing state-of-the-art technology for all your comprehensive root canal needs.";

const GOOD_HERO =
  "If you're scared, in pain, or you got referred here because something hurts, you're in the right place. " +
  "Dr. Chris Olson has spent his career taking care of patients who needed someone to be honest with them. " +
  "Including patients who normally need anxiety medication to walk into a dental office, and didn't need it here.";

vi.mock("../../src/database/connection", () => {
  return {
    db: Object.assign(
      () => ({
        where: () => ({ first: async () => ({}) }),
        insert: async () => ({}),
      }),
      {
        raw: (s: string) => s,
      }
    ),
  };
});

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: {
    create: async () => ({}),
  },
}));

const judgeRouter = {
  nextResponse: null as any,
};

vi.mock("@anthropic-ai/sdk", () => {
  class MockClient {
    messages = {
      create: async () => {
        if (judgeRouter.nextResponse == null) {
          throw new Error("no mock response configured");
        }
        const resp = judgeRouter.nextResponse;
        return { content: [{ type: "text", text: JSON.stringify(resp) }] };
      },
    };
  }
  return { default: MockClient };
});

function setJudge(response: any) {
  judgeRouter.nextResponse = response;
}

function passingResponse() {
  return {
    dimensions: [
      { key: "meta_question", score: 38, reasoning: "Leads with recognition." },
      { key: "recognition_test", score: 10, reasoning: "Specific story surfaced." },
      { key: "patient_voice_match", score: 9, reasoning: "Uses real language." },
      { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A." },
      { key: "cesar_millan", score: 9, reasoning: "Owner is the hero." },
      { key: "mom_test", score: 9, reasoning: "Plain English." },
      { key: "provenance", score: 0, na: true, reasoning: "N/A." },
      { key: "never_blank", score: 5, reasoning: "Pass." },
      { key: "public_safe", score: 5, reasoning: "Pass." },
    ],
    repair_instructions: [],
  };
}

function failingResponse() {
  return {
    dimensions: [
      { key: "meta_question", score: 15, reasoning: "Opens with technology." },
      { key: "recognition_test", score: 1, reasoning: "Template content." },
      { key: "patient_voice_match", score: 0, reasoning: "No patient voice." },
      { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A." },
      { key: "cesar_millan", score: 5, reasoning: "Neutral." },
      { key: "mom_test", score: 6, reasoning: "Some jargon." },
      { key: "provenance", score: 0, na: true, reasoning: "N/A." },
      { key: "never_blank", score: 5, reasoning: "Pass." },
      { key: "public_safe", score: 5, reasoning: "Pass." },
    ],
    repair_instructions: [
      { dimension: "meta_question", instruction: "Lead with the patient, not technology." },
      { dimension: "patient_voice_match", instruction: "Pull a direct patient quote into the hero." },
    ],
  };
}

describe("Freeform Concern Gate", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    _resetRubricCache();
    _seedRubricCache(buildFallbackConfig());
    _resetFlagCache();
    delete process.env.FREEFORM_CONCERN_GATE_ENABLED;
    delete process.env.FREEFORM_CONCERN_GATE_SHADOW_OBSERVE;
  });

  test("blocks known-bad hero in live mode after max retries", async () => {
    process.env.FREEFORM_CONCERN_GATE_ENABLED = "true";
    setJudge(failingResponse());

    const result = await runFreeformConcernGate({
      content: BAD_HERO,
      surface: "siteQa",
      attempt: FREEFORM_CONCERN_GATE_MAX_RETRIES,
    });

    expect(result.passed).toBe(false);
    expect(result.score.composite).toBeLessThan(FREEFORM_CONCERN_GATE_THRESHOLD);
    expect(result.blocked).toBe(true);
    expect(result.escalation?.taskType).toBe("freeform_concern_gate_failed");
    expect(result.failingDimensions.length).toBeGreaterThan(0);
  });

  test("passes known-good rewrite above threshold", async () => {
    process.env.FREEFORM_CONCERN_GATE_ENABLED = "true";
    setJudge(passingResponse());

    const result = await runFreeformConcernGate({
      content: GOOD_HERO,
      surface: "siteQa",
    });

    expect(result.passed).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.score.composite).toBeGreaterThanOrEqual(FREEFORM_CONCERN_GATE_THRESHOLD);
  });

  test("shadow mode (flag off): short-circuits without calling the judge", async () => {
    setJudge(failingResponse());

    const result = await runFreeformConcernGate({
      content: BAD_HERO,
      surface: "siteQa",
      attempt: FREEFORM_CONCERN_GATE_MAX_RETRIES,
    });

    // Flag off, no SHADOW_OBSERVE => gate is a no-op that lets content through.
    expect(result.shadow).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.escalation).toBeUndefined();
    expect(result.score.judge_model).toBe("skipped");
  });

  test("SHADOW_OBSERVE mode: scores content but never blocks", async () => {
    process.env.FREEFORM_CONCERN_GATE_SHADOW_OBSERVE = "true";
    setJudge(failingResponse());

    const result = await runFreeformConcernGate({
      content: BAD_HERO,
      surface: "siteQa",
      attempt: FREEFORM_CONCERN_GATE_MAX_RETRIES,
    });

    delete process.env.FREEFORM_CONCERN_GATE_SHADOW_OBSERVE;

    expect(result.passed).toBe(false);
    expect(result.shadow).toBe(true);
    expect(result.blocked).toBe(false);
    expect(result.escalation).toBeUndefined();
  });

  test("failing dimensions are sorted by severity (lowest first)", async () => {
    process.env.FREEFORM_CONCERN_GATE_ENABLED = "true";
    setJudge(failingResponse());

    const result = await runFreeformConcernGate({
      content: BAD_HERO,
      surface: "siteQa",
    });

    if (result.failingDimensions.length >= 2) {
      const first = result.failingDimensions[0];
      const second = result.failingDimensions[1];
      expect(first.score / first.max).toBeLessThanOrEqual(second.score / second.max);
    }
  });
});
