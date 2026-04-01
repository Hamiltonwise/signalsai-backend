/**
 * Clarity Scoring Engine -- Shared First Impression scoring algorithm
 *
 * Extracted from checkup.ts so the same logic can run during:
 * 1. Initial checkup (checkup.ts)
 * 2. Weekly score recalculation (weeklyScoreRecalc.ts)
 *
 * The scoring algorithm answers: "When a qualified prospect sees your
 * Google profile, do they choose you or swipe past?"
 */

// Per-specialty review volume benchmarks: what "strong" looks like for this vertical
export const REVIEW_VOLUME_BENCHMARKS: Record<string, number> = {
  endodontist: 40,
  orthodontist: 100,
  dentist: 100,
  "general dentist": 100,
  "pediatric dentist": 80,
  periodontist: 40,
  prosthodontist: 30,
  "oral surgeon": 50,
  barber: 150,
  "med spa": 200,
  medspa: 200,
  "plastic surgeon": 100,
  chiropractor: 80,
  optometrist: 60,
  veterinarian: 100,
  "physical therapist": 40,
  attorney: 30,
  lawyer: 30,
  accountant: 20,
  cpa: 20,
  "hair salon": 150,
  plumber: 50,
  electrician: 50,
  hvac: 50,
  roofer: 30,
  landscaper: 40,
  "auto repair": 60,
  "financial advisor": 20,
  "real estate agent": 40,
};

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
  trust: number;
  impression: number;
  responsiveness: number;
  edge: number;
}

export interface ScoringResult {
  composite: number;
  subScores: SubScores;
  scoreLabel: string;
}

function getScoreLabel(score: number): string {
  if (score >= 80) return "Strong first impression";
  if (score >= 60) return "Solid foundation";
  if (score >= 40) return "Room to grow";
  return "Needs attention";
}

/**
 * Calculate the Business Clarity Score from place data and competitors.
 *
 * This is the single source of truth for scoring. Both the initial checkup
 * and the weekly recalculation call this function.
 */
export function calculateClarityScore(
  place: PlaceData,
  competitors: CompetitorData[],
  specialty: string,
): ScoringResult {
  const specKey = specialty.toLowerCase();
  const clientRating = place.rating ?? 0;
  const clientReviews = place.reviewCount ?? 0;

  // Competitor averages
  const compCount = competitors.length || 1;
  const avgRating = competitors.reduce((s, c) => s + c.totalScore, 0) / compCount;

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

  // TRUST SIGNAL (0-30)
  let ratingStrengthPts = 1;
  if (clientRating >= 5.0) ratingStrengthPts = 12;
  else if (clientRating >= 4.8) ratingStrengthPts = 10;
  else if (clientRating >= 4.5) ratingStrengthPts = 7;
  else if (clientRating >= 4.0) ratingStrengthPts = 4;

  const benchmark = REVIEW_VOLUME_BENCHMARKS[specKey] || 50;
  const volumeRatio = clientReviews / benchmark;
  let reviewVolumePts = 0;
  if (volumeRatio >= 3) reviewVolumePts = 10;
  else if (volumeRatio >= 2) reviewVolumePts = 9;
  else if (volumeRatio >= 1.5) reviewVolumePts = 8;
  else if (volumeRatio >= 1) reviewVolumePts = 7;
  else if (volumeRatio >= 0.5) reviewVolumePts = 5;
  else if (volumeRatio >= 0.25) reviewVolumePts = 3;
  else if (volumeRatio > 0) reviewVolumePts = 1;

  let recencyPts = 0;
  if (lastReviewDaysAgo <= 7) recencyPts = 8;
  else if (lastReviewDaysAgo <= 14) recencyPts = 6;
  else if (lastReviewDaysAgo <= 30) recencyPts = 4;
  else if (lastReviewDaysAgo <= 60) recencyPts = 2;

  const trustSignal = Math.min(30, ratingStrengthPts + reviewVolumePts + recencyPts);

  // FIRST IMPRESSION (0-30)
  const clientPhotos = place.photosCount;
  let photoPts = 0;
  if (clientPhotos >= 8) photoPts = 10;
  else if (clientPhotos >= 5) photoPts = 8;
  else if (clientPhotos >= 2) photoPts = 5;
  else if (clientPhotos >= 1) photoPts = 3;

  const completenessCount = [place.hasHours, place.hasPhone, place.hasWebsite].filter(Boolean).length;
  let completenessPts = 0;
  if (completenessCount === 3) completenessPts = 12;
  else if (completenessCount === 2) completenessPts = 8;
  else if (completenessCount === 1) completenessPts = 4;

  const editorialPts = place.hasEditorialSummary ? 3 : 0;
  const statusPts = (place.businessStatus === "OPERATIONAL" || place.businessStatus === "OPEN") ? 5 : 0;

  const firstImpression = Math.min(30, photoPts + completenessPts + editorialPts + statusPts);

  // RESPONSIVENESS (0-20)
  let responseRatePts = 0;
  let negativeResponsePts = 0;

  if (!responseDataAvailable) {
    responseRatePts = 9;
    negativeResponsePts = 5;
  } else {
    if (reviewResponseRate >= 80) responseRatePts = 12;
    else if (reviewResponseRate >= 50) responseRatePts = 8;
    else if (reviewResponseRate >= 20) responseRatePts = 5;
    else if (reviewResponseRate >= 1) responseRatePts = 2;

    if (allReviewsPositive) negativeResponsePts = 4;
    else if (hasRespondedToNegative) negativeResponsePts = 8;
  }

  const responsiveness = Math.min(20, responseRatePts + negativeResponsePts);

  // COMPETITIVE EDGE (0-20)
  let competitiveEdge = 10; // Neutral default when no competitors

  if (competitors.length > 0) {
    const ratingAdvantage = clientRating - avgRating;
    const ratingAdvantagePts = Math.round(Math.min(8, Math.max(0, (ratingAdvantage + 0.5) * 8)));

    const maxReviews = Math.max(...competitors.map((c) => c.reviewsCount), 1);
    const volumeAdvantage = clientReviews / maxReviews;
    let volumeAdvantagePts = 0;
    if (volumeAdvantage >= 3) volumeAdvantagePts = 12;
    else if (volumeAdvantage >= 2) volumeAdvantagePts = 10;
    else if (volumeAdvantage >= 1) volumeAdvantagePts = 8;
    else if (volumeAdvantage >= 0.5) volumeAdvantagePts = 4;
    else volumeAdvantagePts = Math.round(volumeAdvantage * 4);

    competitiveEdge = Math.min(20, ratingAdvantagePts + volumeAdvantagePts);
  }

  const composite = trustSignal + firstImpression + responsiveness + competitiveEdge;

  return {
    composite,
    subScores: {
      trust: trustSignal,
      impression: firstImpression,
      responsiveness,
      edge: competitiveEdge,
    },
    scoreLabel: getScoreLabel(composite),
  };
}
