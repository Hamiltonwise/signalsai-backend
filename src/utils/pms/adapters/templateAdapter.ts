import type { ColumnMapping } from "../../../types/pmsMapping";
import { evaluateFormula } from "../productionFormula";
import {
  type MonthlyRollupForJob,
  type RollupSource,
  findHeaderForRole,
  hasRole,
} from "../applyColumnMapping";

/**
 * Template adapter — for pre-aggregated PMS exports where one row equals
 * one referral.
 *
 * Required mapping shape:
 *   - `source` role assigned (the source name column)
 *   - either `production_total` role assigned OR a `productionFormula`
 *
 * Optional:
 *   - `date` role (else rows are bucketed under "unknown" month)
 *   - `type` role (else type defaults to `self`)
 *   - `statusFilter` (rows whose status value is not in `includeValues` are dropped)
 *
 * Output shape matches what `pmsAggregator.ts` reads from
 * `pms_jobs.response_log.monthly_rollup`.
 *
 * NOTE on date parsing: the canonical month parser lives in
 * `src/controllers/pms/pms-services/pms-paste-parse.service.ts:93-129`
 * but isn't exported. We duplicate the logic verbatim with a comment;
 * the integration agent (T13/T14) is the right place to consolidate
 * the parser into a shared helper.
 */

/**
 * Parse a date string into YYYY-MM format.
 * Mirrors `pms-paste-parse.service.ts:parseDateToMonth` byte-for-byte.
 * See file-header NOTE.
 */
function parseDateToMonth(dateStr: string, fallback: string): string {
  const trimmed = dateStr.trim();
  if (!trimmed) return fallback;

  const isoMatch = trimmed.match(/^(\d{4})[\-\/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}`;
  }

  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    return `${usMatch[3]}-${usMatch[1].padStart(2, "0")}`;
  }

  const monthNames: Record<string, string> = {
    january: "01", jan: "01", february: "02", feb: "02", march: "03", mar: "03",
    april: "04", apr: "04", may: "05", june: "06", jun: "06",
    july: "07", jul: "07", august: "08", aug: "08", september: "09", sep: "09",
    october: "10", oct: "10", november: "11", nov: "11", december: "12", dec: "12",
  };
  const monthYearMatch = trimmed.match(/^([a-zA-Z]+)\s+(\d{4})/);
  if (monthYearMatch) {
    const mm = monthNames[monthYearMatch[1].toLowerCase()];
    if (mm) return `${monthYearMatch[2]}-${mm}`;
  }

  const shortMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (shortMatch) {
    return `${shortMatch[2]}-${shortMatch[1].padStart(2, "0")}`;
  }

  return fallback;
}

/** Number coercion duplicated from pmsAggregator (private export). */
function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * Normalize a "self" / "doctor" type string. Mirrors `pms-paste-parse.service.ts`.
 */
function normalizeType(val: unknown): "self" | "doctor" {
  const s = String(val ?? "").toLowerCase().trim();
  if (s === "doctor" || s === "dr" || s === "doc") return "doctor";
  return "self";
}

const UNKNOWN_MONTH = "unknown";

export function applyTemplateMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): MonthlyRollupForJob {
  const sourceHeader = findHeaderForRole(mapping, "source");
  if (!sourceHeader) {
    throw new Error(
      "templateAdapter: mapping must assign a 'source' role to a header."
    );
  }
  const dateHeader = findHeaderForRole(mapping, "date");
  const typeHeader = findHeaderForRole(mapping, "type");
  const productionTotalHeader = findHeaderForRole(mapping, "production_total");
  const useFormula = hasRole(mapping, "production_total")
    ? false
    : Boolean(mapping.productionFormula);

  // Status filter — rows whose value is not in includeValues are dropped.
  const statusFilter = mapping.statusFilter;

  // Aggregation buckets keyed by `${month}::${sourceName}`.
  type Bucket = {
    month: string;
    sourceName: string;
    referrals: number;
    production: number;
    type: "self" | "doctor";
  };
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    // Status filter
    if (statusFilter) {
      const statusVal = String(row[statusFilter.column] ?? "").trim();
      const include = statusFilter.includeValues.some(
        (v) => v.toLowerCase() === statusVal.toLowerCase()
      );
      if (!include) continue;
    }

    const sourceRaw = row[sourceHeader];
    const sourceName = String(sourceRaw ?? "").trim() || "Unknown";

    const month = dateHeader
      ? parseDateToMonth(String(row[dateHeader] ?? ""), UNKNOWN_MONTH)
      : UNKNOWN_MONTH;

    const type: "self" | "doctor" = typeHeader
      ? normalizeType(row[typeHeader])
      : "self";

    const production = useFormula
      ? evaluateFormula(row, mapping.productionFormula)
      : productionTotalHeader
        ? toNumber(row[productionTotalHeader])
        : 0;

    const key = `${month}::${sourceName}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.referrals += 1;
      existing.production += production;
      // Type stays as the first non-self type encountered; doctor wins
      // over self if any row in the bucket flagged doctor.
      if (existing.type === "self" && type === "doctor") {
        existing.type = "doctor";
      }
    } else {
      buckets.set(key, {
        month,
        sourceName,
        referrals: 1,
        production,
        type,
      });
    }
  }

  // Roll up per month.
  const months = new Map<string, MonthlyRollupForJob[number]>();
  for (const bucket of buckets.values()) {
    let monthEntry = months.get(bucket.month);
    if (!monthEntry) {
      monthEntry = {
        month: bucket.month,
        self_referrals: 0,
        doctor_referrals: 0,
        total_referrals: 0,
        actual_production_total: 0,
        attributed_production_total: 0,
        production_total: 0,
        sources: [],
      };
      months.set(bucket.month, monthEntry);
    }
    const sourceEntry: RollupSource = {
      name: bucket.sourceName,
      referrals: bucket.referrals,
      production: Number(bucket.production.toFixed(2)),
      inferred_referral_type: bucket.type,
    };
    monthEntry.sources.push(sourceEntry);
    if (bucket.type === "doctor") {
      monthEntry.doctor_referrals += bucket.referrals;
    } else {
      monthEntry.self_referrals += bucket.referrals;
    }
    monthEntry.total_referrals += bucket.referrals;
    monthEntry.production_total += bucket.production;
    monthEntry.actual_production_total =
      (monthEntry.actual_production_total ?? 0) + bucket.production;
    monthEntry.attributed_production_total =
      (monthEntry.attributed_production_total ?? 0) + bucket.production;
  }

  return Array.from(months.values())
    .map((m) => ({
      ...m,
      actual_production_total: Number(
        (m.actual_production_total ?? m.production_total).toFixed(2)
      ),
      attributed_production_total: Number(
        (m.attributed_production_total ?? m.production_total).toFixed(2)
      ),
      production_total: Number(m.production_total.toFixed(2)),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
