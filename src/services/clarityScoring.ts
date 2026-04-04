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
 *
 * Weights are configurable via the scoring_config DB table (admin panel).
 * Falls back to hardcoded defaults if the table is missing or empty.
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
 * Scoring config: a flat map of key -> numeric value.
 * Loaded from the scoring_config DB table, with hardcoded fallbacks.
 */
export type ScoringConfig = Record<string, number>;

// Hardcoded defaults: the single source of truth when DB is unavailable
const DEFAULTS: ScoringConfig = {
  // Sub-score maxes
  google_position_max: 34,
  review_health_max: 33,
  gbp_completeness_max: 33,

  // Position tiers
  position_tier_1: 34,
  position_tier_2: 28,
  position_tier_3: 22,
  position_tier_top5: 16,
  position_tier_top10: 10,
  position_tier_top20: 5,
  position_tier_beyond20: 2,
  position_unknown: 17,

  // Rating points
  rating_5_0_pts: 10,
  rating_4_8_pts: 8,
  rating_4_5_pts: 6,
  rating_4_0_pts: 4,
  rating_3_5_pts: 2,
  rating_below_3_5_pts: 1,

  // Volume ratio points
  volume_ratio_3x_pts: 8,
  volume_ratio_2x_pts: 7,
  volume_ratio_1_5x_pts: 6,
  volume_ratio_1x_pts: 5,
  volume_ratio_0_5x_pts: 4,
  volume_ratio_0_25x_pts: 2,

  // Photo points
  photos_10_plus_pts: 10,
  photos_8_plus_pts: 9,
  photos_5_plus_pts: 7,
  photos_2_plus_pts: 4,
  photos_1_pts: 2,

  // Completeness points
  completeness_all_3_pts: 12,
  completeness_2_of_3_pts: 8,
  completeness_1_of_3_pts: 4,
  editorial_summary_pts: 5,
  business_status_operational_pts: 6,
};

// --- Config cache (5-minute TTL) ---
let cachedConfig: ScoringConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Load scoring config from the scoring_config DB table.
 * Returns hardcoded defaults if the table doesn't exist or query fails.
 * Results are cached for 5 minutes.
 */
export async function loadScoringConfig(): Promise<ScoringConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    // Dynamic import to avoid circular dependency issues at module load
    const { db } = await import("../database/connection");
    const rows = await db("scoring_config").select("key", "value");
    if (rows && rows.length > 0) {
      const fromDb: ScoringConfig = {};
      for (const row of rows) {
        fromDb[row.key] = Number(row.value);
      }
      // Merge: DB values override defaults, but missing keys fall back
      cachedConfig = { ...DEFAULTS, ...fromDb };
    } else {
      cachedConfig = { ...DEFAULTS };
    }
  } catch {
    // Table doesn't exist or DB error: use hardcoded defaults silently
    cachedConfig = { ...DEFAULTS };
  }

  cacheTimestamp = now;
  return cachedConfig;
}

/**
 * Get config synchronously (returns cached or defaults).
 * Use loadScoringConfig() for a fresh read.
 */
export function getScoringConfigSync(): ScoringConfig {
  return cachedConfig ?? { ...DEFAULTS };
}

/**
 * Get the hardcoded defaults (useful for comparison in preview).
 */
export function getScoringDefaults(): ScoringConfig {
  return { ...DEFAULTS };
}

/**
 * Force-clear the config cache (e.g., after admin update).
 */
export function clearScoringConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
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
 * @param configOverrides - Optional: override config values for preview/simulation without saving
 */
