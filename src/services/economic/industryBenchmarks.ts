/**
 * Industry benchmarks — DB-backed extension point (Card L).
 *
 * Benchmark rows live in the industry_benchmarks_config table. A new vertical
 * is a SQL insert, not a code change. `Vertical` is a plain string: whatever
 * value appears in industry_benchmarks_config.vertical is valid.
 *
 * The calculateImpact hot path stays sync. We keep an in-memory cache that's
 * hydrated from the DB at worker/server boot (and lazily on first miss).
 * Tests seed the cache directly via `_seedBenchmarkCacheForTests`.
 *
 * Any `getBenchmark(vertical)` call that hits a vertical not present in the
 * table fires a `vertical.unrecognized` behavioral_event and (when the
 * webhook is configured) posts to #alloro-dev. This closes the loop: if
 * production ever sees a vertical we don't have benchmarks for, we find out.
 *
 * Figures tagged as `source` are conservative category averages, not
 * Alloro-specific numbers. Economic Calc lowers confidence when it leans on
 * a benchmark row (the Theranos guardrail decides the rest).
 */

import axios from "axios";
import { db } from "../../database/connection";
import { BehavioralEventModel } from "../../models/BehavioralEventModel";

export type Vertical = string;

export interface VerticalBenchmark {
  averageCaseValueUsd: number;
  averageMonthlyNewCustomers: number;
  referralDependencyPct: number;
  sourceNote: string;
}

interface BenchmarkRow {
  vertical: string;
  avg_case_value_usd: number;
  avg_monthly_new_customers: number;
  referral_dependency_pct: string | number;
  source: string | null;
}

const UNKNOWN_BENCHMARK: VerticalBenchmark = {
  averageCaseValueUsd: 0,
  averageMonthlyNewCustomers: 0,
  referralDependencyPct: 0,
  sourceNote: "No vertical known; defer to org data",
};

const ALLORO_DEV_WEBHOOK = process.env.ALLORO_DEV_SLACK_WEBHOOK || "";

// In-memory cache. Null = not yet hydrated.
let benchmarkCache: Map<string, VerticalBenchmark> | null = null;
const unrecognizedReportedThisSession = new Set<string>();

function rowToBenchmark(row: BenchmarkRow): VerticalBenchmark {
  return {
    averageCaseValueUsd: Number(row.avg_case_value_usd) || 0,
    averageMonthlyNewCustomers: Number(row.avg_monthly_new_customers) || 0,
    referralDependencyPct: Number(row.referral_dependency_pct) || 0,
    sourceNote: row.source ?? "",
  };
}

/**
 * Hydrate the in-memory benchmark cache from the DB. Safe to call multiple
 * times — overwrites the cache. Call at worker/server boot, or whenever a
 * new benchmark row is inserted and the process needs to see it without a
 * restart.
 */
export async function hydrateBenchmarkCache(): Promise<void> {
  try {
    const rows = (await db("industry_benchmarks_config").select(
      "vertical",
      "avg_case_value_usd",
      "avg_monthly_new_customers",
      "referral_dependency_pct",
      "source"
    )) as BenchmarkRow[];
    const next = new Map<string, VerticalBenchmark>();
    for (const row of rows) {
      next.set(row.vertical, rowToBenchmark(row));
    }
    benchmarkCache = next;
    // New rows mean previously-unrecognized verticals may now be known.
    unrecognizedReportedThisSession.clear();
  } catch {
    // Cache stays whatever it was. If it was null, the first getBenchmark
    // call returns the unknown sentinel and the Theranos guardrail trips.
  }
}

/**
 * Test-only hook: seed the cache directly without touching the DB. Tests
 * that exercise calculateImpact or getBenchmark should call this in a
 * beforeAll hook.
 */
export function _seedBenchmarkCacheForTests(
  rows: Array<{
    vertical: string;
    avg_case_value_usd: number;
    avg_monthly_new_customers: number;
    referral_dependency_pct: number;
    source?: string | null;
  }>
): void {
  benchmarkCache = new Map(
    rows.map((r) => [
      r.vertical,
      rowToBenchmark({
        vertical: r.vertical,
        avg_case_value_usd: r.avg_case_value_usd,
        avg_monthly_new_customers: r.avg_monthly_new_customers,
        referral_dependency_pct: r.referral_dependency_pct,
        source: r.source ?? null,
      }),
    ])
  );
  unrecognizedReportedThisSession.clear();
}

/** Test-only: drop the cache back to null. */
export function _resetBenchmarkCacheForTests(): void {
  benchmarkCache = null;
  unrecognizedReportedThisSession.clear();
}

/**
 * Synchronous benchmark lookup.
 *
 * Behavior:
 *   - cache hit   → return the row
 *   - cache miss  → fire-and-forget emit `vertical.unrecognized` (once per
 *                   vertical per process lifetime) and return the unknown
 *                   sentinel so callers hit the Theranos guardrail path
 *   - cache null  → return unknown sentinel (hydration hasn't run yet)
 */
export function getBenchmark(
  vertical: Vertical,
  orgId?: number | null
): VerticalBenchmark {
  if (!benchmarkCache) {
    return UNKNOWN_BENCHMARK;
  }
  const hit = benchmarkCache.get(vertical);
  if (hit) return hit;

  reportUnrecognizedVertical(vertical, orgId);
  return UNKNOWN_BENCHMARK;
}

function reportUnrecognizedVertical(vertical: string, orgId?: number | null): void {
  const key = `${vertical}:${orgId ?? "null"}`;
  if (unrecognizedReportedThisSession.has(key)) return;
  unrecognizedReportedThisSession.add(key);

  // org_id column is NULL to avoid behavioral_events_org_id_foreign violations
  // when the emitting org was synthetic/missing. The referenced orgId is
  // preserved in `properties.orgId` for audit.
  void BehavioralEventModel.create({
    event_type: "vertical.unrecognized",
    org_id: null,
    properties: { vertical, orgId: orgId ?? null },
  }).catch(() => {});

  if (ALLORO_DEV_WEBHOOK) {
    void axios
      .post(ALLORO_DEV_WEBHOOK, {
        text: `:warning: vertical.unrecognized — no industry_benchmarks_config row for "${vertical}" (orgId=${orgId ?? "null"})`,
      })
      .catch(() => {});
  }
}

/**
 * Map a free-text specialty/vertical string to a canonical vertical key.
 * Return value is a plain string; the set of known values is whatever
 * the industry_benchmarks_config table holds, not a compile-time enum.
 */
export function inferVertical(raw?: string | null): string {
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
  // No heuristic match — pass the raw slug through so the DB can answer.
  return v.trim().replace(/\s+/g, "_");
}
