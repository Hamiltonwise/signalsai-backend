export interface DomainMapping {
  domain: string;
  displayName: string;
  gsc_domainkey: string;
  ga4_propertyId: string;
  gbp_accountId?: string;
  gbp_locationId?: string;
  clarity_projectId?: string;
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
