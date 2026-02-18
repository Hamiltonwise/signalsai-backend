/**
 * Google Search Console API Service
 * Core API interaction layer for all GSC data fetching.
 * Manages client creation and provides typed wrappers around the raw API.
 */

import { google } from "googleapis";

interface AggregatedData {
  impressions: number;
  avgPosition: number;
  clicks: number;
  ctr: number;
}

interface DimensionalData {
  rows: any[];
}

/**
 * Creates a Google Search Console API client from an OAuth2 client.
 *
 * @param oauth2Client - Authenticated OAuth2 client (from tokenRefreshMiddleware)
 * @returns Google Search Console API client instance
 */
export const createSearchConsoleClient = (oauth2Client: any) => {
  return google.searchconsole({ version: "v1", auth: oauth2Client });
};

/**
 * Fetches data from the Google Search Console Search Analytics API.
 *
 * When no dimensions are specified, returns aggregated metrics.
 * When dimensions are specified, returns row-level data.
 *
 * @param searchconsole - Google Search Console API client
 * @param domainProperty - The site URL (e.g., "sc-domain:example.com")
 * @param startDate - Start date in ISO format (YYYY-MM-DD)
 * @param endDate - End date in ISO format (YYYY-MM-DD)
 * @param dimensions - Optional array of dimensions (e.g., ["query"], ["page"])
 * @param rowLimit - Maximum number of rows to return (default: 1000)
 * @returns Aggregated data object or dimensional data with rows
 */
export const fetchGSCData = async (
  searchconsole: any,
  domainProperty: string,
  startDate: string,
  endDate: string,
  dimensions: string[] = [],
  rowLimit: number = 1000
): Promise<AggregatedData | DimensionalData> => {
  const response = await searchconsole.searchanalytics.query({
    siteUrl: domainProperty,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      rowLimit,
    },
  });

  // If no dimensions, return aggregated data
  if (dimensions.length === 0) {
    const row = response.data.rows?.[0];
    return {
      impressions: row?.impressions || 0,
      avgPosition: row?.position || 0,
      clicks: row?.clicks || 0,
      ctr: row?.ctr || 0,
    };
  }

  // Return structured data with rows
  return {
    rows: response.data.rows || [],
  };
};

/**
 * Fetches the list of sites available to the authenticated user.
 *
 * @param searchconsole - Google Search Console API client
 * @returns Raw site list response data
 */
export const fetchSitesList = async (searchconsole: any) => {
  const { data } = await searchconsole.sites.list({});
  return data;
};
