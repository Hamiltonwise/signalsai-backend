/**
 * Clarity Scoring Engine -- Business Clarity Score
 *
 * Three sub-scores from public Google data:
 * 1. Google Position (0-34): Where you show up in search results
 * 2. Review Health (0-33): Rating, volume, recency, response rate
 * 3. GBP Completeness (0-33): Photos, hours, phone, website, description
 *
 * Total: 0-100. Publicly verifiable. No Puppeteer. No assumptions.
 *
 * Aligned to Master Build Spec (April 3 2026) and Competitive Market Definition (March 24).
 */

// Benchmarks imported from single source of truth
import { REVIEW_VOLUME_BENCHMARKS, getScoreLabel } from "./businessMetrics";
export { REVIEW_VOLUME_BENCHMARKS };

export interface PlaceData {
  rating: number;
  reviewCount: number;
  photosCount: number;
  hasHours: boolean;
  hasPhone: boolean;
  hasWebsite: boolean;
  hasEditorialSummary: boolean;
  businessStatus: string;
  reviews?: any[];
}

export interface CompetitorData {
  name: string;
  totalScore: number;
  reviewsCount: number;
  photosCount?: number;
  placeId?: string;
}

export interface SubScores {
  googlePosition: number;
  reviewHealth: number;
  gbpCompleteness: number;
  // Legacy aliases for backwards compatibility with stored checkup_data
  trust?: number;
  impression?: number;
  responsiveness?: number;
  edge?: number;
}

export interface ScoringResult {
  composite: number;
  subScores: SubScores;
  scoreLabel: string;
}

/**
 * Calculate the Business Clarity Score from place data, competitors, and position.
 *
 * This is the single source of truth for scoring. Both the initial checkup
 * and the weekly recalculation call this function.
 *
 * @param place - The business's Google Places data
 * @param competitors - Array of competitor data
 * @param specialty - Business specialty (for review volume benchmarks)
 * @param googlePosition - Optional: actual Google search position (1-based). If not provided, estimated from competitor ranking.
 */
