/**
 * Data Fetcher Service
 *
 * Fetches data from all integrated services (GA4, GSC, GBP, Clarity, PMS)
 * by calling the exported functions directly from route files.
 * This bypasses HTTP overhead and reuses existing, tested logic.
 */

import { db } from "../database/connection";
import { OAuth2Client } from "google-auth-library";
import { getGA4AIReadyData } from "../routes/ga4";
import { getGSCAIReadyData } from "../routes/gsc";
import { getGBPAIReadyData } from "../routes/gbp";

// =====================================================================
// TYPES
// =====================================================================

export interface ServiceData {
  ga4Data: any | null;
  gscData: any | null;
  gbpData: any | null;
  clarityData: any | null;
  pmsData: any | null;
}

export interface FetchOptions {
  oauth2Client: OAuth2Client;
  googleAccountId: number;
  weekStart: string;
  weekEnd: string;
}

export interface PropertyIds {
  ga4?: {
    propertyId: string;
    displayName: string;
  };
  gsc?: {
    siteUrl: string;
    displayName: string;
  };
  gbp?: Array<{
    accountId: string;
    locationId: string;
    displayName: string;
  }>;
}

// =====================================================================
// GET PROPERTY IDS FROM DATABASE
// =====================================================================

async function getPropertyIds(
  googleAccountId: number
): Promise<PropertyIds | null> {
  try {
    const account = await db("google_accounts")
      .where({ id: googleAccountId })
      .select("google_property_ids", "domain_name")
      .first();

    if (!account || !account.google_property_ids) {
      console.log(
        `[DataFetcher] No property IDs found for account ${googleAccountId}`
      );
      return null;
    }

    const propertyIds =
      typeof account.google_property_ids === "string"
        ? JSON.parse(account.google_property_ids)
        : account.google_property_ids;

    return propertyIds;
  } catch (error: any) {
    console.error(`[DataFetcher] Error fetching property IDs:`, error.message);
    return null;
  }
}

// =====================================================================
// GA4 DATA FETCHER - Calls Exported Function from ga4.ts
// =====================================================================

async function fetchGA4Data(
  oauth2Client: OAuth2Client,
  weekStart: string,
  weekEnd: string,
  propertyId: string
): Promise<any | null> {
  try {
    console.log(`[GA4] Fetching data for property: ${propertyId}`);

    const data = await getGA4AIReadyData(
      oauth2Client,
      propertyId,
      weekStart,
      weekEnd
    );

    console.log(`[GA4] Data fetched successfully`);
    return data;
  } catch (error: any) {
    console.error(`[GA4] Error fetching data:`, error.message);
    return null;
  }
}

// =====================================================================
// GSC DATA FETCHER - Calls Exported Function from gsc.ts
// =====================================================================

async function fetchGSCData(
  oauth2Client: OAuth2Client,
  weekStart: string,
  weekEnd: string,
  siteUrl: string
): Promise<any | null> {
  try {
    console.log(`[GSC] Fetching data for site: ${siteUrl}`);

    const data = await getGSCAIReadyData(
      oauth2Client,
      siteUrl,
      weekStart,
      weekEnd
    );

    console.log(`[GSC] Data fetched successfully`);
    return data;
  } catch (error: any) {
    console.error(`[GSC] Error fetching data:`, error.message);
    return null;
  }
}

// =====================================================================
// GBP DATA FETCHER - Calls Exported Function from gbp.ts
// =====================================================================

async function fetchGBPData(
  oauth2Client: OAuth2Client,
  weekStart: string,
  weekEnd: string,
  accountId: string,
  locationId: string
): Promise<any | null> {
  try {
    console.log(
      `[GBP] Fetching data for account: ${accountId}, location: ${locationId}`
    );

    const data = await getGBPAIReadyData(
      oauth2Client,
      accountId,
      locationId,
      weekStart,
      weekEnd
    );

    console.log(`[GBP] Data fetched successfully`);
    return data;
  } catch (error: any) {
    console.error(`[GBP] Error fetching data:`, error.message);
    return null;
  }
}

// =====================================================================
// CLARITY DATA FETCHER
// =====================================================================

async function fetchClarityData(
  weekStart: string,
  weekEnd: string,
  domain: string
): Promise<any | null> {
  try {
    console.log(`[Clarity] Fetching data for domain: ${domain}`);

    // Fetch ALL data from database for the week
    const rows = await db("clarity_data_store")
      .where("domain", domain)
      .andWhereBetween("report_date", [weekStart, weekEnd])
      .orderBy("report_date", "asc");

    if (rows.length === 0) {
      console.log(`[Clarity] No data found for domain: ${domain}`);
      return null;
    }

    // Return complete raw data - merge all rows' data arrays
    const allMetrics: any[] = [];

    for (const row of rows) {
      const parsed =
        typeof row.data === "string" ? JSON.parse(row.data) : row.data;

      // Each row.data is an array of metrics, add them all
      if (Array.isArray(parsed)) {
        allMetrics.push(...parsed);
      }
    }

    console.log(
      `[Clarity] Data fetched successfully - ${allMetrics.length} metrics`
    );

    return {
      domain,
      dateRange: { startDate: weekStart, endDate: weekEnd },
      data: allMetrics, // Complete raw data, not aggregated
    };
  } catch (error: any) {
    console.error(`[Clarity] Error fetching data:`, error.message);
    return null;
  }
}

