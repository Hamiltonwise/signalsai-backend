/**
 * Batch Checkup Runner — WO18
 *
 * POST /api/admin/batch-checkup    — submit a batch of practices to analyze
 * GET  /api/admin/batch-checkup/:id — poll batch status + results
 */

import express from "express";
import { v4 as uuid } from "uuid";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import { db } from "../../database/connection";
import {
  autocomplete as placesAutocomplete,
  getPlaceDetails as placesGetDetails,
} from "../../controllers/places/feature-services/GooglePlacesApiService";
import { transformPlaceDetailsResponse } from "../../controllers/places/feature-services/PlaceDataTransformService";
import {
  discoverCompetitorsViaPlaces,
  filterBySpecialty,
} from "../../controllers/practice-ranking/feature-services/service.places-competitor-discovery";
import { calculateClarityScore } from "../../services/clarityScoring";

const batchCheckupRoutes = express.Router();

const MAX_PRACTICES = 100;

// Scoring uses the single source of truth: clarityScoring.ts
// No duplicate algorithm. One function. One score.

// ─── Analyze a single practice ──────────────────────────────────────

async function analyzePractice(
  name: string,
  city: string,
  state: string,
): Promise<{
  score: number;
  topCompetitorName: string | null;
  topCompetitorReviews: number;
  practiceReviews: number;
  primaryGap: string;
  placeId: string | null;
}> {
  // 1. Find the practice via autocomplete
  const query = `${name} ${city} ${state}`.trim();
  const suggestions = await placesAutocomplete(query);

  if (!suggestions || suggestions.length === 0) {
    return {
      score: 0,
      topCompetitorName: null,
      topCompetitorReviews: 0,
      practiceReviews: 0,
      primaryGap: "Practice not found in Google Places",
      placeId: null,
    };
  }

  const firstPlaceId = suggestions[0]?.placePrediction?.placeId;
  if (!firstPlaceId) {
    return {
      score: 0,
      topCompetitorName: null,
      topCompetitorReviews: 0,
      practiceReviews: 0,
      primaryGap: "No valid place ID returned",
      placeId: null,
    };
  }

  // 2. Get place details
  const rawDetails = await placesGetDetails(firstPlaceId);
  const place = transformPlaceDetailsResponse(rawDetails, firstPlaceId);

  // 3. Discover competitors
  const specialty = place.category || "dentist";
  const marketLocation = state ? `${city}, ${state}` : city;
  const allCompetitors = await discoverCompetitorsViaPlaces(specialty, marketLocation, 15);
  const competitors = filterBySpecialty(allCompetitors, specialty);
  const otherCompetitors = competitors.filter(
    (c) => c.placeId !== firstPlaceId && c.name.toLowerCase() !== name.toLowerCase(),
  );

  // 4. Score using the single source of truth
  const scoringResult = calculateClarityScore(
    {
      rating: place.rating ?? 0,
      reviewCount: place.reviewCount ?? 0,
      photosCount: place.photos?.length ?? 0,
      hasHours: !!place.regularOpeningHours,
      hasPhone: !!place.phone,
      hasWebsite: !!place.websiteUri,
      hasEditorialSummary: !!place.editorialSummary,
      businessStatus: place.businessStatus || "OPERATIONAL",
      reviews: place.reviews || [],
    },
    otherCompetitors.map((c) => ({
      name: c.name,
      totalScore: c.totalScore || 0,
      reviewsCount: c.reviewsCount || 0,
      photosCount: c.photosCount,
      placeId: c.placeId,
    })),
    specialty,
  );

  const topComp = otherCompetitors[0] || null;
  const reviewGap = topComp ? Math.max(0, (topComp.reviewsCount || 0) - (place.reviewCount ?? 0)) : 0;
  const primaryGap = topComp
    ? reviewGap > 0
      ? `${topComp.name} has ${reviewGap} more reviews`
      : `${topComp.name} is your closest competitor`
    : "";

  return {
    score: scoringResult.composite,
    topCompetitorName: topComp?.name || null,
    topCompetitorReviews: topComp?.reviewsCount || 0,
    practiceReviews: place.reviewCount ?? 0,
    primaryGap,
    placeId: firstPlaceId,
  };
}

// ─── POST /api/admin/batch-checkup — submit batch ───────────────────

