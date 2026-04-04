/**
 * Clarity Scoring Engine -- Business Clarity Score
 *
 * This is a blood panel, not an algorithm.
 *
 * Every number is a raw reading from Google. No transformation.
 * No weights. No formulas. The customer can verify every number
 * by Googling themselves. We read the results. We don't create them.
 *
 * Six readings, each graded: Healthy / Needs Attention / Critical
 * Score = count of healthy readings. Simple. Undeniable.
 *
 * Research backing:
 * - GBP signals: 32% of local ranking (Whitespark 2026)
 * - Review signals: 20% of local ranking (Whitespark 2026)
 * - Complete profiles: 2.7x more reputable (Google)
 * - Review recency: 74% only care about last 3 months (BrightLocal 2026)
 * - Photo freshness: 30+ days = visibility decay (BrightLocal)
 * - Response rate: improves ranking + 35% more revenue (Womply)
 */

import { getScoreLabel } from "./businessMetrics";

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

export type ReadingStatus = "healthy" | "attention" | "critical";

export interface Reading {
  name: string;
  value: string;           // The raw number, human readable
  status: ReadingStatus;
  context: string;         // Why this status (the doctor's note)
  verifyBy: string;        // How the customer checks it
  canAlloroFix: boolean;   // DFY or DWY?
}

export interface SubScores {
  googlePosition: number;
  reviewHealth: number;
  gbpCompleteness: number;
  trust?: number;
  impression?: number;
  responsiveness?: number;
  edge?: number;
}

export interface ScoringResult {
  composite: number;
  subScores: SubScores;
  scoreLabel: string;
  readings: Reading[];
}

// Config types for admin preview compatibility
export type ScoringConfig = Record<string, number>;

let cachedConfig: ScoringConfig | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

const DEFAULTS: ScoringConfig = {
  review_health_max: 33,
  gbp_completeness_max: 33,
  online_activity_max: 34,
};

