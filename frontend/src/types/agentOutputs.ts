// Agent Outputs Types (Frontend)

export type AgentOutputStatus = "success" | "pending" | "error" | "archived";

export type AgentOutputType =
  | "proofline"
  | "summary"
  | "opportunity"
  | "referral_engine"
  | "cro_optimizer"
  | "gbp_optimizer"
  | "guardian"
  | "governance_sentinel";

export interface AgentOutput {
  id: number;
  organization_id: number | null;
  agent_type: AgentOutputType;
  date_start: string;
  date_end: string;
  status: AgentOutputStatus;
  error_message?: string;
  created_at: string;
  updated_at: string;
  // Full output data (only in detail view)
  agent_input?: unknown;
  agent_output?: unknown;
}

export interface AgentOutputsResponse {
  success: boolean;
  data: AgentOutput[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AgentOutputDetailResponse {
  success: boolean;
  data: AgentOutput;
}

export interface FetchAgentOutputsRequest {
  organization_id?: number;
  location_id?: number;
  agent_type?: AgentOutputType | "all";
  status?: AgentOutputStatus | "all";
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface OrganizationsResponse {
  success: boolean;
  organizations: { id: number; name: string }[];
}

export interface AgentTypesResponse {
  success: boolean;
  agentTypes: string[];
}

export interface AgentOutputStatsResponse {
  success: boolean;
  data: {
    byStatus: Record<string, number>;
    byAgentType: Record<string, number>;
    recentCount: number;
    total: number;
  };
}

export interface ArchiveResponse {
  success: boolean;
  message: string;
  data: { id: number; status: string };
}

export interface BulkArchiveResponse {
  success: boolean;
  message: string;
  data: { archived: number };
}

export interface BulkUnarchiveResponse {
  success: boolean;
  message: string;
  data: { unarchived: number };
}

export interface DeleteResponse {
  success: boolean;
  message: string;
  data: { id: number };
}

export interface BulkDeleteResponse {
  success: boolean;
  message: string;
  data: { deleted: number };
}
