/**
 * Milestone Notifications API
 *
 * GET  /api/admin/milestones           — list milestones (admin view, all orgs)
 * GET  /api/milestones                 — list milestones (client view, own org only)
 * PATCH /api/milestones/:id/seen       — mark as seen
 * POST /api/admin/milestones/check     — manually trigger milestone check for an org
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import { processMilestones, type MilestoneInput } from "../../services/milestoneDetector";

const milestoneRoutes = express.Router();

// ─── GET /api/admin/milestones — admin: all orgs ────────────────────

milestoneRoutes.get(
  "/admin/milestones",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { organization_id, limit = "50" } = req.query;

      let query = db("milestone_notifications")
        .orderBy("created_at", "desc")
        .limit(Number(limit));

      if (organization_id) query = query.where({ organization_id });

      const milestones = await query;
      return res.json({ success: true, milestones });
    } catch (error: any) {
      console.error("[Milestones] List error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch milestones" });
    }
  },
);

// ─── GET /api/milestones — client: own org only ─────────────────────

milestoneRoutes.get(
  "/milestones",
  authenticateToken,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId || req.user?.organization_id;
      if (!orgId) {
        return res.json({ success: true, milestones: [] });
      }

      const milestones = await db("milestone_notifications")
        .where({ organization_id: orgId })
        .orderBy("created_at", "desc")
        .limit(20);

      // Count unseen
      const [{ count }] = await db("milestone_notifications")
        .where({ organization_id: orgId, seen: false })
        .count("id as count");

      return res.json({
        success: true,
        milestones,
        unseen: Number(count),
      });
    } catch (error: any) {
      console.error("[Milestones] Client list error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch milestones" });
    }
  },
);

// ─── PATCH /api/milestones/:id/seen — mark as seen ──────────────────

milestoneRoutes.patch(
  "/milestones/:id/seen",
  authenticateToken,
  async (req: any, res) => {
    try {
      const { id } = req.params;
      await db("milestone_notifications")
        .where({ id })
        .update({ seen: true });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: "Update failed" });
    }
  },
);

// ─── POST /api/admin/milestones/check — manual trigger ──────────────

milestoneRoutes.post(
  "/admin/milestones/check",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ success: false, error: "organizationId required" });
      }

      // Get the latest completed ranking for this org
      const latest = await db("practice_rankings")
        .where({ organization_id: organizationId, status: "completed" })
        .orderBy("created_at", "desc")
        .first();

      if (!latest) {
        return res.json({ success: true, milestonesDetected: 0, message: "No ranking data" });
      }

      const rawData = typeof latest.raw_data === "string"
        ? JSON.parse(latest.raw_data)
        : latest.raw_data || {};

      const org = await db("organizations").where({ id: organizationId }).first();

      // Extract competitor data
      const competitors = (rawData.competitors || []).map((c: any, i: number) => ({
        name: c.name || c.displayName || `Competitor ${i + 1}`,
        reviewCount: c.totalReviews ?? c.reviewsCount ?? c.userRatingCount ?? 0,
        position: i + 1,
      }));

      const input: MilestoneInput = {
        organizationId,
        locationId: latest.location_id,
        practiceName: org?.name || `Org #${organizationId}`,
        specialty: latest.specialty || "practice",
        city: latest.location || latest.search_city || "",
        currentPosition: latest.rank_position || 0,
        totalCompetitors: latest.total_competitors || competitors.length,
        currentReviewCount: rawData.client_gbp?.totalReviewCount ?? 0,
        competitors,
      };

      const result = await processMilestones(input);

      return res.json({
        success: true,
        ...result,
      });
    } catch (error: any) {
      console.error("[Milestones] Check error:", error.message);
      return res.status(500).json({ success: false, error: "Check failed" });
    }
  },
);

export default milestoneRoutes;
