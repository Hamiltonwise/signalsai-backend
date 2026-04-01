/**
 * Agent Activity Feed API
 *
 * GET /api/admin/agent-activity -- last 20 agent_results joined with organizations
 * Powers the "Dream Team Activity" card on IntegratorView.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";

const agentActivityRoutes = express.Router();

agentActivityRoutes.get(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (_req, res) => {
    try {
      const results = await db("agent_results")
        .leftJoin(
          "organizations",
          "agent_results.organization_id",
          "organizations.id"
        )
        .select(
          "agent_results.id",
          "agent_results.agent_type",
          "agent_results.organization_id",
          "agent_results.status",
          "agent_results.error_message",
          "agent_results.created_at",
          "organizations.name as org_name"
        )
        .orderBy("agent_results.created_at", "desc")
        .limit(20);

      return res.json({ success: true, results });
    } catch (err: any) {
      console.error("[AgentActivity] GET error:", err.message);
      return res
        .status(500)
        .json({ success: false, error: "Failed to load agent activity" });
    }
  }
);

export default agentActivityRoutes;
