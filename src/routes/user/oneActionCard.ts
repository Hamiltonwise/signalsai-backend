/**
 * One Action Card — Client-facing API route
 *
 * GET /api/user/one-action-card
 * Returns the single most important action for the logged-in user's org.
 *
 * // T2 registers this route — do not duplicate
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { getOneActionCardWithIntelligence } from "../../services/oneActionCard";

const oneActionCardRoutes = express.Router();

oneActionCardRoutes.get(
  "/one-action-card",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.json({
          success: true,
          card: {
            headline: "Welcome to Alloro.",
            body: "Complete your setup to see your first market intelligence.",
            action_text: null,
            action_url: null,
            priority_level: 5,
          },
        });
      }

      const { card, driftGP, competitorVelocity } = await getOneActionCardWithIntelligence(orgId);
      return res.json({ success: true, card, driftGP, competitorVelocity });
    } catch (error: any) {
      console.error("[OneActionCard] Error for org", req.organizationId, ":", error.message, error.stack?.split("\n").slice(0, 3).join(" | "));

      // Instead of a dead-end message, try to use checkup_data for a real card
      try {
        const { db } = await import("../../database/connection");
        const org = await db("organizations").where({ id: req.organizationId }).select("checkup_data", "target_competitor_name").first();
        const cd = org?.checkup_data ? (typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data) : null;
        const comp = cd?.topCompetitor || (org?.target_competitor_name ? { name: org.target_competitor_name } : null);
        const clientReviews = cd?.place?.reviewCount || cd?.reviewCount || 0;
        const compReviews = comp?.reviewCount || 0;
        const gap = compReviews - clientReviews;

        if (comp?.name && gap > 0) {
          return res.json({
            success: true,
            card: {
              headline: `${comp.name} has ${gap} more reviews than you.`,
              body: "Ask your last 3 customers for a review this week. Every review closes the gap and improves how Google ranks you.",
              action_text: "See your reviews",
              action_url: "/reviews",
              priority_level: 4,
            },
          });
        }

        if (comp?.name) {
          return res.json({
            success: true,
            card: {
              headline: `Alloro is tracking ${comp.name} for you.`,
              body: "Your weekly comparison updates every Monday. Fresh data is being collected now.",
              action_text: "See the comparison",
              action_url: "/compare",
              priority_level: 5,
            },
          });
        }
      } catch {
        // Double-fault: just return something useful
      }

      return res.json({
        success: true,
        card: {
          headline: "Your market data is being refreshed.",
          body: "Alloro is pulling fresh data from Google. Your next insight will appear here shortly.",
          action_text: null,
          action_url: null,
          priority_level: 5,
        },
      });
    }
  },
);

export default oneActionCardRoutes;
