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

function timeAgo(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

behavioralEventsRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req: any, res) => {
    try {
      const typeFilter = req.query.type as string | undefined;
      const eventType = req.query.event_type as string | undefined;
      const orgIdFilter = req.query.org_id as string | undefined;
      const source = req.query.source as string | undefined;
      const hoursAgo = Number(req.query.hours_ago) || 24;
      const limit = Math.min(Number(req.query.limit) || 50, 200);

      const cutoff = new Date(Date.now() - hoursAgo * 3_600_000);

      let query = db("behavioral_events")
        .leftJoin("organizations", "behavioral_events.org_id", "organizations.id")
        .where("behavioral_events.created_at", ">=", cutoff)
        .orderBy("behavioral_events.created_at", "desc")
        .limit(limit)
        .select(
          "behavioral_events.id",
          "behavioral_events.event_type",
          "behavioral_events.org_id",
          "behavioral_events.session_id",
          "behavioral_events.properties",
          "behavioral_events.created_at as occurred_at",
          "organizations.name as practice_name",
        );

      if (typeFilter) query = query.where("behavioral_events.event_type", "like", `${typeFilter}%`);
      if (eventType) query = query.where("behavioral_events.event_type", eventType);
      if (orgIdFilter) query = query.where("behavioral_events.org_id", Number(orgIdFilter));
      if (source) {
        query = query.whereRaw(
          "behavioral_events.properties::text ILIKE ?",
          [`%${source}%`],
        );
      }

      const events = await query;

      const enriched = events.map((e: any) => ({
        id: e.id,
        event_type: e.event_type,
        org_id: e.org_id,
        practice_name: e.practice_name || null,
        occurred_at: e.occurred_at,
        time_ago: timeAgo(e.occurred_at),
        payload: typeof e.properties === "string" ? JSON.parse(e.properties) : (e.properties || {}),
      }));

      return res.json({ success: true, events: enriched, count: enriched.length });
    } catch (error: any) {
      console.error("[BehavioralEvents] Fetch error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load events" });
    }
  },
);

export default behavioralEventsRoutes;

// T2 registers this route at /api/admin/behavioral-events in src/index.ts
