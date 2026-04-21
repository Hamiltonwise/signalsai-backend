/**
 * Industry benchmarks — fallback per vertical when org-specific case/revenue
 * data is not present. Figures are conservative category averages, not
 * Alloro-specific numbers. Economic Calc tags any output that leans on these
 * benchmarks with confidence <= 75 (Theranos guardrail path).
 */

export type Vertical =
  | "endodontics"
  | "orthodontics"
  | "oral_surgery"
  | "general_dentistry"
  | "physical_therapy"
  | "chiropractic"
  | "veterinary"
  | "unknown";

export interface VerticalBenchmark {
  averageCaseValueUsd: number;
  averageMonthlyNewPatients: number;
  referralDependencyPct: number;
  sourceNote: string;
}

const BENCHMARKS: Record<Vertical, VerticalBenchmark> = {
  endodontics: {
    averageCaseValueUsd: 1800,
    averageMonthlyNewPatients: 45,
    referralDependencyPct: 0.85,
    sourceNote: "ADA endodontic specialty report, 3-year average",
  },
  orthodontics: {
    averageCaseValueUsd: 5000,
    averageMonthlyNewPatients: 18,
    referralDependencyPct: 0.55,
    sourceNote: "AAO practice economics survey, category average",
  },
  oral_surgery: {
    averageCaseValueUsd: 2400,
    averageMonthlyNewPatients: 30,
    referralDependencyPct: 0.9,
    sourceNote: "AAOMS category survey",
  },
  general_dentistry: {
    averageCaseValueUsd: 850,
    averageMonthlyNewPatients: 35,
    referralDependencyPct: 0.25,
    sourceNote: "ADA general dentistry survey",
  },
  physical_therapy: {
    averageCaseValueUsd: 1200,
    averageMonthlyNewPatients: 25,
    referralDependencyPct: 0.6,
    sourceNote: "APTA practice report",
  },
  chiropractic: {
    averageCaseValueUsd: 700,
    averageMonthlyNewPatients: 20,
    referralDependencyPct: 0.35,
    sourceNote: "ACA practice economics benchmark",
  },
  veterinary: {
    averageCaseValueUsd: 550,
    averageMonthlyNewPatients: 40,
    referralDependencyPct: 0.2,
    sourceNote: "AVMA practice benchmark",
  },
  unknown: {
    averageCaseValueUsd: 0,
    averageMonthlyNewPatients: 0,
    referralDependencyPct: 0,
    sourceNote: "No vertical known; defer to org data",
  },
};

export function getBenchmark(vertical: Vertical): VerticalBenchmark {
  return BENCHMARKS[vertical] ?? BENCHMARKS.unknown;
}

export function inferVertical(raw?: string | null): Vertical {
  if (!raw) return "unknown";
  const v = raw.toLowerCase();
  if (v.includes("endo")) return "endodontics";
  if (v.includes("ortho")) return "orthodontics";
  if (v.includes("oral") || v.includes("maxillofacial") || v.includes("surgeon"))
    return "oral_surgery";
  if (v.includes("dent")) return "general_dentistry";
  if (v.includes("physical") || v === "pt") return "physical_therapy";
  if (v.includes("chiro")) return "chiropractic";
  if (v.includes("vet") || v.includes("animal")) return "veterinary";
  return "unknown";
}
