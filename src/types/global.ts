export interface DomainMapping {
  domain: string;
  displayName: string;
  gsc_domainkey: string;
  ga4_propertyId: string;
  gbp_accountId?: string;
  gbp_locationId?: string | string[];
  clarity_projectId?: string;
  clarity_apiToken?: string;
  completed?: boolean;
}

// Monday.com type definitions
export interface MondayTask {
  id: string;
  name: string;
  client: string;
  content: string;
  type: "ai" | "custom";
  status: "completed" | "in_progress" | "archived_by_client" | "on_hold";
  created_at?: string;
  updated_at?: string;
  group?: {
    id: string;
    title: string;
  };
  board?: {
    id: string;
  };
}

export interface MondayColumnValue {
  id: string;
  text?: string;
  value?: string;
}

export interface MondayComment {
  id: string;
  body: string;
  created_at: string;
  creator: {
    id: string;
    name: string;
  };
}

export interface CreateTaskRequest {
  domain: string;
  content: string;
  type: "ai" | "custom";
}

export interface FetchTasksRequest {
  domain: string;
  status?: "completed" | "in_progress" | "archived_by_client" | "on_hold";
  limit?: number;
}

export interface UpdateTaskRequest {
  taskId: string;
  updates: {
    content?: string;
    type?: "ai" | "custom";
    status?: "completed" | "in_progress" | "archived_by_client" | "on_hold";
  };
}

export interface ArchiveTaskRequest {
  taskId: string;
  domain: string;
}

// =====================================================================
// NEW TASK MANAGEMENT SYSTEM TYPES
// =====================================================================

// Action Item (Task) types
export type ActionItemCategory = "ALLORO" | "USER";
export type ActionItemStatus =
  | "complete"
  | "pending"
  | "in_progress"
  | "archived";

export interface ActionItem {
  id: number;
  domain_name: string;
  google_account_id?: number;
  title: string;
  description?: string;
  category: ActionItemCategory;
  status: ActionItemStatus;
  is_approved: boolean;
  created_by_admin: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  completed_at?: Date | string;
  due_date?: Date | string;
  metadata?: any;
}

// Request/Response types for Action Items
export interface CreateActionItemRequest {
  domain_name: string;
  google_account_id?: number;
  title: string;
  description?: string;
  category: ActionItemCategory;
  is_approved?: boolean;
  due_date?: string;
  metadata?: any;
}

export interface UpdateActionItemRequest {
  id: number;
  title?: string;
  description?: string;
  status?: ActionItemStatus;
  is_approved?: boolean;
  due_date?: string;
  metadata?: any;
}

export interface FetchActionItemsRequest {
  domain_name?: string;
  google_account_id?: number;
  category?: ActionItemCategory;
  status?: ActionItemStatus;
  is_approved?: boolean;
  limit?: number;
  offset?: number;
  date_from?: string;
  date_to?: string;
}

export interface ActionItemsResponse {
  success: boolean;
  tasks: ActionItem[];
  total: number;
  message?: string;
}

export interface GroupedActionItemsResponse {
  success: boolean;
  tasks: {
    ALLORO: ActionItem[];
    USER: ActionItem[];
  };
  total: number;
  message?: string;
}

// =====================================================================
// NOTIFICATION SYSTEM TYPES
// =====================================================================

export type NotificationType = "task" | "pms" | "agent" | "system" | "ranking";

export interface Notification {
  id: number;
  google_account_id?: number;
  domain_name: string;
  title: string;
  message?: string;
  type: NotificationType;
  read: boolean;
  read_timestamp?: Date;
  metadata?: any;
  created_at: Date;
  updated_at: Date;
}

export interface CreateNotificationRequest {
  google_account_id?: number;
  domain_name: string;
  title: string;
  message?: string;
  type: NotificationType;
  metadata?: any;
}

export interface NotificationsResponse {
  success: boolean;
  notifications: Notification[];
  unreadCount: number;
  total: number;
}
