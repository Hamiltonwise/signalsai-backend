import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmTasksController";

const router = express.Router();

// POST /api/pm/projects/:id/tasks — create task in specified column
router.post(
  "/projects/:id/tasks",
  authenticateToken,
  superAdminMiddleware,
  controller.createTask
);

// PUT /api/pm/tasks/:id — update task fields
router.put(
  "/tasks/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.updateTask
);

// PUT /api/pm/tasks/:id/move — move task to column + position
router.put(
  "/tasks/:id/move",
  authenticateToken,
  superAdminMiddleware,
  controller.moveTask
);

// PUT /api/pm/tasks/:id/assign — assign task to user
router.put(
  "/tasks/:id/assign",
  authenticateToken,
  superAdminMiddleware,
  controller.assignTask
);

// DELETE /api/pm/tasks/:id — delete task
router.delete(
  "/tasks/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.deleteTask
);

export default router;
