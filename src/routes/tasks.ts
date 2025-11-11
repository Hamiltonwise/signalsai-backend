import express, { Request, Response } from "express";
import { db } from "../database/connection";
import { createNotification } from "../utils/notificationHelper";
import type {
  ActionItem,
  ActionItemCategory,
  ActionItemStatus,
  CreateActionItemRequest,
  UpdateActionItemRequest,
  FetchActionItemsRequest,
  ActionItemsResponse,
  GroupedActionItemsResponse,
} from "../types/global";

const router = express.Router();

// =====================================================================
// HELPER FUNCTIONS
// =====================================================================

/**
 * Get domain name from google account ID
 */
async function getDomainFromAccountId(
  googleAccountId: number
): Promise<string | null> {
  try {
    const account = await db("google_accounts")
      .where({ id: googleAccountId })
      .first();
    return account?.domain_name || null;
  } catch (error) {
    console.error("Error fetching domain from account ID:", error);
    return null;
  }
}

/**
 * Validate that a task belongs to a specific domain
 */
async function validateTaskOwnership(
  taskId: number,
  domain: string
): Promise<boolean> {
  try {
    const task = await db("tasks")
      .where({ id: taskId, domain_name: domain })
      .first();
    return !!task;
  } catch (error) {
    console.error("Error validating task ownership:", error);
    return false;
  }
}

/**
 * Error handler for routes
 */
function handleError(res: Response, error: any, operation: string): Response {
  console.error(`[TASKS] ${operation} Error:`, error?.message || error);
  return res.status(500).json({
    success: false,
    error: `Failed to ${operation.toLowerCase()}`,
    message: error?.message || "Unknown error occurred",
    timestamp: new Date().toISOString(),
  });
}

// =====================================================================
// CLIENT ENDPOINTS (Domain-Filtered)
// =====================================================================

/**
 * GET /api/tasks
 * Fetch tasks for logged-in client (grouped by category)
 * Query params: googleAccountId (required)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const googleAccountId =
      req.query.googleAccountId || req.headers["x-google-account-id"];

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        message: "googleAccountId is required",
      });
    }

    // Get domain from account ID
    const domain = await getDomainFromAccountId(Number(googleAccountId));
    if (!domain) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
        message: "Google account not found or has no domain",
      });
    }

    console.log(`[TASKS] Fetching tasks for domain: ${domain}`);

    // Fetch approved tasks for this domain (exclude archived)
    const tasks = await db("tasks")
      .where({
        domain_name: domain,
        is_approved: true,
      })
      .whereNot("status", "archived")
      .orderBy("created_at", "desc")
      .select("*");

    // Group by category
    const alloroTasks = tasks.filter(
      (t: ActionItem) => t.category === "ALLORO"
    );
    const userTasks = tasks.filter((t: ActionItem) => t.category === "USER");

    const response: GroupedActionItemsResponse = {
      success: true,
      tasks: {
        ALLORO: alloroTasks,
        USER: userTasks,
      },
      total: tasks.length,
    };

    console.log(
      `[TASKS] Fetched ${alloroTasks.length} ALLORO tasks and ${userTasks.length} USER tasks for ${domain}`
    );

    return res.json(response);
  } catch (error: any) {
    return handleError(res, error, "Fetch tasks");
  }
});

/**
 * PATCH /api/tasks/:id/complete
 * Mark a USER category task as complete (clients only)
 * Body: { googleAccountId: number }
 */
