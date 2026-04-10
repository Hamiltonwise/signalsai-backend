/**
 * Scoring Logic Tests -- Business logic verification
 *
 * Tests the clarity scoring engine against known inputs.
 * No database, no network. Pure function tests.
 *
 * These prove: given this data, the score is this, the readings are these.
 * Dave can verify the math matches the Product Constitution.
 */

import { describe, test, expect, vi } from "vitest";

// Mock the database import so we can test the pure scoring logic
vi.mock("../src/database/connection", () => ({
  db: () => ({ select: () => Promise.resolve([]) }),
}));

vi.mock("../src/services/businessMetrics", () => ({
  getScoreLabel: (score: number) => {
    if (score >= 80) return "Strong";
    if (score >= 50) return "Developing";
    return "Needs Attention";
  },
  REVIEW_VOLUME_BENCHMARKS: {},
}));

import {
  calculateClarityScore,
  getScoringDefaults,
  type PlaceData,
  type CompetitorData,
} from "../src/services/clarityScoring";

// ── Test Data ──────────────────────────────────────────────────────

const HEALTHY_PRACTICE: PlaceData = {
  rating: 5.0,
  reviewCount: 74,
  photosCount: 15,
  hasHours: true,
  hasPhone: true,
  hasWebsite: true,
  hasEditorialSummary: true,
  businessStatus: "OPERATIONAL",
  reviews: [
    { publishTime: new Date().toISOString(), ownerResponse: "Thank you!" },
    { publishTime: new Date().toISOString(), ownerResponse: "Thanks!" },
    { publishTime: new Date(Date.now() - 7 * 86400000).toISOString(), ownerResponse: "Appreciate it!" },
  ],
};

const WEAK_PRACTICE: PlaceData = {
  rating: 3.8,
  reviewCount: 12,
  photosCount: 0,
  hasHours: false,
  hasPhone: true,
  hasWebsite: false,
  hasEditorialSummary: false,
  businessStatus: "OPERATIONAL",
  reviews: [],
};

const STRONG_COMPETITOR: CompetitorData = {
  name: "Top Competitor Orthodontics",
  totalScore: 85,
  reviewsCount: 120,
};

const WEAKER_COMPETITOR: CompetitorData = {
  name: "Small Practice",
  totalScore: 40,
  reviewsCount: 30,
};

// ═════════════════════════════════════════════════════════════════════
// SCORING ENGINE
// ═════════════════════════════════════════════════════════════════════

