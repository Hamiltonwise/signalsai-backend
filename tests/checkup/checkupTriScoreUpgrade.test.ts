/**
 * Tests for the Checkup Tri-Score Upgrade.
 *
 * Verifies:
 *   1. Existing output preserved when flag OFF
 *   2. Tri-score output produced when flag ON
 *   3. Event emission on completion
 *   4. Prospect framing passes Mom Test / Standard rubric validation
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  _resetRubricCache,
  _seedRubricCache,
} from "../../src/services/rubric/standardRubric";
import { buildFallbackConfig } from "../../src/services/rubric/localFallback";

// Mock featureFlags
let mockFlagValue = false;
vi.mock("../../src/services/featureFlags", () => ({
  isEnabled: async (flag: string, _orgId?: number) => {
    if (flag === "checkup_tri_score_enabled") return mockFlagValue;
    return false;
  },
  invalidateCache: () => {},
}));

// Mock BehavioralEventModel
const createdEvents: any[] = [];
vi.mock("../../src/models/BehavioralEventModel", () => ({
  BehavioralEventModel: {
    create: async (data: any) => {
      createdEvents.push(data);
      return { id: "test-event-id", ...data };
    },
  },
}));

// Mock database
vi.mock("../../src/database/connection", () => ({
  db: () => ({
    where: () => ({ first: async () => null }),
    insert: async () => [{ id: "test-id" }],
  }),
}));

// Mock webFetch
vi.mock("../../src/services/webFetch", () => ({
  fetchPage: async (url: string) => {
    if (url.includes("notfound")) {
      return { success: false, error: "HTTP 404" };
    }
    if (url.endsWith("/about") || url.endsWith("/about-us") || url.includes("/meet-the-doctor")) {
      return {
        success: true,
        html: "<html><body>Dr. Smith specializes in creating beautiful smiles. She understands dental anxiety and takes time with each patient.</body></html>",
      };
    }
    return {
      success: true,
      html: "<html><body>Welcome to Artful Orthodontics. We provide comprehensive orthodontic care.</body></html>",
    };
  },
  extractText: async (html: string) =>
    html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
}));

// Mock Google Places
vi.mock(
  "../../src/controllers/places/feature-services/GooglePlacesApiService",
  () => ({
    isApiKeyConfigured: () => true,
    textSearch: async () => [
      { id: "place-artful", websiteUri: "https://artfulortho.com" },
    ],
    getPlaceDetails: async () => ({
      reviews: [
        {
          rating: 5,
          text: { text: "Dr. Smith made my daughter feel so comfortable. The whole team was patient and explained every step clearly." },
          authorAttribution: { displayName: "Sarah M." },
          relativePublishTimeDescription: "a week ago",
        },
        {
          rating: 5,
          text: { text: "They really listen to your concerns. My son was terrified but they handled it perfectly." },
          authorAttribution: { displayName: "Mike R." },
          relativePublishTimeDescription: "2 weeks ago",
        },
      ],
    }),
  })
);

// Mock Anthropic
vi.mock("@anthropic-ai/sdk", () => {
  class MockClient {
    messages = {
      create: async (args: any) => {
        const user = args.messages?.[0]?.content ?? "";
        if (user.includes("verifying")) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  items: [
                    { phrase: "daughter feel so comfortable", verified: true, reasoning: "Not on site." },
                    { phrase: "terrified but they handled", verified: true, reasoning: "Anxiety theme missing." },
                  ],
                }),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dimensions: [
                  { key: "meta_question", score: 20, reasoning: "Some understanding." },
                  { key: "recognition_test", score: 3, reasoning: "Generic." },
                  { key: "patient_voice_match", score: 2, reasoning: "Minimal patient voice." },
                  { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A." },
                  { key: "cesar_millan", score: 7, reasoning: "OK." },
                  { key: "mom_test", score: 7, reasoning: "Mostly clear." },
                  { key: "provenance", score: 0, na: true, reasoning: "N/A." },
                  { key: "never_blank", score: 5, reasoning: "Pass." },
                  { key: "public_safe", score: 5, reasoning: "Pass." },
                  { key: "fear_acknowledged", score: 2, reasoning: "Services first." },
                ],
                repair_instructions: [
                  { dimension: "recognition_test", instruction: "Add specific practitioner details." },
                  { dimension: "fear_acknowledged", instruction: "Open with patient fears." },
                ],
              }),
            },
          ],
        };
      },
    };
  }
  return { default: MockClient };
});

// Mock Notion config
vi.mock("../../src/services/checkup/checkupNotionConfig", () => ({
  loadCheckupCopyConfig: async () => ({
    headline: "",
    subheadline: "",
    ctaLabel: "See the full report",
    ctaDescription: "Get your complete Recognition Report.",
    disclaimer: "Based on publicly available data.",
    scoreLabels: { strong: "Strong", developing: "Developing", needs_attention: "Needs attention" },
    summaryTemplates: {},
    source: "fallback",
    loadedAt: new Date().toISOString(),
  }),
}));

describe("computeCheckupTriScore", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    _resetRubricCache();
    _seedRubricCache(buildFallbackConfig());
    createdEvents.length = 0;
    mockFlagValue = false;
  });

  test("returns disabled when flag is OFF (existing output preserved)", async () => {
    mockFlagValue = false;
    const { computeCheckupTriScore } = await import(
      "../../src/services/checkup/checkupTriScoreUpgrade"
    );
    const result = await computeCheckupTriScore({
      practiceUrl: "https://artfulortho.com",
      practiceName: "Artful Orthodontics",
    });

    expect(result.enabled).toBe(false);
    expect(result.prospectFraming).toBeNull();
    expect(result.rawResult).toBeNull();
    expect(result.eventEmitted).toBe(false);
    expect(createdEvents.length).toBe(0);
  });

  test("produces tri-score output when flag is ON", async () => {
    mockFlagValue = true;
    const { computeCheckupTriScore } = await import(
      "../../src/services/checkup/checkupTriScoreUpgrade"
    );
    const result = await computeCheckupTriScore({
      practiceUrl: "https://artfulortho.com",
      practiceName: "Artful Orthodontics",
      specialty: "orthodontics",
      location: "Austin, TX",
    });

    expect(result.enabled).toBe(true);
    expect(result.prospectFraming).not.toBeNull();

    const framing = result.prospectFraming!;
    expect(framing.triScore.seo).not.toBeNull();
    expect(framing.triScore.aeo).not.toBeNull();
    expect(framing.triScore.cro).not.toBeNull();
    expect(framing.triScore.composite).not.toBeNull();
    expect(framing.triScore.label).toBeTruthy();
    expect(framing.triScore.summary).toBeTruthy();

    // Missing examples present
    expect(framing.missingExamples.length).toBeGreaterThanOrEqual(1);
    for (const ex of framing.missingExamples) {
      expect(ex.phrase).toBeTruthy();
      expect(ex.reviewerFirstName).toBeTruthy();
    }

    // Recommendations present
    expect(framing.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(framing.recommendations.length).toBeLessThanOrEqual(2);
    for (const rec of framing.recommendations) {
      expect(rec.title).toBeTruthy();
      expect(rec.detail).toBeTruthy();
      // No rubric internals exposed
      expect(rec.title).not.toContain("rubric");
      expect(rec.title).not.toContain("dimension");
    }

    // Next step CTA
    expect(framing.nextStep.label).toBeTruthy();
    expect(framing.nextStep.description).toBeTruthy();

    // Disclaimer present
    expect(framing.disclaimer).toBeTruthy();
  });

  test("emits checkup.tri_score_completed behavioral event", async () => {
    mockFlagValue = true;
    const { computeCheckupTriScore } = await import(
      "../../src/services/checkup/checkupTriScoreUpgrade"
    );
    const result = await computeCheckupTriScore({
      practiceUrl: "https://artfulortho.com",
      practiceName: "Artful Orthodontics",
      sessionId: "test-session-123",
    });

    expect(result.eventEmitted).toBe(true);
    const event = createdEvents.find(
      (e) => e.event_type === "checkup.tri_score_completed"
    );
    expect(event).toBeDefined();
    expect(event.properties.url).toBe("https://artfulortho.com");
    expect(event.properties.practice_name).toBe("Artful Orthodontics");
    expect(event.properties.seo_composite).not.toBeNull();
    expect(event.properties.aeo_composite).not.toBeNull();
    expect(event.properties.cro_composite).not.toBeNull();
    expect(event.properties.composite).not.toBeNull();
    expect(event.properties.missing_examples_count).toBeGreaterThanOrEqual(0);
    expect(event.properties.timestamp).toBeTruthy();
    expect(event.session_id).toBe("test-session-123");
  });

  test("prospect framing has no rubric internals or jargon", async () => {
    mockFlagValue = true;
    const { computeCheckupTriScore } = await import(
      "../../src/services/checkup/checkupTriScoreUpgrade"
    );
    const result = await computeCheckupTriScore({
      practiceUrl: "https://artfulortho.com",
      practiceName: "Artful Orthodontics",
    });

    const framing = result.prospectFraming!;
    const allText = [
      framing.headline,
      framing.subheadline,
      framing.triScore.summary,
      framing.triScore.label,
      framing.disclaimer,
      framing.nextStep.label,
      framing.nextStep.description,
      ...framing.recommendations.map((r) => `${r.title} ${r.detail}`),
    ].join(" ");

    // No Alloro internal language
    expect(allText).not.toMatch(/rubric/i);
    expect(allText).not.toMatch(/freeform concern/i);
    expect(allText).not.toMatch(/narrator/i);
    expect(allText).not.toMatch(/watcher agent/i);
    expect(allText).not.toMatch(/behavioral.event/i);
    expect(allText).not.toMatch(/dimension.key/i);
    expect(allText).not.toMatch(/composite.score/i);

    // Summary is inviting, not indicting
    expect(framing.triScore.summary).not.toMatch(/failing/i);
    expect(framing.triScore.summary).not.toMatch(/terrible/i);
    expect(framing.triScore.summary).not.toMatch(/broken/i);
  });

  test("handles missing URL gracefully", async () => {
    mockFlagValue = true;
    const { computeCheckupTriScore } = await import(
      "../../src/services/checkup/checkupTriScoreUpgrade"
    );
    const result = await computeCheckupTriScore({
      practiceName: "No Website Practice",
    });

    expect(result.enabled).toBe(true);
    expect(result.prospectFraming).toBeNull();
    expect(result.eventEmitted).toBe(false);
  });
});
