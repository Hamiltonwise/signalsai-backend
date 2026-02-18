/**
 * GSC AI-Ready Data Service
 * Orchestrates comprehensive GSC data fetching for AI analysis.
 * This module exports getGSCAIReadyData which is used both by the HTTP endpoint
 * and programmatically by other modules (e.g., dataAggregator).
 */

import { getDateRanges } from "../feature-utils/util.date-ranges";
import { processDeviceData } from "../feature-utils/util.device-data";
import { calculateOpportunities } from "../feature-utils/util.opportunities";
import {
  createSearchConsoleClient,
  fetchGSCData,
} from "./service.search-console-api";

/**
 * Fetches comprehensive GSC data structured for AI consumption.
 * Performs 5 parallel API calls and processes the results.
 *
 * This function is used both via HTTP endpoint and programmatically
 * by other modules (e.g., dataAggregator service).
 *
 * @param oauth2Client - Authenticated OAuth2 client
 * @param domainProperty - The site URL (e.g., "sc-domain:example.com")
 * @param startDate - Optional start date (defaults to current month start)
 * @param endDate - Optional end date (defaults to current month end)
 * @returns Structured AI-ready data object
 */
export async function getGSCAIReadyData(
  oauth2Client: any,
  domainProperty: string,
  startDate?: string,
  endDate?: string
) {
  const searchconsole = createSearchConsoleClient(oauth2Client);

  const dateRanges = getDateRanges();
  const finalStartDate = startDate || dateRanges.currentMonth.startDate;
  const finalEndDate = endDate || dateRanges.currentMonth.endDate;

  // Parallel fetch all data types
  const [overviewData, queryData, pageData, deviceData, geoData] =
    (await Promise.all([
      fetchGSCData(
        searchconsole,
        domainProperty,
        finalStartDate,
        finalEndDate
      ), // Overview
      fetchGSCData(
        searchconsole,
        domainProperty,
        finalStartDate,
        finalEndDate,
        ["query"],
        25
      ),
      fetchGSCData(
        searchconsole,
        domainProperty,
        finalStartDate,
        finalEndDate,
        ["page"],
        50
      ),
      fetchGSCData(
        searchconsole,
        domainProperty,
        finalStartDate,
        finalEndDate,
        ["device"]
      ),
      fetchGSCData(
        searchconsole,
        domainProperty,
        finalStartDate,
        finalEndDate,
        ["country"],
        10
      ),
    ])) as [any, any, any, any, any];

  // Process and structure for AI
  const aiReadyData = {
    overview: {
      totalClicks: overviewData.clicks,
      totalImpressions: overviewData.impressions,
      avgCTR: overviewData.clicks / (overviewData.impressions || 1),
      avgPosition: overviewData.avgPosition,
      dateRange: { startDate: finalStartDate, endDate: finalEndDate },
    },
    topQueries: queryData.rows || [],
    underperformingPages:
      pageData.rows?.filter((page: any) => page.position > 10) || [],
    deviceBreakdown: processDeviceData(deviceData.rows),
    geoPerformance: geoData.rows || [],
    opportunities: calculateOpportunities(queryData.rows, pageData.rows),
  };

  return aiReadyData;
}
