/**
 * GA4 Controller
 *
 * Handles HTTP request/response for GA4 endpoints.
 * Delegates to service layer for all business logic and API calls.
 * Exports getGA4AIReadyData() for direct programmatic use by other modules.
 */

import { Response } from "express";
import { AuthenticatedRequest } from "../../middleware/tokenRefresh";
import { formatPropertyId } from "./feature-utils/util.property-formatter";
import { getDateRanges } from "./feature-utils/util.date-ranges";
import { handleError } from "./feature-utils/util.error-handler";
import { buildKeyDataResponse } from "./feature-utils/util.response-builder";
import {
  createDataClient,
  createAdminClient,
  listAccounts,
  listProperties,
  listDataStreams,
} from "./feature-services/service.analytics-api";
import { fetchKeyMetrics } from "./feature-services/service.data-fetcher";
import { fetchComprehensiveData } from "./feature-services/service.data-fetcher";
import { calculateTrendScore } from "./feature-services/service.trend-calculator";

/**
 * Exported function for direct use (bypassing HTTP).
 * Used by dataAggregator and other modules that need GA4 data programmatically.
 *
 * @param oauth2Client - Google OAuth2 client
 * @param propertyId - GA4 property ID (raw or formatted)
 * @param startDate - Optional start date (YYYY-MM-DD)
 * @param endDate - Optional end date (YYYY-MM-DD)
 * @returns AI-ready data object
 */
export async function getGA4AIReadyData(
  oauth2Client: any,
  propertyId: string,
  startDate?: string,
  endDate?: string
): Promise<any> {
  return fetchComprehensiveData(oauth2Client, propertyId, startDate, endDate);
}

/**
 * POST /getKeyData
 *
 * Fetches key GA4 metrics for current and previous months,
 * calculates trend score using weighted formula.
 */
const getKeyData = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<Response> => {
  try {
    const propertyId = req.body.propertyId;

    if (!propertyId) {
      return res.json({
        successful: false,
        message: "No property ID included",
      });
    }

    const formattedPropertyId = formatPropertyId(propertyId);

    if (!req.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }

    const analyticsdata = createDataClient(req.oauth2Client);

    const { currentMonthData, previousMonthData } = await fetchKeyMetrics(
      analyticsdata,
      formattedPropertyId
    );

    const trendScore = calculateTrendScore(currentMonthData, previousMonthData);

    return res.json(
      buildKeyDataResponse(currentMonthData, previousMonthData, trendScore)
    );
  } catch (error: any) {
    return handleError(res, error, "GA4 API");
  }
};

/**
 * GET /diag/properties
 *
 * Lists all available GA4 properties with full metadata.
 * Diagnostic endpoint for account inspection.
 */
const getDiagnosticProperties = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<Response> => {
  try {
    if (!req.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }

    const analyticsadmin = createAdminClient(req.oauth2Client);
    const accounts = await listAccounts(analyticsadmin);

    if (!accounts || accounts.length === 0) {
      return res.json({ properties: [] });
    }

    const allProperties: any[] = [];

    for (const account of accounts) {
      if (account.name) {
        try {
          const properties = await listProperties(analyticsadmin, account.name);

          if (properties) {
            allProperties.push(
              ...properties.map((prop: any) => ({
                propertyId: prop.name,
                displayName: prop.displayName,
                timeZone: prop.timeZone,
                currencyCode: prop.currencyCode,
                accountId: account.name,
                accountDisplayName: account.displayName,
              }))
            );
          }
        } catch (propError) {
          console.warn(
            `Failed to fetch properties for account ${account.name}:`,
            propError
          );
        }
      }
    }

    return res.json({ properties: allProperties });
  } catch (err: any) {
    return handleError(res, err, "List GA4 properties");
  }
};

/**
 * GET /properties/get
 *
 * Lists available GA4 properties with extracted domain names.
 * Domain extraction: stream URL -> hostname -> remove "www." prefix.
 * Fallback chain: stream URL -> display name -> "Unknown Domain" / "No Domain".
 */
const getPropertiesWithDomains = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<Response> => {
  try {
    if (!req.oauth2Client) {
      throw new Error("OAuth2 client not initialized");
    }

    const analyticsadmin = createAdminClient(req.oauth2Client);
    const accounts = await listAccounts(analyticsadmin);

    if (!accounts || accounts.length === 0) {
      return res.json([]);
    }

    const properties: Array<{ propertyId: string; domain: string }> = [];

    for (const account of accounts) {
      if (account.name) {
        try {
          const accountProperties = await listProperties(
            analyticsadmin,
            account.name
          );

          if (accountProperties) {
            for (const prop of accountProperties) {
              if (prop.name) {
                try {
                  const dataStreams = await listDataStreams(
                    analyticsadmin,
                    prop.name
                  );

                  if (dataStreams && dataStreams.length > 0) {
                    // Find web data streams and extract domains
                    const webStreams = dataStreams.filter(
                      (stream: any) => stream.type === "WEB_DATA_STREAM"
                    );

                    for (const stream of webStreams) {
                      if (stream.webStreamData?.defaultUri) {
                        try {
                          const url = new URL(stream.webStreamData.defaultUri);
                          let domain = url.hostname;

                          // Remove www. prefix if it exists
                          if (domain.startsWith("www.")) {
                            domain = domain.substring(4);
                          }

                          properties.push({
                            propertyId: prop.name,
                            domain: domain,
                          });
                        } catch (urlError) {
                          // If URL parsing fails, fall back to display name
                          properties.push({
                            propertyId: prop.name,
                            domain: prop.displayName || "Unknown Domain",
                          });
                        }
                      }
                    }
                  }

                  // If no data streams found, fall back to display name
                  if (!dataStreams || dataStreams.length === 0) {
                    properties.push({
                      propertyId: prop.name,
                      domain: prop.displayName || "No Domain",
                    });
                  }
                } catch (streamError) {
                  console.warn(
                    `Failed to fetch data streams for property ${prop.name}:`,
                    streamError
                  );
                  // Fall back to display name if data stream fetch fails
                  properties.push({
                    propertyId: prop.name,
                    domain: prop.displayName || "Unknown Domain",
                  });
                }
              }
            }
          }
        } catch (propError) {
          console.warn(
            `Failed to fetch properties for account ${account.name}:`,
            propError
          );
        }
      }
    }

    return res.json(properties);
  } catch (err: any) {
    return handleError(res, err, "Get available GA4 properties");
  }
};

/**
 * POST /getAIReadyData
 *
 * Comprehensive AI-ready data endpoint.
 * Supports optional custom date ranges via req.body.startDate/endDate.
 */
const getAIReadyData = async (
  req: AuthenticatedRequest,
  res: Response
): Promise<Response> => {
  try {
    const propertyId = req.body.propertyId;

    if (!propertyId) {
      return res.json({
        successful: false,
        message: "No property ID included",
      });
    }

    const dateRanges = getDateRanges();
    const startDate = req.body.startDate || dateRanges.currentMonth.startDate;
    const endDate = req.body.endDate || dateRanges.currentMonth.endDate;

    const aiReadyData = await getGA4AIReadyData(
      req.oauth2Client,
      propertyId,
      startDate,
      endDate
    );

    return res.json(aiReadyData);
  } catch (error: any) {
    return handleError(res, error, "GA4 AI Data");
  }
};

const Ga4Controller = {
  getKeyData,
  getDiagnosticProperties,
  getPropertiesWithDomains,
  getAIReadyData,
};

export default Ga4Controller;
