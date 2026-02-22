import express from "express";
import * as TasksController from "../controllers/tasks/TasksController";
import { authenticateToken } from "../middleware/auth";
import { rbacMiddleware } from "../middleware/rbac";

const router = express.Router();

// =====================================================================
// CLIENT ENDPOINTS (Organization-scoped via JWT + RBAC)
// =====================================================================

/**
 * GET /api/tasks
 * Fetch tasks for logged-in client (grouped by category)
 */
router.get("/", authenticateToken, rbacMiddleware, TasksController.getTasksForClient);

/**
 * PATCH /api/tasks/:id/complete
 * Mark a USER category task as complete (clients only)
 */
router.patch("/:id/complete", authenticateToken, rbacMiddleware, TasksController.completeTask);

// =====================================================================
// ADMIN ENDPOINTS (Unrestricted Access)
// =====================================================================

/**
 * POST /api/tasks
 * Create a new task (admin only)
 * Body: CreateActionItemRequest
 */
router.post("/", TasksController.createTask);

/**
 * GET /api/tasks/admin/all
 * Fetch all tasks with filtering (admin dashboard)
 * Query params: status, category, is_approved, date_from, date_to, limit, offset
 */
router.get("/admin/all", TasksController.getAdminTasks);

/**
 * PATCH /api/tasks/:id
 * Update a task (admin only)
 * Body: UpdateActionItemRequest
 */
router.patch("/:id", TasksController.updateTask);

/**
 * PATCH /api/tasks/:id/category
 * Update task category (admin only)
 * Body: { category: "ALLORO" | "USER" }
 */
router.patch("/:id/category", TasksController.updateCategory);

/**
 * DELETE /api/tasks/:id
 * Archive a task (soft delete)
 */
router.delete("/:id", TasksController.archiveTask);

/**
 * GET /api/tasks/clients
 * Get list of available clients for task creation dropdown
 */
router.get("/clients", TasksController.getClients);

/**
 * POST /api/tasks/bulk/delete
 * Bulk archive tasks
 * Body: { taskIds: number[] }
 */
router.post("/bulk/delete", TasksController.bulkArchive);

/**
 * POST /api/tasks/bulk/approve
 * Bulk approve/unapprove tasks
 * Body: { taskIds: number[], is_approved: boolean }
 */
router.post("/bulk/approve", TasksController.bulkApprove);

/**
 * POST /api/tasks/bulk/status
 * Bulk update task status
 * Body: { taskIds: number[], status: ActionItemStatus }
 */
router.post("/bulk/status", TasksController.bulkUpdateStatus);

// =====================================================================
// HEALTH CHECK
// =====================================================================

/**
 * GET /api/tasks/health
 * Health check endpoint
 */
router.get("/health", TasksController.healthCheck);

// =====================================================================
// EXPORTS
// =====================================================================

export default router;