// =====================================================================
// PMS DATA FETCHER
// =====================================================================

async function fetchPMSData(
  weekStart: string,
  weekEnd: string,
  domain: string
): Promise<any | null> {
  try {
    console.log(`[PMS] Fetching data for domain: ${domain}`);

    // Fetch approved PMS jobs for this domain within the week
    const jobs = await db("pms_jobs")
      .where("domain", domain)
      .andWhere("is_approved", 1)
      .andWhereBetween("timestamp", [
        `${weekStart} 00:00:00`,
        `${weekEnd} 23:59:59`,
      ])
      .orderBy("timestamp", "desc");

    if (jobs.length === 0) {
      console.log(`[PMS] No approved jobs found for domain: ${domain}`);
      return null;
    }

    // Process the most recent approved job
    const latestJob = jobs[0];
    const responseLog =
      typeof latestJob.response_log === "string"
        ? JSON.parse(latestJob.response_log)
        : latestJob.response_log;

    console.log(`[PMS] Data fetched successfully - Job ID: ${latestJob.id}`);

    return {
      domain,
      dateRange: { startDate: weekStart, endDate: weekEnd },
      jobId: latestJob.id,
      data: responseLog,
    };
  } catch (error: any) {
    console.error(`[PMS] Error fetching data:`, error.message);
    return null;
  }
}

// =====================================================================
// MAIN FETCH FUNCTION
// =====================================================================

/**
 * Fetch data from all services in parallel by calling exported functions directly
 * Returns null for any service that fails or is unavailable
 */
export async function fetchAllServiceData(
  options: FetchOptions
): Promise<ServiceData> {
  const { oauth2Client, googleAccountId, weekStart, weekEnd } = options;

  console.log(
    `[DataFetcher] Fetching data for account ${googleAccountId} (${weekStart} to ${weekEnd})`
  );

  // Get property IDs from database
  const propertyIds = await getPropertyIds(googleAccountId);

  if (!propertyIds) {
    console.log(`[DataFetcher] No property IDs found - returning all nulls`);
    return {
      ga4Data: null,
      gscData: null,
      gbpData: null,
      clarityData: null,
      pmsData: null,
    };
  }

  console.log(`[DataFetcher] Property IDs:`, JSON.stringify(propertyIds));

  // Get domain name for Clarity and PMS
  const account = await db("google_accounts")
    .where({ id: googleAccountId })
    .select("domain_name")
    .first();

  const domain = account?.domain_name || "";
  console.log(`[DataFetcher] Domain: ${domain}`);

  // Fetch all services in parallel using exported functions
  const [ga4Data, gscData, gbpData, clarityData, pmsData] = await Promise.all([
    propertyIds.ga4
      ? fetchGA4Data(
          oauth2Client,
          weekStart,
          weekEnd,
          propertyIds.ga4.propertyId
        ).catch((err) => {
          console.error(`[GA4] Fetch failed:`, err.message);
          return null;
        })
      : Promise.resolve(null),

    propertyIds.gsc
      ? fetchGSCData(
          oauth2Client,
          weekStart,
          weekEnd,
          propertyIds.gsc.siteUrl
        ).catch((err) => {
          console.error(`[GSC] Fetch failed:`, err.message);
          return null;
        })
      : Promise.resolve(null),

    propertyIds.gbp && propertyIds.gbp.length > 0
      ? fetchGBPData(
          oauth2Client,
          weekStart,
          weekEnd,
          propertyIds.gbp[0].accountId,
          propertyIds.gbp[0].locationId
        ).catch((err) => {
          console.error(`[GBP] Fetch failed:`, err.message);
          return null;
        })
      : Promise.resolve(null),

    domain
      ? fetchClarityData(weekStart, weekEnd, domain).catch((err) => {
          console.error(`[Clarity] Fetch failed:`, err.message);
          return null;
        })
      : Promise.resolve(null),

    domain
      ? fetchPMSData(weekStart, weekEnd, domain).catch((err) => {
          console.error(`[PMS] Fetch failed:`, err.message);
          return null;
        })
      : Promise.resolve(null),
  ]);

  console.log(`[DataFetcher] Fetch complete:`, {
    ga4: ga4Data ? "✓" : "✗",
    gsc: gscData ? "✓" : "✗",
    gbp: gbpData ? "✓" : "✗",
    clarity: clarityData ? "✓" : "✗",
    pms: pmsData ? "✓" : "✗",
  });

  return {
    ga4Data,
    gscData,
    gbpData,
    clarityData,
    pmsData,
  };
}
