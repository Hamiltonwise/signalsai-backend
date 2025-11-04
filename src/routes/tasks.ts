import express, { Request, Response } from "express";
import { db } from "../database/connection";
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
      is_approved,
      date_from,
      date_to,
      limit = "50",
      offset = "0",
    }: any = req.query;

    console.log("[TASKS] Admin fetching all tasks with filters:", req.query);

    // Build query
    let query = db("tasks").select("tasks.*");

    // Apply filters
    if (domain_name) {
      query = query.where("tasks.domain_name", domain_name);
    }

    if (status && status !== "all") {
      query = query.where("tasks.status", status);
    } else {
      // Default: exclude archived
      query = query.whereNot("tasks.status", "archived");
    }

    if (category && category !== "all") {
      query = query.where("tasks.category", category);
    }

    if (is_approved !== undefined && is_approved !== "all") {
      const approvedValue = is_approved === "true" || is_approved === true;
      query = query.where("tasks.is_approved", approvedValue);
    }

    if (date_from) {
      query = query.where("tasks.created_at", ">=", new Date(date_from));
    }

    if (date_to) {
      query = query.where("tasks.created_at", "<=", new Date(date_to));
    }

    // Get total count before pagination
    const countQuery = query.clone();
    const [{ count }] = await countQuery.clearSelect().count("* as count");

    // Apply pagination
    query = query
      .orderBy("tasks.created_at", "desc")
      .limit(parseInt(limit))
      .offset(parseInt(offset));

    const tasks = await query;

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

    // Update task
    await db("tasks").where({ id: taskId }).update(updateData);

    const updatedTask = await db("tasks").where({ id: taskId }).first();

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
