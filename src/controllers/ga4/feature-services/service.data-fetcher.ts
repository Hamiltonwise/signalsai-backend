/**
 * GA4 Data Fetcher Service
 *
 * Orchestrates data fetching for GA4 endpoints.
 * Delegates to service.analytics-api.ts for actual API calls.
 * Delegates to service.data-processor.ts for data transformations.
 * Handles Promise.all orchestration for parallel fetches.
 *
 * NOTE: Uses Promise.all (fail-fast). If any API call fails, the entire
 * operation fails. TODO: Consider Promise.allSettled for partial data return.
 */

import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import {
  fetchReport,
  fetchReportWithDimensions,
} from "./service.analytics-api";
import { getDateRanges } from "../feature-utils/util.date-ranges";
import { formatPropertyId } from "../feature-utils/util.property-formatter";
import {
  processAcquisitionData,
  processAudienceData,
  processBehaviorData,
} from "./service.data-processor";
import { detectOpportunities } from "./service.opportunity-detector";

/**
 * Fetches key metrics for two months and returns raw data for trend calculation.
 * Used by POST /getKeyData endpoint.
 *
 * @param oauth2Client - Authenticated OAuth2 client (from req.oauth2Client)
 * @param propertyId - Raw property ID (will be formatted)
 * @returns Current and previous month metric data
 */
export const fetchKeyMetrics = async (
  analyticsdata: any,
  formattedPropertyId: string
): Promise<{
  currentMonthData: { activeUsers: number; engagementRate: number; conversions: number };
  previousMonthData: { activeUsers: number; engagementRate: number; conversions: number };
}> => {
  const dateRanges = getDateRanges();

  const [currentMonthData, previousMonthData] = await Promise.all([
    fetchReport(
      analyticsdata,
      formattedPropertyId,
      dateRanges.currentMonth.startDate,
      dateRanges.currentMonth.endDate
    ),
    fetchReport(
      analyticsdata,
      formattedPropertyId,
      dateRanges.previousMonth.startDate,
      dateRanges.previousMonth.endDate
    ),
  ]);

  return { currentMonthData, previousMonthData };
};

/**
 * Fetches comprehensive GA4 data for AI-ready export.
 * Orchestrates 8 parallel API calls, processes results, and detects opportunities.
 * Used by POST /getAIReadyData endpoint and the exported getGA4AIReadyData() function.
 *
 * @param oauth2Client - Authenticated OAuth2 client
 * @param propertyId - Raw property ID (will be formatted)
 * @param startDate - Optional start date (defaults to current reporting month)
 * @param endDate - Optional end date (defaults to current reporting month)
 * @returns Fully structured AI-ready data object
 */
