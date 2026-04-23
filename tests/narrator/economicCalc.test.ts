import { describe, test, expect, beforeAll, beforeEach } from "vitest";
import { calculateImpact } from "../../src/services/economic/economicCalc";
import { CONFIDENCE_THRESHOLD, applyGuardrail } from "../../src/services/economic/confidenceThreshold";
import {
  getBenchmark,
  inferVertical,
  _seedBenchmarkCacheForTests,
  _resetBenchmarkCacheForTests,
} from "../../src/services/economic/industryBenchmarks";

// Canonical fixture — mirrors the migration seed. Tests hit this cache, not the DB.
const SEED_ROWS = [
  { vertical: "endodontics", avg_case_value_usd: 1800, avg_monthly_new_customers: 45, referral_dependency_pct: 0.85, source: "ADA endodontic specialty report, 3-year average" },
  { vertical: "orthodontics", avg_case_value_usd: 5000, avg_monthly_new_customers: 18, referral_dependency_pct: 0.55, source: "AAO practice economics survey, category average" },
  { vertical: "oral_surgery", avg_case_value_usd: 2400, avg_monthly_new_customers: 30, referral_dependency_pct: 0.9, source: "AAOMS category survey" },
  { vertical: "general_dentistry", avg_case_value_usd: 850, avg_monthly_new_customers: 35, referral_dependency_pct: 0.25, source: "ADA general dentistry survey" },
  { vertical: "physical_therapy", avg_case_value_usd: 1200, avg_monthly_new_customers: 25, referral_dependency_pct: 0.6, source: "APTA practice report" },
  { vertical: "chiropractic", avg_case_value_usd: 700, avg_monthly_new_customers: 20, referral_dependency_pct: 0.35, source: "ACA practice economics benchmark" },
  { vertical: "veterinary", avg_case_value_usd: 550, avg_monthly_new_customers: 40, referral_dependency_pct: 0.2, source: "AVMA practice benchmark" },
  { vertical: "unknown", avg_case_value_usd: 0, avg_monthly_new_customers: 0, referral_dependency_pct: 0, source: "No vertical known; defer to org data" },
];

beforeAll(() => {
  _seedBenchmarkCacheForTests(SEED_ROWS);
});

beforeEach(() => {
  // Restore baseline cache before each test so open-world additions from one
  // test don't leak into the next.
  _seedBenchmarkCacheForTests(SEED_ROWS);
});

describe("inferVertical", () => {
  test("maps known specialty strings to canonical vertical", () => {
    expect(inferVertical("Endodontist")).toBe("endodontics");
    expect(inferVertical("Orthodontist")).toBe("orthodontics");
    expect(inferVertical("Oral Surgeon")).toBe("oral_surgery");
    expect(inferVertical("General Dentist")).toBe("general_dentistry");
    expect(inferVertical("Veterinary Clinic")).toBe("veterinary");
  });

  test("returns 'unknown' only for null or empty input", () => {
    expect(inferVertical(null)).toBe("unknown");
    expect(inferVertical(undefined)).toBe("unknown");
    expect(inferVertical("")).toBe("unknown");
  });

  test("slugifies unrecognized verticals (open-world)", () => {
    // Card L: unrecognized strings pass through as slugs so the DB can answer.
    expect(inferVertical("Yoga Studio")).toBe("yoga_studio");
    expect(inferVertical("med spa")).toBe("med_spa");
  });
});

describe("Theranos guardrail (applyGuardrail)", () => {
  test("blocks dollar output below threshold", () => {
    const g = applyGuardrail({ dollar30d: 1000, dollar90d: 3000, dollar365d: 12000, confidence: 50 });
    expect(g.allowedToShowDollar).toBe(false);
    expect(g.dollar30d).toBeNull();
    expect(g.dataGapReason).toMatch(/below threshold/i);
  });

  test("allows dollar output at threshold with data", () => {
    const g = applyGuardrail({
      dollar30d: 1000,
      dollar90d: 3000,
      dollar365d: 12000,
      confidence: CONFIDENCE_THRESHOLD,
    });
    expect(g.allowedToShowDollar).toBe(true);
    expect(g.dollar90d).toBe(3000);
    expect(g.dataGapReason).toBeNull();
  });
});

