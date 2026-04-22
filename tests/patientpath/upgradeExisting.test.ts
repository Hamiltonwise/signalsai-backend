/**
 * Tests for upgrade_existing Card 2 entry mode (Card 5 Run 4).
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

vi.mock("../../src/services/webFetch", () => ({
  fetchPage: async (url: string) => ({
    success: true,
    html: `<html><body>Advanced orthodontic care utilizing state-of-the-art technology (${url})</body></html>`,
  }),
  extractText: async (html: string) =>
    html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
}));

vi.mock("../../src/controllers/places/feature-services/GooglePlacesApiService", () => ({
  isApiKeyConfigured: () => false,
  textSearch: async () => [],
  getPlaceDetails: async () => ({ reviews: [] }),
}));

vi.mock("../../src/database/connection", () => ({
  db: Object.assign(
    () => ({
      where: () => ({ first: async () => ({}), orderBy: () => ({ first: async () => null }) }),
      insert: () => ({ returning: async () => [{ id: "noop" }] }),
    }),
    { raw: (s: string) => s }
  ),
}));

vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: { create: async () => ({}) },
}));

const GOOD_REWRITE =
  "If you walked in dreading orthodontic care, you're in the right place. Our patients describe Dr. Artful as calm, specific, and willing to tell you when you don't need treatment.";

function passingGate() {
  return {
    dimensions: [
      { key: "meta_question", score: 38, reasoning: "ok" },
      { key: "recognition_test", score: 9, reasoning: "ok" },
      { key: "patient_voice_match", score: 9, reasoning: "ok" },
      { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A" },
      { key: "cesar_millan", score: 9, reasoning: "ok" },
      { key: "mom_test", score: 9, reasoning: "ok" },
      { key: "provenance", score: 0, na: true, reasoning: "N/A" },
      { key: "never_blank", score: 5, reasoning: "pass" },
      { key: "public_safe", score: 5, reasoning: "pass" },
    ],
    repair_instructions: [],
  };
}

const router: { composeResponses: string[]; gateResponse: any } = {
  composeResponses: [],
  gateResponse: null,
};

vi.mock("@anthropic-ai/sdk", () => {
  class MockClient {
    messages = {
      create: async (args: any) => {
        const user = args.messages?.[0]?.content ?? "";
        const system = args.system ?? "";
        if (system.includes("judge") || user.includes("Rubric dimensions:")) {
          return {
            content: [{ type: "text", text: JSON.stringify(router.gateResponse ?? passingGate()) }],
          };
        }
        const text = router.composeResponses.shift();
        if (!text) throw new Error("no compose response");
        return { content: [{ type: "text", text }] };
      },
    };
  }
  return { default: MockClient };
});

describe("upgrade_existing mode", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.FREEFORM_CONCERN_GATE_ENABLED = "true";
    process.env.COPY_REWRITE_ENABLED = "true";
    process.env.UPGRADE_EXISTING_ENABLED = "true";
    delete process.env.NOTION_TOKEN;
    _resetRubricCache();
    _seedRubricCache(buildFallbackConfig());
    _resetFlagCache();
    _resetRewriteFlagCache();
    _resetCopyRewriteConfigCache();
    router.composeResponses = [];
    router.gateResponse = passingGate();
  });

  test("produces a diff with before, after, and projected score delta", async () => {
    router.composeResponses = [GOOD_REWRITE];
    const { runUpgradeExisting } = await import(
      "../../src/services/patientpath/upgradeExisting"
    );
    const result = await runUpgradeExisting({
      orgId: 27,
      url: "https://artfulorthodontics.com",
      specialty: "orthodontics",
      location: "Birmingham, AL",
      practiceName: "Artful Orthodontics",
      differentiator: "calm second-opinion conscience",
      doctorBackground: "Dr. Jane Artful, DMD",
      targetSections: ["hero"],
    });

    expect(result.autoPublishAllowed).toBe(false);
    expect(result.approvalRequired).toBe(true);
    expect(result.sectionDiffs.length).toBe(1);
    const hero = result.sectionDiffs[0];
    expect(hero.section).toBe("hero");
    expect(hero.before.length).toBeGreaterThan(0);
    expect(hero.after).toBe(GOOD_REWRITE);
    expect(hero.passed).toBe(true);
    expect(hero.firstSentenceBefore).not.toBe(hero.firstSentenceAfter);
    expect(result.triScoreProjected.cro).not.toBeNull();
    expect(result.triScoreProjected.rationale).toContain("sections");
    expect(result.proposalEmitted).toBe(true);
  });

  test("orchestrator entry: mode='upgrade_existing' routes here and returns proposal_ready", async () => {
    router.composeResponses = [GOOD_REWRITE];
    const { runBuildOrchestrator } = await import(
      "../../src/services/patientpath/orchestrator"
    );
    // db stubs will return {} for org lookup; that satisfies the early check.
    const result = await runBuildOrchestrator({
      orgId: 27,
      triggerEventId: "test-upgrade-1",
      mode: "upgrade_existing",
      existingUrl: "https://artfulorthodontics.com",
      upgradeContext: {
        practiceName: "Artful Orthodontics",
        specialty: "orthodontics",
        location: "Birmingham, AL",
      },
    });
    expect(result.status).toBe("upgrade_existing_proposal_ready");
    expect(result.stages.upgradeExisting).toBeDefined();
    expect(result.stages.upgradeExisting?.sectionsPassed).toBeGreaterThanOrEqual(0);
  });

  test("shadow mode (flag off): still composes diff but proposalEmitted=false", async () => {
    delete process.env.UPGRADE_EXISTING_ENABLED;
    router.composeResponses = [GOOD_REWRITE];
    const { runUpgradeExisting } = await import(
      "../../src/services/patientpath/upgradeExisting"
    );
    const result = await runUpgradeExisting({
      orgId: 27,
      url: "https://artfulorthodontics.com",
      practiceName: "Artful Orthodontics",
      targetSections: ["hero"],
    });
    expect(result.shadow).toBe(true);
    expect(result.sectionDiffs.length).toBe(1);
    expect(result.proposalEmitted).toBe(false);
  });
});
