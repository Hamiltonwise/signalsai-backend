/**
 * GA4 Analytics API Service
 *
 * Wraps Google Analytics Data and Admin API clients.
 * Provides low-level API call methods with logging and error context.
 * No data transformation -- returns raw API responses.
 */

import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";

/**
 * Creates a Google Analytics Data API client.
 *
 * @param oauth2Client - Authenticated OAuth2 client
 * @returns analyticsdata client (v1beta)
 */
export const createDataClient = (oauth2Client: OAuth2Client) => {
  return google.analyticsdata({ version: "v1beta", auth: oauth2Client });
};

/**
 * Creates a Google Analytics Admin API client.
 *
 * @param oauth2Client - Authenticated OAuth2 client
 * @returns analyticsadmin client (v1beta)
 */
export const createAdminClient = (oauth2Client: OAuth2Client) => {
  return google.analyticsadmin({ version: "v1beta", auth: oauth2Client });
};

/**
 * Fetches a GA4 report without dimensions (aggregated metrics only).
 *
 * @param analyticsdata - Analytics Data API client
 * @param propertyId - Formatted property ID (e.g., "properties/123")
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @param metrics - Array of metric names to fetch
 * @returns Object with metric name -> value pairs, or default zeros
 */
export const fetchReport = async (
  analyticsdata: any,
  propertyId: string,
  startDate: string,
  endDate: string,
  metrics: string[] = ["activeUsers", "engagementRate", "conversions"]
): Promise<{ activeUsers: number; engagementRate: number; conversions: number }> => {
  const response = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody: {
      dateRanges: [
        {
          startDate,
          endDate,
        },
      ],
      metrics: metrics.map((metric) => ({ name: metric })),
    },
  });

  const rows = response.data.rows || [];
  const metricHeaders = response.data.metricHeaders || [];

  // Extract values from the first row (aggregated data)
  const row = rows[0];
  if (!row || !row.metricValues) {
    return {
      activeUsers: 0,
      engagementRate: 0,
      conversions: 0,
    };
  }

  const result: any = {};
  metricHeaders.forEach((header: any, index: number) => {
    const metricName = header.name;
    const value = parseFloat(row.metricValues[index].value) || 0;
    result[metricName] = value;
  });

  return {
    activeUsers: result.activeUsers || 0,
    engagementRate: result.engagementRate || 0,
    conversions: result.conversions || 0,
  };
};

/**
 * Fetches a GA4 report with optional dimensions support.
 * Preserves all original logging patterns for production monitoring.
 *
 * @param analyticsdata - Analytics Data API client
 * @param propertyId - Formatted property ID
 * @param startDate - Start date in YYYY-MM-DD format
 * @param endDate - End date in YYYY-MM-DD format
 * @param metrics - Array of metric names
 * @param dimensions - Array of dimension names (empty for aggregated data)
 * @param limit - Maximum rows to return (default 1000)
 * @returns Aggregated object (no dimensions) or { rows: [...] } (with dimensions)
 */
export const fetchReportWithDimensions = async (
  analyticsdata: any,
  propertyId: string,
  startDate: string,
  endDate: string,
  metrics: string[],
  dimensions: string[] = [],
  limit: number = 1000
): Promise<any> => {
  const requestBody: any = {
    dateRanges: [{ startDate, endDate }],
    metrics: metrics.map((metric) => ({ name: metric })),
    limit,
  };

  if (dimensions.length > 0) {
    requestBody.dimensions = dimensions.map((dimension) => ({
      name: dimension,
    }));
  }

  console.log(`[GA4 API] Calling runReport for ${startDate} to ${endDate}`);
  console.log(`  - Property: ${propertyId}`);
  console.log(`  - Metrics: ${metrics.join(", ")}`);
  console.log(
    `  - Dimensions: ${dimensions.length > 0 ? dimensions.join(", ") : "none"}`
  );

  try {
    const response = await analyticsdata.properties.runReport({
      property: propertyId,
      requestBody,
    });

    console.log(
      `[GA4 API] runReport successful for ${startDate} to ${endDate}`
    );
    console.log(`  - Rows returned: ${response.data.rows?.length || 0}`);

    const rows = response.data.rows || [];
    const metricHeaders = response.data.metricHeaders || [];
    const dimensionHeaders = response.data.dimensionHeaders || [];

    if (dimensions.length === 0) {
      // Return aggregated data for no dimensions
      const row = rows[0];
      if (!row || !row.metricValues) return {};

      const result: any = {};
      metricHeaders.forEach((header: any, index: number) => {
        const metricName = header.name;
        const value = parseFloat(row.metricValues[index].value) || 0;
        result[metricName] = value;
      });
      return result;
    }

    // Return structured data with rows for dimensions
    return {
      rows: rows.map((row: any) => {
        const result: any = {};

        // Add dimension values
        if (row.dimensionValues) {
          dimensionHeaders.forEach((header: any, index: number) => {
            result[header.name] = row.dimensionValues[index].value;
          });
        }

        // Add metric values
        if (row.metricValues) {
          metricHeaders.forEach((header: any, index: number) => {
            result[header.name] =
              parseFloat(row.metricValues[index].value) || 0;
          });
        }

        return result;
      }),
    };
  } catch (error: any) {
    console.error(
      `[GA4 API] runReport FAILED for ${startDate} to ${endDate}`
    );
    console.error(`  - Property: ${propertyId}`);
    console.error(`  - Error type: ${error?.constructor?.name || "Unknown"}`);
    console.error(`  - Error message: ${error?.message || String(error)}`);
    console.error(`  - HTTP Status: ${error?.response?.status || "N/A"}`);
    console.error(
      `  - Response data:`,
      JSON.stringify(error?.response?.data || {}, null, 2)
    );
    throw error;
  }
};

/**
 * Lists all GA4 accounts accessible by the authenticated user.
 *
 * @param adminClient - Analytics Admin API client
 * @returns Array of account objects, or empty array
 */
export const listAccounts = async (adminClient: any): Promise<any[]> => {
  const response = await adminClient.accounts.list();
  return response.data.accounts || [];
};

/**
 * Lists all GA4 properties for a given account.
 *
 * @param adminClient - Analytics Admin API client
 * @param accountName - Account resource name (e.g., "accounts/123")
 * @returns Array of property objects, or empty array
 */
export const listProperties = async (
  adminClient: any,
  accountName: string
): Promise<any[]> => {
  const response = await adminClient.properties.list({
    filter: `parent:${accountName}`,
  });
  return response.data.properties || [];
};

/**
 * Lists all data streams for a given GA4 property.
 *
 * @param adminClient - Analytics Admin API client
 * @param propertyName - Property resource name (e.g., "properties/123")
 * @returns Array of data stream objects, or empty array
 */
export const listDataStreams = async (
  adminClient: any,
  propertyName: string
): Promise<any[]> => {
  const response = await adminClient.properties.dataStreams.list({
    parent: propertyName,
  });
  return response.data.dataStreams || [];
};
