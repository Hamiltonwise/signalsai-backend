/**
 * Clarity Scoring Engine -- Business Clarity Score
 *
 * Napkin math. Every calculation is one sentence. Every input is verifiable by Googling.
 *
 * Three factors from public Google data:
 * 1. Review Health (0-33): Rating + count vs competitor + response rate + recency
 * 2. GBP Completeness (0-33): Description, photos, website, phone, hours
 * 3. Online Activity (0-34): Posts, review responses, content freshness
 *
 * Total: 0-100.
 *
 * DFY/DWY split: ~70 points are influenced by Alloro's automated actions.
 * ~30 points require owner input (rating, review count, phone, hours).
 * The GLP-1 model: score climbs without the owner changing behavior.
 *
 * Research backing:
 * - GBP signals: 32% of local ranking weight (Whitespark 2026)
 * - Review signals: 20% of local ranking weight (Whitespark 2026)
 * - Google Ask Maps reads review WORDS, not just stars (Google, March 2026)
 * - Complete GBP profiles: 2.7x more reputable, 70% more visits (Google)
 * - Photo freshness: 30+ days without photo = visibility decay (BrightLocal)
 * - Review recency: 74% of consumers only care about last 3 months (BrightLocal 2026)
 */

import { getScoreLabel } from "./businessMetrics";

// Re-export for backwards compatibility
export { REVIEW_VOLUME_BENCHMARKS } from "./businessMetrics";

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
  googlePosition: number;  // Legacy alias for onlineActivity
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

// Scoring config type (for admin preview/override)
export type ScoringConfig = Record<string, number>;

// Config cache
let cachedConfig: ScoringConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

// Defaults: the napkin math, documented
const DEFAULTS: ScoringConfig = {
  // Sub-score maxes
  review_health_max: 33,
  gbp_completeness_max: 33,
  online_activity_max: 34,

  // Review Health components
  rating_max_pts: 8,          // (rating / 5) * 8
  count_vs_competitor_max_pts: 10, // min(1, yours / theirs) * 10
  response_rate_max_pts: 10,  // (responses / total) * 10 -- DFY
  recency_pts: 5,             // review in last 30 days = 5, else 0

  // GBP Completeness components (weighted by DFY controllability)
  description_pts: 10,        // DFY: Alloro writes it
  photos_pts: 8,              // DFY: Alloro can post from library
  website_pts: 8,             // DFY: PatientPath builds it
  phone_pts: 4,               // DWY: owner enters it
  hours_pts: 3,               // DWY: owner enters it

  // Online Activity components (all DFY)
  posts_0_pts: 0,
  posts_1_pts: 8,
  posts_2_plus_pts: 14,       // GBP posts in last 30 days
  review_responses_pts: 10,   // any review responses in last 30 days
  content_freshness_pts: 10,  // website content updated in last 30 days
};

export async function loadScoringConfig(): Promise<ScoringConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedConfig;
  }

  try {
    const { db } = await import("../database/connection");
    const rows = await db("scoring_config").select("key", "value");
    if (rows && rows.length > 0) {
      const fromDb: ScoringConfig = {};
      for (const row of rows) {
        fromDb[row.key] = Number(row.value);
      }
      cachedConfig = { ...DEFAULTS, ...fromDb };
    } else {
      cachedConfig = { ...DEFAULTS };
    }
  } catch {
    cachedConfig = { ...DEFAULTS };
  }

  cacheTimestamp = now;
  return cachedConfig;
}

export function getScoringConfigSync(): ScoringConfig {
  return cachedConfig ?? { ...DEFAULTS };
}

export function getScoringDefaults(): ScoringConfig {
  return { ...DEFAULTS };
}

export function clearScoringConfigCache(): void {
  cachedConfig = null;
  cacheTimestamp = 0;
}

/**
 * Calculate the Business Clarity Score.
 *
 * Every calculation is one line. Every input is Googleable.
 * This is the single source of truth. No other file calculates scores.
 */
