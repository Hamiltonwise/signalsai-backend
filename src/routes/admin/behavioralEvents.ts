/**
 * Behavioral Events Admin API
 *
 * GET /api/admin/behavioral-events -- last 50 events, reverse chronological.
 * Supports ?type= filter prefix and ?limit= override (max 100).
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const behavioralEventsRoutes = express.Router();

behavioralEventsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const typeFilter = req.query.type as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 100);

      let query = db("behavioral_events")
        .orderBy("created_at", "desc")
        .limit(limit)
        .select("id", "event_type", "properties", "created_at");

      if (typeFilter) {
        query = query.where("event_type", "like", `${typeFilter}%`);
      }

      const events = await query;

      // Enrich with org name where available
      const enriched = await Promise.all(
        events.map(async (e: any) => {
          const props = typeof e.properties === "string" ? JSON.parse(e.properties) : (e.properties || {});
          const orgId = props.organization_id || props.org_id;
          let orgName: string | null = null;
          if (orgId) {
            const org = await db("organizations").where({ id: orgId }).select("name").first();
            orgName = org?.name || null;
          }
          return {
            id: e.id,
            event_type: e.event_type,
            properties: props,
            org_name: orgName || props.practice_name || null,
            created_at: e.created_at,
          };
        }),
      );

      return res.json({ success: true, events: enriched });
    } catch (error: any) {
      console.error("[BehavioralEvents] Fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load events" });
    }
  },
);

export default behavioralEventsRoutes;

// T2 registers this route at /api/admin/behavioral-events in src/index.ts
