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

// Enhanced helper function to fetch GA4 data with dimensions support
const fetchGA4DataWithDimensions = async (
  analyticsdata: any,
  propertyId: string,
  startDate: string,
  endDate: string,
  metrics: string[],
  dimensions: string[] = [],
  limit: number = 1000
) => {
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

  const response = await analyticsdata.properties.runReport({
    property: propertyId,
    requestBody,
  });

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
          result[header.name] = parseFloat(row.metricValues[index].value) || 0;
        });
      }

      return result;
    }),
  };
};

// Helper function to process acquisition data
const processAcquisitionData = (rows: any[]) => {
  if (!rows) return {};

  return {
    bySource: rows.slice(0, 10).map((row) => ({
      source: row.sessionSource || row.firstUserSource || "Unknown",
      medium: row.sessionMedium || row.firstUserMedium || "Unknown",
      users: row.activeUsers || 0,
      sessions: row.sessions || 0,
      engagementRate: row.engagementRate || 0,
      conversions: row.conversions || 0,
    })),
  };
};

// Helper function to process audience data
const processAudienceData = (geoRows: any[], deviceRows: any[]) => {
  return {
    geographic:
      geoRows?.slice(0, 10).map((row) => ({
        country: row.country || "Unknown",
        users: row.activeUsers || 0,
        sessions: row.sessions || 0,
        engagementRate: row.engagementRate || 0,
      })) || [],
    technology:
      deviceRows?.map((row) => ({
        deviceCategory: row.deviceCategory || "Unknown",
        users: row.activeUsers || 0,
        sessions: row.sessions || 0,
        engagementRate: row.engagementRate || 0,
      })) || [],
  };
};

// Helper function to process behavior data
const processBehaviorData = (pageRows: any[], eventRows: any[]) => {
  return {
    topPages:
      pageRows?.slice(0, 20).map((row) => ({
        page: row.pagePath || row.pageTitle || "Unknown",
        views: row.screenPageViews || 0,
        users: row.activeUsers || 0,
        avgEngagementTime: row.userEngagementDuration || 0,
        bounceRate: 1 - row.engagedSessions / (row.sessions || 1),
      })) || [],
    topEvents:
      eventRows?.slice(0, 15).map((row) => ({
        eventName: row.eventName || "Unknown",
        eventCount: row.eventCount || 0,
        users: row.activeUsers || 0,
      })) || [],
  };
};

// Helper function to process e-commerce data
const processEcommerceData = (ecommerceRows: any[]) => {
  if (!ecommerceRows || ecommerceRows.length === 0) {
    return {
      revenue: {
        total: 0,
        transactions: 0,
        avgOrderValue: 0,
      },
      products: [],
    };
  }

  const totalRevenue = ecommerceRows.reduce(
    (sum, row) => sum + (row.purchaseRevenue || 0),
    0
  );
  const totalTransactions = ecommerceRows.reduce(
    (sum, row) => sum + (row.transactions || 0),
    0
  );

  return {
    revenue: {
      total: totalRevenue,
      transactions: totalTransactions,
      avgOrderValue:
        totalTransactions > 0 ? totalRevenue / totalTransactions : 0,
    },
    products: ecommerceRows.slice(0, 10).map((row) => ({
      itemName: row.itemName || "Unknown",
      revenue: row.itemRevenue || 0,
      quantity: row.itemsViewed || row.itemsPurchased || 0,
    })),
  };
};

// Helper function to calculate opportunities for GA4
const calculateGA4Opportunities = (
  overviewData: any,
  pagesData: any[],
  acquisitionData: any[]
) => {
  const opportunities = [];

  // High bounce rate pages (>70%)
  const highBouncePages =
    pagesData
      ?.filter((page) => {
        const bounceRate = 1 - page.engagedSessions / (page.sessions || 1);
        return bounceRate > 0.7 && page.sessions > 50;
      })
      ?.slice(0, 5)
      ?.map((page) => ({
        type: "high_bounce_page",
        page: page.pagePath || page.pageTitle,
        bounceRate: 1 - page.engagedSessions / (page.sessions || 1),
        sessions: page.sessions,
      })) || [];

  // Low engagement rate traffic sources (<30%)
  const lowEngagementSources =
    acquisitionData
      ?.filter((source) => source.engagementRate < 0.3 && source.users > 100)
      ?.slice(0, 5)
      ?.map((source) => ({
        type: "low_engagement_source",
        source: source.source,
        medium: source.medium,
        engagementRate: source.engagementRate,
        users: source.users,
      })) || [];

  return [...highBouncePages, ...lowEngagementSources];
};

