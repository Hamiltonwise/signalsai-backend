import express from "express";
import { google } from "googleapis";
import { createGSCAuth } from "../auth/oauth2Helper";

const gscRoutes = express.Router();

// Reusable authentication helper using OAuth2
const createGoogleAuth = () => {
  return createGSCAuth();
};

// Reusable search console client helper
const createSearchConsoleClient = () => {
  const auth = createGoogleAuth();
  return google.searchconsole({ version: "v1", auth });
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

// Helper function to get date ranges
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

// Helper function to fetch GSC data for a date range
const fetchGSCData = async (
  searchconsole: any,
  domainProperty: string,
  startDate: string,
  endDate: string,
  dimensions: string[] = [],
  rowLimit: number = 1000
) => {
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

// Helper function to process device data
const processDeviceData = (deviceRows: any[]) => {
  if (!deviceRows) return {};

  const deviceData: any = {};
  deviceRows.forEach((row) => {
    deviceData[row.keys[0]] = {
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    };
  });
  return deviceData;
};

// Helper function to calculate opportunities
const calculateOpportunities = (queryRows: any[], pageRows: any[]) => {
  const opportunities = [];

  // High impression, low CTR queries (opportunity to improve)
  const lowCtrQueries =
    queryRows
      ?.filter((query) => query.impressions > 100 && query.ctr < 0.02)
      ?.slice(0, 5)
      ?.map((query) => ({
        type: "low_ctr_query",
        query: query.keys[0],
        impressions: query.impressions,
        ctr: query.ctr,
        position: query.position,
      })) || [];

  // Pages ranking 4-10 (opportunity to reach top 3)
  const rankingOpportunities =
    pageRows
      ?.filter(
        (page) => page.position >= 4 && page.position <= 10 && page.clicks > 10
      )
      ?.slice(0, 5)
      ?.map((page) => ({
        type: "ranking_opportunity",
        page: page.keys[0],
        position: page.position,
        clicks: page.clicks,
        impressions: page.impressions,
      })) || [];

  return [...lowCtrQueries, ...rankingOpportunities];
};

// Trend score calculation function
const calculateTrendScore = (currentData: any, previousData: any) => {
  const impressionsChange =
    previousData.impressions === 0
      ? 0
      : ((currentData.impressions - previousData.impressions) /
          previousData.impressions) *
        100;

  const clicksChange =
    previousData.clicks === 0
      ? 0
      : ((currentData.clicks - previousData.clicks) / previousData.clicks) *
        100;

  // For avgPosition, lower is better, so we invert the calculation
  const positionChange =
    previousData.avgPosition === 0
      ? 0
      : ((previousData.avgPosition - currentData.avgPosition) /
          previousData.avgPosition) *
        100;

  // Weight the metrics: clicks (40%), impressions (35%), position (25%)
  const trendScore =
    clicksChange * 0.4 + impressionsChange * 0.35 + positionChange * 0.25;

  return Math.round(trendScore * 100) / 100; // Round to 2 decimal places
};

gscRoutes.post("/getKeyData", async (req, res) => {
  try {
    const domainProperty = req.body.domainProperty;

    if (!domainProperty) {
      return res.json({
        successful: false,
        message: "No domain property included",
      });
    }

    const searchconsole = createSearchConsoleClient();
    const dateRanges = getDateRanges();

    // Fetch data for both months
    const [currentMonthData, previousMonthData] = await Promise.all([
      fetchGSCData(
        searchconsole,
        domainProperty,
        dateRanges.currentMonth.startDate,
        dateRanges.currentMonth.endDate
      ),
      fetchGSCData(
        searchconsole,
        domainProperty,
        dateRanges.previousMonth.startDate,
        dateRanges.previousMonth.endDate
      ),
    ]);

    // Calculate trend score
    const trendScore = calculateTrendScore(currentMonthData, previousMonthData);

    return res.json({
      impressions: {
        prevMonth: previousMonthData.impressions,
        currMonth: currentMonthData.impressions,
      },
      avgPosition: {
        prevMonth: previousMonthData.avgPosition,
        currMonth: currentMonthData.avgPosition,
      },
      clicks: {
        prevMonth: previousMonthData.clicks,
        currMonth: currentMonthData.clicks,
      },
      trendScore,
    });
  } catch (error: any) {
    return handleError(res, error, "GSC API");
  }
});

gscRoutes.post("/getAIReadyData", async (req, res) => {
  try {
    const domainProperty = req.body.domainProperty;

    if (!domainProperty) {
      return res.json({
        successful: false,
        message: "No domain property included",
      });
    }

    const searchconsole = createSearchConsoleClient();
    const dateRanges = getDateRanges();
    const { startDate, endDate } = dateRanges.currentMonth;

    // Parallel fetch all data types
    const [overviewData, queryData, pageData, deviceData, geoData] =
      await Promise.all([
        fetchGSCData(searchconsole, domainProperty, startDate, endDate), // Overview
        fetchGSCData(
          searchconsole,
          domainProperty,
          startDate,
          endDate,
          ["query"],
          25
        ),
        fetchGSCData(
          searchconsole,
          domainProperty,
          startDate,
          endDate,
          ["page"],
          50
        ),
        fetchGSCData(searchconsole, domainProperty, startDate, endDate, [
          "device",
        ]),
        fetchGSCData(
          searchconsole,
          domainProperty,
          startDate,
          endDate,
          ["country"],
          10
        ),
      ]);

    // Process and structure for AI
    const aiReadyData = {
      overview: {
        totalClicks: overviewData.clicks,
        totalImpressions: overviewData.impressions,
        avgCTR: overviewData.clicks / (overviewData.impressions || 1),
        avgPosition: overviewData.avgPosition,
        dateRange: { startDate, endDate },
      },
      topQueries: queryData.rows || [],
      underperformingPages:
        pageData.rows?.filter((page: any) => page.position > 10) || [],
      deviceBreakdown: processDeviceData(deviceData.rows),
      geoPerformance: geoData.rows || [],
      opportunities: calculateOpportunities(queryData.rows, pageData.rows),
    };

    return res.json(aiReadyData);
  } catch (error: any) {
    return handleError(res, error, "GSC AI Data");
  }
});

// Diagnosis routes
gscRoutes.get("/diag/sites", async (req, res) => {
  try {
    const searchconsole = createSearchConsoleClient();
    const { data } = await searchconsole.sites.list({});

    // data.siteEntry: [{ siteUrl, permissionLevel }, ...]
    return res.json({
      sites: (data.siteEntry || []).map((s) => ({
        siteUrl: s.siteUrl,
        permissionLevel: s.permissionLevel,
      })),
    });
  } catch (err: any) {
    return handleError(res, err, "List sites");
  }
});

gscRoutes.get("/sites/get", async (req, res) => {
  try {
    const searchconsole = createSearchConsoleClient();
    const { data } = await searchconsole.sites.list({});

    // Extract just the siteUrl values as an array of strings
    const sites = (data.siteEntry || []).map((s) => s.siteUrl).filter(Boolean);

    return res.json(sites);
  } catch (err: any) {
    return handleError(res, err, "Get available sites");
  }
});

export default gscRoutes;