export function calculateClarityScore(
  place: PlaceData,
  competitors: CompetitorData[],
  specialty: string,
  googlePosition?: number | null,
  configOverrides?: ScoringConfig,
): ScoringResult {
  // Merge: defaults <- cached DB config <- overrides
  const cfg: ScoringConfig = {
    ...getScoringConfigSync(),
    ...(configOverrides || {}),
  };

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
  // SUB-SCORE 1: GOOGLE POSITION (0-{google_position_max})
  // From Places API text search. Verifiable by Googling.
  // =====================================================================

  let googlePositionScore = 0;
  const pos = googlePosition ?? null;

  if (pos !== null && pos > 0) {
    if (pos === 1) googlePositionScore = cfg.position_tier_1;
    else if (pos === 2) googlePositionScore = cfg.position_tier_2;
    else if (pos === 3) googlePositionScore = cfg.position_tier_3;
    else if (pos <= 5) googlePositionScore = cfg.position_tier_top5;
    else if (pos <= 10) googlePositionScore = cfg.position_tier_top10;
    else if (pos <= 20) googlePositionScore = cfg.position_tier_top20;
    else googlePositionScore = cfg.position_tier_beyond20;
  } else {
    // Position unknown: assign neutral score (not penalized, not rewarded)
    googlePositionScore = cfg.position_unknown;
  }

  // =====================================================================
  // SUB-SCORE 2: REVIEW HEALTH (0-{review_health_max})
  // Rating strength + Review volume + Recency + Response rate
  // =====================================================================

  // Rating strength (0-10)
  let ratingPts = cfg.rating_below_3_5_pts;
  if (clientRating >= 5.0) ratingPts = cfg.rating_5_0_pts;
  else if (clientRating >= 4.8) ratingPts = cfg.rating_4_8_pts;
  else if (clientRating >= 4.5) ratingPts = cfg.rating_4_5_pts;
  else if (clientRating >= 4.0) ratingPts = cfg.rating_4_0_pts;
  else if (clientRating >= 3.5) ratingPts = cfg.rating_3_5_pts;

  // Review volume (0-8)
  const benchmark = REVIEW_VOLUME_BENCHMARKS[specKey] || 50;
  const volumeRatio = clientReviews / benchmark;
  let volumePts = 0;
  if (volumeRatio >= 3) volumePts = cfg.volume_ratio_3x_pts;
  else if (volumeRatio >= 2) volumePts = cfg.volume_ratio_2x_pts;
  else if (volumeRatio >= 1.5) volumePts = cfg.volume_ratio_1_5x_pts;
  else if (volumeRatio >= 1) volumePts = cfg.volume_ratio_1x_pts;
  else if (volumeRatio >= 0.5) volumePts = cfg.volume_ratio_0_5x_pts;
  else if (volumeRatio >= 0.25) volumePts = cfg.volume_ratio_0_25x_pts;
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

  const reviewHealth = Math.min(cfg.review_health_max, ratingPts + volumePts + recencyPts + responsePts);

  // =====================================================================
  // SUB-SCORE 3: GBP COMPLETENESS (0-{gbp_completeness_max})
  // Photos + Hours/Phone/Website + Editorial summary + Status
  // =====================================================================

  // Photos (0-10)
  const clientPhotos = place.photosCount;
  let photoPts = 0;
  if (clientPhotos >= 10) photoPts = cfg.photos_10_plus_pts;
  else if (clientPhotos >= 8) photoPts = cfg.photos_8_plus_pts;
  else if (clientPhotos >= 5) photoPts = cfg.photos_5_plus_pts;
  else if (clientPhotos >= 2) photoPts = cfg.photos_2_plus_pts;
  else if (clientPhotos >= 1) photoPts = cfg.photos_1_pts;

  // Core info completeness: hours + phone + website (0-12)
  const completenessCount = [place.hasHours, place.hasPhone, place.hasWebsite].filter(Boolean).length;
  let completenessPts = 0;
  if (completenessCount === 3) completenessPts = cfg.completeness_all_3_pts;
  else if (completenessCount === 2) completenessPts = cfg.completeness_2_of_3_pts;
  else if (completenessCount === 1) completenessPts = cfg.completeness_1_of_3_pts;

  // Editorial summary / Google AI description (0-5)
  const editorialPts = place.hasEditorialSummary ? cfg.editorial_summary_pts : 0;

  // Business status (0-6)
  const statusPts = (place.businessStatus === "OPERATIONAL" || place.businessStatus === "OPEN") ? cfg.business_status_operational_pts : 0;

  const gbpCompleteness = Math.min(cfg.gbp_completeness_max, photoPts + completenessPts + editorialPts + statusPts);

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
