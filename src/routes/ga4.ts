import express from "express";
import { google } from "googleapis";
import path from "path";

const ga4Routes = express.Router();

const KEY_FILE = path.resolve(__dirname, "../../signals-google-key.json");

// Reusable authentication helper
const createGoogleAuth = () => {
  return new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });
};

// Reusable analytics data client helper
const createAnalyticsDataClient = () => {
  const auth = createGoogleAuth();
  return google.analyticsdata({ version: "v1beta", auth });
};

// Reusable analytics admin client helper (for properties listing)
const createAnalyticsAdminClient = () => {
  const auth = createGoogleAuth();
  return google.analyticsadmin({ version: "v1beta", auth });
};

// Reusable error handler
const handleError = (res: express.Response, error: any, operation: string) => {
  console.error(
    `${operation} Error:`,
    error?.response?.data || error?.message || error
  );
  return res
    .status(500)
    .json({ error: `Failed to ${operation.toLowerCase()}` });
};

// Helper function to get date ranges (reused from GSC pattern)
const getDateRanges = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() - 1; // 0-indexed

  // Current month
  const currMonthStart = new Date(currentYear, currentMonth, 1);
  const currMonthEnd = new Date(currentYear, currentMonth + 1, 0);

  // Previous month
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const prevMonthEnd = new Date(currentYear, currentMonth, 0);

  const formatDate = (date: Date) => date.toISOString().split("T")[0];

  return {
    currentMonth: {
      startDate: formatDate(currMonthStart),
      endDate: formatDate(currMonthEnd),
    },
    previousMonth: {
      startDate: formatDate(prevMonthStart),
      endDate: formatDate(prevMonthEnd),
    },
  };
};

// Helper function to fetch GA4 data for a date range
const fetchGA4Data = async (
  analyticsdata: any,
  propertyId: string,
  startDate: string,
  endDate: string,
  metrics: string[] = ["activeUsers", "engagementRate", "conversions"]
) => {
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

// Main endpoint to get key data by GA4 property ID
ga4Routes.post("/getKeyDataByPropertyId", async (req, res) => {
  try {
    const propertyId = req.body.propertyId;

    if (!propertyId) {
      return res.json({
        successful: false,
        message: "No property ID included",
      });
    }

    // Ensure propertyId is in correct format
    const formattedPropertyId = propertyId.startsWith("properties/")
      ? propertyId
      : `properties/${propertyId}`;

    const analyticsdata = createAnalyticsDataClient();
    const dateRanges = getDateRanges();

    // Fetch data for both months
    const [currentMonthData, previousMonthData] = await Promise.all([
      fetchGA4Data(
        analyticsdata,
        formattedPropertyId,
        dateRanges.currentMonth.startDate,
        dateRanges.currentMonth.endDate
      ),
      fetchGA4Data(
        analyticsdata,
        formattedPropertyId,
        dateRanges.previousMonth.startDate,
        dateRanges.previousMonth.endDate
      ),
    ]);

    return res.json({
      activeUsers: {
        prevMonth: previousMonthData.activeUsers,
        currMonth: currentMonthData.activeUsers,
      },
      engagementRate: {
        prevMonth: previousMonthData.engagementRate,
        currMonth: currentMonthData.engagementRate,
      },
      conversions: {
        prevMonth: previousMonthData.conversions,
        currMonth: currentMonthData.conversions,
      },
    });
  } catch (error: any) {
    return handleError(res, error, "GA4 API");
  }
});

// Diagnosis route to get available GA4 properties
ga4Routes.get("/diag/properties", async (req, res) => {
  try {
    const analyticsadmin = createAnalyticsAdminClient();
    const response = await analyticsadmin.accounts.list();

    if (!response.data.accounts) {
      return res.json({ properties: [] });
    }

    const allProperties: any[] = [];

    // Fetch properties for each account
    for (const account of response.data.accounts) {
      if (account.name) {
        try {
          const propertiesResponse = await analyticsadmin.properties.list({
            filter: `parent:${account.name}`,
          });

          if (propertiesResponse.data.properties) {
            allProperties.push(
              ...propertiesResponse.data.properties.map((prop: any) => ({
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
});

// Simple endpoint to get available GA4 properties with domain names
ga4Routes.get("/properties/get", async (req, res) => {
  try {
    const analyticsadmin = createAnalyticsAdminClient();
    const response = await analyticsadmin.accounts.list();

    if (!response.data.accounts) {
      return res.json([]);
    }

    const properties: Array<{ propertyId: string; domain: string }> = [];

    // Fetch properties for each account
    for (const account of response.data.accounts) {
      if (account.name) {
        try {
          const propertiesResponse = await analyticsadmin.properties.list({
            filter: `parent:${account.name}`,
          });

          if (propertiesResponse.data.properties) {
            // For each property, fetch its data streams to get domain names
            for (const prop of propertiesResponse.data.properties) {
              if (prop.name) {
                try {
                  // Fetch data streams for this property
                  const streamsResponse =
                    await analyticsadmin.properties.dataStreams.list({
                      parent: prop.name,
                    });

                  if (streamsResponse.data.dataStreams) {
                    // Find web data streams and extract domains
                    const webStreams = streamsResponse.data.dataStreams.filter(
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

                  // If no web streams found, fall back to display name
                  if (
                    !streamsResponse.data.dataStreams ||
                    streamsResponse.data.dataStreams.length === 0
                  ) {
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
});

export default ga4Routes;
