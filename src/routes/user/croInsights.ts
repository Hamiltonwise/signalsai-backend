/**
 * CRO Insights -- what Alloro optimized on your website
 *
 * GET /api/user/cro-insights
 * Returns the last 30 days of CRO engine recommendations for this org.
 * Powers the "Website Optimizations" section on the Presence page.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const croInsightsRoutes = express.Router();

croInsightsRoutes.get(
  "/cro-insights",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.json({ success: true, insights: [] });

      const hasTable = await db.schema.hasTable("behavioral_events");
      if (!hasTable) return res.json({ success: true, insights: [] });

      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

      const rows = await db("behavioral_events")
        .where({ org_id: orgId, event_type: "cro_engine_run" })
        .where("created_at", ">=", thirtyDaysAgo)
        .orderBy("created_at", "desc")
        .limit(10)
        .select("properties", "created_at");

      const insights = rows.flatMap((row) => {
        const props = typeof row.properties === "string"
          ? JSON.parse(row.properties)
          : row.properties || {};
        const recs = props.recommendations || [];
        return recs.map((rec: any) => ({
          pageUrl: rec.pageUrl || null,
          changeType: rec.changeType || null,
          currentValue: rec.currentValue || null,
          recommendedValue: rec.recommendedValue || null,
          rationale: rec.rationale || null,
          date: row.created_at,
        }));
      });

      return res.json({ success: true, insights });
    } catch (error: any) {
      console.error("[CROInsights] Error:", error.message);
      return res.json({ success: true, insights: [] });
    }
  },
);

export default croInsightsRoutes;
