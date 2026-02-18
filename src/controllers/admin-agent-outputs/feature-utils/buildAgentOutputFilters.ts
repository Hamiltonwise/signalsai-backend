import { AgentResultFilters } from "../../../models/AgentResultModel";

export interface AgentOutputQueryParams {
  domain?: string;
  agent_type?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export function buildAgentOutputFilters(
  queryParams: AgentOutputQueryParams
): AgentResultFilters {
  const filters: AgentResultFilters = {};

  if (queryParams.domain) {
    filters.domain = queryParams.domain as string;
  }

  if (queryParams.agent_type && queryParams.agent_type !== "all") {
    filters.agent_type = queryParams.agent_type as string;
  }

  // Status filter logic:
  // - If a specific status is given (not "all"), filter to that status
  // - If no status or status !== "all", default to excluding archived
  if (queryParams.status && queryParams.status !== "all") {
    filters.status = queryParams.status as string;
  } else if (!queryParams.status || queryParams.status !== "all") {
    filters.exclude_status = "archived";
  }

  if (queryParams.date_from) {
    filters.date_from = new Date(queryParams.date_from as string).toISOString();
  }

  if (queryParams.date_to) {
    filters.date_to = new Date(queryParams.date_to as string).toISOString();
  }

  return filters;
}
