/**
 * Roadmap API -- GET /api/admin/roadmap
 *
 * Returns the full RoadmapState: current position, next milestone,
 * course correction, and ETA to unicorn. Requires superAdmin.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { calculateRoadmapState } from "../../services/roadmapEngine";

const roadmapRoutes = express.Router();

roadmapRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req: any, res) => {
    try {
      const state = await calculateRoadmapState();
      res.json({ success: true, ...state });
    } catch (error: any) {
      console.error("[roadmap] Error calculating roadmap state:", error);
      res.status(500).json({
        success: false,
        error: "Failed to calculate roadmap state",
      });
    }
  }
);

export default roadmapRoutes;
