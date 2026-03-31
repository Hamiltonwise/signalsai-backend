/**
 * Morning Briefing Admin Route
 *
 * GET /api/admin/morning-briefing/latest -- returns the most recent briefing.
 * Admin only.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const morningBriefingRoutes = express.Router();

/**
 * GET /api/admin/morning-briefing/latest
 *
 * Returns the latest morning briefing summary.
 */
morningBriefingRoutes.get(
  "/latest",
  authenticateToken,
  superAdminMiddleware,
  async (_req: any, res) => {
    try {
      const tableExists = await db.schema.hasTable("morning_briefings");
      if (!tableExists) {
        return res.json({
          success: true,
          data: null,
          message: "Morning briefings table not yet created",
        });
      }

      const briefing = await db("morning_briefings")
        .orderBy("briefing_date", "desc")
        .first();

      if (!briefing) {
        return res.json({
          success: true,
          data: null,
          message: "No briefings available yet",
        });
      }

      // Parse stored JSON summary
      const summary =
        typeof briefing.summary === "string"
          ? JSON.parse(briefing.summary)
          : briefing.summary;

      return res.json({
        success: true,
        id: briefing.id,
        date: briefing.briefing_date,
        summary,
        signups: briefing.new_signups,
        competitor_moves: briefing.competitor_moves,
        reviews_received: briefing.reviews_received,
        client_health_green: briefing.client_health_green,
        client_health_amber: briefing.client_health_amber,
        client_health_red: briefing.client_health_red,
        milestones: briefing.milestones,
        topEvent: briefing.top_event,
        generated_at: briefing.created_at,
      });
    } catch (error: any) {
      console.error("[MorningBriefing] Fetch error:", error.message);
      return res
        .status(500)
        .json({ success: false, error: "Failed to load morning briefing" });
    }
  },
);

export default morningBriefingRoutes;
