/**
 * Client Health API -- WO-T5
 *
 * GET /api/admin/client-health -- returns health grid for all active orgs.
 * Admin only. Feeds Jo's IntegratorView.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const clientHealthRoutes = express.Router();

/**
 * GET /api/admin/client-health
 *
 * Returns array of org health records with status, login info, and open task count.
 */
clientHealthRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req: any, res) => {
    try {
      const orgs = await db("organizations")
        .whereIn("subscription_status", ["active", "trial"])
        .select(
          "id",
          "name",
          "subscription_status",
          "subscription_tier",
          "first_login_at",
          "client_health_status",
          "created_at",
        );

      const healthGrid = [];

      for (const org of orgs) {
        // Open task count (dream_team_nodes are global, not org-scoped)
        let openTasks = 0;
        try {
          const taskResult = await db("dream_team_tasks")
            .where({ status: "open" })
            .count("id as count")
            .first();
          openTasks = Number(taskResult?.count || 0);
        } catch {
          // dream_team_tasks may not exist yet
        }

        // Days since login
        let daysSinceLogin: number | null = null;
        if (org.first_login_at) {
          const now = new Date();
          const lastLogin = new Date(org.first_login_at);
          daysSinceLogin = Math.floor(
            (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24),
          );
        }

        healthGrid.push({
          org_id: org.id,
          name: org.name,
          status: org.client_health_status || "green",
          subscription_status: org.subscription_status,
          subscription_tier: org.subscription_tier,
          days_since_login: daysSinceLogin,
          open_tasks: openTasks,
          created_at: org.created_at,
        });
      }

      // Sort: RED first, then AMBER, then GREEN
      const statusOrder: Record<string, number> = { red: 0, amber: 1, green: 2 };
      healthGrid.sort(
        (a, b) => (statusOrder[a.status] ?? 3) - (statusOrder[b.status] ?? 3),
      );

      return res.json({ success: true, data: healthGrid });
    } catch (error: any) {
      console.error("[ClientHealth] Fetch error:", error.message);
      return res
        .status(500)
        .json({ success: false, error: "Failed to load client health grid" });
    }
  },
);

export default clientHealthRoutes;
