/**
 * Admin PMS Pipeline Routes
 *
 * Read-only endpoint for the "View Pipeline" admin debug modal at
 * /admin/ai-pms-automation. Mounted at `/api/admin/pms-jobs` from
 * `src/index.ts`.
 *
 *   GET /:id/pipeline — full agent pipeline for one PMS job (RE + Summary
 *                        with persisted agent_input + agent_output)
 *
 * Auth: super-admin only (JWT + allowlisted email).
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-pms-pipeline/PmsPipelineController";

const router = express.Router();

router.get(
  "/:id/pipeline",
  authenticateToken,
  superAdminMiddleware,
  controller.getPipelineForPmsJob
);

export default router;
