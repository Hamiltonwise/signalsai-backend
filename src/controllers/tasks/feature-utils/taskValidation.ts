export type ActionItemCategory = "ALLORO" | "USER";
export type ActionItemStatus =
  | "complete"
  | "pending"
  | "in_progress"
  | "archived";

export interface CreateActionItemRequest {
  organization_id: number;
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

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

const VALID_CATEGORIES: ActionItemCategory[] = ["ALLORO", "USER"];
const VALID_STATUSES: ActionItemStatus[] = ["pending", "in_progress", "complete", "archived"];

/**
 * Validate a task ID from route params
 */
export function validateTaskId(id: string): ValidationResult {
  const parsed = parseInt(id, 10);
  if (isNaN(parsed)) {
    return {
      isValid: false,
      error: "Task ID must be a valid number",
    };
  }
  return { isValid: true };
}

/**
 * Validate a task category value
 */
export function validateCategory(category: unknown): ValidationResult {
  if (!category || !VALID_CATEGORIES.includes(category as ActionItemCategory)) {
    return {
      isValid: false,
      error: "Category must be ALLORO or USER",
    };
  }
  return { isValid: true };
}

/**
 * Validate a task status value
 */
export function validateStatus(status: unknown): ValidationResult {
  if (!VALID_STATUSES.includes(status as ActionItemStatus)) {
    return {
      isValid: false,
      error: "status must be pending, in_progress, complete, or archived",
    };
  }
  return { isValid: true };
}

/**
 * Validate required fields for task creation
 */
export function validateCreateRequest(body: {
  title?: string;
  category?: string;
}): ValidationResult {
  if (!body.title || !body.category) {
    return {
      isValid: false,
      error: "title and category are required",
    };
  }

  const categoryValidation = validateCategory(body.category);
  if (!categoryValidation.isValid) {
    return categoryValidation;
  }

  return { isValid: true };
}

/**
 * Validate an array of task IDs for bulk operations
 */
export function validateBulkTaskIds(taskIds: unknown): ValidationResult {
  if (!Array.isArray(taskIds) || taskIds.length === 0) {
    return {
      isValid: false,
      error: "taskIds must be a non-empty array",
    };
  }
  return { isValid: true };
}

/**
 * Validate bulk approval request body
 */
export function validateBulkApproval(body: {
  taskIds?: unknown;
  is_approved?: unknown;
}): ValidationResult {
  const taskIdsValidation = validateBulkTaskIds(body.taskIds);
  if (!taskIdsValidation.isValid) {
    return taskIdsValidation;
  }

  if (typeof body.is_approved !== "boolean") {
    return {
      isValid: false,
      error: "is_approved must be a boolean",
    };
  }

  return { isValid: true };
}

/**
 * Validate bulk status update request body
 */
export function validateBulkStatus(body: {
  taskIds?: unknown;
  status?: unknown;
}): ValidationResult {
  const taskIdsValidation = validateBulkTaskIds(body.taskIds);
  if (!taskIdsValidation.isValid) {
    return taskIdsValidation;
  }

  const statusValidation = validateStatus(body.status);
  if (!statusValidation.isValid) {
    return statusValidation;
  }

  return { isValid: true };
}

/**
 * Validate that googleAccountId is present
 */
export function validateGoogleAccountId(
  googleAccountId: unknown
): ValidationResult {
  if (!googleAccountId) {
    return {
      isValid: false,
      error: "googleAccountId is required",
    };
  }
  return { isValid: true };
}