export const fetchComprehensiveData = async (
  oauth2Client: OAuth2Client | any,
  propertyId: string,
  startDate?: string,
  endDate?: string
): Promise<any> => {
  const formattedPropertyId = formatPropertyId(propertyId);

  console.log(`[GA4 Core] Starting data fetch`);
  console.log(`  - Property ID: ${formattedPropertyId}`);
  console.log(`  - Start Date: ${startDate || "using default"}`);
  console.log(`  - End Date: ${endDate || "using default"}`);

  const analyticsdata = google.analyticsdata({
    version: "v1beta",
    auth: oauth2Client,
  });

  const dateRanges = getDateRanges();
  const finalStartDate = startDate || dateRanges.currentMonth.startDate;
  const finalEndDate = endDate || dateRanges.currentMonth.endDate;

  console.log(
    `[GA4 Core] Final date range: ${finalStartDate} to ${finalEndDate}`
  );

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
  const audienceMetrics = ["totalUsers", "sessions", "engagementRate"];

  // Parallel fetch all data types
  console.log(
    `[GA4 Core] Starting parallel data fetch for ${finalStartDate} to ${finalEndDate}`
  );

  const [
    overviewData,
    acquisitionData,
    audienceGeoData,
    audienceDeviceData,
    behaviorPagesData,
    behaviorEventsData,
    leadSubmitData,
    leadSubmitBySourceData,
  ] = await Promise.all([
    // 1. Traffic Overview
    fetchReportWithDimensions(
      analyticsdata,
      formattedPropertyId,
      finalStartDate,
      finalEndDate,
      overviewMetrics
    ),

    // 2. Acquisition Data - by source/medium
    fetchReportWithDimensions(
      analyticsdata,
      formattedPropertyId,
      finalStartDate,
      finalEndDate,
      acquisitionMetrics,
      ["sessionSource", "sessionMedium"],
      20
    ),

    // 3. Audience Insights - Geographic
    fetchReportWithDimensions(
      analyticsdata,
      formattedPropertyId,
      finalStartDate,
      finalEndDate,
      audienceMetrics,
      ["country"],
      15
    ),

    // 3. Audience Insights - Technology
    fetchReportWithDimensions(
      analyticsdata,
      formattedPropertyId,
      finalStartDate,
      finalEndDate,
      audienceMetrics,
      ["deviceCategory"]
    ),

    // 4. Behavior Data - Pages
    fetchReportWithDimensions(
      analyticsdata,
      formattedPropertyId,
      finalStartDate,
      finalEndDate,
      behaviorMetrics,
      ["pagePath"],
      25
    ),

    // 4. Behavior Data - Events
    fetchReportWithDimensions(
      analyticsdata,
      formattedPropertyId,
      finalStartDate,
      finalEndDate,
      ["eventCount", "totalUsers"],
      ["eventName"],
      20
    ),

    // 5. Lead Submit Event Count - Total
    fetchReportWithDimensions(
      analyticsdata,
      formattedPropertyId,
      finalStartDate,
      finalEndDate,
      ["eventCount"],
      ["eventName"],
      1000
    )
      .then((response) => {
        const leadSubmitRow = response.rows?.find(
          (row: any) => row.eventName === "lead_submit"
        );
        return leadSubmitRow?.eventCount || 0;
      })
      .catch(() => 0),

    // 6. Lead Submit Event Count - by Source/Medium
    fetchReportWithDimensions(
      analyticsdata,
      formattedPropertyId,
      finalStartDate,
      finalEndDate,
      ["eventCount"],
      ["sessionSource", "sessionMedium", "eventName"],
      100
    )
      .then((response) => {
        return {
          rows:
            response.rows?.filter(
              (row: any) => row.eventName === "lead_submit"
            ) || [],
        };
      })
      .catch(() => ({ rows: [] })),
  ]).catch((error) => {
    console.error(
      `[GA4 Core] CRITICAL: Promise.all failed: ${error.message}`
    );
    console.error(`[GA4 Core] Error details:`, error);
    throw error;
  });

  console.log(
    `[GA4 Core] All parallel data fetches completed successfully`
  );

  // Process and structure data for AI
  const aiReadyData = {
    // 1. Traffic Overview
    overview: {
      sessions: overviewData.sessions || 0,
      users: overviewData.totalUsers || 0,
      pageviews: overviewData.screenPageViews || 0,
      engagementRate: overviewData.engagementRate || 0,
      avgSessionDuration: overviewData.averageSessionDuration || 0,
      bounceRate: overviewData.bounceRate || 0,
      leadSubmissions: leadSubmitData || 0,
      dateRange: { startDate: finalStartDate, endDate: finalEndDate },
    },

    // 2. Acquisition Data
    acquisition: processAcquisitionData(
      acquisitionData.rows || [],
      leadSubmitBySourceData.rows || []
    ),

    // 3. Audience Insights
    audience: processAudienceData(
      audienceGeoData.rows || [],
      audienceDeviceData.rows || []
    ),

    // 4. Behavior Data
    behavior: processBehaviorData(
      behaviorPagesData.rows || [],
      behaviorEventsData.rows || []
    ),

    // 5. E-commerce Data (Removed - incompatible metrics)
    ecommerce: {
      revenue: {
        total: 0,
        transactions: 0,
        avgOrderValue: 0,
      },
      products: [],
    },

    // 6. Real-time Data (Removed - invalid date format)
    realTime: {
      activeUsers: 0,
      popularPages: [],
    },

    // AI Optimization Opportunities
    opportunities: detectOpportunities(
      overviewData,
      behaviorPagesData.rows || [],
      acquisitionData.rows || []
    ),
  };

  return aiReadyData;
};
