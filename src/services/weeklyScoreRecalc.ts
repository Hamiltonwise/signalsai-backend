/**
 * Weekly Score Recalculation Service
 *
 * Recalculates the Business Clarity Score for each org using fresh
 * Google Places data. Runs every Sunday night before the Monday email
 * so the email can open with the score delta.
 *
 * This is what makes the score ALIVE. A static number is a report.
 * A number that moves is a relationship.
 */

import { db } from "../database/connection";
import { getPlaceDetails } from "../controllers/places/feature-services/GooglePlacesApiService";
import {
  discoverCompetitorsWithFallback,
} from "../controllers/practice-ranking/feature-services/service.places-competitor-discovery";
import { calculateClarityScore, type SubScores } from "./clarityScoring";

export interface RecalcResult {
  previousScore: number;
  newScore: number;
  delta: number;
  subScores: SubScores;
  changes: string[];
}

/**
 * Recalculate the Business Clarity Score for a single org.
 *
 * 1. Reads stored checkup_data for placeId and market context
 * 2. Fetches fresh Google Places data (rating, reviews, photos, hours)
 * 3. Refreshes top competitor data
 * 4. Runs the shared scoring algorithm
 * 5. Compares to previous score and returns the delta
 * 6. Stores new score on the org for the Monday email
 */