router.patch("/:id/complete", async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { googleAccountId } = req.body;

    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
        message: "Task ID must be a valid number",
      });
    }

    if (!googleAccountId) {
      return res.status(400).json({
        success: false,
        error: "Missing google account ID",
        message: "googleAccountId is required",
      });
    }

    // Get domain from account ID
    const domain = await getDomainFromAccountId(googleAccountId);
    if (!domain) {
      return res.status(404).json({
        success: false,
        error: "Account not found",
        message: "Google account not found",
      });
    }

    // Fetch the task
    const task = await db("tasks").where({ id: taskId }).first();

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
        message: "Task does not exist",
      });
    }

    // Validate ownership
    if (task.domain_name !== domain) {
      return res.status(403).json({
        success: false,
        error: "Access denied",
        message: "Task does not belong to your domain",
      });
    }

    // Only USER category tasks can be completed by clients
    if (task.category !== "USER") {
      return res.status(403).json({
        success: false,
        error: "Cannot complete task",
        message: "Only USER category tasks can be marked complete by clients",
      });
    }

    // Update task
    await db("tasks").where({ id: taskId }).update({
      status: "complete",
      completed_at: new Date(),
      updated_at: new Date(),
    });

    const updatedTask = await db("tasks").where({ id: taskId }).first();

    console.log(`[TASKS] Task ${taskId} marked complete for domain ${domain}`);

    return res.json({
      success: true,
      task: updatedTask,
      message: "Task marked as complete",
    });
  } catch (error: any) {
    return handleError(res, error, "Mark task complete");
  }
});

// =====================================================================
// ADMIN ENDPOINTS (Unrestricted Access)
// =====================================================================

/**
 * POST /api/tasks
 * Create a new task (admin only)
 * Body: CreateActionItemRequest
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      domain_name,
      google_account_id,
      title,
      description,
      category,
      is_approved = false,
      due_date,
      metadata,
    }: CreateActionItemRequest = req.body;

    // Validation
    if (!domain_name || !title || !category) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields",
        message: "domain_name, title, and category are required",
      });
    }

    if (!["ALLORO", "USER"].includes(category)) {
      return res.status(400).json({
        success: false,
        error: "Invalid category",
        message: "Category must be ALLORO or USER",
      });
    }

    // Verify domain exists
    const account = await db("google_accounts").where({ domain_name }).first();

    if (!account) {
      return res.status(404).json({
        success: false,
        error: "Domain not found",
        message: `No account found for domain: ${domain_name}`,
      });
    }

    // Create task
    const taskData = {
      domain_name,
      google_account_id: google_account_id || account.id,
      title,
      description: description || null,
      category,
      status: "pending" as ActionItemStatus,
      is_approved,
      created_by_admin: true,
      due_date: due_date ? new Date(due_date) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const [result] = await db("tasks").insert(taskData).returning("id");
    const taskId = result.id;
    const createdTask = await db("tasks").where({ id: taskId }).first();

    console.log(`[TASKS] Created task ${taskId} for domain ${domain_name}`);

    return res.status(201).json({
      success: true,
      task: createdTask,
      message: "Task created successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Create task");
  }
});

/**
 * GET /api/tasks/admin/all
 * Fetch all tasks with filtering (admin dashboard)
 * Query params: domain_name, status, category, is_approved, date_from, date_to, limit, offset
 */
