// Task Management System Types (Frontend)

export type ActionItemCategory = "ALLORO" | "USER";
export type ActionItemStatus =
  | "complete"
  | "pending"
  | "in_progress"
  | "archived";

export type AgentType =
  | "GBP_OPTIMIZATION"
  | "OPPORTUNITY"
  | "CRO_OPTIMIZER"
  | "REFERRAL_ENGINE_ANALYSIS"
  | "RANKING"
  | "MANUAL";

export interface ActionItem {
  id: number;
  organization_id?: number;
  location_name?: string | null;
  title: string;
  description?: string;
  category: ActionItemCategory;
  status: ActionItemStatus;
  is_approved: boolean;
  created_by_admin: boolean;
  agent_type?: AgentType | null;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  due_date?: string;
  metadata?: unknown;
}

export interface GroupedActionItems {
  ALLORO: ActionItem[];
  USER: ActionItem[];
}

export interface GroupedActionItemsResponse {
  success: boolean;
  tasks: GroupedActionItems;
  total: number;
  message?: string;
}

export interface ActionItemsResponse {
  success: boolean;
  tasks: ActionItem[];
  total: number;
  message?: string;
}

export interface CreateActionItemRequest {
  organization_id: number;
  title: string;
  description?: string;
  category: ActionItemCategory;
  is_approved?: boolean;
  due_date?: string;
  metadata?: unknown;
}

export interface UpdateActionItemRequest {
  id: number;
  title?: string;
  description?: string;
  status?: ActionItemStatus;
  is_approved?: boolean;
  due_date?: string;
  metadata?: unknown;
}

export interface FetchActionItemsRequest {
  organization_id?: number;
  location_id?: number;
  category?: ActionItemCategory;
  status?: ActionItemStatus;
  is_approved?: boolean;
  agent_type?: AgentType;
  limit?: number;
  offset?: number;
  date_from?: string;
  date_to?: string;
}

