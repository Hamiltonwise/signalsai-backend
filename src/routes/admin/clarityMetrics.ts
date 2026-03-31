/**
 * Clarity Metrics API
 *
 * GET /api/admin/clarity-metrics/latest -- today's snapshot
 * GET /api/admin/clarity-metrics/trend -- last 30 days
 * POST /api/admin/clarity-metrics/run -- manually trigger snapshot
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { computeDailySnapshot, detectAnomalies } from "../../services/clarityMetrics";
import { db } from "../../database/connection";

const clarityMetricsRoutes = express.Router();

// Get today's snapshot (or compute it if it doesn't exist)
clarityMetricsRoutes.get(
  "/latest",
  authenticateToken,
  superAdminMiddleware,
  async (_req: any, res) => {
    try {
      // Check if today's snapshot already exists
      const today = new Date().toISOString().split("T")[0];
      const existing = await db("behavioral_events")
        .where("event_type", "clarity_metrics.daily_snapshot")
        .where("created_at", ">=", `${today}T00:00:00`)
        .orderBy("created_at", "desc")
        .first();

      if (existing) {
        const snapshot = typeof existing.properties === "string"
          ? JSON.parse(existing.properties)
          : existing.properties;
        const anomalies = await detectAnomalies(snapshot);
        return res.json({ success: true, snapshot, anomalies });
      }

      // Compute fresh snapshot
      const snapshot = await computeDailySnapshot();
      const anomalies = await detectAnomalies(snapshot);
      return res.json({ success: true, snapshot, anomalies });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Get 30-day trend
clarityMetricsRoutes.get(
  "/trend",
  authenticateToken,
  superAdminMiddleware,
  async (_req: any, res) => {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const snapshots = await db("behavioral_events")
        .where("event_type", "clarity_metrics.daily_snapshot")
        .where("created_at", ">=", thirtyDaysAgo)
        .orderBy("created_at", "asc")
        .select("properties", "created_at");

      const trend = snapshots.map((s: any) => ({
        ...(typeof s.properties === "string" ? JSON.parse(s.properties) : s.properties),
        recorded_at: s.created_at,
      }));

      return res.json({ success: true, trend });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Manually trigger a snapshot (useful for testing)
clarityMetricsRoutes.post(
  "/run",
  authenticateToken,
  superAdminMiddleware,
  async (_req: any, res) => {
    try {
      const snapshot = await computeDailySnapshot();
      const anomalies = await detectAnomalies(snapshot);
      return res.json({ success: true, snapshot, anomalies });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default clarityMetricsRoutes;