// Trend score calculation function for GA4 metrics
const calculateTrendScore = (currentData: any, previousData: any) => {
  const conversionsChange =
    previousData.conversions === 0
      ? 0
      : ((currentData.conversions - previousData.conversions) /
          previousData.conversions) *
        100;

  const engagementRateChange =
    previousData.engagementRate === 0
      ? 0
      : ((currentData.engagementRate - previousData.engagementRate) /
          previousData.engagementRate) *
        100;

  const activeUsersChange =
    previousData.activeUsers === 0
      ? 0
      : ((currentData.activeUsers - previousData.activeUsers) /
          previousData.activeUsers) *
        100;

  // Weight the metrics: conversion (40%), Engagement Rate (35%), active users (25%)
  const trendScore =
    conversionsChange * 0.4 +
    engagementRateChange * 0.35 +
    activeUsersChange * 0.25;

  return Math.round(trendScore * 100) / 100; // Round to 2 decimal places
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

    // Calculate trend score
    const trendScore = calculateTrendScore(currentMonthData, previousMonthData);

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
      trendScore,
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

// Comprehensive AI-ready data endpoint for GA4
ga4Routes.post("/getAIReadyData", async (req, res) => {
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
    const { startDate, endDate } = dateRanges.currentMonth;

    // Define metrics for different data categories
    const overviewMetrics = [
      "sessions",
      "totalUsers",
      "screenPageViews",
      "engagementRate",
      "averageSessionDuration",
      "bounceRate",
    ];
    const acquisitionMetrics = [
      "sessions",
      "totalUsers",
      "engagementRate",
      "conversions",
    ];
    const behaviorMetrics = [
      "screenPageViews",
      "totalUsers",
      "userEngagementDuration",
      "sessions",
      "engagedSessions",
    ];
    const ecommerceMetrics = [
      "purchaseRevenue",
      "transactions",
      "itemRevenue",
      "itemsViewed",
    ];
    const audienceMetrics = ["totalUsers", "sessions", "engagementRate"];

    // Parallel fetch all data types
    const [
      overviewData,
      acquisitionData,
      audienceGeoData,
      audienceDeviceData,
      behaviorPagesData,
      behaviorEventsData,
      ecommerceData,
      realTimeData,
    ] = await Promise.all([
      // 1. Traffic Overview
      fetchGA4DataWithDimensions(
        analyticsdata,
        formattedPropertyId,
        startDate,
        endDate,
        overviewMetrics
      ),

      // 2. Acquisition Data - by source/medium
      fetchGA4DataWithDimensions(
        analyticsdata,
        formattedPropertyId,
        startDate,
        endDate,
        acquisitionMetrics,
        ["sessionSource", "sessionMedium"],
        20
      ),

      // 3. Audience Insights - Geographic
      fetchGA4DataWithDimensions(
        analyticsdata,
        formattedPropertyId,
        startDate,
        endDate,
        audienceMetrics,
        ["country"],
        15
      ),

      // 3. Audience Insights - Technology
      fetchGA4DataWithDimensions(
        analyticsdata,
        formattedPropertyId,
        startDate,
        endDate,
        audienceMetrics,
        ["deviceCategory"]
      ),

      // 4. Behavior Data - Pages
      fetchGA4DataWithDimensions(
        analyticsdata,
        formattedPropertyId,
        startDate,
        endDate,
        behaviorMetrics,
        ["pagePath"],
        25
      ),

      // 4. Behavior Data - Events
      fetchGA4DataWithDimensions(
        analyticsdata,
        formattedPropertyId,
        startDate,
        endDate,
        ["eventCount", "totalUsers"],
        ["eventName"],
        20
      ),

      // 5. E-commerce Data
      fetchGA4DataWithDimensions(
        analyticsdata,
        formattedPropertyId,
        startDate,
        endDate,
        ecommerceMetrics,
        ["itemName"],
        15
      ).catch(() => ({ rows: [] })),

      // 6. Real-time Data (using last 30 minutes)
      fetchGA4DataWithDimensions(
        analyticsdata,
        formattedPropertyId,
        "30minutesAgo",
        "now",
        ["activeUsers"],
        ["pagePath"],
        10
      ).catch(() => ({ rows: [] })),
    ]);

    // Process and structure data for AI
    const aiReadyData = {
      // 1. Traffic Overview 📊
      overview: {
        sessions: overviewData.sessions || 0,
        users: overviewData.totalUsers || 0,
        pageviews: overviewData.screenPageViews || 0,
        engagementRate: overviewData.engagementRate || 0,
        avgSessionDuration: overviewData.averageSessionDuration || 0,
        bounceRate: overviewData.bounceRate || 0,
        dateRange: { startDate, endDate },
      },

      // 2. Acquisition Data 🎯
      acquisition: processAcquisitionData(acquisitionData.rows || []),

      // 3. Audience Insights 👥
      audience: processAudienceData(
        audienceGeoData.rows || [],
        audienceDeviceData.rows || []
      ),

      // 4. Behavior Data 🔄
      behavior: processBehaviorData(
        behaviorPagesData.rows || [],
        behaviorEventsData.rows || []
      ),

      // 5. E-commerce Data 💰
      ecommerce: processEcommerceData(ecommerceData.rows || []),

      // 6. Real-time Data ⚡
      realTime: {
        activeUsers:
          realTimeData.rows?.reduce(
            (sum: number, row: any) => sum + (row.activeUsers || 0),
            0
          ) || 0,
        popularPages:
          realTimeData.rows?.slice(0, 5).map((row: any) => ({
            page: row.pagePath || "Unknown",
            activeUsers: row.activeUsers || 0,
          })) || [],
      },

      // AI Optimization Opportunities
      opportunities: calculateGA4Opportunities(
        overviewData,
        behaviorPagesData.rows || [],
        acquisitionData.rows || []
      ),
    };

    return res.json(aiReadyData);
  } catch (error: any) {
    return handleError(res, error, "GA4 AI Data");
  }
});

export default ga4Routes;
