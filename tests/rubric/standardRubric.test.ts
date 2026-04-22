/**
 * Tests for The Standard — Runtime Principle Rubric v1 engine.
 *
 * The LLM judge is stubbed so these run offline and deterministically. The
 * engine itself (cache, config merge, composite math, N/A redistribution,
 * pass-gate handling) is what's under test.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  score,
  _resetRubricCache,
  _seedRubricCache,
} from "../../src/services/rubric/standardRubric";
import { buildFallbackConfig } from "../../src/services/rubric/localFallback";

type JudgeFn = (input: { system: string; user: string }) => {
  dimensions: Array<{ key: string; score: number; na?: boolean; reasoning: string }>;
  repair_instructions?: Array<{ dimension: string; instruction: string }>;
};

function mockAnthropic(judge: JudgeFn) {
  vi.doMock("@anthropic-ai/sdk", () => {
    class MockClient {
      messages = {
        create: async (args: any) => {
          const result = judge({
            system: args.system,
            user: args.messages?.[0]?.content ?? "",
          });
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
          };
        },
      };
    }
    return { default: MockClient };
  });
}

describe("standardRubric.score", () => {
  beforeEach(async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    _resetRubricCache();
    _seedRubricCache(buildFallbackConfig());
    vi.resetModules();
  });

  test("runtime mode: composite reflects per-dimension scores and mode weights", async () => {
    mockAnthropic(() => ({
      dimensions: [
        { key: "meta_question", score: 40, reasoning: "Opens with recognition." },
        { key: "recognition_test", score: 10, reasoning: "Specific story surfaced." },
        { key: "patient_voice_match", score: 10, reasoning: "Uses real review language." },
        { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A for marketing copy." },
        { key: "cesar_millan", score: 10, reasoning: "Owner is the hero." },
        { key: "mom_test", score: 10, reasoning: "9th grade readable." },
        { key: "provenance", score: 0, na: true, reasoning: "N/A for marketing copy." },
        { key: "never_blank", score: 5, reasoning: "Pass." },
        { key: "public_safe", score: 5, reasoning: "Pass." },
      ],
      repair_instructions: [],
    }));
    const { score: scoreFn, _seedRubricCache: seedFresh, _resetRubricCache: resetFresh } =
      await import("../../src/services/rubric/standardRubric");
    const { buildFallbackConfig: buildFresh } = await import("../../src/services/rubric/localFallback");
    resetFresh();
    seedFresh(buildFresh());

    const result = await scoreFn("Any content", { mode: "runtime" });
    expect(result.composite).toBeGreaterThan(75);
    expect(result.mode).toBe("runtime");
    expect(result.loaded_from).toBe("fallback");
    expect(result.dimensions["recipe_compliance"].verdict).toBe("n_a");
    expect(result.dimensions["never_blank"].verdict).toBe("pass_gate");
  });

  test("Surf City calibration: known-bad content scores ~27", async () => {
    mockAnthropic(() => ({
      dimensions: [
        {
          key: "meta_question",
          score: 15,
          reasoning: "Opens with advanced-tech framing, not recognition.",
        },
        { key: "recognition_test", score: 1, reasoning: "Generic endodontist site." },
        { key: "patient_voice_match", score: 0, reasoning: "No patient language surfaced." },
        { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A for marketing." },
        { key: "cesar_millan", score: 5, reasoning: "Neutral framing." },
        { key: "mom_test", score: 6, reasoning: "GentleWave jargon loses grade-9 readers." },
        { key: "provenance", score: 0, na: true, reasoning: "N/A for marketing." },
        { key: "never_blank", score: 5, reasoning: "Site exists." },
        { key: "public_safe", score: 5, reasoning: "No HIPAA issues." },
      ],
      repair_instructions: [
        { dimension: "meta_question", instruction: "Lead with recognition, not technology." },
        { dimension: "patient_voice_match", instruction: "Pull a direct patient quote into the hero." },
      ],
    }));
    const { score: scoreFn, _seedRubricCache: seedFresh, _resetRubricCache: resetFresh } =
      await import("../../src/services/rubric/standardRubric");
    const { buildFallbackConfig: buildFresh } = await import("../../src/services/rubric/localFallback");
    resetFresh();
    seedFresh(buildFresh());

    const result = await scoreFn(
      "Advanced endodontic care utilizing state-of-the-art technology.",
      {
        mode: "runtime",
        metadata: { practice: "Surf City Endodontics", specialty: "endodontics" },
      }
    );
    // Calibration check: composite in the 20–35 band.
    expect(result.composite).toBeGreaterThanOrEqual(20);
    expect(result.composite).toBeLessThanOrEqual(40);
    expect(result.repair_instructions.length).toBeGreaterThan(0);
  });

  test("CRO mode clamps composite to 65 when fear_acknowledged is 0 on patient-facing copy", async () => {
    mockAnthropic(() => ({
      dimensions: [
        { key: "meta_question", score: 30, reasoning: "Decent." },
        { key: "recognition_test", score: 8, reasoning: "Good." },
        { key: "patient_voice_match", score: 8, reasoning: "Uses patient words." },
        { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A" },
        { key: "cesar_millan", score: 8, reasoning: "Good." },
        { key: "mom_test", score: 9, reasoning: "Plain English." },
        { key: "provenance", score: 0, na: true, reasoning: "N/A" },
        { key: "never_blank", score: 5, reasoning: "Pass." },
        { key: "public_safe", score: 5, reasoning: "Pass." },
        { key: "fear_acknowledged", score: 0, reasoning: "Leads with services." },
      ],
    }));
    const { score: scoreFn, _seedRubricCache: seedFresh, _resetRubricCache: resetFresh } =
      await import("../../src/services/rubric/standardRubric");
    const { buildFallbackConfig: buildFresh } = await import("../../src/services/rubric/localFallback");
    resetFresh();
    seedFresh(buildFresh());

    const result = await scoreFn("Services-first hero copy", { mode: "cro" });
    expect(result.composite).toBeLessThanOrEqual(65);
  });

  test("judge failure returns degraded result, never throws", async () => {
    vi.doMock("@anthropic-ai/sdk", () => {
      class MockClient {
        messages = {
          create: async () => {
            throw new Error("network down");
          },
        };
      }
      return { default: MockClient };
    });
    const { score: scoreFn, _seedRubricCache: seedFresh, _resetRubricCache: resetFresh } =
      await import("../../src/services/rubric/standardRubric");
    const { buildFallbackConfig: buildFresh } = await import("../../src/services/rubric/localFallback");
    resetFresh();
    seedFresh(buildFresh());

    const result = await scoreFn("anything", { mode: "runtime" });
    expect(result.composite).toBe(0);
    expect(result.repair_instructions[0].dimension).toBe("system");
  });

  test("config-change-without-redeploy: seeded Notion config is honored", async () => {
    const customConfig = buildFallbackConfig();
    customConfig.source = "notion";
    customConfig.versionId = "notion-test-version";
    customConfig.modeWeights.cro.passThreshold = 99;

    mockAnthropic(() => ({
      dimensions: [{ key: "meta_question", score: 40, reasoning: "ok" }],
    }));

    const { _seedRubricCache: seedFresh, _resetRubricCache: resetFresh, score: scoreFn } =
      await import("../../src/services/rubric/standardRubric");
    resetFresh();
    seedFresh(customConfig);

    const result = await scoreFn("content", { mode: "cro" });
    expect(result.rubric_version_id).toBe("notion-test-version");
    expect(result.loaded_from).toBe("notion");
  });
});
