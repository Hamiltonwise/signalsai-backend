import { describe, test, expect, beforeAll } from "vitest";
import { _seedBenchmarkCacheForTests } from "../../src/services/economic/industryBenchmarks";

beforeAll(() => {
  _seedBenchmarkCacheForTests([
    { vertical: "endodontics", avg_case_value_usd: 1800, avg_monthly_new_customers: 45, referral_dependency_pct: 0.85, source: "ADA endodontic specialty report, 3-year average" },
    { vertical: "orthodontics", avg_case_value_usd: 5000, avg_monthly_new_customers: 18, referral_dependency_pct: 0.55, source: "AAO practice economics survey, category average" },
    { vertical: "oral_surgery", avg_case_value_usd: 2400, avg_monthly_new_customers: 30, referral_dependency_pct: 0.9, source: "AAOMS category survey" },
    { vertical: "general_dentistry", avg_case_value_usd: 850, avg_monthly_new_customers: 35, referral_dependency_pct: 0.25, source: "ADA general dentistry survey" },
    { vertical: "physical_therapy", avg_case_value_usd: 1200, avg_monthly_new_customers: 25, referral_dependency_pct: 0.6, source: "APTA practice report" },
    { vertical: "chiropractic", avg_case_value_usd: 700, avg_monthly_new_customers: 20, referral_dependency_pct: 0.35, source: "ACA practice economics benchmark" },
    { vertical: "veterinary", avg_case_value_usd: 550, avg_monthly_new_customers: 40, referral_dependency_pct: 0.2, source: "AVMA practice benchmark" },
    { vertical: "unknown", avg_case_value_usd: 0, avg_monthly_new_customers: 0, referral_dependency_pct: 0, source: "No vertical known; defer to org data" },
  ]);
});

import { siteQaPassedTemplate } from "../../src/services/narrator/templates/siteQaPassed";
import { siteQaBlockedTemplate } from "../../src/services/narrator/templates/siteQaBlocked";
import { sitePublishedTemplate } from "../../src/services/narrator/templates/sitePublished";
import { cleanWeekTemplate } from "../../src/services/narrator/templates/cleanWeek";
import { milestoneDetectedTemplate } from "../../src/services/narrator/templates/milestoneDetected";
import { referralSignalTemplate } from "../../src/services/narrator/templates/referralSignal";
import { weeklyRankingUpdateTemplate } from "../../src/services/narrator/templates/weeklyRankingUpdate";
import { internalEventTemplate } from "../../src/services/narrator/templates/_internal";
import { checkVoice } from "../../src/services/narrator/voiceConstraints";
import { tagOutput, reportRatio } from "../../src/services/narrator/guidara95_5";
import type { TemplateContext } from "../../src/services/narrator/types";

function estOrg(partial: Partial<TemplateContext["org"]> = {}) {
  return {
    id: 42,
    name: "Coastal Endodontic Studio",
    vertical: "Endodontist",
    createdAt: new Date(Date.now() - 365 * 86400000),
    hasGbpData: true,
    hasCheckupData: true,
    knownAverageCaseValueUsd: 1950,
    knownMonthlyNewCustomers: 55,
    ...partial,
  };
}

function mkCtx(
  eventType: string,
  properties: Record<string, unknown> = {},
  orgOverride: Partial<TemplateContext["org"]> = {}
): TemplateContext {
  return {
    event: { id: `evt-${eventType}`, eventType, orgId: 42, properties, createdAt: new Date() },
    org: estOrg(orgOverride),
    nowIso: new Date().toISOString(),
  };
}