router.get("/admin/all", async (req: Request, res: Response) => {
  try {
    const {
      domain_name,
      status,
      category,
      agent_type,
      is_approved,
      date_from,
      date_to,
      limit = "50",
      offset = "0",
    }: any = req.query;

    console.log("[TASKS] Admin fetching all tasks with filters:", req.query);

    // Build count query
    let countQuery = db("tasks");

    // Apply filters to count query
    if (domain_name) {
      countQuery = countQuery.where("tasks.domain_name", domain_name);
    }

    if (status && status !== "all") {
      countQuery = countQuery.where("tasks.status", status);
    } else {
      // Default: exclude archived
      countQuery = countQuery.whereNot("tasks.status", "archived");
    }

    if (category && category !== "all") {
      countQuery = countQuery.where("tasks.category", category);
    }

    if (agent_type && agent_type !== "all") {
      countQuery = countQuery.where("tasks.agent_type", agent_type);
    }

    if (is_approved !== undefined && is_approved !== "all") {
      const approvedValue = is_approved === "true" || is_approved === true;
      countQuery = countQuery.where("tasks.is_approved", approvedValue);
    }

    if (date_from) {
      countQuery = countQuery.where(
        "tasks.created_at",
        ">=",
        new Date(date_from)
      );
    }

    if (date_to) {
      countQuery = countQuery.where(
        "tasks.created_at",
        "<=",
        new Date(date_to)
      );
    }

    // Execute count query
    const [{ count }] = await countQuery.count("* as count");

    // Build data query separately
    let dataQuery = db("tasks").select("tasks.*");

    // Apply same filters to data query
    if (domain_name) {
      dataQuery = dataQuery.where("tasks.domain_name", domain_name);
    }

    if (status && status !== "all") {
      dataQuery = dataQuery.where("tasks.status", status);
    } else {
      // Default: exclude archived
      dataQuery = dataQuery.whereNot("tasks.status", "archived");
    }

    if (category && category !== "all") {
      dataQuery = dataQuery.where("tasks.category", category);
    }

    if (agent_type && agent_type !== "all") {
      dataQuery = dataQuery.where("tasks.agent_type", agent_type);
    }

    if (is_approved !== undefined && is_approved !== "all") {
      const approvedValue = is_approved === "true" || is_approved === true;
      dataQuery = dataQuery.where("tasks.is_approved", approvedValue);
    }

    if (date_from) {
      dataQuery = dataQuery.where(
        "tasks.created_at",
        ">=",
        new Date(date_from)
      );
    }

    if (date_to) {
      dataQuery = dataQuery.where("tasks.created_at", "<=", new Date(date_to));
    }

    // Execute data query with pagination
    const tasks = await dataQuery
      .orderBy("tasks.created_at", "desc")
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    console.log(
      `[TASKS] Admin fetched ${tasks.length} tasks (total: ${count})`
    );

    const response: ActionItemsResponse = {
      success: true,
      tasks,
      total: parseInt(count as string),
    };

    return res.json(response);
  } catch (error: any) {
    return handleError(res, error, "Fetch all tasks (admin)");
  }
});

/**
 * PATCH /api/tasks/:id
 * Update a task (admin only)
 * Body: UpdateActionItemRequest
 */
router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const updates: UpdateActionItemRequest = req.body;

    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
        message: "Task ID must be a valid number",
      });
    }

    // Check if task exists
    const task = await db("tasks").where({ id: taskId }).first();

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
        message: "Task does not exist",
      });
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date(),
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.status !== undefined) {
      updateData.status = updates.status;
      // Set completed_at if status is complete
      if (updates.status === "complete" && !task.completed_at) {
        updateData.completed_at = new Date();
      }
    }
    if (updates.is_approved !== undefined)
      updateData.is_approved = updates.is_approved;
    if (updates.due_date !== undefined)
      updateData.due_date = updates.due_date
        ? new Date(updates.due_date)
        : null;
    if (updates.metadata !== undefined)
      updateData.metadata = JSON.stringify(updates.metadata);

    // Track if approval status is changing to true for USER tasks
    const isApprovingUserTask =
      updates.is_approved === true &&
      task.is_approved === false &&
      task.category === "USER";

    // Update task
    await db("tasks").where({ id: taskId }).update(updateData);

    const updatedTask = await db("tasks").where({ id: taskId }).first();

    // Create notification if USER task was just approved
    if (isApprovingUserTask && task.domain_name) {
      try {
        await createNotification(
          task.domain_name,
          "New Task Approved",
          "A new opportunity awaits your action! Visit the tasks tab to see more",
          "task",
          { taskId, taskTitle: task.title }
        );
        console.log(
          `[TASKS] Created notification for approved USER task ${taskId}`
        );
      } catch (notificationError: any) {
        console.error(
          `[TASKS] Failed to create notification: ${notificationError.message}`
        );
        // Don't fail the update if notification creation fails
      }
    }

    console.log(`[TASKS] Updated task ${taskId}`);

    return res.json({
      success: true,
      task: updatedTask,
      message: "Task updated successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Update task");
  }
});

