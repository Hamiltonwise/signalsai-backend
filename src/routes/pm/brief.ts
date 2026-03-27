import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmBriefController";

const router = express.Router();

// GET /api/pm/daily-brief — get latest daily brief
router.get("/", authenticateToken, superAdminMiddleware, controller.getLatestBrief);

// GET /api/pm/daily-brief/history — list past briefs with pagination
router.get(
  "/history",
  authenticateToken,
  superAdminMiddleware,
  controller.getBriefHistory
);

export default router;
