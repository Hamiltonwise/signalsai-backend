import type { ITask } from "../../../models/TaskModel";
import type { ActionItemCategory, ActionItemStatus } from "./taskValidation";

interface ActionItem {
  id: number;
  organization_id?: number;
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

interface ActionItemsResponse {
  success: boolean;
  tasks: ActionItem[];
  total: number;
  message?: string;
}

interface GroupedActionItemsResponse {
  success: boolean;
  tasks: {
    ALLORO: ActionItem[];
    USER: ActionItem[];
  };
  total: number;
  message?: string;
}

/**
 * Group tasks by category (ALLORO, USER) and format as GroupedActionItemsResponse.
 * Preserves exact response shape from the client GET / endpoint.
 * Accepts ITask[] from the model layer and casts to ActionItem[] for the response.
 */
export function formatGroupedTasks(tasks: ITask[]): GroupedActionItemsResponse {
  // Cast is safe: ITask and ActionItem are structurally compatible at runtime.
  // The only difference is null vs undefined for optional fields, which JSON
  // serialization handles identically (both become absent or null in JSON).
  const actionItems = tasks as unknown as ActionItem[];

  const alloroTasks = actionItems.filter(
    (t: ActionItem) => t.category === "ALLORO"
  );
  const userTasks = actionItems.filter(
    (t: ActionItem) => t.category === "USER"
  );

  return {
    success: true,
    tasks: {
      ALLORO: alloroTasks,
      USER: userTasks,
    },
    total: tasks.length,
  };
}

/**
 * Format paginated admin task list response.
 * Preserves exact response shape from the admin GET /admin/all endpoint.
 * Accepts ActionItem[] (already cast by the filtering service).
 */
export function formatTasksResponse(
  tasks: ActionItem[],
  total: number
): ActionItemsResponse {
  return {
    success: true,
    tasks,
    total,
  };
}

/**
 * Standard error response for task routes.
 * Preserves the handleError() response shape from the original route.
 */
export function formatErrorResponse(
  error: string,
  message: string,
  timestamp?: string
): { success: false; error: string; message: string; timestamp: string } {
  return {
    success: false,
    error,
    message,
    timestamp: timestamp || new Date().toISOString(),
  };
}
