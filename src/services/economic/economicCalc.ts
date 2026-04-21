import { getBenchmark, inferVertical, type Vertical } from "./industryBenchmarks";
import { applyGuardrail, type GuardrailedImpact } from "./confidenceThreshold";

/**
 * Economic Calculation Service
 *
 * Given a behavioral_event and the org context, returns a GuardrailedImpact:
 * { dollar30d, dollar90d, dollar365d, confidence, dataGapReason }.
 *
 * Confidence scoring starts at 100 and subtracts for each missing signal:
 *   -30 when no org-specific case value (benchmark fallback)
 *   -15 when practice < 14 days old (insufficient history)
 *   -15 when no GBP/checkup data present
 *   -10 when vertical is unknown
 *   -10 when event_type lacks a documented economic formula
 *
 * Any score < 80 returns the data-gap variant (Theranos guardrail).
 */

export interface EventContext {
  eventType: string;
  properties?: Record<string, unknown>;
}

export interface OrgSnapshot {
  id?: number;
  name?: string;
  vertical?: string | null;
  createdAt?: Date | string | null;
  hasGbpData?: boolean;
  hasCheckupData?: boolean;
  knownAverageCaseValueUsd?: number | null;
  knownMonthlyNewPatients?: number | null;
}

export interface ImpactEstimate extends GuardrailedImpact {
  vertical: Vertical;
  inputsUsed: string[];
}

// Documented economic formulas per event type. Missing entry = -10 confidence.
const EVENT_FORMULAS: Record<string, (ctx: {
  caseValue: number;
  monthlyPatients: number;
  referralDependency: number;
}) => { dollar30d: number; dollar90d: number; dollar365d: number }> = {
  "site.qa_passed": ({ caseValue, monthlyPatients }) => {
    // Site passed QA = publish can proceed. Value = one week of kept momentum.
    const perWeek = (caseValue * monthlyPatients * 0.04) / 1;
    return {
      dollar30d: Math.round(perWeek * 4),
      dollar90d: Math.round(perWeek * 13),
      dollar365d: Math.round(perWeek * 52),
    };
  },
  "site.qa_blocked": ({ caseValue, monthlyPatients }) => {
    // Defect caught before ship. Value = avoided-cost of one bad page.
    const avoided = caseValue * monthlyPatients * 0.06;
    return {
      dollar30d: Math.round(avoided),
      dollar90d: Math.round(avoided * 2.5),
      dollar365d: Math.round(avoided * 8),
    };
  },
  "site.published": ({ caseValue, monthlyPatients }) => {
    // New site live. Value = conservative year-one referral/web lift.
    const monthly = caseValue * monthlyPatients * 0.1;
    return {
      dollar30d: Math.round(monthly),
      dollar90d: Math.round(monthly * 3),
      dollar365d: Math.round(monthly * 12),
    };
  },
  clean_week: ({ caseValue, monthlyPatients }) => {
    // Nothing moved against you. Value = retained weekly run-rate.
    const week = (caseValue * monthlyPatients) / 4;
    return {
      dollar30d: Math.round(week * 4),
      dollar90d: Math.round(week * 13),
      dollar365d: Math.round(week * 52),
    };
  },
  "milestone.achieved": ({ caseValue, monthlyPatients }) => {
    const quarterly = caseValue * monthlyPatients * 0.25;
    return {
      dollar30d: Math.round(quarterly * 0.33),
      dollar90d: Math.round(quarterly),
      dollar365d: Math.round(quarterly * 4),
    };
  },
  "gp.drift_detected": ({ caseValue, monthlyPatients, referralDependency }) => {
    const atRisk = caseValue * monthlyPatients * referralDependency * 0.15;
    return {
      dollar30d: Math.round(atRisk),
      dollar90d: Math.round(atRisk * 3),
      dollar365d: Math.round(atRisk * 12),
    };
  },
  "gp.gone_dark": ({ caseValue, monthlyPatients, referralDependency }) => {
    const lost = caseValue * monthlyPatients * referralDependency * 0.25;
    return {
      dollar30d: Math.round(lost),
      dollar90d: Math.round(lost * 3),
      dollar365d: Math.round(lost * 12),
    };
  },
  "ranking.weekly_update": ({ caseValue, monthlyPatients }) => {
    const week = caseValue * monthlyPatients * 0.05;
    return {
      dollar30d: Math.round(week * 4),
      dollar90d: Math.round(week * 13),
      dollar365d: Math.round(week * 52),
    };
  },
};

export function calculateImpact(
  eventType: string,
  eventContext: EventContext,
  org: OrgSnapshot
): ImpactEstimate {
  const vertical = inferVertical(org.vertical);
  const benchmark = getBenchmark(vertical);

  const usingOrgCaseValue =
    typeof org.knownAverageCaseValueUsd === "number" &&
    org.knownAverageCaseValueUsd > 0;
  const caseValue = usingOrgCaseValue
    ? (org.knownAverageCaseValueUsd as number)
    : benchmark.averageCaseValueUsd;

  const usingOrgPatients =
    typeof org.knownMonthlyNewPatients === "number" &&
    org.knownMonthlyNewPatients > 0;
  const monthlyPatients = usingOrgPatients
    ? (org.knownMonthlyNewPatients as number)
    : benchmark.averageMonthlyNewPatients;

  const referralDependency = benchmark.referralDependencyPct;

  let confidence = 100;
  const inputsUsed: string[] = [];
  const missing: string[] = [];

  if (usingOrgCaseValue) inputsUsed.push("org_case_value");
  else {
    confidence -= 30;
    missing.push("org_case_value (using benchmark)");
  }

  if (usingOrgPatients) inputsUsed.push("org_monthly_patients");
  else {
    confidence -= 10;
    missing.push("org_monthly_patients (using benchmark)");
  }

  if (vertical === "unknown") {
    confidence -= 10;
    missing.push("vertical");
  } else {
    inputsUsed.push(`vertical=${vertical}`);
  }

  if (!org.hasGbpData && !org.hasCheckupData) {
    confidence -= 15;
    missing.push("gbp_or_checkup_data");
  } else {
    inputsUsed.push(org.hasGbpData ? "gbp_data" : "checkup_data");
  }

  if (org.createdAt) {
    const ageDays =
      (Date.now() - new Date(org.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 14) {
      confidence -= 15;
      missing.push("practice_history<14d");
    } else {
      inputsUsed.push("practice_history");
    }
  } else {
    confidence -= 15;
    missing.push("practice_created_at");
  }

  const formula = EVENT_FORMULAS[eventType];
  let dollar30d: number | null = null;
  let dollar90d: number | null = null;
  let dollar365d: number | null = null;
  let dataGapReason: string | null = null;

  if (!formula) {
    confidence -= 10;
    missing.push(`no_formula_for_${eventType}`);
    dataGapReason = `No documented economic formula for event "${eventType}"`;
  } else if (caseValue === 0 || monthlyPatients === 0) {
    dataGapReason = `Missing benchmark and org data for vertical "${vertical}"`;
    confidence = Math.min(confidence, 50);
  } else {
    const out = formula({ caseValue, monthlyPatients, referralDependency });
    dollar30d = out.dollar30d;
    dollar90d = out.dollar90d;
    dollar365d = out.dollar365d;
  }

  confidence = Math.max(0, Math.min(100, confidence));

  const guarded = applyGuardrail({
    dollar30d,
    dollar90d,
    dollar365d,
    confidence,
    dataGapReason:
      dataGapReason ??
      (missing.length > 0 ? `Missing inputs: ${missing.join(", ")}` : null),
  });

  return {
    ...guarded,
    vertical,
    inputsUsed,
  };
}
