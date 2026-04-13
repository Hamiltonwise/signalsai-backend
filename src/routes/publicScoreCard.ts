/**
 * Public Score Card -- Shareable checkup results.
 *
 * Public (no auth) endpoint for rendering a score card
 * from a completed checkup. Used in email share links.
 */

import express from "express";
import { db } from "../database/connection";

const publicScoreCardRoutes = express.Router();

/**
 * GET /api/clarity/:orgId
 *
 * Public score card endpoint. Returns a screenshot-worthy summary
 * of an organization's Business Clarity Score. No business name exposed.
 *
 * Returns: score, rank, city, specialty, competitor count.
 */
publicScoreCardRoutes.get("/:orgId", async (req, res) => {
  try {
    const orgId = parseInt(req.params.orgId, 10);
    if (isNaN(orgId)) {
      return res.status(400).json({ success: false, error: "Invalid ID" });
    }

    const org = await db("organizations")
      .select("id", "checkup_score", "specialty", "location")
      .where({ id: orgId })
      .first();

    if (!org || !org.checkup_score) {
      return res.status(404).json({ success: false, error: "Score card not found" });
    }

    // Get latest weekly ranking snapshot for rank + competitor count
    const snapshot = await db("weekly_ranking_snapshots")
      .where({ org_id: orgId })
      .orderBy("week_start", "desc")
      .first();

    // Count competitors in same specialty + city from batch checkup results
    const competitorCount = snapshot
      ? await db("weekly_ranking_snapshots")
          .where({ org_id: orgId })
          .orderBy("week_start", "desc")
          .first()
          .then(() => {
            // Use the snapshot's competitor data if available
            return snapshot.competitor_position || 0;
          })
      : 0;

    // Fallback: count orgs with same specialty and location
    const peerCount = await db("organizations")
      .where({ specialty: org.specialty, location: org.location })
      .whereNotNull("checkup_score")
      .count("id as count")
      .first();

    const totalCompetitors = (peerCount?.count as number) || 1;

    // Calculate rank among peers (how many have a higher score)
    const higherScored = await db("organizations")
      .where({ specialty: org.specialty, location: org.location })
      .whereNotNull("checkup_score")
      .where("checkup_score", ">", org.checkup_score)
      .count("id as count")
      .first();

    const rank = snapshot?.position || ((higherScored?.count as number) || 0) + 1;

    return res.json({
      success: true,
      card: {
        score: org.checkup_score,
        rank,
        city: org.location || "Unknown",
        specialty: org.specialty || "Specialist",
        totalCompetitors,
      },
    });
  } catch (error: any) {
    console.error("[PublicScoreCard] Error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to load score card" });
  }
});

export default publicScoreCardRoutes;
