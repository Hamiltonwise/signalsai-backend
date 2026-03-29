/**
 * Alloro Labs -- Public Benchmark Data API
 *
 * GET /api/labs/benchmarks?specialty=endodontist
 * Returns aggregated, anonymized benchmark data for a specialty.
 * Only returns data if sampleSize >= 5 to protect anonymity.
 *
 * Powers "State of Business Clarity" content and research posts.
 */

import { Router, Request, Response } from "express";
import { db } from "../database/connection";

const router = Router();

router.get("/benchmarks", async (req: Request, res: Response) => {
  try {
    const { specialty } = req.query;

    if (!specialty || typeof specialty !== "string") {
      return res.status(400).json({
        error: "specialty query parameter is required",
      });
    }

    const normalizedSpecialty = specialty.toLowerCase().trim();

    // Get organizations matching this specialty
    const orgIds = await db("organizations")
      .whereRaw("LOWER(specialty) = ?", [normalizedSpecialty])
      .select("id");

    if (orgIds.length < 5) {
      return res.json({
        specialty: normalizedSpecialty,
        sampleSize: orgIds.length,
        message: "Insufficient sample size. Minimum 5 organizations required for anonymized benchmarks.",
        data: null,
      });
    }

    const ids = orgIds.map((o: any) => o.id);

    // Get latest weekly ranking snapshots for these orgs
    const snapshots = await db("weekly_ranking_snapshots")
      .whereIn("organization_id", ids)
      .whereRaw(
        "created_at >= NOW() - INTERVAL '30 days'"
      )
      .orderBy("created_at", "desc");

    // Deduplicate: keep only the latest snapshot per org
    const latestByOrg = new Map<number, any>();
    for (const snap of snapshots) {
      if (!latestByOrg.has(snap.organization_id)) {
        latestByOrg.set(snap.organization_id, snap);
      }
    }

    const latestSnapshots = Array.from(latestByOrg.values());

    if (latestSnapshots.length < 5) {
      return res.json({
        specialty: normalizedSpecialty,
        sampleSize: latestSnapshots.length,
        message: "Insufficient snapshot data. Minimum 5 organizations with recent data required.",
        data: null,
      });
    }

    // Calculate aggregated benchmarks
    const scores = latestSnapshots
      .map((s: any) => s.overall_score || s.score)
      .filter((s: any) => s != null && !isNaN(s));
    const reviewCounts = latestSnapshots
      .map((s: any) => s.review_count)
      .filter((r: any) => r != null && !isNaN(r));
    const ratings = latestSnapshots
      .map((s: any) => s.average_rating || s.rating)
      .filter((r: any) => r != null && !isNaN(r));
    const competitorCounts = latestSnapshots
      .map((s: any) => s.competitor_count || s.total_competitors)
      .filter((c: any) => c != null && !isNaN(c));

    const avg = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const topPercentile = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => b - a);
      return sorted[Math.floor(sorted.length * 0.1)] || sorted[0];
    };

    return res.json({
      specialty: normalizedSpecialty,
      sampleSize: latestSnapshots.length,
      data: {
        avgScore: Math.round(avg(scores) * 10) / 10,
        avgReviewCount: Math.round(avg(reviewCounts)),
        avgRating: Math.round(avg(ratings) * 100) / 100,
        avgCompetitorCount: Math.round(avg(competitorCounts)),
        topPercentileScore: Math.round(topPercentile(scores) * 10) / 10,
        sampleSize: latestSnapshots.length,
      },
    });
  } catch (err) {
    console.error("[AlloroLabs] Benchmark error:", err);
    return res.status(500).json({ error: "Failed to generate benchmarks" });
  }
});

export default router;
