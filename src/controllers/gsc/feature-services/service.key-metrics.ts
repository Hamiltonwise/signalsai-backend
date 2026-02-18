/**
 * GSC Key Metrics Service
 * Orchestrates fetching and comparing current vs previous month GSC data.
 */

import { getDateRanges } from "../feature-utils/util.date-ranges";
import { calculateTrendScore } from "../feature-utils/util.trend-score";
import {
  createSearchConsoleClient,
  fetchGSCData,
} from "./service.search-console-api";

/**
 * Fetches key metrics (impressions, avgPosition, clicks) for current and previous month,
 * then calculates a weighted trend score.
 *
 * @param oauth2Client - Authenticated OAuth2 client
 * @param domainProperty - The site URL (e.g., "sc-domain:example.com")
 * @returns Comparison object with current/previous month metrics and trend score
 */
export const getKeyMetrics = async (
  oauth2Client: any,
  domainProperty: string
) => {
  const searchconsole = createSearchConsoleClient(oauth2Client);
  const dateRanges = getDateRanges();

  // Fetch data for both months in parallel
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
  ]) as [any, any];

  // Calculate trend score
  const trendScore = calculateTrendScore(currentMonthData, previousMonthData);

  return {
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
  };
};
