/**
 * Owner Profile -- Lemonis Protocol onboarding questions
 *
 * GET  /api/user/owner-profile  -- read profile
 * POST /api/user/owner-profile  -- save profile
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const ownerProfileRoutes = express.Router();

ownerProfileRoutes.get(
  "/owner-profile",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.json({ success: true, profile: null });

      const org = await db("organizations").where({ id: orgId }).first("owner_profile");
      const profile = org?.owner_profile
        ? (typeof org.owner_profile === "string" ? JSON.parse(org.owner_profile) : org.owner_profile)
        : null;

      return res.json({ success: true, profile });
    } catch (error: any) {
      console.error("[OwnerProfile] GET error:", error.message);
      return res.json({ success: true, profile: null });
    }
  },
);

ownerProfileRoutes.post(
  "/owner-profile",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(400).json({ success: false, error: "No organization" });

      const { vision_3yr, sunday_fear, confidence_score, confidence_threat, people_challenge, personal_goal } = req.body;

      const profile = {
        vision_3yr: vision_3yr || null,
        sunday_fear: sunday_fear || null,
        confidence_score: confidence_score ?? null,
        confidence_threat: confidence_threat || null,
        people_challenge: people_challenge || null,
        personal_goal: personal_goal || null,
        completed_at: new Date().toISOString(),
      };

      await db("organizations").where({ id: orgId }).update({ owner_profile: JSON.stringify(profile) });

      return res.json({ success: true, profile });
    } catch (error: any) {
      console.error("[OwnerProfile] POST error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to save profile" });
    }
  },
);

export default ownerProfileRoutes;
