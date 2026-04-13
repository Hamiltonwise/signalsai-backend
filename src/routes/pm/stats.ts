/**
 * PM Stats API -- Project velocity and workload metrics.
 *
 * GET /api/pm/stats          - Overall project stats
 * GET /api/pm/stats/velocity - Sprint velocity over time
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmStatsController";

const router = express.Router();

router.get("/", authenticateToken, superAdminMiddleware, controller.getStats);
router.get("/velocity", authenticateToken, superAdminMiddleware, controller.getVelocity);

export default router;