export async function loadScoringConfig(): Promise<ScoringConfig> {
  const now = Date.now();
  if (cachedConfig && now - cacheTimestamp < CACHE_TTL_MS) return cachedConfig;
  try {
    const { db } = await import("../database/connection");
    const rows = await db("scoring_config").select("key", "value");
    if (rows && rows.length > 0) {
      const fromDb: ScoringConfig = {};
      for (const row of rows) fromDb[row.key] = Number(row.value);
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

export function getScoringConfigSync(): ScoringConfig { return cachedConfig ?? { ...DEFAULTS }; }
export function getScoringDefaults(): ScoringConfig { return { ...DEFAULTS }; }
export function clearScoringConfigCache(): void { cachedConfig = null; cacheTimestamp = 0; }

/**
 * Read the blood panel.
 *
 * Six readings. Each graded by range. No formulas. No weights.
 * The score is how many readings are healthy (0-100 scale).
 */
export function calculateClarityScore(
  place: PlaceData,
  competitors: CompetitorData[],
  _specialty: string,
  _googlePosition?: number | null,
  _configOverrides?: ScoringConfig,
): ScoringResult {
  const readings: Reading[] = [];

  const rating = place.rating ?? 0;
  const reviewCount = place.reviewCount ?? 0;
  const topCompetitorReviews = competitors.length > 0
    ? Math.max(...competitors.map(c => c.reviewsCount || 0), 1)
    : 1;
  const topCompetitorName = competitors.length > 0
    ? competitors.reduce((top, c) => (c.reviewsCount || 0) > (top.reviewsCount || 0) ? c : top, competitors[0]).name
    : null;

  // Extract review signals
  const reviews: any[] = place.reviews || [];
  const reviewsWithResponse = reviews.filter((r: any) => !!r.ownerResponse);
  const responseRate = reviews.length > 0 ? Math.round((reviewsWithResponse.length / reviews.length) * 100) : null;

  let hasRecentReview = false;
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  for (const r of reviews) {
    if (r.publishTime) {
      const pubDate = new Date(r.publishTime).getTime();
      if (!isNaN(pubDate) && pubDate >= thirtyDaysAgo) { hasRecentReview = true; break; }
    }
    const desc = r.relativePublishTimeDescription || "";
    if (desc.includes("week ago") || desc.includes("days ago") || desc.includes("yesterday") || desc.includes("hour")) {
      hasRecentReview = true; break;
    }
  }

  // ─── READING 1: Star Rating ─────────────────────────────────────
  // Range: 4.5+ = healthy, 4.0-4.4 = attention, below 4.0 = critical
  // Research: 68% of consumers require 4+ stars (BrightLocal 2026)
  readings.push({
    name: "Star Rating",
    value: `${rating} stars`,
    status: rating >= 4.5 ? "healthy" : rating >= 4.0 ? "attention" : "critical",
    context: rating >= 4.5
      ? "Above the threshold where most consumers will choose you"
      : rating >= 4.0
        ? "68% of consumers require 4+ stars. You qualify, but higher is better"
        : "68% of consumers require 4+ stars. Below that threshold.",
    verifyBy: "Google your business name",
    canAlloroFix: false,
  });

  // ─── READING 2: Review Count vs Competitor ──────────────────────
  // Range: >= competitor = healthy, >= 50% = attention, < 50% = critical
  const reviewRatio = topCompetitorReviews > 0 ? reviewCount / topCompetitorReviews : 1;
  readings.push({
    name: "Review Volume",
    value: `${reviewCount} reviews`,
    status: reviewRatio >= 1 ? "healthy" : reviewRatio >= 0.5 ? "attention" : "critical",
    context: topCompetitorName
      ? `${topCompetitorName} has ${topCompetitorReviews}. ${reviewCount >= topCompetitorReviews ? "You lead." : `Gap: ${topCompetitorReviews - reviewCount} reviews.`}`
      : `${reviewCount} reviews in your market`,
    verifyBy: topCompetitorName ? `Google "${topCompetitorName}"` : "Google your specialty + city",
    canAlloroFix: false,
  });

  // ─── READING 3: Review Recency ─────────────────────────────────
  // Range: review in last 30 days = healthy, none = attention
  // Research: 74% only care about last 3 months (BrightLocal 2026)
  if (reviews.length > 0) {
    readings.push({
      name: "Review Recency",
      value: hasRecentReview ? "Active (last 30 days)" : "No recent reviews",
      status: hasRecentReview ? "healthy" : "attention",
      context: hasRecentReview
        ? "Fresh reviews signal an active business to Google and to patients"
        : "74% of consumers only care about reviews from the last 3 months",
      verifyBy: "Check the dates on your most recent Google reviews",
      canAlloroFix: false,
    });
  }

  // ─── READING 4: GBP Profile Completeness ───────────────────────
  // Range: 5/5 = healthy, 3-4 = attention, 0-2 = critical
  // Research: Complete profiles 2.7x more reputable (Google)
  const gbpFields = [
    { name: "phone", present: place.hasPhone },
    { name: "hours", present: place.hasHours },
    { name: "website", present: place.hasWebsite },
    { name: "photos", present: place.photosCount > 0 },
    { name: "description", present: place.hasEditorialSummary },
  ];
  const complete = gbpFields.filter(f => f.present).length;
  const missing = gbpFields.filter(f => !f.present).map(f => f.name);

  readings.push({
    name: "Profile Completeness",
    value: `${complete}/5 fields`,
    status: complete >= 5 ? "healthy" : complete >= 3 ? "attention" : "critical",
    context: missing.length > 0
      ? `Missing: ${missing.join(", ")}. Complete profiles are 2.7x more reputable.`
      : "All fields complete. Your profile signals credibility to Google.",
    verifyBy: "Open your Google Business Profile and check each field",
    canAlloroFix: missing.some(f => f === "description" || f === "photos" || f === "website"),
  });

  // ─── READING 5: Review Response Rate ───────────────────────────
  // Range: 80%+ = healthy, 1-79% = attention, 0% = critical
  // Research: Responding improves ranking + 35% more revenue (Womply)
  if (responseRate !== null) {
    readings.push({
      name: "Review Responses",
      value: `${responseRate}% responded`,
      status: responseRate >= 80 ? "healthy" : responseRate >= 1 ? "attention" : "critical",
      context: responseRate >= 80
        ? "Strong response rate signals active management to Google"
        : responseRate >= 1
          ? "Businesses that respond to reviews earn 35% more revenue"
          : "No responses found. Each response signals activity to Google.",
      verifyBy: "Check your Google reviews for owner responses",
      canAlloroFix: true,
    });
  }

  // ─── READING 6: Photos ─────────────────────────────────────────
  // Range: 10+ = healthy, 1-9 = attention, 0 = critical
  // Research: 100+ photos = 520% more calls (BrightLocal)
  const photoCount = place.photosCount ?? 0;
  readings.push({
    name: "Photos",
    value: `${photoCount} photos`,
    status: photoCount >= 10 ? "healthy" : photoCount >= 1 ? "attention" : "critical",
    context: photoCount >= 10
      ? "Strong photo presence. Businesses with many photos get significantly more engagement."
      : photoCount >= 1
        ? "More photos = more engagement. Businesses with 100+ photos get 520% more calls."
        : "No photos found. This significantly reduces your visibility.",
    verifyBy: "Check the photos section of your Google Business Profile",
    canAlloroFix: true,
  });

  // ─── COMPOSITE SCORE ───────────────────────────────────────────
  // Score = percentage of readings that are healthy
  // Simple. No weights. No formulas. Just: how much of your blood panel is green?
  const healthyCount = readings.filter(r => r.status === "healthy").length;
  const totalReadings = readings.length;
  const composite = Math.round((healthyCount / totalReadings) * 100);

  // Map to sub-scores for backwards compatibility
  // These are simplified mappings for code that expects the old interface
  const reviewReadings = readings.filter(r =>
    r.name === "Star Rating" || r.name === "Review Volume" || r.name === "Review Recency"
  );
  const gbpReadings = readings.filter(r =>
    r.name === "Profile Completeness" || r.name === "Photos"
  );
  const activityReadings = readings.filter(r =>
    r.name === "Review Responses"
  );

  const reviewHealthScore = Math.round(
    (reviewReadings.filter(r => r.status === "healthy").length / Math.max(reviewReadings.length, 1)) * 33
  );
  const gbpScore = Math.round(
    (gbpReadings.filter(r => r.status === "healthy").length / Math.max(gbpReadings.length, 1)) * 33
  );
  const activityScore = Math.round(
    (activityReadings.filter(r => r.status === "healthy").length / Math.max(activityReadings.length, 1)) * 34
  );

  return {
    composite,
    subScores: {
      googlePosition: activityScore,
      reviewHealth: reviewHealthScore,
      gbpCompleteness: gbpScore,
      trust: reviewHealthScore,
      impression: gbpScore,
      responsiveness: activityScore,
      edge: activityScore,
    },
    scoreLabel: getScoreLabel(composite),
    readings,
  };
}
