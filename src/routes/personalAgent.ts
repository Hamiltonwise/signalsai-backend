/**
 * Personal Agent API -- Daily brief endpoint for team members.
 *
 * GET /api/personal-agent/brief
 *   Returns the daily brief for the authenticated user based on their role.
 *   Role mapping: visionary (Corey), integrator (Jo), build (Dave).
 *
 * GET /api/personal-agent/handoffs
 *   Returns recent cross-agent handoffs for visibility.
 */

import express from "express";
import { authenticateToken, AuthRequest } from "../middleware/auth";
import { superAdminMiddleware } from "../middleware/superAdmin";
import { getBriefForRole, getRecentHandoffs } from "../services/personalAgents/agentCoordinator";
import { TeamRole } from "../services/personalAgents/types";
import { db } from "../database/connection";

const personalAgentRoutes = express.Router();

/**
 * Map user email to team role.
 * Falls back to checking the users table role column, then defaults to visionary.
 */
async function resolveTeamRole(email: string, userId: number): Promise<TeamRole> {
  // Hard-coded team mapping for the three founders
  const emailRoleMap: Record<string, TeamRole> = {
    "corey@getalloro.com": "visionary",
    "jo@getalloro.com": "integrator",
    "dave@getalloro.com": "build",
  };

  const mapped = emailRoleMap[email.toLowerCase()];
  if (mapped) return mapped;

  // Fallback: check the users table role column
  try {
    const user = await db("users").where({ id: userId }).select("role").first();
    if (user?.role === "build" || user?.role === "integrator" || user?.role === "visionary") {
      return user.role as TeamRole;
    }
  } catch {
    // role column may not exist
  }

  return "visionary";
}

/**
 * GET /api/personal-agent/brief
 *
 * Returns the personalized daily brief for the authenticated user.
 * Query params:
 *   ?role=visionary|integrator|build  (override, admin only)
 */
personalAgentRoutes.get(
  "/brief",
  authenticateToken,
  superAdminMiddleware,
  async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.userId;
      const email = req.user?.email;

      if (!userId || !email) {
        return res.status(401).json({ success: false, error: "Authentication required" });
      }

      // Allow role override via query param for testing
      const overrideRole = req.query.role as string | undefined;
      let role: TeamRole;

      if (overrideRole && ["visionary", "integrator", "build"].includes(overrideRole)) {
        role = overrideRole as TeamRole;
      } else {
        role = await resolveTeamRole(email, userId);
      }

      const brief = await getBriefForRole(role, userId);

      return res.json({
        success: true,
        data: {
          role,
          generatedAt: new Date().toISOString(),
          ...brief,
        },
      });
    } catch (error: any) {
      console.error("[PersonalAgent] Brief generation error:", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to generate daily brief",
      });
    }
  },
);

/**
 * GET /api/personal-agent/handoffs
 *
 * Returns recent cross-agent handoffs for audit/visibility.
 */
personalAgentRoutes.get(
  "/handoffs",
  authenticateToken,
  superAdminMiddleware,
  async (_req: AuthRequest, res) => {
    try {
      const handoffs = await getRecentHandoffs(20);
      return res.json({ success: true, data: handoffs });
    } catch (error: any) {
      console.error("[PersonalAgent] Handoffs fetch error:", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to fetch handoffs",
      });
    }
  },
);

export default personalAgentRoutes;
