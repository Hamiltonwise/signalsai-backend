import { AgentResultModel, IAgentResult } from "../../../models/AgentResultModel";
import { buildAgentOutputFilters, AgentOutputQueryParams } from "../feature-utils/buildAgentOutputFilters";

export interface ListAgentOutputsParams extends AgentOutputQueryParams {
  page?: string;
  limit?: string;
}

export interface ListAgentOutputsResult {
  data: IAgentResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/** Columns selected for the list view (excludes heavy JSON fields) */
const LIST_COLUMNS = [
  "id",
  "google_account_id",
  "domain",
  "agent_type",
  "date_start",
  "date_end",
  "status",
  "error_message",
  "created_at",
  "updated_at",
];

export async function list(
  params: ListAgentOutputsParams
): Promise<ListAgentOutputsResult> {
  const page = parseInt(params.page || "1", 10);
  const limit = parseInt(params.limit || "50", 10);
  const offset = (page - 1) * limit;

  const filters = buildAgentOutputFilters(params);

  const result = await AgentResultModel.listAdmin(
    filters,
    { limit, offset },
    undefined,
    LIST_COLUMNS
  );

  const totalPages = Math.ceil(result.total / limit);

  return {
    data: result.data,
    pagination: {
      page,
      limit,
      total: result.total,
      totalPages,
    },
  };
}
