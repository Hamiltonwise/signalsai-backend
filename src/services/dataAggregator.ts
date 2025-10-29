/**
 * Data Aggregation Service
 * Wraps existing service functions to provide flexible date range support
 * for agent processing with multiple clients
 */

import { getGA4AIReadyData } from "../routes/ga4";
import { getGBPAIReadyData } from "../routes/gbp";
import { getGSCAIReadyData } from "../routes/gsc";
import { db } from "../database/connection";

// =====================================================================
// TYPE DEFINITIONS
// =====================================================================

export interface ServiceDataResult {
  ga4Data: any;
  gbpData: any;
  gscData: any;
  clarityData: any;
  pmsData: any;
}

export interface GooglePropertyIds {
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
// GOOGLE SERVICES DATA AGGREGATION
// =====================================================================

/**
 * Fetch GA4 data for a specific date range
 * @param oauth2Client - Authenticated OAuth2 client
 * @param propertyId - GA4 property ID (e.g., "properties/12345")
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function fetchGA4DataForRange(
  oauth2Client: any,
  propertyId: string,
  startDate: string,
  endDate: string
): Promise<any> {
  try {
    console.log(
      `[GA4] Attempting to fetch data for property: ${propertyId} (${startDate} to ${endDate})`
    );

    // Log credential status (without exposing sensitive data)
    const credentials = oauth2Client.credentials;
    console.log(`[GA4] OAuth credentials status:`, {
      hasAccessToken: !!credentials?.access_token,
      hasRefreshToken: !!credentials?.refresh_token,
      tokenExpiry: credentials?.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : "unknown",
      scopes: credentials?.scope || "not available",
    });

    const data = await getGA4AIReadyData(
      oauth2Client,
      propertyId,
      startDate,
      endDate
    );
    console.log(
      `[GA4] ✓ Successfully fetched data for property: ${propertyId}`
    );
    return data;
  } catch (error: any) {
    console.error(
      `[GA4 ERROR] Failed to fetch data for property: ${propertyId}`
    );
    console.error(`[GA4 ERROR] Date range: ${startDate} to ${endDate}`);
    console.error(
      `[GA4 ERROR] Error type: ${error?.constructor?.name || "Unknown"}`
    );
    console.error(
      `[GA4 ERROR] Error message: ${error?.message || String(error)}`
    );

    // Log additional error details if available
    if (error?.response) {
      console.error(`[GA4 ERROR] HTTP Status: ${error.response?.status}`);
      console.error(
        `[GA4 ERROR] Response data:`,
        JSON.stringify(error.response?.data, null, 2)
      );
    }
    if (error?.code) {
      console.error(`[GA4 ERROR] Error code: ${error.code}`);
    }
    if (error?.errors) {
      console.error(
        `[GA4 ERROR] Detailed errors:`,
        JSON.stringify(error.errors, null, 2)
      );
    }

    console.error(`Error fetching GA4 data: ${error}`);
    return null;
  }
}

/**
 * Fetch GBP data for all locations in a date range
 * Returns grouped data by locationId with display names
 * @param oauth2Client - Authenticated OAuth2 client
 * @param locations - Array of GBP locations with accountId, locationId, displayName
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function fetchGBPDataForRange(
  oauth2Client: any,
  locations: Array<{
    accountId: string;
    locationId: string;
    displayName: string;
  }>,
  startDate: string,
  endDate: string
): Promise<any> {
  try {
    if (!locations || locations.length === 0) {
      return { locations: [] };
    }

    // Fetch data for all locations in parallel
    const locationDataPromises = locations.map(async (location) => {
      try {
        const data = await getGBPAIReadyData(
          oauth2Client,
          location.accountId,
          location.locationId,
          startDate,
          endDate
        );
        return {
          locationId: location.locationId,
          displayName: location.displayName,
          data: data,
        };
      } catch (error: any) {
        console.error(
          `Error fetching GBP data for location ${location.locationId}: ${error}`
        );
        return {
          locationId: location.locationId,
          displayName: location.displayName,
          data: null,
          error: error?.message || String(error),
        };
      }
    });

    const locationData = await Promise.all(locationDataPromises);

    return {
      locations: locationData,
      totalLocations: locations.length,
    };
  } catch (error: any) {
    console.error(`Error fetching GBP data: ${error}`);
    return { locations: [], error: error?.message || String(error) };
  }
}

/**
 * Fetch GSC data for a specific date range
 * @param oauth2Client - Authenticated OAuth2 client
 * @param siteUrl - GSC site URL (e.g., "sc-domain:example.com")
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function fetchGSCDataForRange(
  oauth2Client: any,
  siteUrl: string,
  startDate: string,
  endDate: string
): Promise<any> {
  try {
    const data = await getGSCAIReadyData(
      oauth2Client,
      siteUrl,
      startDate,
      endDate
    );
    return data;
  } catch (error) {
    console.error(`Error fetching GSC data: ${error}`);
    return null;
  }
}

// =====================================================================
// CLARITY DATA AGGREGATION
// =====================================================================

/**
 * Aggregate Clarity data from daily rows for a date range
 * Sums numeric values and concatenates arrays
 * @param domain - Domain name
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function aggregateClarityDataForRange(
  domain: string,
  startDate: string,
  endDate: string
): Promise<any> {
  try {
    const rows = await db("clarity_data_store")
      .where("domain", domain)
      .andWhereBetween("report_date", [startDate, endDate])
      .orderBy("report_date", "asc");

    if (!rows || rows.length === 0) {
      return {
        dateRange: { startDate, endDate },
        totalDays: 0,
        aggregated: null,
        dailyData: [],
      };
    }

    // Parse and aggregate data
    const parsedRows = rows.map((r) => ({
      report_date: r.report_date,
      data: typeof r.data === "string" ? JSON.parse(r.data) : r.data,
    }));

    // Aggregate metrics across all days
    const aggregated = aggregateClarityMetrics(parsedRows.map((r) => r.data));

    return {
      dateRange: { startDate, endDate },
      totalDays: rows.length,
      aggregated,
      dailyData: parsedRows,
    };
  } catch (error: any) {
    console.error(`Error aggregating Clarity data: ${error}`);
    return {
      dateRange: { startDate, endDate },
      totalDays: 0,
      aggregated: null,
      error: error?.message || String(error),
    };
  }
}

/**
 * Helper function to aggregate Clarity metrics from multiple daily data objects
 * Sums numeric values (even if wrapped in strings) and concatenates arrays
 */
function aggregateClarityMetrics(dataArray: any[]): any {
  if (!dataArray || dataArray.length === 0) return null;

  const aggregated: any = {};

  for (const dayData of dataArray) {
    if (!Array.isArray(dayData)) continue;

    for (const metric of dayData) {
      const metricName = metric.metricName;
      if (!aggregated[metricName]) {
        aggregated[metricName] = {
          metricName,
          information: [],
        };
      }

      // Aggregate information arrays
      if (metric.information && Array.isArray(metric.information)) {
        for (const info of metric.information) {
          // Find existing entry or create new one
          let existingInfo = aggregated[metricName].information.find(
            (i: any) => i.subTotal !== undefined
          );

          if (!existingInfo) {
            existingInfo = {};
            aggregated[metricName].information.push(existingInfo);
          }

          // Sum numeric values
          for (const [key, value] of Object.entries(info)) {
            if (typeof value === "number" || !isNaN(Number(value))) {
              const numValue = Number(value);
              existingInfo[key] = (existingInfo[key] || 0) + numValue;
            } else if (typeof value === "string") {
              // Concatenate unique strings (like URLs)
              if (!existingInfo[key]) {
                existingInfo[key] = value;
              } else if (existingInfo[key] !== value) {
                // If different strings, create array
                if (Array.isArray(existingInfo[key])) {
                  if (!existingInfo[key].includes(value)) {
                    existingInfo[key].push(value);
                  }
                } else {
                  existingInfo[key] = [existingInfo[key], value];
                }
              }
            } else if (Array.isArray(value)) {
              // Merge arrays
              if (!existingInfo[key]) {
                existingInfo[key] = [...value];
              } else {
                existingInfo[key] = [...existingInfo[key], ...value];
              }
            }
          }
        }
      }
    }
  }

  return Object.values(aggregated);
}

// =====================================================================
// PMS DATA (PLACEHOLDER)
// =====================================================================

/**
 * Fetch PMS data for a date range
 * Currently returns empty object as placeholder
 * @param domain - Domain name
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function fetchPMSDataForRange(
  domain: string,
  startDate: string,
  endDate: string
): Promise<any> {
  // TODO: Implement PMS data fetching when available
  // For now, return empty object as placeholder
  return {
    dateRange: { startDate, endDate },
    data: {},
    note: "PMS data feature coming soon",
  };
}

// =====================================================================
// COMBINED DATA FETCHING
// =====================================================================

/**
 * Fetch all service data for a specific date range
 * Combines GA4, GBP, GSC, Clarity, and PMS data
 * @param oauth2Client - Authenticated OAuth2 client
 * @param googleAccountId - Google account ID
 * @param domain - Domain name
 * @param propertyIds - Google property IDs (GA4, GBP, GSC)
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 */
export async function fetchAllServiceData(
  oauth2Client: any,
  googleAccountId: number,
  domain: string,
  propertyIds: GooglePropertyIds,
  startDate: string,
  endDate: string
): Promise<ServiceDataResult> {
  console.log(
    `[DataAggregator] Fetching all services for ${domain} (${startDate} to ${endDate})`
  );

  // Fetch all services in parallel
  const [ga4Data, gbpData, gscData, clarityData, pmsData] = await Promise.all([
    // GA4
    propertyIds.ga4?.propertyId
      ? fetchGA4DataForRange(
          oauth2Client,
          propertyIds.ga4.propertyId,
          startDate,
          endDate
        )
      : Promise.resolve(null),

    // GBP (all locations)
    propertyIds.gbp && propertyIds.gbp.length > 0
      ? fetchGBPDataForRange(oauth2Client, propertyIds.gbp, startDate, endDate)
      : Promise.resolve(null),

    // GSC
    propertyIds.gsc?.siteUrl
      ? fetchGSCDataForRange(
          oauth2Client,
          propertyIds.gsc.siteUrl,
          startDate,
          endDate
        )
      : Promise.resolve(null),

    // Clarity (from database)
    aggregateClarityDataForRange(domain, startDate, endDate),

    // PMS (placeholder)
    fetchPMSDataForRange(domain, startDate, endDate),
  ]);

  return {
    ga4Data,
    gbpData,
    gscData,
    clarityData,
    pmsData,
  };
}
