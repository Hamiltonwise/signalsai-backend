/**
 * PM Task Comments Routes
 *
 * Flat markdown comments on a PM task, with @mentions stored as a native PG
 * INTEGER[]. Mounted at `/api/pm` (see src/routes/pm/index.ts); paths here
 * are absolute from that mount point.
 *
 * Auth: authenticateToken + superAdminMiddleware — super-admin-only surface,
 * same as every other PM route.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmCommentsController";

const router = express.Router();

// POST /api/pm/tasks/:id/comments
router.post(
  "/tasks/:id/comments",
  authenticateToken,
  superAdminMiddleware,
  controller.createComment
);

// GET /api/pm/tasks/:id/comments
router.get(
  "/tasks/:id/comments",
  authenticateToken,
  superAdminMiddleware,
  controller.listComments
);

// PUT /api/pm/tasks/:id/comments/:commentId
router.put(
  "/tasks/:id/comments/:commentId",
  authenticateToken,
  superAdminMiddleware,
  controller.updateComment
);

// DELETE /api/pm/tasks/:id/comments/:commentId
router.delete(
  "/tasks/:id/comments/:commentId",
  authenticateToken,
  superAdminMiddleware,
  controller.deleteComment
);

export default router;
