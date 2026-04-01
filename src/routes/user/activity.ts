/**
 * User Activity Feed -- what Alloro did this week
 *
 * GET /api/user/activity
 * Returns the last 7 days of behavioral events for this org.
 * Powers the "What Alloro Did This Week" dashboard card.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const activityRoutes = express.Router();

activityRoutes.get(
  "/activity",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.json({ success: true, events: [] });

      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

      const hasTable = await db.schema.hasTable("behavioral_events");
      if (!hasTable) return res.json({ success: true, events: [] });

      const events = await db("behavioral_events")
        .where(function () {
          this.where({ organization_id: orgId }).orWhere({ org_id: orgId });
        })
        .where("created_at", ">=", sevenDaysAgo)
        .orderBy("created_at", "desc")
        .limit(20)
        .select("event_type as type", "properties", "created_at");

      const normalized = events.map((e: any) => ({
        type: e.type,
        properties: e.properties || {},
        created_at: e.created_at,
      }));

      return res.json({ success: true, events: normalized, count: normalized.length });
    } catch (error: any) {
      console.error("[Activity] Error:", error.message);
      return res.json({ success: true, events: [] });
    }
  },
);

export default activityRoutes;
