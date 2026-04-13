/**
 * Oz Engine API
 *
 * GET /api/user/oz-engine
 *
 * Returns the single highest-surprise insight for the Home page hero card.
 * Deterministic, zero external API calls. Pure database reads.
 *
 * Response shape:
 * {
 *   ozMoment: {
 *     headline: string,
 *     context: string,
 *     status: "healthy" | "attention" | "critical",
 *     verifyUrl: string | null,
 *     surprise: number,
 *     actionText: string | null,
 *     actionUrl: string | null,
 *     signalType: string,
 *   } | null
 * }
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { getOzEngineResult } from "../../services/ozEngine";

const ozEngineRoutes = express.Router();

ozEngineRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const ozMoment = await getOzEngineResult(orgId);
      return res.json({ success: true, ozMoment });
    } catch (err: any) {
      console.error("[OzEngine] Error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to compute insight" });
    }
  },
);

export default ozEngineRoutes;