describe("Template voice check — every template passes on happy path", () => {
  const cases: Array<{
    name: string;
    run: () => Awaited<ReturnType<typeof siteQaPassedTemplate>>;
  }> = [
    {
      name: "siteQaPassed",
      run: () => siteQaPassedTemplate(mkCtx("site.qa_passed", { pagePath: "/services" })),
    },
    {
      name: "siteQaBlocked",
      run: () =>
        siteQaBlockedTemplate(
          mkCtx("site.qa_blocked", { defectCount: 3, gateFailures: ["bannedPhrase"], pagePath: "/" })
        ),
    },
    {
      name: "sitePublished",
      run: () =>
        sitePublishedTemplate(
          mkCtx("site.published", { siteUrl: "https://coastal.alloro.site", pageCount: 7 })
        ),
    },
    { name: "cleanWeek", run: () => cleanWeekTemplate(mkCtx("clean_week")) },
    {
      name: "milestoneDetected anniversary",
      run: () => milestoneDetectedTemplate(mkCtx("milestone.achieved", { kind: "anniversary", years: 5 })),
    },
    {
      name: "milestoneDetected year_over_year",
      run: () =>
        milestoneDetectedTemplate(
          mkCtx("first_win.achieved", { kind: "year_over_year_growth", delta: "12%" })
        ),
    },
    {
      name: "referralSignal gp.gone_dark",
      run: () =>
        referralSignalTemplate(
          mkCtx("gp.gone_dark", { gpName: "Dr. Patel", daysSilent: 75 })
        ),
    },
    {
      name: "referralSignal positive",
      run: () =>
        referralSignalTemplate(
          mkCtx("referral.positive_signal", { gpName: "Dr. Patel", referralCount: 4 })
        ),
    },
    {
      name: "weeklyRankingUpdate held",
      run: () =>
        weeklyRankingUpdateTemplate(
          mkCtx("ranking.weekly_update", { direction: "held", rank: 2, totalTracked: 8 })
        ),
    },
    {
      name: "weeklyRankingUpdate down",
      run: () =>
        weeklyRankingUpdateTemplate(
          mkCtx("ranking.weekly_update", {
            direction: "down",
            rank: 3,
            totalTracked: 8,
            topCompetitor: "Peluso Ortho",
          })
        ),
    },
  ];

  for (const c of cases) {
    test(`voice check passes for ${c.name}`, async () => {
      const out = await c.run();
      expect(out.voiceCheckPassed, `${c.name}: ${out.voiceViolations.join("; ")}`).toBe(true);
      expect(out.finding.length).toBeGreaterThan(10);
      expect(out.action.length).toBeGreaterThan(3);
    });
  }
});

describe("Voice constraints — catches marketing language", () => {
  test("flags banned phrases", () => {
    const v = checkVoice("Our state-of-the-art system will unlock growth for your practice.");
    expect(v.passed).toBe(false);
    expect(v.violations.length).toBeGreaterThanOrEqual(3);
  });

  test("allows optimize with a specific metric", () => {
    const v = checkVoice("We optimize response time by 12%.");
    expect(v.passed).toBe(true);
  });

  test("flags optimize without a metric", () => {
    const v = checkVoice("We optimize your marketing.");
    expect(v.passed).toBe(false);
  });

  test("flags em-dash + missing space", () => {
    const v = checkVoice("Expert Care — Close to Home.And more.");
    expect(v.passed).toBe(false);
  });

  test("flags shame language", () => {
    const v = checkVoice("You're behind your competitors.");
    expect(v.passed).toBe(false);
    expect(v.violations.some((x) => /shame/i.test(x))).toBe(true);
  });
});

describe("Guidara 95/5 tier tagger", () => {
  test("routine events tag expected", () => {
    expect(tagOutput("site.qa_passed")).toBe("expected");
    expect(tagOutput("ranking.weekly_update")).toBe("expected");
    expect(tagOutput("gp.drift_detected")).toBe("expected");
  });

  test("delight events tag unreasonable_hospitality", () => {
    expect(tagOutput("clean_week")).toBe("unreasonable_hospitality");
    expect(tagOutput("milestone.achieved")).toBe("unreasonable_hospitality");
    expect(tagOutput("site.published")).toBe("unreasonable_hospitality");
  });

  test("reportRatio detects out-of-band distributions", () => {
    const all95 = Array(95).fill("expected" as const).concat(Array(5).fill("unreasonable_hospitality" as const));
    const balanced = reportRatio(all95 as any);
    expect(balanced.inBand).toBe(true);

    const too_many_delight = Array(70).fill("expected" as const).concat(Array(30).fill("unreasonable_hospitality" as const));
    const out = reportRatio(too_many_delight as any);
    expect(out.inBand).toBe(false);
  });
});

describe("Internal events no-op", () => {
  test("internal events do not emit", async () => {
    const out = await internalEventTemplate(mkCtx("research_brief.created"));
    expect(out.emit).toBe(false);
  });
});

describe("Theranos guardrail proof — fresh org falls into data-gap path", () => {
  test("org < 14 days with no data → dollar null, action is data-gap", async () => {
    const out = await siteQaPassedTemplate(
      mkCtx(
        "site.qa_passed",
        { pagePath: "/" },
        {
          createdAt: new Date(Date.now() - 3 * 86400000),
          hasCheckupData: false,
          hasGbpData: false,
          vertical: null,
          knownAverageCaseValueUsd: null,
          knownMonthlyNewCustomers: null,
        }
      )
    );
    expect(out.dollar).toBeNull();
    expect(out.dataGapReason).toBeTruthy();
    expect(out.voiceCheckPassed).toBe(true);
  });
});