export function calculateClarityScore(
  place: PlaceData,
  competitors: CompetitorData[],
  _specialty: string,
  _googlePosition?: number | null,
  configOverrides?: ScoringConfig,
): ScoringResult {
  const cfg = { ...getScoringConfigSync(), ...(configOverrides || {}) };

  const rating = place.rating ?? 0;
  const reviewCount = place.reviewCount ?? 0;
  const topCompetitorReviews = competitors.length > 0
    ? Math.max(...competitors.map(c => c.reviewsCount || 0), 1)
    : reviewCount || 1; // If no competitors, compare against self (score = full)

  // Extract review signals from place.reviews (when available)
  const reviews: any[] = place.reviews || [];
  const reviewsWithResponse = reviews.filter((r: any) => !!r.ownerResponse);
  const responseRate = reviews.length > 0
    ? reviewsWithResponse.length / reviews.length
    : 0;

  let hasRecentReview = false;
  if (reviews.length > 0) {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const r of reviews) {
      if (r.publishTime) {
        const pubDate = new Date(r.publishTime).getTime();
        if (!isNaN(pubDate) && pubDate >= thirtyDaysAgo) {
          hasRecentReview = true;
          break;
        }
      }
      // Fallback: relative time descriptions
      const desc = r.relativePublishTimeDescription || "";
      if (desc.includes("week ago") || desc.includes("days ago") || desc.includes("yesterday") || desc.includes("hour")) {
        hasRecentReview = true;
        break;
      }
    }
  }

  // ─── FACTOR 1: REVIEW HEALTH (0-33) ─────────────────────────────
  // Napkin: rating/5 * 8 + min(1, yours/theirs) * 10 + responseRate * 10 + recentBonus
  const ratingPts = Math.round((rating / 5) * cfg.rating_max_pts);
  const countPts = Math.round(Math.min(1, reviewCount / topCompetitorReviews) * cfg.count_vs_competitor_max_pts);
  const responsePts = Math.round(responseRate * cfg.response_rate_max_pts);
  const recencyPts = hasRecentReview ? cfg.recency_pts : 0;

  const reviewHealth = Math.min(cfg.review_health_max, ratingPts + countPts + responsePts + recencyPts);

  // ─── FACTOR 2: GBP COMPLETENESS (0-33) ──────────────────────────
  // Napkin: each field present = its point value. Sum them.
  const descriptionPts = place.hasEditorialSummary ? cfg.description_pts : 0;
  const photosPts = place.photosCount > 0 ? cfg.photos_pts : 0;
  const websitePts = place.hasWebsite ? cfg.website_pts : 0;
  const phonePts = place.hasPhone ? cfg.phone_pts : 0;
  const hoursPts = place.hasHours ? cfg.hours_pts : 0;

  const gbpCompleteness = Math.min(cfg.gbp_completeness_max, descriptionPts + photosPts + websitePts + phonePts + hoursPts);

  // ─── FACTOR 3: ONLINE ACTIVITY (0-34) ───────────────────────────
  // Napkin: posts in 30 days + review responses in 30 days + content freshness
  // These are all DFY signals Alloro can control.
  // For now: estimate from available data. When GBP OAuth provides post data,
  // this becomes exact.
  const hasAnyResponses = responsePts > 0;
  const hasWebsiteContent = place.hasWebsite;
  // Posts: we don't have direct GBP post count yet. Score 0 until DFY engine runs.
  const postPts = 0; // Will become cfg.posts_1_pts or posts_2_plus_pts when data exists
  const activityResponsePts = hasAnyResponses ? cfg.review_responses_pts : 0;
  const contentPts = hasWebsiteContent ? cfg.content_freshness_pts : 0;

  const onlineActivity = Math.min(cfg.online_activity_max, postPts + activityResponsePts + contentPts);

  // ─── COMPOSITE ──────────────────────────────────────────────────
  const composite = reviewHealth + gbpCompleteness + onlineActivity;

  return {
    composite,
    subScores: {
      googlePosition: onlineActivity, // Legacy alias
      reviewHealth,
      gbpCompleteness,
      // Legacy aliases
      trust: reviewHealth,
      impression: gbpCompleteness,
      responsiveness: responsePts,
      edge: onlineActivity,
    },
    scoreLabel: getScoreLabel(composite),
  };
}
