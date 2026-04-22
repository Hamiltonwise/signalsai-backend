/**
 * Tests for the Recognition Tri-Score scorer.
 *
 * fetchPage, Places API, and the Anthropic judge are all stubbed so these
 * run offline and deterministically.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  _resetRubricCache,
  _seedRubricCache,
} from "../../src/services/rubric/standardRubric";
import { buildFallbackConfig } from "../../src/services/rubric/localFallback";

vi.mock("../../src/services/webFetch", () => ({
  fetchPage: async (url: string) => {
    if (url.includes("notfound")) {
      return { success: false, error: "HTTP 404" };
    }
    if (url.endsWith("/about") || url.endsWith("/about-us") || url.includes("/meet-the-doctor")) {
      return {
        success: true,
        html: "<html><body>Dr. Chris Olson. DDS, USC. We focus on honest care for anxious patients.</body></html>",
      };
    }
    return {
      success: true,
      html: "<html><body>Advanced endodontic care utilizing state-of-the-art technology.</body></html>",
    };
  },
  extractText: async (html: string) =>
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
}));

vi.mock(
  "../../src/controllers/places/feature-services/GooglePlacesApiService",
  () => ({
    isApiKeyConfigured: () => true,
    textSearch: async () => [
      {
        id: "place-abc",
        websiteUri: "https://surfcityendo.com",
      },
    ],
    getPlaceDetails: async () => ({
      reviews: [
        {
          rating: 5,
          text: {
            text:
              "Dr. Olson has ninja accuracy and I didn't even need my usual anxiety medication to walk in. Compassionate, honest, and calm.",
          },
          authorAttribution: { displayName: "Maria V." },
          relativePublishTimeDescription: "2 weeks ago",
        },
        {
          rating: 5,
          text: {
            text: "He told me I didn't need the procedure my regular dentist wanted. Saved me thousands.",
          },
          authorAttribution: { displayName: "James K." },
          relativePublishTimeDescription: "a month ago",
        },
      ],
    }),
  })
);

vi.mock("@anthropic-ai/sdk", () => {
  class MockClient {
    messages = {
      create: async (args: any) => {
        const user = args.messages?.[0]?.content ?? "";
        if (user.includes("verifying")) {
          // Missing-example verifier call
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  items: [
                    {
                      phrase: "ninja accuracy and",
                      verified: true,
                      reasoning: "Site does not use this phrase or theme.",
                    },
                    {
                      phrase: "anxiety medication to walk",
                      verified: true,
                      reasoning: "Anxiety/meds story not on the site.",
                    },
                  ],
                }),
              },
            ],
          };
        }
        // Rubric judge call
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                dimensions: [
                  { key: "meta_question", score: 15, reasoning: "Tech-first." },
                  { key: "recognition_test", score: 1, reasoning: "Template." },
                  { key: "patient_voice_match", score: 0, reasoning: "No patient voice." },
                  { key: "recipe_compliance", score: 0, na: true, reasoning: "N/A." },
                  { key: "cesar_millan", score: 5, reasoning: "Neutral." },
                  { key: "mom_test", score: 6, reasoning: "Some jargon." },
                  { key: "provenance", score: 0, na: true, reasoning: "N/A." },
                  { key: "never_blank", score: 5, reasoning: "Pass." },
                  { key: "public_safe", score: 5, reasoning: "Pass." },
                  { key: "fear_acknowledged", score: 0, reasoning: "Services-first." },
                ],
                repair_instructions: [
                  {
                    dimension: "fear_acknowledged",
                    instruction: "Open with the patient's fear.",
                  },
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

describe("scoreRecognition", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    _resetRubricCache();
    _seedRubricCache(buildFallbackConfig());
  });

  test("produces three scores for a practice URL", async () => {
    const { scoreRecognition } = await import("../../src/services/checkup/recognitionScorer");
    const result = await scoreRecognition({
      practiceUrl: "https://surfcityendo.com",
      specialty: "endodontics",
      location: "Huntington Beach, CA",
    });

    expect(result.practice.pageFetched).toBe(true);
    expect(result.practice.seo_composite).not.toBeNull();
    expect(result.practice.aeo_composite).not.toBeNull();
    expect(result.practice.cro_composite).not.toBeNull();
    expect(result.review_data_available).toBe(true);
    expect(result.practice.review_count).toBeGreaterThan(0);
  });

  test("extracts missing examples pulled from real reviews", async () => {
    const { scoreRecognition } = await import("../../src/services/checkup/recognitionScorer");
    const result = await scoreRecognition({
      practiceUrl: "https://surfcityendo.com",
      specialty: "endodontics",
    });
    expect(result.practice.missing_examples.length).toBeGreaterThanOrEqual(1);
  });

  test("handles fetch failure gracefully (no throw)", async () => {
    const { scoreRecognition } = await import("../../src/services/checkup/recognitionScorer");
    const result = await scoreRecognition({
      practiceUrl: "https://notfound.example.com",
    });
    expect(result.practice.pageFetched).toBe(false);
    expect(result.practice.seo_composite).toBeNull();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test("runs competitor comparison when URLs provided", async () => {
    const { scoreRecognition } = await import("../../src/services/checkup/recognitionScorer");
    const result = await scoreRecognition({
      practiceUrl: "https://surfcityendo.com",
      specialty: "endodontics",
      competitorUrls: ["https://competitor1.com", "https://competitor2.com"],
    });
    expect(result.competitors.length).toBe(2);
    for (const c of result.competitors) {
      expect(c.seo_composite).not.toBeNull();
    }
  });
});
