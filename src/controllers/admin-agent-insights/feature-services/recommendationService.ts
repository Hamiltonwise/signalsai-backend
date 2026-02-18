/**
 * Recommendation CRUD service for admin agent insights.
 *
 * Handles filtered listing, single status updates, bulk mark-all-pass,
 * bulk delete, and clear-month-data operations.
 */

import { AgentRecommendationModel } from "../../../models/AgentRecommendationModel";
import { AgentResultModel } from "../../../models/AgentResultModel";
import { parseRecommendationJsonFields } from "../feature-utils/recommendationFormatter";
import { buildStatusUpdatePayload } from "../feature-utils/statusMapper";
import { PaginationMeta } from "../feature-utils/paginationHelper";

export interface RecommendationListResult {
  data: any[];
  pagination: PaginationMeta;
}

export interface StatusUpdateResult {
  id: string;
  status: string | null;
}

export interface MarkAllPassResult {
  agentType: string;
  updated: number;
}

export interface BulkDeleteResult {
  deleted: number;
}

export interface ClearMonthDataResult {
  deletedResults: number;
  deletedRecommendations: number;
}

/**
 * Fetch filtered, paginated recommendations for a specific agent type.
 */
export async function fetchRecommendations(
  agentType: string,
  month: string | undefined,
  source: string,
  status: string,
  page: number,
  limit: number
): Promise<RecommendationListResult> {
  const offset = (page - 1) * limit;

  // Build date range only if month is provided
  let dateRange: { startDate: string; endDateTime: string } | null = null;
  if (month) {
    const startDate = `${month}-01`;
    const endOfMonth = new Date(
      new Date(month + "-01").getFullYear(),
      new Date(month + "-01").getMonth() + 1,
      0
    );
    const endDate = endOfMonth.toISOString().split("T")[0];
    const endDateTime = `${endDate}T23:59:59.999Z`;
    dateRange = { startDate, endDateTime };
  }

  const { data, total } = await AgentRecommendationModel.findByAgentWithFilters(
    agentType,
    dateRange,
    { source, status },
    { limit, offset }
  );

  const parsedData = parseRecommendationJsonFields(data);
  const totalPages = Math.ceil(total / limit);

  return {
    data: parsedData,
    pagination: { page, limit, total, totalPages },
  };
}

/**
 * Update a single recommendation's status (PASS/REJECT/IGNORE).
 * Returns the updated id and database status value.
 */
export async function updateRecommendationStatus(
  id: string,
  status: string
): Promise<StatusUpdateResult> {
  // Check if recommendation exists
  const existing = await AgentRecommendationModel.findById(parseInt(id, 10));
  if (!existing) {
    throw Object.assign(new Error("Recommendation not found"), { statusCode: 404 });
  }

  const payload = buildStatusUpdatePayload(status);
  await AgentRecommendationModel.updateWithStatusLogic(parseInt(id, 10), payload);

  return { id, status: payload.status };
}

/**
 * Mark all REJECT recommendations as PASS for an agent type.
 * Optionally filtered by source_agent_type.
 */
export async function markAllAsPass(
  agentType: string,
  source?: string
): Promise<MarkAllPassResult> {
  const updated = await AgentRecommendationModel.markAllAsPassForAgent(
    agentType,
    source as string | undefined
  );

  return { agentType, updated };
}

/**
 * Bulk delete recommendations by an array of IDs.
 */
export async function bulkDelete(ids: number[]): Promise<BulkDeleteResult> {
  const deleted = await AgentRecommendationModel.deleteByIds(ids);
  return { deleted };
}

/**
 * Clear all Guardian/Governance data for a given month.
 * Deletes from both agent_recommendations and agent_results tables.
 */
export async function clearMonthData(
  startDate: string,
  endDate: string,
  endDateTime: string
): Promise<ClearMonthDataResult> {
  const deletedRecommendations = await AgentRecommendationModel.deleteByDateRange(
    startDate,
    endDateTime
  );

  const deletedResults = await AgentResultModel.deleteByAgentTypesAndDateRange(
    ["guardian", "governance_sentinel"],
    startDate,
    endDateTime
  );

  return { deletedResults, deletedRecommendations };
}
