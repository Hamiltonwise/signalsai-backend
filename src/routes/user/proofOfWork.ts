/**
 * Proof of Work API
 *
 * GET /api/user/proof-of-work
 *
 * Returns the proofline timeline: dated narratives of what Alloro
 * did for the business, drawn from agent_results (type: proofline).
 *
 * Also returns the review count history from weekly_ranking_snapshots
 * for trajectory visualization.
 *
 * These are the two missing delivery surfaces:
 * 1. "What Alloro Did" -- proves the product is working
 * 2. "Review trajectory" -- proves the trend is real
 */

import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { rbacMiddleware } from "../../middleware/rbac";
import { db } from "../../database/connection";

const proofOfWorkRoutes = express.Router();

function tryParse(s: unknown): any {
  if (typeof s === "string") {
    try { return JSON.parse(s); } catch { return null; }
  }
  return s || null;
}

proofOfWorkRoutes.get(
  "/",
  authenticateToken,
  rbacMiddleware,
  async (req: any, res) => {
    try {
      const orgId = req.user?.organizationId;
      if (!orgId) return res.status(400).json({ error: "No organization" });

      // 1. Proofline timeline: last 12 entries
      let prooflineTimeline: Array<{
        date: string;
        title: string;
        narrative: string;
        proofType: string;
        valueChange: string | null;
      }> = [];

      try {
        const rows = await db("agent_results")
          .where({ organization_id: orgId, agent_type: "proofline" })
          .whereNot("status", "archived")
          .orderBy("created_at", "desc")
          .limit(12)
          .select("agent_output", "created_at");

        prooflineTimeline = rows
          .map((row: any) => {
            const output = tryParse(row.agent_output);
            if (!output || output.skipped) return null;
            return {
              date: row.created_at,
              title: output.title || "Activity detected",
              narrative: (output.trajectory || "").replace(/<\/?hl>/g, ""),
              proofType: output.proof_type || "info",
              valueChange: output.value_change || null,
            };
          })
          .filter(Boolean) as typeof prooflineTimeline;
      } catch {
        // agent_results table may not exist
      }

      // 2. Review trajectory: historical review counts from snapshots + rankings
      let reviewTrajectory: Array<{
        date: string;
        reviewCount: number;
        competitorReviewCount: number | null;
        competitorName: string | null;
      }> = [];

      try {
        // From weekly_ranking_snapshots (most reliable weekly data)
        const snapshots = await db("weekly_ranking_snapshots")
          .where("org_id", orgId)
          .orderBy("created_at", "asc")
          .select("created_at", "client_review_count", "competitor_review_count", "competitor_name");

        const snapshotPoints = snapshots
          .filter((s: any) => s.client_review_count != null)
          .map((s: any) => ({
            date: s.created_at,
            reviewCount: s.client_review_count,
            competitorReviewCount: s.competitor_review_count || null,
            competitorName: s.competitor_name || null,
          }));

        // From practice_rankings raw_data (fills gaps between snapshots)
        const rankings = await db("practice_rankings")
          .where({ organization_id: orgId, status: "completed" })
          .orderBy("created_at", "asc")
          .select("created_at", "raw_data");

        const rankingPoints = rankings
          .map((r: any) => {
            const data = tryParse(r.raw_data);
            if (!data) return null;
            const clientReviews = data.client_gbp?.totalReviewCount || data.clientReviews || null;
            if (clientReviews == null) return null;
            const topComp = Array.isArray(data.competitors) && data.competitors.length > 0
              ? data.competitors[0]
              : null;
            return {
              date: r.created_at,
              reviewCount: clientReviews,
              competitorReviewCount: topComp?.reviewCount || null,
              competitorName: topComp?.name || null,
            };
          })
          .filter(Boolean) as typeof reviewTrajectory;

        // Merge and deduplicate by week (prefer snapshot data)
        const byWeek = new Map<string, typeof reviewTrajectory[0]>();
        for (const point of [...rankingPoints, ...snapshotPoints]) {
          const weekKey = new Date(point.date).toISOString().slice(0, 10);
          byWeek.set(weekKey, point); // later entries (snapshots) overwrite earlier
        }

        reviewTrajectory = Array.from(byWeek.values())
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      } catch {
        // tables may not exist
      }

      // 3. Full competitor landscape from latest ranking
      let competitorLandscape: Array<{
        name: string;
        reviewCount: number;
        rating: number;
        reviewVelocity: number | null;
        photosCount: number | null;
      }> = [];

      try {
        const latestRanking = await db("practice_rankings")
          .where({ organization_id: orgId, status: "completed" })
          .orderBy("created_at", "desc")
          .first("raw_data");

        if (latestRanking?.raw_data) {
          const data = tryParse(latestRanking.raw_data);
          const comps = data?.competitors || [];
          competitorLandscape = (comps as any[])
            .filter((c: any) => c.name && c.reviewCount > 0)
            .sort((a: any, b: any) => (b.reviewCount || 0) - (a.reviewCount || 0))
            .slice(0, 10)
            .map((c: any) => ({
              name: c.name,
              reviewCount: c.reviewCount || 0,
              rating: c.rating || 0,
              reviewVelocity: c.reviewsLast30d ?? null,
              photosCount: c.photosCount ?? null,
            }));
        }
      } catch {
        // table may not exist
      }

      return res.json({
        success: true,
        prooflineTimeline,
        reviewTrajectory,
        competitorLandscape,
      });
    } catch (err: any) {
      console.error("[ProofOfWork] Error:", err.message);
      return res.status(500).json({ success: false, error: "Failed to load proof of work" });
    }
  },
);

export default proofOfWorkRoutes;