batchCheckupRoutes.post(
  "/",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { practices, mode } = req.body;
      const isOutreachScan = mode === "outreach_scan";

      if (!Array.isArray(practices) || practices.length === 0) {
        return res.status(400).json({
          success: false,
          error: "practices array is required",
        });
      }

      if (practices.length > MAX_PRACTICES) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${MAX_PRACTICES} practices per batch`,
        });
      }

      const batchId = uuid();

      // Insert pending rows
      const rows = practices.map((p: any) => ({
        batch_id: batchId,
        practice_name: p.name?.trim() || null,
        city: p.city?.trim() || null,
        state: p.state?.trim() || null,
        status: "pending",
      }));

      await db("batch_checkup_results").insert(rows);

      console.log(
        `[BatchCheckup] Batch ${batchId} created with ${practices.length} practices (mode: ${mode || "standard"})`,
      );

      // Process async — don't block the response
      processBackgroundBatch(batchId, isOutreachScan).catch((err) =>
        console.error(`[BatchCheckup] Batch ${batchId} error:`, err.message),
      );

      return res.json({
        success: true,
        batchId,
        status: "processing",
        total: practices.length,
        mode: isOutreachScan ? "outreach_scan" : "standard",
      });
    } catch (error: any) {
      console.error("[BatchCheckup] Submit error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to start batch" });
    }
  },
);

// ─── GET /api/admin/batch-checkup/:id — poll status ─────────────────

batchCheckupRoutes.get(
  "/:id",
  authenticateToken,
  superAdminMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;

      const results = await db("batch_checkup_results")
        .where({ batch_id: id })
        .orderBy("created_at", "asc");

      if (results.length === 0) {
        return res.status(404).json({ success: false, error: "Batch not found" });
      }

      const completed = results.filter((r: any) => r.status === "completed").length;
      const failed = results.filter((r: any) => r.status === "failed").length;
      const total = results.length;
      const allDone = completed + failed === total;

      return res.json({
        success: true,
        batchId: id,
        status: allDone ? "completed" : "processing",
        total,
        completed,
        failed,
        results: results.map((r: any) => ({
          id: r.id,
          practiceName: r.practice_name,
          city: r.city,
          state: r.state,
          score: r.score,
          topCompetitorName: r.top_competitor_name,
          topCompetitorReviews: r.top_competitor_reviews,
          practiceReviews: r.practice_reviews,
          primaryGap: r.primary_gap,
          placeId: r.place_id,
          emailParagraph: r.email_paragraph,
          status: r.status,
        })),
      });
    } catch (error: any) {
      console.error("[BatchCheckup] Poll error:", error.message);
      return res.status(500).json({ success: false, error: "Failed to fetch batch" });
    }
  },
);

// ─── Background processor ───────────────────────────────────────────

async function processBackgroundBatch(batchId: string, isOutreachScan = false): Promise<void> {
  const pending = await db("batch_checkup_results")
    .where({ batch_id: batchId, status: "pending" })
    .orderBy("created_at", "asc");

  const outreachResults: any[] = [];

  for (const row of pending) {
    try {
      const result = await analyzePractice(
        row.practice_name || "",
        row.city || "",
        row.state || "",
      );

      await db("batch_checkup_results").where({ id: row.id }).update({
        score: result.score,
        top_competitor_name: result.topCompetitorName,
        top_competitor_reviews: result.topCompetitorReviews,
        practice_reviews: result.practiceReviews,
        primary_gap: result.primaryGap,
        place_id: result.placeId,
        status: "completed",
      });

      console.log(
        `[BatchCheckup] ${row.practice_name}: score ${result.score}`,
      );

      // Build outreach scan result
      if (isOutreachScan) {
        outreachResults.push({
          practice_name: row.practice_name,
          primary_competitor_name: result.topCompetitorName,
          primary_competitor_review_count: result.topCompetitorReviews,
          lead_review_count: result.practiceReviews,
          ranking_position: result.score > 0 ? Math.ceil((100 - result.score) / 10) : null,
          review_gap: Math.max(0, (result.topCompetitorReviews || 0) - (result.practiceReviews || 0)),
          top_issue: result.primaryGap,
          checkup_link: result.placeId
            ? `https://getalloro.com/checkup?placeId=${result.placeId}`
            : `https://getalloro.com/checkup`,
        });
      }

      // Small delay to avoid hammering Places API
      await new Promise((r) => setTimeout(r, 500));
    } catch (err: any) {
      console.error(
        `[BatchCheckup] Failed: ${row.practice_name}:`,
        err.message,
      );
      await db("batch_checkup_results")
        .where({ id: row.id })
        .update({ status: "failed", primary_gap: err.message });
    }
  }

  console.log(`[BatchCheckup] Batch ${batchId} complete (mode: ${isOutreachScan ? "outreach_scan" : "standard"})`);

  // Outreach scan: POST summary to ProspectAI
  if (isOutreachScan && outreachResults.length > 0) {
    const PROSPECT_AI_WEBHOOK = process.env.PROSPECT_AI_WEBHOOK_URL;
    if (PROSPECT_AI_WEBHOOK) {
      try {
        const axios = await import("axios");
        await axios.default.post(PROSPECT_AI_WEBHOOK, {
          batch_id: batchId,
          total: outreachResults.length,
          results: outreachResults,
        }, { timeout: 30000 });
        console.log(`[BatchCheckup] Outreach scan posted to ProspectAI: ${outreachResults.length} leads`);
      } catch (err: any) {
        console.error(`[BatchCheckup] ProspectAI webhook failed:`, err.message);
      }
    } else {
      console.log(`[BatchCheckup] PROSPECT_AI_WEBHOOK_URL not set — outreach results logged only`);
    }
  }
}

export default batchCheckupRoutes;
