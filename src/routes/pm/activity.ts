import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmActivityController";

const router = express.Router();

// GET /api/pm/activity — global activity feed (paginated)
router.get("/", authenticateToken, superAdminMiddleware, controller.getGlobalActivity);

// DELETE /api/pm/activity — clear all activity
router.delete("/", authenticateToken, superAdminMiddleware, controller.clearActivity);

// GET /api/pm/activity/projects/:id/activity — project-specific activity
router.get(
  "/projects/:id/activity",
  authenticateToken,
  superAdminMiddleware,
  controller.getProjectActivity
);

// GET /api/pm/activity/tasks/:id — task-level activity
router.get(
  "/tasks/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.getTaskActivity
);

export default router;