export async function recalculateScore(orgId: number): Promise<RecalcResult | null> {
  const org = await db("organizations")
    .where({ id: orgId })
    .select(
      "id",
      "name",
      "checkup_data",
      "checkup_score",
      "current_clarity_score",
      "score_history",
    )
    .first();

  if (!org) {
    console.log(`[WeeklyRecalc] Org ${orgId} not found`);
    return null;
  }

  const checkupData = org.checkup_data
    ? (typeof org.checkup_data === "string" ? JSON.parse(org.checkup_data) : org.checkup_data)
    : null;

  if (!checkupData) {
    console.log(`[WeeklyRecalc] Org ${orgId} (${org.name}) has no checkup_data, skipping`);
    return null;
  }

  // Extract the placeId from checkup data
  const placeId = checkupData.placeId
    || checkupData.place?.placeId
    || checkupData.place?.place_id
    || null;

  if (!placeId) {
    console.log(`[WeeklyRecalc] Org ${orgId} (${org.name}) has no placeId, skipping`);
    return null;
  }

  const specialty = checkupData.market?.specialty || checkupData.specialty || "local business";
  const city = checkupData.market?.city || checkupData.city || "";
  const previousScore = org.current_clarity_score ?? org.checkup_score ?? 0;

  // Track what changed for the email narrative
  const changes: string[] = [];

  try {
    // 1. Fetch fresh place details from Google
    const freshPlace = await getPlaceDetails(placeId);
    if (!freshPlace) {
      console.log(`[WeeklyRecalc] Google Places returned nothing for ${placeId}, skipping`);
      return null;
    }

    const freshRating = freshPlace.rating ?? 0;
    const freshReviewCount = freshPlace.userRatingCount ?? freshPlace.reviewCount ?? 0;
    const freshPhotos = freshPlace.photos?.length ?? 0;
    const freshHours = freshPlace.regularOpeningHours
      ? ((freshPlace.regularOpeningHours.periods?.length || 0) > 0
        || (freshPlace.regularOpeningHours.weekdayDescriptions?.length || 0) > 0)
      : false;
    const freshPhone = !!freshPlace.nationalPhoneNumber || !!freshPlace.internationalPhoneNumber;
    const freshWebsite = !!freshPlace.websiteUri;
    const freshEditorial = !!freshPlace.editorialSummary?.text;
    const freshStatus = freshPlace.businessStatus || "OPERATIONAL";

    // Compare to stored data for change narrative
    const oldReviewCount = checkupData.place?.reviewCount ?? checkupData.reviewCount ?? 0;
    const oldRating = checkupData.place?.rating ?? checkupData.rating ?? 0;
    const oldPhotos = checkupData.place?.photoCount ?? checkupData.place?.photos ?? 0;

    if (freshReviewCount > oldReviewCount) {
      changes.push(`gained ${freshReviewCount - oldReviewCount} review${freshReviewCount - oldReviewCount !== 1 ? "s" : ""}`);
    } else if (freshReviewCount < oldReviewCount) {
      changes.push(`lost ${oldReviewCount - freshReviewCount} review${oldReviewCount - freshReviewCount !== 1 ? "s" : ""}`);
    }

    if (Math.abs(freshRating - oldRating) >= 0.1) {
      changes.push(`rating ${freshRating > oldRating ? "rose" : "dropped"} from ${oldRating} to ${freshRating}`);
    }

    if (freshPhotos > oldPhotos) {
      changes.push(`added ${freshPhotos - oldPhotos} photo${freshPhotos - oldPhotos !== 1 ? "s" : ""}`);
    }

    // 2. Refresh competitor data (with fallback broadening)
    let competitors: any[] = [];
    try {
      if (city) {
        const result = await discoverCompetitorsWithFallback(specialty, city, 10);
        // Exclude self from competitor list
        competitors = result.competitors.filter(
          (c) => c.placeId !== placeId && c.name?.toLowerCase() !== org.name?.toLowerCase()
        );
      }
    } catch (compErr) {
      console.error(`[WeeklyRecalc] Competitor discovery failed for org ${orgId}:`, compErr instanceof Error ? compErr.message : compErr);
      // Use stored competitors as fallback
      if (checkupData.competitors) {
        competitors = checkupData.competitors.map((c: any) => ({
          name: c.name,
          totalScore: c.rating ?? c.totalScore ?? 0,
          reviewsCount: c.reviewCount ?? c.reviewsCount ?? 0,
          photosCount: c.photosCount ?? 0,
        }));
      }
    }

    // Compare top competitor changes
    const storedTopComp = checkupData.topCompetitor;
    if (competitors.length > 0 && storedTopComp) {
      const newTopComp = competitors[0];
      const compReviewDelta = (newTopComp.reviewsCount ?? 0) - (storedTopComp.reviewCount ?? 0);
      if (compReviewDelta > 0) {
        changes.push(`${storedTopComp.name || "top competitor"} added ${compReviewDelta} review${compReviewDelta !== 1 ? "s" : ""}`);
      }
    }

    // 3. Run the scoring algorithm
    const result = calculateClarityScore(
      {
        rating: freshRating,
        reviewCount: freshReviewCount,
        photosCount: freshPhotos,
        hasHours: freshHours,
        hasPhone: freshPhone,
        hasWebsite: freshWebsite,
        hasEditorialSummary: freshEditorial,
        businessStatus: freshStatus,
        reviews: freshPlace.reviews || [],
      },
      competitors.map((c) => ({
        name: c.name,
        totalScore: c.totalScore ?? c.rating ?? 0,
        reviewsCount: c.reviewsCount ?? c.reviewCount ?? 0,
        photosCount: c.photosCount ?? 0,
      })),
      specialty,
    );

    const newScore = result.composite;
    const delta = newScore - previousScore;

    if (delta !== 0 && changes.length === 0) {
      changes.push("competitive landscape shifted");
    }

    // 4. Build score history
    const existingHistory: Array<{ score: number; date: string }> = org.score_history
      ? (typeof org.score_history === "string" ? JSON.parse(org.score_history) : org.score_history)
      : [];

    const newHistory = [
      ...existingHistory,
      { score: newScore, date: new Date().toISOString().split("T")[0] },
    ].slice(-52); // Keep 1 year of weekly data

    // 5. Store updated score on the org
    await db("organizations").where({ id: orgId }).update({
      current_clarity_score: newScore,
      previous_clarity_score: previousScore,
      score_updated_at: new Date(),
      score_history: JSON.stringify(newHistory),
    });

    // Also update the stored checkup_data with fresh place data
    // so the dashboard shows current info
    const updatedCheckupData = {
      ...checkupData,
      place: {
        ...(checkupData.place || {}),
        rating: freshRating,
        reviewCount: freshReviewCount,
        photoCount: freshPhotos,
      },
      score: {
        composite: newScore,
        trustSignal: result.subScores.trust,
        firstImpression: result.subScores.impression,
        responsiveness: result.subScores.responsiveness,
        competitiveEdge: result.subScores.edge,
      },
    };

    await db("organizations").where({ id: orgId }).update({
      checkup_data: JSON.stringify(updatedCheckupData),
      checkup_score: newScore,
    });

    console.log(
      `[WeeklyRecalc] Org ${orgId} (${org.name}): ${previousScore} -> ${newScore} (${delta >= 0 ? "+" : ""}${delta}) | Changes: ${changes.join(", ") || "none"}`,
    );

    return {
      previousScore,
      newScore,
      delta,
      subScores: result.subScores,
      changes,
    };
  } catch (err) {
    console.error(`[WeeklyRecalc] Failed for org ${orgId} (${org.name}):`, err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Recalculate scores for ALL orgs that have a placeId.
 * Returns summary stats.
 */
export async function recalculateAllScores(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  // Find all orgs with checkup data (they have placeIds)
  const orgs = await db("organizations")
    .whereNotNull("checkup_data")
    .select("id", "name");

  let processed = 0;
  let updated = 0;
  let errors = 0;

  for (const org of orgs) {
    try {
      const result = await recalculateScore(org.id);
      processed++;
      if (result) updated++;
    } catch (err) {
      errors++;
      console.error(`[WeeklyRecalc] Error for org ${org.id} (${org.name}):`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[WeeklyRecalc] Complete: ${updated}/${processed} updated, ${errors} errors`);
  return { processed, updated, errors };
}
