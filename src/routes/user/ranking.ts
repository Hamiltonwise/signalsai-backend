/**
 * User-Facing Ranking Route
 *
 * GET /api/user/ranking/latest
 *
 * Returns the latest ranking data for the authenticated user's organization.
 * Unlike /api/practice-ranking/latest (admin-only), this route uses
 * authenticateToken + rbacMiddleware so regular dashboard users can access
 * their own ranking data. The org is scoped from the JWT, not a query param.
 *
 * Also filters out self-competitors (same brand name) from the competitor list.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";

const router = express.Router();

router.get(
  "/latest",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.status(401).json({ success: false, error: "Auth required" });
      }

      const locationId = req.query.locationId
        ? Number(req.query.locationId)
        : null;

      // Get org name for self-competitor filtering
      const org = await db("organizations")
        .where({ id: orgId })
        .select("name")
        .first();
      const orgName = (org?.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

      // Build base filters
      const baseFilters: Record<string, unknown> = {
        organization_id: orgId,
        status: "completed",
      };
      if (locationId) {
        baseFilters.location_id = locationId;
      }

      // Find latest batch
      const latestBatchRecord = await db("practice_rankings")
        .where(baseFilters)
        .whereNotNull("batch_id")
        .orderBy("created_at", "desc")
        .first()
        .select("batch_id");

      let ranking: Record<string, unknown> | null = null;

      if (latestBatchRecord?.batch_id) {
        ranking = await db("practice_rankings")
          .where({ ...baseFilters, batch_id: latestBatchRecord.batch_id })
          .orderBy("created_at", "desc")
          .first();
      } else {
        // Fall back to legacy (no batch_id)
        ranking = await db("practice_rankings")
          .where(baseFilters)
          .whereNull("batch_id")
          .orderBy("created_at", "desc")
          .first();
      }

      if (!ranking) {
        return res.json({ success: true, rankings: [] });
      }

      // Get Google position from weekly snapshot
      const snapshot = await db("weekly_ranking_snapshots")
        .where({ org_id: orgId })
        .orderBy("week_start", "desc")
        .first();
      if (snapshot?.position) {
        (ranking as any).google_position = snapshot.position;
      }

      // Parse raw data and filter self-competitors
      let rawData =
        typeof ranking.raw_data === "string"
          ? JSON.parse(ranking.raw_data as string)
          : ranking.raw_data;

      if (!rawData && typeof ranking.results === "string") {
        try { rawData = JSON.parse(ranking.results as string); } catch { /* */ }
      }
      if (!rawData) rawData = {};

      // Filter out self-competitors (same brand name prefix)
      if (Array.isArray(rawData.competitors) && orgName) {
        rawData.competitors = rawData.competitors.filter((c: any) => {
          const cName = (c.name || c.displayName?.text || "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");
          return !cName.startsWith(orgName) && !orgName.startsWith(cName);
        });
      }

      // Ensure topCompetitor is always populated from competitors array
      // This fixes: ComparePage empty, Reviews VS Competitors placeholder,
      // Home page share prompt generic, and all downstream consumers.
      const sortedCompetitors = [...(rawData.competitors || [])].sort(
        (a: any, b: any) =>
          (b.userRatingCount || b.reviewCount || 0) -
          (a.userRatingCount || a.reviewCount || 0),
      );

      if (rawData.topCompetitor && orgName) {
        // Fix topCompetitor if it matches self
        const topName =
          typeof rawData.topCompetitor === "string"
            ? rawData.topCompetitor
            : rawData.topCompetitor?.name || "";
        const topNorm = topName.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (topNorm.startsWith(orgName) || orgName.startsWith(topNorm)) {
          rawData.topCompetitor = sortedCompetitors[0] || null;
        }
      }

      // If topCompetitor is missing entirely, compute from competitors array
      if (!rawData.topCompetitor && sortedCompetitors.length > 0) {
        rawData.topCompetitor = sortedCompetitors[0];
      }

      return res.json({
        success: true,
        rankings: [
          {
            id: ranking.id,
            status: ranking.status,
            rawData,
            created_at: ranking.created_at,
            google_position: (ranking as any).google_position || null,
          },
        ],
      });
    } catch (error: any) {
      console.error("[user/ranking/latest]", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to load ranking data",
      });
    }
  },
);

export default router;
