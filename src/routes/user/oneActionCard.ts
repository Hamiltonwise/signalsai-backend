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
      console.error("[OneActionCard] Error:", error.message);
      return res.json({
        success: true,
        card: {
          headline: "Alloro is watching your market.",
          body: "Check back after your next agent run for personalized intelligence.",
          action_text: null,
          action_url: null,
          priority_level: 5,
        },
      });
    }
  },
);

export default oneActionCardRoutes;
