/**
 * Dashboard Context API -- WO-CHECKUP-SESSION-KEY
 *
 * GET /api/user/dashboard-context
 *
 * On first load after account creation: if the org has checkup data
 * stored from the Checkup gate, returns it so the frontend can
 * pre-populate the position card before the first ranking snapshot runs.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { db } from "../../database/connection";

const dashboardContextRoutes = express.Router();

/**
 * GET /api/user/dashboard-context
 *
 * Returns checkup_context if session_checkup_key is set and checkup_data exists.
 * This gives new accounts immediate dashboard content from their Checkup results.
 */
dashboardContextRoutes.get(
  "/",
  authenticateToken,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId || req.organizationId;
      if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

      const org = await db("organizations")
        .where({ id: orgId })
        .select(
          "checkup_score",
          "checkup_data",
          "top_competitor_name",
          "session_checkup_key",
          "first_login_at",
          "name",
        )
        .first();

      if (!org) return res.status(404).json({ success: false, error: "Org not found" });

      // Only include checkup context if data exists
      let checkupContext = null;
      if (org.session_checkup_key && org.checkup_data) {
        const data = typeof org.checkup_data === "string"
          ? JSON.parse(org.checkup_data)
          : org.checkup_data;

        checkupContext = {
          score: org.checkup_score,
          data,
          top_competitor_name: org.top_competitor_name,
          session_key: org.session_checkup_key,
        };
      }

      return res.json({
        success: true,
        checkup_context: checkupContext,
        has_ranking_snapshot: false, // T2 can enhance: check weekly_ranking_snapshots
      });
    } catch (error: any) {
      console.error("[DashboardContext] Error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load dashboard context" });
    }
  },
);

export default dashboardContextRoutes;