describe("Clarity Scoring Engine", () => {
  test("returns a valid ScoringResult structure", () => {
    const result = calculateClarityScore(HEALTHY_PRACTICE, [STRONG_COMPETITOR], "orthodontist");

    expect(result).toHaveProperty("composite");
    expect(result).toHaveProperty("subScores");
    expect(result).toHaveProperty("scoreLabel");
    expect(result).toHaveProperty("readings");
    expect(typeof result.composite).toBe("number");
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(100);
  });

  test("every reading has required fields (Known 7 compliance)", () => {
    const result = calculateClarityScore(HEALTHY_PRACTICE, [STRONG_COMPETITOR], "orthodontist");

    for (const reading of result.readings) {
      expect(reading).toHaveProperty("name");
      expect(reading).toHaveProperty("value");
      expect(reading).toHaveProperty("status");
      expect(reading).toHaveProperty("context");
      expect(reading).toHaveProperty("verifyBy");
      expect(reading).toHaveProperty("canAlloroFix");

      // Status must be one of the three valid values
      expect(["healthy", "attention", "critical"]).toContain(reading.status);

      // verifyBy must mention Google (Known 1: verifiable)
      expect(reading.verifyBy.toLowerCase()).toMatch(/google|check|open/);
    }
  });

  test("no reading contains a transformed number (Known 7: raw data only)", () => {
    const result = calculateClarityScore(HEALTHY_PRACTICE, [STRONG_COMPETITOR], "orthodontist");

    for (const reading of result.readings) {
      // Value should be human-readable raw data, not a formula output
      // Should NOT contain patterns like "8/10" or percentages from formulas
      expect(reading.value).not.toMatch(/\/10|\/100/);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// READING STATUS RANGES
// ═════════════════════════════════════════════════════════════════════

describe("Reading status ranges match Product Constitution", () => {
  test("Star Rating: 4.5+ = healthy, 4.0-4.4 = attention, <4.0 = critical", () => {
    const makePlace = (rating: number): PlaceData => ({
      ...HEALTHY_PRACTICE,
      rating,
      reviews: [],
    });

    const r1 = calculateClarityScore(makePlace(5.0), [], "dentist");
    const starReading1 = r1.readings.find(r => r.name === "Star Rating");
    expect(starReading1?.status).toBe("healthy");

    const r2 = calculateClarityScore(makePlace(4.2), [], "dentist");
    const starReading2 = r2.readings.find(r => r.name === "Star Rating");
    expect(starReading2?.status).toBe("attention");

    const r3 = calculateClarityScore(makePlace(3.5), [], "dentist");
    const starReading3 = r3.readings.find(r => r.name === "Star Rating");
    expect(starReading3?.status).toBe("critical");
  });

  test("Review Volume: >= competitor = healthy, >= 50% = attention, < 50% = critical", () => {
    const competitor: CompetitorData = { name: "Test", totalScore: 50, reviewsCount: 100 };

    // 100 reviews vs 100 = healthy
    const r1 = calculateClarityScore({ ...HEALTHY_PRACTICE, reviewCount: 100, reviews: [] }, [competitor], "dentist");
    expect(r1.readings.find(r => r.name === "Review Volume")?.status).toBe("healthy");

    // 60 reviews vs 100 = attention (60%)
    const r2 = calculateClarityScore({ ...HEALTHY_PRACTICE, reviewCount: 60, reviews: [] }, [competitor], "dentist");
    expect(r2.readings.find(r => r.name === "Review Volume")?.status).toBe("attention");

    // 20 reviews vs 100 = critical (20%)
    const r3 = calculateClarityScore({ ...HEALTHY_PRACTICE, reviewCount: 20, reviews: [] }, [competitor], "dentist");
    expect(r3.readings.find(r => r.name === "Review Volume")?.status).toBe("critical");
  });

  test("GBP Completeness: 5/5 = healthy, 3-4 = attention, 0-2 = critical", () => {
    // 5/5
    const r1 = calculateClarityScore(HEALTHY_PRACTICE, [], "dentist");
    const gbp1 = r1.readings.find(r => r.name === "Profile Completeness");
    expect(gbp1?.status).toBe("healthy");
    expect(gbp1?.value).toBe("5/5 fields");

    // 2/5 (phone + one more = critical)
    const r2 = calculateClarityScore(WEAK_PRACTICE, [], "dentist");
    const gbp2 = r2.readings.find(r => r.name === "Profile Completeness");
    expect(gbp2?.status).toBe("critical");
  });
});

// ═════════════════════════════════════════════════════════════════════
// COMPETITOR NAMING (Known 5: The Recipe)
// ═════════════════════════════════════════════════════════════════════

describe("Known 5: Findings name competitors specifically", () => {
  test("Review Volume reading names the top competitor", () => {
    const result = calculateClarityScore(HEALTHY_PRACTICE, [STRONG_COMPETITOR], "orthodontist");
    const reviewReading = result.readings.find(r => r.name === "Review Volume");

    // Context must name the competitor, not say "a competitor"
    expect(reviewReading?.context).toContain("Top Competitor Orthodontics");
    expect(reviewReading?.context).not.toContain("a competitor");
  });

  test("Review Volume reading includes specific numbers", () => {
    const result = calculateClarityScore(HEALTHY_PRACTICE, [STRONG_COMPETITOR], "orthodontist");
    const reviewReading = result.readings.find(r => r.name === "Review Volume");

    // Must contain specific review counts
    expect(reviewReading?.context).toContain("120");
  });
});

// ═════════════════════════════════════════════════════════════════════
// EDGE CASES
// ═════════════════════════════════════════════════════════════════════

describe("Edge cases", () => {
  test("handles zero competitors gracefully", () => {
    const result = calculateClarityScore(HEALTHY_PRACTICE, [], "dentist");
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.readings.length).toBeGreaterThan(0);
  });

  test("handles zero reviews gracefully", () => {
    const place: PlaceData = { ...WEAK_PRACTICE, reviewCount: 0, reviews: [] };
    const result = calculateClarityScore(place, [STRONG_COMPETITOR], "dentist");
    expect(result.composite).toBeGreaterThanOrEqual(0);
  });

  test("handles missing place data gracefully", () => {
    const minimal: PlaceData = {
      rating: 0,
      reviewCount: 0,
      photosCount: 0,
      hasHours: false,
      hasPhone: false,
      hasWebsite: false,
      hasEditorialSummary: false,
      businessStatus: "OPERATIONAL",
    };
    const result = calculateClarityScore(minimal, [], "dentist");
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.readings.length).toBeGreaterThan(0);
  });

  test("scoring defaults are defined", () => {
    const defaults = getScoringDefaults();
    expect(defaults).toHaveProperty("review_health_max");
    expect(defaults).toHaveProperty("gbp_completeness_max");
    expect(defaults).toHaveProperty("online_activity_max");
    // Weights should sum to 100
    expect(defaults.review_health_max + defaults.gbp_completeness_max + defaults.online_activity_max).toBe(100);
  });
});
