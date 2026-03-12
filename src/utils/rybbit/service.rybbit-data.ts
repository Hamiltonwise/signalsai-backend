/**
 * Rybbit Data Fetcher
 *
 * Shared utility for fetching website analytics data from the
 * self-hosted Rybbit instance. Used by both daily (Proofline)
 * and monthly (Summary) agents.
 *
 * All functions are non-blocking — they log errors and return null,
 * never throw.
 */

import { db } from "../../database/connection";

const PROJECTS_TABLE = "website_builder.projects";

const RYBBIT_API_URL = process.env.RYBBIT_API_URL || "";
const RYBBIT_API_KEY = process.env.RYBBIT_API_KEY || "";
const RYBBIT_TIME_ZONE = "America/New_York";

// =====================================================================
// SITE ID LOOKUP
// =====================================================================

/**
 * Look up the Rybbit site ID for an organization.
 * Returns null if the org has no project or no rybbit_site_id.
 */
export async function getRybbitSiteId(
  organizationId: number
): Promise<string | null> {
  try {
    const project = await db(PROJECTS_TABLE)
      .select("rybbit_site_id")
      .where("organization_id", organizationId)
      .first();

    return project?.rybbit_site_id || null;
  } catch (err: any) {
    console.error(`[Rybbit] Error looking up site ID for org ${organizationId}:`, err?.message || err);
    return null;
  }
}

// =====================================================================
// OVERVIEW FETCH
// =====================================================================

/**
 * Fetch the Rybbit overview metrics for a site and date range.
 * Returns the raw response data or null on failure.
 */
export async function fetchRybbitOverview(
  siteId: string,
  startDate: string,
  endDate: string
): Promise<any | null> {
  if (!RYBBIT_API_URL || !RYBBIT_API_KEY) {
    console.warn("[Rybbit] Skipping fetch — missing RYBBIT_API_URL or RYBBIT_API_KEY");
    return null;
  }

  try {
    const url = `${RYBBIT_API_URL}/api/sites/${siteId}/overview?start_date=${startDate}&end_date=${endDate}&time_zone=${RYBBIT_TIME_ZONE}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${RYBBIT_API_KEY}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      console.error(`[Rybbit] Overview fetch failed (${response.status}): ${body}`);
      return null;
    }

    return await response.json();
  } catch (err: any) {
    console.error(`[Rybbit] Overview fetch error for site ${siteId}:`, err?.message || err);
    return null;
  }
}

// =====================================================================
// DAILY COMPARISON (Proofline)
// =====================================================================

export interface RybbitDailyComparison {
  yesterday: RybbitOverviewData;
  dayBefore: RybbitOverviewData;
}

export interface RybbitOverviewData {
  sessions: number;
  pageviews: number;
  users: number;
  bounce_rate: number;
  pages_per_session: number;
  session_duration: number;
}

/**
 * Fetch Rybbit overview for two consecutive days (yesterday vs day-before).
 * Returns structured comparison or null if unavailable.
 */
export async function fetchRybbitDailyComparison(
  organizationId: number,
  yesterday: string,
  dayBefore: string
): Promise<RybbitDailyComparison | null> {
  const siteId = await getRybbitSiteId(organizationId);

  if (!siteId) {
    console.log(`[Rybbit] No rybbit_site_id for org ${organizationId}, skipping website analytics`);
    return null;
  }

  console.log(`[Rybbit] Fetching daily comparison for site ${siteId} (${dayBefore} vs ${yesterday})`);

  const [yesterdayData, dayBeforeData] = await Promise.all([
    fetchRybbitOverview(siteId, yesterday, yesterday),
    fetchRybbitOverview(siteId, dayBefore, dayBefore),
  ]);

  if (!yesterdayData && !dayBeforeData) {
    console.warn(`[Rybbit] No data returned for either day, skipping`);
    return null;
  }

  return {
    yesterday: extractOverviewMetrics(yesterdayData),
    dayBefore: extractOverviewMetrics(dayBeforeData),
  };
}

// =====================================================================
// MONTHLY COMPARISON (Summary)
// =====================================================================

export interface RybbitMonthlyComparison {
  currentMonth: RybbitOverviewData;
  previousMonth: RybbitOverviewData;
}

/**
 * Fetch Rybbit overview for two month ranges (current vs previous).
 * Returns structured comparison or null if unavailable.
 */
export async function fetchRybbitMonthlyComparison(
  organizationId: number,
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string
): Promise<RybbitMonthlyComparison | null> {
  const siteId = await getRybbitSiteId(organizationId);

  if (!siteId) {
    console.log(`[Rybbit] No rybbit_site_id for org ${organizationId}, skipping website analytics`);
    return null;
  }

  console.log(`[Rybbit] Fetching monthly comparison for site ${siteId} (${previousStart}–${previousEnd} vs ${currentStart}–${currentEnd})`);

  const [currentData, previousData] = await Promise.all([
    fetchRybbitOverview(siteId, currentStart, currentEnd),
    fetchRybbitOverview(siteId, previousStart, previousEnd),
  ]);

  if (!currentData && !previousData) {
    console.warn(`[Rybbit] No data returned for either month, skipping`);
    return null;
  }

  return {
    currentMonth: extractOverviewMetrics(currentData),
    previousMonth: extractOverviewMetrics(previousData),
  };
}

// =====================================================================
// HELPERS
// =====================================================================

function extractOverviewMetrics(data: any): RybbitOverviewData {
  return {
    sessions: data?.sessions ?? 0,
    pageviews: data?.pageviews ?? 0,
    users: data?.users ?? 0,
    bounce_rate: data?.bounce_rate ?? 0,
    pages_per_session: data?.pages_per_session ?? 0,
    session_duration: data?.session_duration ?? 0,
  };
}