/**
 * PATCH /api/tasks/:id/category
 * Update task category (admin only)
 * Body: { category: "ALLORO" | "USER" }
 */
router.patch("/:id/category", async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const { category } = req.body;

    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
        message: "Task ID must be a valid number",
      });
    }

    if (!category || !["ALLORO", "USER"].includes(category)) {
      return res.status(400).json({
        success: false,
        error: "Invalid category",
        message: "Category must be ALLORO or USER",
      });
    }

    // Check if task exists
    const task = await db("tasks").where({ id: taskId }).first();

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
        message: "Task does not exist",
      });
    }

    // Update category
    await db("tasks").where({ id: taskId }).update({
      category,
      updated_at: new Date(),
    });

    const updatedTask = await db("tasks").where({ id: taskId }).first();

    console.log(`[TASKS] Updated task ${taskId} category to ${category}`);

    return res.json({
      success: true,
      task: updatedTask,
      message: `Task category updated to ${category} successfully`,
    });
  } catch (error: any) {
    return handleError(res, error, "Update task category");
  }
});

/**
 * DELETE /api/tasks/:id
 * Archive a task (soft delete)
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const taskId = parseInt(req.params.id, 10);

    if (isNaN(taskId)) {
      return res.status(400).json({
        success: false,
        error: "Invalid task ID",
        message: "Task ID must be a valid number",
      });
    }

    // Check if task exists
    const task = await db("tasks").where({ id: taskId }).first();

    if (!task) {
      return res.status(404).json({
        success: false,
        error: "Task not found",
        message: "Task does not exist",
      });
    }

    // Archive the task (soft delete)
    await db("tasks").where({ id: taskId }).update({
      status: "archived",
      updated_at: new Date(),
    });

    console.log(`[TASKS] Archived task ${taskId}`);

    return res.json({
      success: true,
      message: "Task archived successfully",
    });
  } catch (error: any) {
    return handleError(res, error, "Archive task");
  }
});

/**
 * GET /api/tasks/clients
 * Get list of available clients for task creation dropdown
 */
router.get("/clients", async (req: Request, res: Response) => {
  try {
    console.log("[TASKS] Fetching available clients");

    // Fetch onboarded accounts (following pattern from agentsV2.ts)
    const accounts = await db("google_accounts")
      .where("onboarding_completed", true)
      .select("id", "domain_name", "email")
      .orderBy("domain_name", "asc");

    console.log(`[TASKS] Found ${accounts.length} onboarded clients`);

    return res.json({
      success: true,
      clients: accounts,
      total: accounts.length,
    });
  } catch (error: any) {
    return handleError(res, error, "Fetch clients");
  }
});

/**
 * POST /api/tasks/bulk/delete
 * Bulk archive tasks
 * Body: { taskIds: number[] }
 */
router.post("/bulk/delete", async (req: Request, res: Response) => {
  try {
    const { taskIds } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid task IDs",
        message: "taskIds must be a non-empty array",
      });
    }

    console.log(`[TASKS] Bulk archiving ${taskIds.length} task(s)`);

    // Archive all tasks
    const updated = await db("tasks").whereIn("id", taskIds).update({
      status: "archived",
      updated_at: new Date(),
    });

    console.log(`[TASKS] Archived ${updated} task(s)`);

    return res.json({
      success: true,
      message: `${updated} task(s) archived successfully`,
      count: updated,
    });
  } catch (error: any) {
    return handleError(res, error, "Bulk archive tasks");
  }
});

/**
 * POST /api/tasks/bulk/approve
 * Bulk approve/unapprove tasks
 * Body: { taskIds: number[], is_approved: boolean }
 */
