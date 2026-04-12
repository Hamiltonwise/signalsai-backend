/**
 * Review Sentiment Comparison API
 *
 * GET /api/user/review-sentiment
 *
 * Returns theme comparison between the org's Google reviews and their
 * top competitor's reviews. This is the "how did they know that?" moment:
 * it surfaces what competitors are praised for that you are not.
 *
 * Uses the existing compareReviewSentiment() service which fetches
 * reviews from Google Places API and uses Claude for theme extraction.
 *
 * Response is cached in checkup_data.sentimentComparison to avoid
 * re-running Claude on every page load. Cache TTL: 7 days.
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { compareReviewSentiment } from "../../services/reviewSentiment";

const router = express.Router();

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

router.get(
  "/review-sentiment",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) {
        return res.status(401).json({ success: false, error: "Auth required" });
      }

      const org = await db("organizations").where({ id: orgId }).first();
      if (!org?.checkup_data) {
        return res.json({ success: true, comparison: null, reason: "no_checkup" });
      }

      const checkup =
        typeof org.checkup_data === "string"
          ? JSON.parse(org.checkup_data)
          : org.checkup_data;

      // Check cache first
      const cached = checkup.sentimentComparison;
      if (cached?.generatedAt) {
        const age = Date.now() - new Date(cached.generatedAt).getTime();
        if (age < CACHE_TTL_MS) {
          return res.json({ success: true, comparison: cached.data, cached: true });
        }
      }

      // Resolve place IDs
      const clientPlaceId = checkup.placeId || checkup.place?.placeId || null;

      // Prefer target competitor, fall back to topCompetitor from checkup,
      // then fall back to ranking data
      let competitorPlaceId: string | null = null;
      let competitorName: string | null = null;

      if (org.target_competitor_name && org.target_competitor_place_id) {
        competitorName = org.target_competitor_name;
        competitorPlaceId = org.target_competitor_place_id;
      } else {
        const topComp = checkup.topCompetitor;
        if (typeof topComp === "object" && topComp) {
          competitorPlaceId = topComp.placeId || topComp.place_id || null;
          competitorName = topComp.name || topComp.displayName?.text || null;
        }
      }

      // If still no competitor, try ranking data
      if (!competitorPlaceId) {
        const latestRanking = await db("practice_rankings")
          .where({ organization_id: orgId, status: "completed" })
          .orderBy("created_at", "desc")
          .first();

        if (latestRanking?.raw_data) {
          const raw =
            typeof latestRanking.raw_data === "string"
              ? JSON.parse(latestRanking.raw_data)
              : latestRanking.raw_data;
          const competitors = raw.competitors || [];
          const orgNameNorm = (org.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

          const filtered = competitors
            .filter((c: any) => {
              const cName = (c.name || c.displayName?.text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
              return !cName.startsWith(orgNameNorm) && !orgNameNorm.startsWith(cName);
            })
            .sort(
              (a: any, b: any) =>
                (b.userRatingCount || b.reviewCount || 0) -
                (a.userRatingCount || a.reviewCount || 0),
            );

          if (filtered.length > 0) {
            const top = filtered[0];
            competitorPlaceId = top.placeId || top.place_id || top.id || null;
            competitorName = top.name || top.displayName?.text || null;
          }
        }
      }

      if (!clientPlaceId) {
        return res.json({ success: true, comparison: null, reason: "no_place_id" });
      }
      if (!competitorPlaceId || !competitorName) {
        return res.json({ success: true, comparison: null, reason: "no_competitor" });
      }

      // Run the comparison
      const comparison = await compareReviewSentiment({
        clientPlaceId,
        clientName: org.name || "Your practice",
        competitorPlaceId,
        competitorName,
      });

      // Cache the result in checkup_data
      const updatedCheckup = {
        ...checkup,
        sentimentComparison: {
          generatedAt: new Date().toISOString(),
          data: comparison,
        },
      };

      await db("organizations")
        .where({ id: orgId })
        .update({ checkup_data: JSON.stringify(updatedCheckup) });

      return res.json({ success: true, comparison, cached: false });
    } catch (error: any) {
      console.error("[review-sentiment]", error.message);
      return res.status(500).json({
        success: false,
        error: "Failed to generate sentiment comparison",
      });
    }
  },
);

export default router;
