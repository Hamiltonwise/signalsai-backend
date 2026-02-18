/**
 * Summary service for admin agent insights.
 *
 * Handles the summary aggregation logic: fetching summary data from
 * the model, formatting rows, and applying in-memory pagination.
 */

import { AgentRecommendationModel } from "../../../models/AgentRecommendationModel";
import { formatSummaryRow, FormattedSummaryRow } from "../feature-utils/recommendationFormatter";
import { PaginationMeta } from "../feature-utils/paginationHelper";

export interface SummaryResult {
  data: FormattedSummaryRow[];
  pagination: PaginationMeta;
  period: { startDate: string; endDate: string };
  message?: string;
}

/**
 * Fetch summary statistics for all agent types within a date range.
 *
 * Queries the model for aggregated counts, formats each row, and
 * applies in-memory pagination (the original behavior paginates
 * after fetching all agent types).
 */
export async function fetchSummary(
  startDate: string,
  endDate: string,
  endDateTime: string,
  page: number,
  limit: number
): Promise<SummaryResult> {
  const offset = (page - 1) * limit;

  const summaryData = await AgentRecommendationModel.getSummaryWithCounts(
    startDate,
    endDateTime
  );

  if (summaryData.length === 0) {
    return {
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
      period: { startDate, endDate },
      message: "No recommendations found for this period",
    };
  }

  const allSummary = summaryData.map(formatSummaryRow);

  const total = allSummary.length;
  const totalPages = Math.ceil(total / limit);
  const paginatedData = allSummary.slice(offset, offset + limit);

  return {
    data: paginatedData,
    pagination: { page, limit, total, totalPages },
    period: { startDate, endDate },
  };
}
