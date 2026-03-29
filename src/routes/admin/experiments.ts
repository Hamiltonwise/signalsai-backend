/**
 * Experiment Lab Admin Routes
 *
 * GET /api/admin/experiments -- list all active experiments with results
 * POST /api/admin/experiments/:id/conclude -- conclude an experiment with a winner
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import {
  ACTIVE_EXPERIMENTS,
  getExperimentResults,
} from "../../services/experimentLab";

const experimentRoutes = express.Router();

experimentRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const results = await Promise.all(
        ACTIVE_EXPERIMENTS.map(async (exp) => ({
          ...exp,
          results: await getExperimentResults(exp.id, exp.targetSampleSize),
        }))
      );

      return res.json({ success: true, experiments: results });
    } catch (error: any) {
      console.error("[Experiments] Error:", error.message);
      return res.json({ success: true, experiments: [] });
    }
  }
);

export default experimentRoutes;
