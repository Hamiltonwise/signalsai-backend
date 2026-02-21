/**
 * Data Aggregation Service
 * Wraps existing service functions to provide flexible date range support
 * for agent processing with multiple clients
 */

import { getGBPAIReadyData } from "../../routes/gbp";
import { db } from "../../database/connection";

// =====================================================================
// TYPE DEFINITIONS
// =====================================================================

export interface ServiceDataResult {
  gbpData: any;
  clarityData: any;
  pmsData: any;
}

export interface GooglePropertyIds {
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
          // Always use the first (and only) info object for each metric
          let existingInfo = aggregated[metricName].information[0];

          if (!existingInfo) {
            existingInfo = {};
            aggregated[metricName].information[0] = existingInfo;
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
 * Combines GBP, Clarity, and PMS data
 * @param oauth2Client - Authenticated OAuth2 client
 * @param googleAccountId - Google account ID (legacy param name, will be org ID)
 * @param domain - Domain name
 * @param propertyIds - Google property IDs (GBP)
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
  const [gbpData, clarityData, pmsData] = await Promise.all([
    // GBP (all locations)
    propertyIds.gbp && propertyIds.gbp.length > 0
      ? fetchGBPDataForRange(oauth2Client, propertyIds.gbp, startDate, endDate)
      : Promise.resolve(null),

    // Clarity (from database)
    aggregateClarityDataForRange(domain, startDate, endDate),

    // PMS (placeholder)
    fetchPMSDataForRange(domain, startDate, endDate),
  ]);

  return {
    gbpData,
    clarityData,
    pmsData,
  };
}
