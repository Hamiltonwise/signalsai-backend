import type { ColumnMapping, ColumnRole } from "../../types/pmsMapping";
import { applyTemplateMapping } from "./adapters/templateAdapter";
import { applyProcedureLogMapping } from "./adapters/procedureLogAdapter";

/**
 * Dispatcher for applying a resolved `ColumnMapping` to raw rows.
 *
 * Routes to one of two adapters based on which roles are mapped:
 *   - `source` mapped (and not `referring_practice`) → template adapter
 *     (1 row = 1 referral, pre-aggregated input).
 *   - `referring_practice` mapped (and not `source`) → procedure-log
 *     adapter (group by patient + date + practice, count groups).
 *   - both mapped → invalid; throw.
 *   - neither mapped → invalid; throw.
 *
 * The returned shape is compatible with what the existing aggregator at
 * `src/utils/pms/pmsAggregator.ts` reads from `pms_jobs.response_log.monthly_rollup`.
 */

// ---------------------------------------------------------------------
// Output shape — must match what `pmsAggregator.ts` consumes from
// `pms_jobs.response_log.monthly_rollup` (see pmsAggregator.ts:74-110).
// ---------------------------------------------------------------------

export interface RollupSource {
  name: string;
  referrals: number;
  production: number;
  inferred_referral_type?: "self" | "doctor" | "marketing" | "other";
}

export interface MonthlyRollupEntry {
  month: string; // "YYYY-MM"
  self_referrals: number;
  doctor_referrals: number;
  total_referrals: number;
  actual_production_total?: number;
  attributed_production_total?: number;
  production_total: number;
  sources: RollupSource[];
}

export type MonthlyRollupForJob = MonthlyRollupEntry[];

// ---------------------------------------------------------------------
// Helpers shared with adapters
// ---------------------------------------------------------------------

/**
 * Look up the header assigned to a given role. Returns `undefined` if the
 * role isn't mapped. When multiple headers share a role (which is allowed
 * for `ignore` only — other roles SHOULD be unique but the type doesn't
 * enforce it), returns the first.
 */
export function findHeaderForRole(
  mapping: ColumnMapping,
  role: ColumnRole
): string | undefined {
  return mapping.assignments.find((a) => a.role === role)?.header;
}

export function hasRole(mapping: ColumnMapping, role: ColumnRole): boolean {
  return mapping.assignments.some((a) => a.role === role);
}

// ---------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------

export function applyMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  /**
   * Optional sink for data-quality messages surfaced by adapters.
   * Currently populated by the procedure-log adapter when triplets
   * are skipped due to non-positive production.
   */
  flags?: string[]
): MonthlyRollupForJob {
  const hasSource = hasRole(mapping, "source");
  const hasReferringPractice = hasRole(mapping, "referring_practice");

  if (hasSource && hasReferringPractice) {
    throw new Error(
      "Mapping is invalid: cannot map both 'source' and 'referring_practice'."
    );
  }

  if (!hasSource && !hasReferringPractice) {
    throw new Error(
      "Mapping is invalid: must map either 'source' or 'referring_practice'."
    );
  }

  if (hasSource) {
    // Template adapter has no skip rule (rows are already pre-summed by user).
    return applyTemplateMapping(rows, mapping);
  }
  return applyProcedureLogMapping(rows, mapping, flags);
}