export function calculateClarityScore(
  place: PlaceData,
  competitors: CompetitorData[],
  specialty: string,
  googlePosition?: number | null,
): ScoringResult {
  const specKey = specialty.toLowerCase();
  const clientRating = place.rating ?? 0;
  const clientReviews = place.reviewCount ?? 0;

  // --- Extract review signals ---
  let reviewResponseRate = 0;
  let hasRespondedToNegative = false;
  let allReviewsPositive = false;
  let lastReviewDaysAgo = 999;
  let responseDataAvailable = false;

  const googleReviews: any[] = place.reviews || [];
  if (googleReviews.length > 0) {
    const withResponse = googleReviews.filter((r: any) => !!r.ownerResponse);
    responseDataAvailable = withResponse.length > 0;
    if (responseDataAvailable) {
      reviewResponseRate = Math.round((withResponse.length / googleReviews.length) * 100);
    }

    const negativeReviews = googleReviews.filter((r: any) => (r.rating || 5) <= 3);
    allReviewsPositive = negativeReviews.length === 0;
    if (negativeReviews.length > 0 && responseDataAvailable) {
      hasRespondedToNegative = negativeReviews.some((r: any) => !!r.ownerResponse);
    }

    const now = Date.now();
    for (const r of googleReviews) {
      if (r.publishTime) {
        const pubDate = new Date(r.publishTime).getTime();
        if (!isNaN(pubDate)) {
          const daysAgo = Math.floor((now - pubDate) / (1000 * 60 * 60 * 24));
          if (daysAgo < lastReviewDaysAgo) lastReviewDaysAgo = daysAgo;
        }
      }
    }
    if (lastReviewDaysAgo === 999) {
      for (const r of googleReviews) {
        const desc = r.relativePublishTimeDescription || "";
        if (desc.includes("a week ago") || desc.includes("days ago") || desc.includes("yesterday") || desc.includes("an hour ago")) {
          lastReviewDaysAgo = 7;
          break;
        } else if (desc.includes("2 weeks ago")) {
          lastReviewDaysAgo = 14;
          break;
        } else if (desc.includes("a month ago") || desc.includes("3 weeks ago")) {
          lastReviewDaysAgo = 30;
          break;
        } else if (desc.includes("2 months ago")) {
          lastReviewDaysAgo = 60;
          break;
        }
      }
    }
  }

  // =====================================================================
  // SUB-SCORE 1: GOOGLE POSITION (0-34)
  // From Places API text search. Verifiable by Googling.
  // =====================================================================

  let googlePositionScore = 0;
  const pos = googlePosition ?? null;

  if (pos !== null && pos > 0) {
    if (pos === 1) googlePositionScore = 34;
    else if (pos === 2) googlePositionScore = 28;
    else if (pos === 3) googlePositionScore = 22;
    else if (pos <= 5) googlePositionScore = 16;
    else if (pos <= 10) googlePositionScore = 10;
    else if (pos <= 20) googlePositionScore = 5;
    else googlePositionScore = 2;
  } else {
    // Position unknown: assign neutral score (not penalized, not rewarded)
    googlePositionScore = 17;
  }

  // =====================================================================
  // SUB-SCORE 2: REVIEW HEALTH (0-33)
  // Rating strength + Review volume + Recency + Response rate
  // =====================================================================

  // Rating strength (0-10)
  let ratingPts = 1;
  if (clientRating >= 5.0) ratingPts = 10;
  else if (clientRating >= 4.8) ratingPts = 8;
  else if (clientRating >= 4.5) ratingPts = 6;
  else if (clientRating >= 4.0) ratingPts = 4;
  else if (clientRating >= 3.5) ratingPts = 2;

  // Review volume (0-8)
  const benchmark = REVIEW_VOLUME_BENCHMARKS[specKey] || 50;
  const volumeRatio = clientReviews / benchmark;
  let volumePts = 0;
  if (volumeRatio >= 3) volumePts = 8;
  else if (volumeRatio >= 2) volumePts = 7;
  else if (volumeRatio >= 1.5) volumePts = 6;
  else if (volumeRatio >= 1) volumePts = 5;
  else if (volumeRatio >= 0.5) volumePts = 4;
  else if (volumeRatio >= 0.25) volumePts = 2;
  else if (volumeRatio > 0) volumePts = 1;

  // Recency (0-7)
  let recencyPts = 0;
  if (lastReviewDaysAgo <= 7) recencyPts = 7;
  else if (lastReviewDaysAgo <= 14) recencyPts = 5;
  else if (lastReviewDaysAgo <= 30) recencyPts = 3;
  else if (lastReviewDaysAgo <= 60) recencyPts = 1;

  // Response rate (0-8)
  let responsePts = 0;
  if (!responseDataAvailable) {
    responsePts = 4; // Neutral when we can't verify
  } else {
    if (reviewResponseRate >= 80) responsePts = 8;
    else if (reviewResponseRate >= 50) responsePts = 6;
    else if (reviewResponseRate >= 20) responsePts = 3;
    else if (reviewResponseRate >= 1) responsePts = 1;

    // Bonus for responding to negative reviews
    if (!allReviewsPositive && hasRespondedToNegative) responsePts = Math.min(8, responsePts + 2);
  }

  const reviewHealth = Math.min(33, ratingPts + volumePts + recencyPts + responsePts);

  // =====================================================================
  // SUB-SCORE 3: GBP COMPLETENESS (0-33)
  // Photos + Hours/Phone/Website + Editorial summary + Status
  // =====================================================================

  // Photos (0-10)
  const clientPhotos = place.photosCount;
  let photoPts = 0;
  if (clientPhotos >= 10) photoPts = 10;
  else if (clientPhotos >= 8) photoPts = 9;
  else if (clientPhotos >= 5) photoPts = 7;
  else if (clientPhotos >= 2) photoPts = 4;
  else if (clientPhotos >= 1) photoPts = 2;

  // Core info completeness: hours + phone + website (0-12)
  const completenessCount = [place.hasHours, place.hasPhone, place.hasWebsite].filter(Boolean).length;
  let completenessPts = 0;
  if (completenessCount === 3) completenessPts = 12;
  else if (completenessCount === 2) completenessPts = 8;
  else if (completenessCount === 1) completenessPts = 4;

  // Editorial summary / Google AI description (0-5)
  const editorialPts = place.hasEditorialSummary ? 5 : 0;

  // Business status (0-6)
  const statusPts = (place.businessStatus === "OPERATIONAL" || place.businessStatus === "OPEN") ? 6 : 0;

  const gbpCompleteness = Math.min(33, photoPts + completenessPts + editorialPts + statusPts);

  // =====================================================================
  // COMPOSITE
  // =====================================================================

  const composite = googlePositionScore + reviewHealth + gbpCompleteness;

  return {
    composite,
    subScores: {
      googlePosition: googlePositionScore,
      reviewHealth,
      gbpCompleteness,
      // Legacy aliases so old code doesn't break during transition
      trust: reviewHealth,
      impression: gbpCompleteness,
      responsiveness: responsePts,
      edge: googlePositionScore,
    },
    scoreLabel: getScoreLabel(composite),
  };
}
