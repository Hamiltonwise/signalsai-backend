import db from "../database/connection";

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
 * Aggregate PMS data across all approved jobs for a domain
 * This function implements smart deduplication - keeps only the latest data for each month
 *
 * @param domain - The domain to fetch PMS data for
 * @returns Aggregated PMS data with unique months (latest wins) and aggregated sources
 */
export async function aggregatePmsData(
  domain: string
): Promise<AggregatedPmsData> {
  // Fetch all approved jobs for this domain
  const approvedJobs = await db("pms_jobs")
    .select("id", "timestamp", "response_log")
    .where({ domain, is_approved: 1 })
    .orderBy("timestamp", "asc");

  if (!approvedJobs.length) {
    return {
      months: [],
      sources: [],
      totals: {
        totalReferrals: 0,
        totalProduction: 0,
      },
    };
  }

  // Track month data with timestamps to keep only the latest
  const monthMap = new Map<string, AggregatedMonthData>();

  // Process jobs to build month map (keeping only latest data per month)
  for (const job of approvedJobs) {
    const entries = extractMonthEntriesFromResponse(job.response_log);

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
  };
}