describe("calculateImpact — Theranos guardrail end-to-end", () => {
  test("new practice (<14 days old), no GBP, unknown vertical → data gap", () => {
    const impact = calculateImpact(
      "site.qa_passed",
      { eventType: "site.qa_passed" },
      {
        createdAt: new Date(Date.now() - 5 * 86400000),
        vertical: null,
        hasCheckupData: false,
        hasGbpData: false,
      }
    );
    expect(impact.allowedToShowDollar).toBe(false);
    expect(impact.dollar90d).toBeNull();
    expect(impact.dataGapReason).toBeTruthy();
  });

  test("established endodontic practice with GBP data → dollar still blocked (no org revenue)", () => {
    const impact = calculateImpact(
      "site.qa_passed",
      { eventType: "site.qa_passed" },
      {
        createdAt: new Date(Date.now() - 120 * 86400000),
        vertical: "Endodontist",
        hasCheckupData: true,
        hasGbpData: true,
      }
    );
    expect(impact.vertical).toBe("endodontics");
    // No knownAverageCaseValueUsd → -30, no knownMonthlyNewCustomers → -10.
    // Confidence lands at 60, below the 80 threshold, so the guardrail trips.
    expect(impact.allowedToShowDollar).toBe(false);
  });

  test("endodontic practice with org-known case value and customer flow → dollar allowed", () => {
    const impact = calculateImpact(
      "site.qa_passed",
      { eventType: "site.qa_passed" },
      {
        createdAt: new Date(Date.now() - 180 * 86400000),
        vertical: "Endodontist",
        hasCheckupData: true,
        hasGbpData: true,
        knownAverageCaseValueUsd: 1950,
        knownMonthlyNewCustomers: 55,
      }
    );
    expect(impact.allowedToShowDollar).toBe(true);
    expect(impact.dollar90d).toBeGreaterThan(0);
    expect(impact.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
});

describe("industry benchmarks — DB-backed", () => {
  test("endodontics benchmark served from cached DB row", () => {
    const b = getBenchmark("endodontics");
    expect(b.averageCaseValueUsd).toBe(1800);
    expect(b.averageMonthlyNewCustomers).toBe(45);
    expect(b.referralDependencyPct).toBeCloseTo(0.85, 2);
  });

  test("unknown vertical returns zero-sentinel so guardrail trips", () => {
    const b = getBenchmark("unknown");
    expect(b.averageCaseValueUsd).toBe(0);
    expect(b.averageMonthlyNewCustomers).toBe(0);
  });

  test("cold cache (no hydration) returns unknown sentinel", () => {
    _resetBenchmarkCacheForTests();
    const b = getBenchmark("endodontics");
    expect(b.averageCaseValueUsd).toBe(0);
    // Restore for subsequent tests.
    _seedBenchmarkCacheForTests(SEED_ROWS);
  });
});

describe("Extension point — adding a vertical without code change", () => {
  test("new yoga_studio row makes calculateImpact work for a yoga_studio org", () => {
    // Inject the new vertical into the cache to simulate a fresh DB row.
    _seedBenchmarkCacheForTests([
      ...SEED_ROWS,
      {
        vertical: "yoga_studio",
        avg_case_value_usd: 120,
        avg_monthly_new_customers: 60,
        referral_dependency_pct: 0.1,
        source: "Card L extension point test",
      },
    ]);

    const impact = calculateImpact(
      "site.published",
      { eventType: "site.published" },
      {
        id: 9999,
        createdAt: new Date(Date.now() - 200 * 86400000),
        vertical: "Yoga Studio",
        hasCheckupData: true,
        hasGbpData: true,
        knownAverageCaseValueUsd: 120,
        knownMonthlyNewCustomers: 60,
      }
    );

    expect(impact.vertical).toBe("yoga_studio");
    expect(impact.allowedToShowDollar).toBe(true);
    expect(impact.dollar30d).toBeGreaterThan(0);
    expect(impact.dollar365d).toBeGreaterThan(impact.dollar90d!);
  });
});
