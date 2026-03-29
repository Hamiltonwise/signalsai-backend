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
        data: {
          id: briefing.id,
          date: briefing.briefing_date,
          summary,
          newSignups: briefing.new_signups,
          competitorMoves: briefing.competitor_moves,
          reviewsReceived: briefing.reviews_received,
          clientHealth: {
            green: briefing.client_health_green,
            amber: briefing.client_health_amber,
            red: briefing.client_health_red,
          },
          milestones: briefing.milestones,
          topEvent: briefing.top_event,
          createdAt: briefing.created_at,
        },
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
