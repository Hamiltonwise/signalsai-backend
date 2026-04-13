/**
 * PM Projects API -- CRUD for internal projects.
 *
 * GET    /api/pm/projects     - List all projects
 * POST   /api/pm/projects     - Create project
 * PATCH  /api/pm/projects/:id - Update project
 * DELETE /api/pm/projects/:id - Archive project
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmProjectsController";

const router = express.Router();

// GET /api/pm/projects — list all projects
router.get("/", authenticateToken, superAdminMiddleware, controller.listProjects);

// POST /api/pm/projects — create project (auto-seeds 4 columns)
router.post("/", authenticateToken, superAdminMiddleware, controller.createProject);

// GET /api/pm/projects/:id — get project with columns and tasks
router.get("/:id", authenticateToken, superAdminMiddleware, controller.getProject);

// PUT /api/pm/projects/:id — update project fields
router.put("/:id", authenticateToken, superAdminMiddleware, controller.updateProject);

// DELETE /api/pm/projects/:id — delete project (CASCADE)
router.delete("/:id", authenticateToken, superAdminMiddleware, controller.deleteProject);

// PUT /api/pm/projects/:id/archive — toggle archive status
router.put("/:id/archive", authenticateToken, superAdminMiddleware, controller.archiveProject);

export default router;
