/**
 * Tracked Competitors API
 *
 * POST /api/user/competitors/track    - Add a competitor by placeId
 * GET  /api/user/competitors          - List tracked competitors
 * DELETE /api/user/competitors/:placeId - Remove a tracked competitor
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware, type RBACRequest } from "../../middleware/rbac";
import { db } from "../../database/connection";
import { getPlaceDetails } from "../../controllers/places/feature-services/GooglePlacesApiService";

const competitorRoutes = express.Router();

const MAX_TRACKED = 3;

interface TrackedCompetitor {
  placeId: string;
  name: string;
  rating: number;
  reviewCount: number;
  photoCount: number;
  lastReviewRelative: string | null;
  address: string | null;
  lastUpdated: string;
}

/**
 * GET /api/user/competitors
 * Returns tracked competitors with their latest data.
 */
competitorRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

      const org = await db("organizations")
        .where({ id: orgId })
        .select("tracked_competitors")
        .first();

      const competitors: TrackedCompetitor[] = org?.tracked_competitors
        ? (typeof org.tracked_competitors === "string"
            ? JSON.parse(org.tracked_competitors)
            : org.tracked_competitors)
        : [];

      return res.json({ success: true, competitors });
    } catch (error: any) {
      console.error("[Competitors] GET error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to load competitors" });
    }
  },
);

/**
 * POST /api/user/competitors/track
 * Adds a competitor by placeId. Fetches their GBP data for comparison.
 */
competitorRoutes.post(
  "/track",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

      const { placeId } = req.body;
      if (!placeId) {
        return res.status(400).json({ success: false, error: "placeId is required" });
      }

      // Load current tracked competitors
      const org = await db("organizations")
        .where({ id: orgId })
        .select("tracked_competitors")
        .first();

      const current: TrackedCompetitor[] = org?.tracked_competitors
        ? (typeof org.tracked_competitors === "string"
            ? JSON.parse(org.tracked_competitors)
            : org.tracked_competitors)
        : [];

      // Check limit
      if (current.length >= MAX_TRACKED) {
        return res.status(400).json({
          success: false,
          error: `You can track up to ${MAX_TRACKED} competitors. Remove one first.`,
        });
      }

      // Check duplicate
      if (current.some((c) => c.placeId === placeId)) {
        return res.status(400).json({
          success: false,
          error: "This competitor is already tracked.",
        });
      }

      // Fetch competitor data from Google Places
      let placeData: any;
      try {
        placeData = await getPlaceDetails(placeId);
      } catch (err: any) {
        console.error("[Competitors] Places API error:", err.message);
        return res.status(400).json({
          success: false,
          error: "Could not fetch business data. Please try again.",
        });
      }

      // Extract the last review relative time
      const reviews = placeData?.reviews || [];
      let lastReviewRelative: string | null = null;
      if (reviews.length > 0) {
        // Reviews are sorted most recent first by Google
        lastReviewRelative = reviews[0]?.relativePublishTimeDescription || null;
      }

      const competitor: TrackedCompetitor = {
        placeId,
        name: placeData?.displayName?.text || placeData?.name || "Unknown",
        rating: placeData?.rating ?? 0,
        reviewCount: placeData?.userRatingCount ?? 0,
        photoCount: placeData?.photos?.length ?? 0,
        lastReviewRelative,
        address: placeData?.formattedAddress || placeData?.shortFormattedAddress || null,
        lastUpdated: new Date().toISOString(),
      };

      const updated = [...current, competitor];

      await db("organizations")
        .where({ id: orgId })
        .update({ tracked_competitors: JSON.stringify(updated) });

      return res.json({ success: true, competitor, competitors: updated });
    } catch (error: any) {
      console.error("[Competitors] POST error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to track competitor" });
    }
  },
);

/**
 * DELETE /api/user/competitors/:placeId
 * Removes a tracked competitor.
 */
competitorRoutes.delete(
  "/:placeId",
  authenticateToken,
  rbacMiddleware,
  async (req: RBACRequest, res) => {
    try {
      const orgId = req.organizationId;
      if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

      const { placeId } = req.params;

      const org = await db("organizations")
        .where({ id: orgId })
        .select("tracked_competitors")
        .first();

      const current: TrackedCompetitor[] = org?.tracked_competitors
        ? (typeof org.tracked_competitors === "string"
            ? JSON.parse(org.tracked_competitors)
            : org.tracked_competitors)
        : [];

      const updated = current.filter((c) => c.placeId !== placeId);

      await db("organizations")
        .where({ id: orgId })
        .update({ tracked_competitors: JSON.stringify(updated) });

      return res.json({ success: true, competitors: updated });
    } catch (error: any) {
      console.error("[Competitors] DELETE error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to remove competitor" });
    }
  },
);

export default competitorRoutes;
