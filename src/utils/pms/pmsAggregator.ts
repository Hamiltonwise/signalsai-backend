import db from "../../database/connection";

// Threshold (5%) for flagging when sum(sources.referrals) diverges from
// total_referrals on a given month. Informational only — never blocks.
const SOURCE_SUM_TOLERANCE = 0.05;

type RawPmsSource = {
  name?: string;
  referrals?: number | string;
  production?: number | string;
};

type RawPmsMonthEntry = {
  month?: string;
  sources?: RawPmsSource[];
  self_referrals?: number | string;
  total_referrals?: number | string;
  doctor_referrals?: number | string;
  production_total?: number | string;
};

type AggregatedMonthData = {
  month: string;
  selfReferrals: number;
  doctorReferrals: number;
  totalReferrals: number;
  productionTotal: number;
  timestamp: string;
  sources: RawPmsSource[];
};

type AggregatedSourceData = {
  rank: number;
  name: string;
  referrals: number;
  production: number;
  percentage: number;
};

export type AggregatedPmsData = {
  months: AggregatedMonthData[];
  sources: AggregatedSourceData[];
  totals: {
    totalReferrals: number;
    totalProduction: number;
  };
  patientRecords: any[];
  /**
   * Deterministic data-quality flags computed during aggregation.
   * Surfaced into the LLM input so the agent can echo them in its
   * own data_quality_flags output (see ReferralEngineAnalysis.md →
   * UPSTREAM DATA QUALITY ACKNOWLEDGEMENT).
   */
  dataQualityFlags: string[];
};

/**
 * Convert various value types to number
 */
const toNumber = (value: unknown): number => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Ensure value is an array
 */
const ensureArray = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }
  return [];
};

/**
 * Extract month entries from response_log
 */
const extractMonthEntriesFromResponse = (
  responseLog: unknown
): RawPmsMonthEntry[] => {
  if (responseLog === null || responseLog === undefined) {
    return [];
  }

  let candidate: unknown = responseLog;

  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      return [];
    }
  }

  if (Array.isArray(candidate)) {
    return candidate as RawPmsMonthEntry[];
  }

  if (typeof candidate === "object" && candidate !== null) {
    const container = candidate as Record<string, unknown>;

    // Check for monthly_rollup as the canonical field (primary)
    if (Array.isArray(container.monthly_rollup)) {
      return container.monthly_rollup as RawPmsMonthEntry[];
    }

    // Fallback to report_data for backward compatibility
    if (Array.isArray(container.report_data)) {
      return container.report_data as RawPmsMonthEntry[];
    }
  }

  return [];
};

/**
 * Extract additional_data (patient records) from response_log
 */
const extractAdditionalDataFromResponse = (responseLog: unknown): any[] => {
  if (responseLog === null || responseLog === undefined) {
    return [];
  }

  let candidate: unknown = responseLog;

  if (typeof candidate === "string") {
    try {
      candidate = JSON.parse(candidate);
    } catch (error) {
      return [];
    }
  }

  if (typeof candidate === "object" && candidate !== null) {
    const container = candidate as Record<string, unknown>;

    // Extract additional_data array if present
    if (Array.isArray(container.additional_data)) {
      return container.additional_data;
    }
  }

  return [];
};

/**
 * Aggregate PMS data across all approved jobs for an organization.
 * This function implements smart deduplication - keeps only the latest data for each month.
 *
 * @param organizationId - The organization to fetch PMS data for
 * @returns Aggregated PMS data with unique months (latest wins) and aggregated sources
 */