router.post("/bulk/approve", async (req: Request, res: Response) => {
  try {
    const { taskIds, is_approved } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid task IDs",
        message: "taskIds must be a non-empty array",
      });
    }

    if (typeof is_approved !== "boolean") {
      return res.status(400).json({
        success: false,
        error: "Invalid approval status",
        message: "is_approved must be a boolean",
      });
    }

    console.log(
      `[TASKS] Bulk ${is_approved ? "approving" : "unapproving"} ${
        taskIds.length
      } task(s)`
    );

    // If approving, fetch tasks to check which are USER tasks and not yet approved
    let userTasksToNotify: { domain_name: string; count: number }[] = [];
    if (is_approved) {
      const tasksToApprove = await db("tasks")
        .whereIn("id", taskIds)
        .where("is_approved", false)
        .where("category", "USER")
        .select("domain_name");

      // Group by domain to send one notification per domain
      const domainCounts = tasksToApprove.reduce((acc: any, task: any) => {
        acc[task.domain_name] = (acc[task.domain_name] || 0) + 1;
        return acc;
      }, {});

      userTasksToNotify = Object.entries(domainCounts).map(
        ([domain, count]) => ({
          domain_name: domain as string,
          count: count as number,
        })
      );
    }

    // Update all tasks
    const updated = await db("tasks").whereIn("id", taskIds).update({
      is_approved,
      updated_at: new Date(),
    });

    console.log(`[TASKS] Updated ${updated} task(s)`);

    // Create notifications for approved USER tasks
    if (is_approved && userTasksToNotify.length > 0) {
      for (const { domain_name, count } of userTasksToNotify) {
        try {
          const message =
            count === 1
              ? "A new opportunity awaits your action! Visit the tasks tab to see more"
              : `${count} new opportunities awaiting your action! Visit tasks to see more`;

          await createNotification(
            domain_name,
            count === 1 ? "New Task Approved" : "New Tasks Approved",
            message,
            "task",
            { taskCount: count }
          );
          console.log(
            `[TASKS] Created notification for ${count} approved USER task(s) for ${domain_name}`
          );
        } catch (notificationError: any) {
          console.error(
            `[TASKS] Failed to create notification for ${domain_name}: ${notificationError.message}`
          );
          // Don't fail the approval if notification creation fails
        }
      }
    }

    return res.json({
      success: true,
      message: `${updated} task(s) ${
        is_approved ? "approved" : "unapproved"
      } successfully`,
      count: updated,
    });
  } catch (error: any) {
    return handleError(res, error, "Bulk approve tasks");
  }
});

/**
 * POST /api/tasks/bulk/status
 * Bulk update task status
 * Body: { taskIds: number[], status: ActionItemStatus }
 */
router.post("/bulk/status", async (req: Request, res: Response) => {
  try {
    const { taskIds, status } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid task IDs",
        message: "taskIds must be a non-empty array",
      });
    }

    if (!["pending", "in_progress", "complete", "archived"].includes(status)) {
      return res.status(400).json({
        success: false,
        error: "Invalid status",
        message: "status must be pending, in_progress, complete, or archived",
      });
    }

    console.log(`[TASKS] Bulk updating ${taskIds.length} task(s) to ${status}`);

    const updateData: any = {
      status,
      updated_at: new Date(),
    };

    // Set completed_at for tasks being marked complete
    if (status === "complete") {
      updateData.completed_at = new Date();
    }

    // Update all tasks
    const updated = await db("tasks").whereIn("id", taskIds).update(updateData);

    console.log(`[TASKS] Updated ${updated} task(s)`);

    return res.json({
      success: true,
      message: `${updated} task(s) updated to ${status} successfully`,
      count: updated,
    });
  } catch (error: any) {
    return handleError(res, error, "Bulk update task status");
  }
});

// =====================================================================
// HEALTH CHECK
// =====================================================================

/**
 * GET /api/tasks/health
 * Health check endpoint
 */
router.get("/health", (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
