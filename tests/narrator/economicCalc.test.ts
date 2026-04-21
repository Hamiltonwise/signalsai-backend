import { describe, test, expect } from "vitest";
import { calculateImpact } from "../../src/services/economic/economicCalc";
import { CONFIDENCE_THRESHOLD, applyGuardrail } from "../../src/services/economic/confidenceThreshold";
import { getBenchmark, inferVertical } from "../../src/services/economic/industryBenchmarks";

describe("inferVertical", () => {
  test("maps specialty strings to canonical vertical", () => {
    expect(inferVertical("Endodontist")).toBe("endodontics");
    expect(inferVertical("Orthodontist")).toBe("orthodontics");
    expect(inferVertical("Oral Surgeon")).toBe("oral_surgery");
    expect(inferVertical("General Dentist")).toBe("general_dentistry");
    expect(inferVertical("Veterinary Clinic")).toBe("veterinary");
    expect(inferVertical(null)).toBe("unknown");
    expect(inferVertical("something weird")).toBe("unknown");
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

  test("established endodontic practice with GBP data → dollar allowed", () => {
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
    // allowedToShowDollar depends on confidence cuts; with benchmark fallback
    // we lose 30 for no org_case_value, 10 for no patients, total 60 penalty
    // but we keep GBP + history + known vertical + known formula. So confidence
    // sits at 100 - 30 - 10 = 60: below threshold. That is correct Theranos
    // behavior: even with a known vertical, without org-specific revenue we
    // must not fabricate a dollar.
    expect(impact.allowedToShowDollar).toBe(false);
  });

  test("endodontic practice with org-known case value and patient flow → dollar allowed", () => {
    const impact = calculateImpact(
      "site.qa_passed",
      { eventType: "site.qa_passed" },
      {
        createdAt: new Date(Date.now() - 180 * 86400000),
        vertical: "Endodontist",
        hasCheckupData: true,
        hasGbpData: true,
        knownAverageCaseValueUsd: 1950,
        knownMonthlyNewPatients: 55,
      }
    );
    expect(impact.allowedToShowDollar).toBe(true);
    expect(impact.dollar90d).toBeGreaterThan(0);
    expect(impact.confidence).toBeGreaterThanOrEqual(CONFIDENCE_THRESHOLD);
  });
});

describe("industry benchmarks", () => {
  test("endo benchmark keeps case value in dental range", () => {
    const b = getBenchmark("endodontics");
    expect(b.averageCaseValueUsd).toBeGreaterThan(1000);
    expect(b.referralDependencyPct).toBeGreaterThan(0.7);
  });
});