export async function aggregatePmsData(
  organizationId: number,
  locationId?: number
): Promise<AggregatedPmsData> {
  // Fetch all approved jobs for this organization (optionally scoped by location)
  let query = db("pms_jobs")
    .select("id", "timestamp", "response_log")
    .where({ organization_id: organizationId, is_approved: 1 });
  if (locationId) query = query.where("location_id", locationId);
  const approvedJobs = await query.orderBy("timestamp", "asc");

  if (!approvedJobs.length) {
    return {
      months: [],
      sources: [],
      totals: {
        totalReferrals: 0,
        totalProduction: 0,
      },
      patientRecords: [],
      dataQualityFlags: [],
    };
  }

  // Track month data with timestamps to keep only the latest
  const monthMap = new Map<string, AggregatedMonthData>();

  // Collect all patient records from all approved jobs
  const allPatientRecords: any[] = [];

  // Process jobs to build month map (keeping only latest data per month)
  for (const job of approvedJobs) {
    const entries = extractMonthEntriesFromResponse(job.response_log);

    // Extract and collect additional_data (patient records)
    const patientRecords = extractAdditionalDataFromResponse(job.response_log);
    if (patientRecords.length > 0) {
      allPatientRecords.push(...patientRecords);
    }

    if (!entries.length) {
      continue;
    }

    const jobTimestamp = job.timestamp;

    for (const entry of entries) {
      const monthKey = entry?.month?.trim();

      if (!monthKey) {
        continue;
      }

      const selfReferrals = toNumber(entry.self_referrals);
      const doctorReferrals = toNumber(entry.doctor_referrals);
      const entryTotalReferrals =
        entry.total_referrals !== undefined
          ? toNumber(entry.total_referrals)
          : selfReferrals + doctorReferrals;
      const entryProductionTotal = toNumber(entry.production_total);

      const existingMonth = monthMap.get(monthKey);

      // Only update if this job is newer or month doesn't exist
      if (
        !existingMonth ||
        new Date(jobTimestamp) > new Date(existingMonth.timestamp)
      ) {
        monthMap.set(monthKey, {
          month: monthKey,
          selfReferrals,
          doctorReferrals,
          totalReferrals: entryTotalReferrals,
          productionTotal: entryProductionTotal,
          timestamp: jobTimestamp,
          sources: ensureArray<RawPmsSource>(entry.sources),
        });
      }
    }
  }

  // Now aggregate sources from the final month map
  const sourceMap = new Map<
    string,
    { name: string; referrals: number; production: number }
  >();

  let totalReferrals = 0;
  let totalProduction = 0;

  for (const monthData of monthMap.values()) {
    totalReferrals += monthData.totalReferrals;
    totalProduction += monthData.productionTotal;

    for (const source of monthData.sources) {
      const name = source?.name?.trim();
      if (!name) {
        continue;
      }

      const existing = sourceMap.get(name) ?? {
        name,
        referrals: 0,
        production: 0,
      };

      existing.referrals += toNumber(source.referrals);
      existing.production += toNumber(source.production);

      sourceMap.set(name, existing);
    }
  }

  const months = Array.from(monthMap.values()).sort((a, b) =>
    a.month.localeCompare(b.month)
  );

  // Sum reconciliation (D1 in spec): for each month, verify that the sum of
  // per-source referrals matches the month's total_referrals within
  // SOURCE_SUM_TOLERANCE. Anything beyond that gets flagged for the LLM.
  // Skip months where totalReferrals <= 0 (avoid div-by-zero; empty months
  // are valid per the n8n contract).
  const dataQualityFlags: string[] = [];
  for (const monthData of months) {
    if (monthData.totalReferrals <= 0) {
      continue;
    }

    const sumOfSourceReferrals = monthData.sources.reduce(
      (acc, s) => acc + (toNumber(s.referrals) || 0),
      0,
    );

    const delta =
      Math.abs(sumOfSourceReferrals - monthData.totalReferrals) /
      monthData.totalReferrals;

    if (delta > SOURCE_SUM_TOLERANCE) {
      dataQualityFlags.push(
        `Sum-of-sources mismatch in ${monthData.month}: sources=${sumOfSourceReferrals}, total=${monthData.totalReferrals}`,
      );
    }
  }

  const sources = Array.from(sourceMap.values())
    .sort((a, b) => b.production - a.production)
    .map((source, index) => {
      const percentage =
        totalProduction > 0
          ? Number(((source.production / totalProduction) * 100).toFixed(2))
          : 0;

      return {
        rank: index + 1,
        name: source.name,
        referrals: Number(source.referrals.toFixed(2)),
        production: Number(source.production.toFixed(2)),
        percentage,
      };
    });

  return {
    months,
    sources,
    totals: {
      totalReferrals: Number(totalReferrals.toFixed(2)),
      totalProduction: Number(totalProduction.toFixed(2)),
    },
    patientRecords: allPatientRecords,
    dataQualityFlags,
  };
}
