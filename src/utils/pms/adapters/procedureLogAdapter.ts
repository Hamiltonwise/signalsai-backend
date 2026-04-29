import type { ColumnMapping } from "../../../types/pmsMapping";
import {
  type MonthlyRollupForJob,
  type RollupSource,
  findHeaderForRole,
} from "../applyColumnMapping";
import {
  buildActualProductionByMonth,
  getRowProduction,
} from "../monthlyProduction";

/**
 * Procedure-log adapter — for raw PMS exports where one row equals one
 * billed procedure. Multiple rows per patient visit. Referrals are
 * deduplicated by `(patient_id, date, referring_practice)` triplets.
 *
 * Required mapping shape:
 *   - `referring_practice` role assigned (raw practice name column)
 *   - `patient` role assigned (for triplet dedup)
 *   - `date` role assigned (for triplet dedup + month bucketing)
 *
 * Optional:
 *   - `productionFormula` (sum of per-row production within a triplet)
 *   - `statusFilter` (drop rows whose status value isn't in includeValues)
 *
 * Type classification (D9): `referring_practice` blank → source "self";
 * non-blank → source "doctor". No keyword inference on text.
 *
 * Asterisks (`*`) at the leading/trailing edges of `referring_practice`
 * are stripped before deduplication — this handles annotation styles
 * like `***Cox Family Dentistry & Orthodontics***` or
 * `**Neibauer Dental Care - Harrison Crossing**`.
 *
 * Output shape matches what `pmsAggregator.ts` reads from
 * `pms_jobs.response_log.monthly_rollup`.
 */

/** Stable label for blank-referring-practice rows. */
const SELF_SOURCE_NAME = "Self / Walk-in";

const UNKNOWN_MONTH = "unknown";

/**
 * Date parser — duplicated from `pms-paste-parse.service.ts:parseDateToMonth`.
 * See templateAdapter.ts file-header NOTE for context.
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

/**
 * Strip leading/trailing asterisks and whitespace from a referring-practice
 * value. Empty string in → empty string out.
 */
function stripAsterisks(val: unknown): string {
  return String(val ?? "")
    .replace(/^\*+|\*+$/g, "")
    .trim();
}

export function applyProcedureLogMapping(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping,
  /**
   * Optional sink for surfaced data-quality messages. Mutated in place.
   * Currently used to report skipped zero/negative-production triplets so
   * the caller can include them in the response (toast, telemetry, etc.).
   */
  flags?: string[]
): MonthlyRollupForJob {
  const referringPracticeHeader = findHeaderForRole(
    mapping,
    "referring_practice"
  );
  if (!referringPracticeHeader) {
    throw new Error(
      "procedureLogAdapter: mapping must assign a 'referring_practice' role to a header."
    );
  }
  const patientHeader = findHeaderForRole(mapping, "patient");
  const dateHeader = findHeaderForRole(mapping, "date");

  if (!patientHeader || !dateHeader) {
    throw new Error(
      "procedureLogAdapter: mapping must assign 'patient' and 'date' roles for triplet dedup."
    );
  }

  const statusFilter = mapping.statusFilter;
  const actualProductionByMonth = buildActualProductionByMonth(rows, mapping);

  // Step 1 — group rows by `(patient, practiceClean)`. One referral per
  // unique patient → practice relationship within the file. Multiple visits
  // by the same patient to the same practice within the period collapse to
  // one referral; their production rolls up. Date is NOT in the dedup key —
  // matches Hamilton Wise's per-patient mental model (verified against
  // their pivot table on the Fredericksburg Feb 2026 dataset).
  //
  // Month bucketing uses the FIRST date encountered per (patient, practice)
  // pair (typically the earliest visit, since PMS exports are chronological).
  type PatientGroup = {
    patient: string;
    firstDate: string;
    month: string;
    practiceClean: string; // empty string when blank
    production: number;
  };
  const groups = new Map<string, PatientGroup>();

  for (const row of rows) {
    // Status filter
    if (statusFilter) {
      const statusVal = String(row[statusFilter.column] ?? "").trim();
      const include = statusFilter.includeValues.some(
        (v) => v.toLowerCase() === statusVal.toLowerCase()
      );
      if (!include) continue;
    }

    const patient = String(row[patientHeader] ?? "").trim();
    const dateRaw = String(row[dateHeader] ?? "").trim();
    const practiceClean = stripAsterisks(row[referringPracticeHeader]);

    // Skip rows missing the dedup key components.
    if (!patient || !dateRaw) continue;

    const month = parseDateToMonth(dateRaw, UNKNOWN_MONTH);
    const groupKey = `${patient}::${practiceClean}`;
    const rowProduction = getRowProduction(row, mapping);

    const existing = groups.get(groupKey);
    if (existing) {
      existing.production += rowProduction;
      // Keep firstDate / month from the first occurrence.
    } else {
      groups.set(groupKey, {
        patient,
        firstDate: dateRaw,
        month,
        practiceClean,
        production: rowProduction,
      });
    }
  }

  // No skip rule. Hamilton Wise's reference pivot retains zero-production
  // referrals (e.g. post-op visits) as legitimate referral events.
  void flags;

  // Step 2 — aggregate per (sourceName, month). Each (patient, practice)
  // group = 1 referral.
  type Bucket = {
    sourceName: string;
    month: string;
    referrals: number;
    production: number;
    type: "self" | "doctor";
  };
  const buckets = new Map<string, Bucket>();

  for (const group of groups.values()) {
    const isSelf = group.practiceClean.length === 0;
    const sourceName = isSelf ? SELF_SOURCE_NAME : group.practiceClean;
    const type: "self" | "doctor" = isSelf ? "self" : "doctor";

    const key = `${group.month}::${sourceName}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.referrals += 1;
      existing.production += group.production;
    } else {
      buckets.set(key, {
        sourceName,
        month: group.month,
        referrals: 1,
        production: group.production,
        type,
      });
    }
  }

  // Step 3 — roll up per month.
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
    monthEntry.attributed_production_total =
      (monthEntry.attributed_production_total ?? 0) + bucket.production;
  }

  for (const [month, actualProduction] of actualProductionByMonth.entries()) {
    let monthEntry = months.get(month);
    if (!monthEntry) {
      monthEntry = {
        month,
        self_referrals: 0,
        doctor_referrals: 0,
        total_referrals: 0,
        actual_production_total: 0,
        attributed_production_total: 0,
        production_total: 0,
        sources: [],
      };
      months.set(month, monthEntry);
    }
    monthEntry.actual_production_total =
      (monthEntry.actual_production_total ?? 0) + actualProduction;
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
