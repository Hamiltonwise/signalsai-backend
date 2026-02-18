import { TaskModel, TaskAdminFilters } from "../../../models/TaskModel";
import type { ActionItemCategory, ActionItemStatus } from "../feature-utils/taskValidation";

interface ActionItem {
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

/**
 * Parse raw query params from the admin /admin/all endpoint into clean
 * TaskAdminFilters. Handles "all" sentinel values by omitting the filter.
 */
export function parseAdminFilters(query: Record<string, any>): TaskAdminFilters {
  const filters: TaskAdminFilters = {};

  if (query.domain_name) {
    filters.domain_name = query.domain_name;
  }

  if (query.status && query.status !== "all") {
    filters.status = query.status;
  }
  // When status is omitted or "all", the model defaults to excluding archived

  if (query.category && query.category !== "all") {
    filters.category = query.category;
  }

  if (query.agent_type && query.agent_type !== "all") {
    filters.agent_type = query.agent_type;
  }

  if (query.is_approved !== undefined && query.is_approved !== "all") {
    filters.is_approved = query.is_approved === "true" || query.is_approved === true;
  }

  if (query.date_from) {
    filters.date_from = query.date_from;
  }

  if (query.date_to) {
    filters.date_to = query.date_to;
  }

  return filters;
}

/**
 * Parse pagination params from query string.
 * Defaults: limit=50, offset=0
 */
export function parsePagination(query: Record<string, any>): {
  limit: number;
  offset: number;
} {
  return {
    limit: parseInt(query.limit) || 50,
    offset: parseInt(query.offset) || 0,
  };
}

/**
 * Execute the admin task list query with filters and pagination.
 * Uses TaskModel.listAdmin() which handles both count and data queries.
 * Returns tasks and total count.
 */
export async function getAdminTasks(
  query: Record<string, any>
): Promise<{ tasks: ActionItem[]; total: number }> {
  console.log("[TASKS] Admin fetching all tasks with filters:", query);

  const filters = parseAdminFilters(query);
  const pagination = parsePagination(query);

  const result = await TaskModel.listAdmin(filters, pagination);

  console.log(
    `[TASKS] Admin fetched ${result.data.length} tasks (total: ${result.total})`
  );

  // Cast ITask[] to ActionItem[] since the shapes are compatible
  return {
    tasks: result.data as unknown as ActionItem[],
    total: result.total,
  };
}
