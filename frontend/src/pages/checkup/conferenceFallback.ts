/**
 * Conference Mode Fallback Data
 *
 * Pre-seeded demo data used when:
 * - URL includes ?mode=conference or ?demo=true
 * - API calls timeout after 5 seconds
 *
 * All competitor names are fictional. Uses universal specialist
 * language, not dental-specific.
 */

import type { PlaceDetails } from "../../api/places";

export const CONFERENCE_PLACE: PlaceDetails = {
  placeId: "conference-demo-slc",
  name: "Valley Specialty Group",
  formattedAddress: "123 S State St, Salt Lake City, UT 84111",
  city: "Salt Lake City",
  state: "UT",
  displayString: "Valley Specialty Group, Salt Lake City, UT",
  practiceSearchString: "Valley Specialty Group, Salt Lake City, UT",
  domain: "valleyspecialtygroup.com",
  websiteUri: null,
  phone: null,
  rating: 4.6,
  reviewCount: 61,
  category: "Specialist",
  types: ["health", "professional_services"],
  location: { latitude: 40.7608, longitude: -111.891 },
};

export const CONFERENCE_ANALYSIS = {
  success: true as const,
  score: {
    composite: 61,
    visibility: 22,
    reputation: 24,
    competitive: 15,
  },
  topCompetitor: {
    name: "Summit Specialists",
    rating: 4.9,
    reviewCount: 284,
    placeId: "conf-summit",
    location: { lat: 40.758, lng: -111.876 },
  },
  competitors: [
    { name: "Summit Specialists", rating: 4.9, reviewCount: 284, placeId: "conf-summit", location: { lat: 40.758, lng: -111.876 }, driveTimeMinutes: 8 },
    { name: "Pioneer Specialists", rating: 4.8, reviewCount: 156, placeId: "conf-pioneer", location: { lat: 40.771, lng: -111.902 }, driveTimeMinutes: 12 },
    { name: "Wasatch Health Partners", rating: 4.7, reviewCount: 98, placeId: "conf-wasatch", location: { lat: 40.745, lng: -111.865 }, driveTimeMinutes: 15 },
    { name: "Desert Valley Specialists", rating: 4.6, reviewCount: 67, placeId: "conf-desert", location: { lat: 40.782, lng: -111.921 }, driveTimeMinutes: 18 },
  ],
  findings: [
    {
      type: "review_gap",
      title: "Review Gap",
      detail: "Summit Specialists has 223 more reviews than you. At your current pace, that gap grows by 8 reviews per month.",
      value: 223,
      impact: 10035,
    },
    {
      type: "rating_strong",
      title: "Rating Comparison",
      detail: "Your 4.6-star rating is competitive but Summit leads with 4.9 stars across 284 reviews.",
      value: 0.3,
      impact: 720,
    },
    {
      type: "market_rank",
      title: "Market Position",
      detail: "You rank #3 of 5 specialists in Salt Lake City. Patients searching see Summit and Pioneer before you.",
      value: 3,
      impact: 0,
    },
    {
      type: "sentiment_insight",
      title: "Your patients mention wait times",
      detail: "4 of your last 10 reviews mention wait time or scheduling delays. Summit Specialists reviews never mention this. Patients notice.",
      value: 0,
      impact: 0,
    },
  ],
  totalImpact: 10755,
  market: {
    city: "Salt Lake City",
    totalCompetitors: 4,
    avgRating: 4.75,
    avgReviews: 151,
    rank: 3,
  },
  gaps: [
    {
      id: "review_race",
      label: "223 reviews to pass Summit Specialists",
      current: 61,
      target: 284,
      unit: "reviews",
      action: "Ask 3 patients for a Google review this week. At that pace, you close the gap in 18 weeks.",
      timeEstimate: "~18 weeks at current pace",
      competitorName: "Summit Specialists",
      velocity: {
        clientWeekly: 0.6,
        competitorWeekly: 2.7,
        weeksToPass: 73,
        thisWeekAsk: 3,
        competitorName: "Summit Specialists",
      },
    },
  ],
};

/**
 * Get the source channel, checking URL params then localStorage.
 * Persists on first detection so it survives React Router navigation.
 */
export function getSourceChannel(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("source");
  if (fromUrl) {
    localStorage.setItem("alloro_source_channel", fromUrl);
    return fromUrl;
  }
  return localStorage.getItem("alloro_source_channel");
}

/**
 * Clear all persisted flow params (call after flow completes).
 */
export function clearFlowParams(): void {
  localStorage.removeItem("alloro_conference_mode");
  localStorage.removeItem("alloro_source_channel");
}

/**
 * Build a personalized conference fallback using the real practice's data.
 * Randomizes the score in a realistic range and injects the actual
 * practice name, city, rating, and review count so every attendee
 * at AAE sees their own data, not identical demo numbers.
 */
export function personalizeConferenceFallback(place: PlaceDetails): typeof CONFERENCE_ANALYSIS {
  const seed = hashCode(place.placeId || place.name);

  // Composite 38-72 (realistic range for most practices)
  const composite = 38 + Math.abs(seed % 35);
  const visibility = 10 + Math.abs((seed >> 4) % 18);
  const reputation = 12 + Math.abs((seed >> 8) % 18);
  const competitive = composite - visibility - reputation;

  const rank = 2 + Math.abs((seed >> 12) % 4); // #2 through #5
  const totalCompetitors = 4 + Math.abs((seed >> 16) % 4); // 4-7

  const topReviews = (place.reviewCount || 61) + 80 + Math.abs((seed >> 6) % 200);
  const reviewGap = topReviews - (place.reviewCount || 61);

  const topName = CONFERENCE_ANALYSIS.topCompetitor.name;
  const city = place.city || "Salt Lake City";

  return {
    ...CONFERENCE_ANALYSIS,
    score: { composite, visibility, reputation, competitive: Math.max(competitive, 3) },
    topCompetitor: {
      ...CONFERENCE_ANALYSIS.topCompetitor,
      reviewCount: topReviews,
      rating: 4.6 + Math.abs((seed >> 3) % 4) * 0.1, // 4.6-4.9
    },
    findings: [
      {
        type: "review_gap",
        title: "Review Gap",
        detail: `${topName} has ${reviewGap} more reviews than you. At your current pace, that gap grows each month.`,
        value: reviewGap,
        impact: reviewGap * 45,
      },
      {
        type: "rating_strong",
        title: "Rating Comparison",
        detail: `Your ${place.rating || 4.6}-star rating is ${(place.rating || 4.6) >= 4.7 ? "strong" : "competitive"} but ${topName} leads with ${(4.6 + Math.abs((seed >> 3) % 4) * 0.1).toFixed(1)} stars across ${topReviews} reviews.`,
        value: 0.3,
        impact: 720,
      },
      {
        type: "market_rank",
        title: "Market Position",
        detail: `You rank #${rank} of ${totalCompetitors} specialists in ${city}. People searching see ${rank - 1} business${rank > 2 ? "es" : ""} before you.`,
        value: rank,
        impact: 0,
      },
      CONFERENCE_ANALYSIS.findings[3], // sentiment insight stays generic
    ],
    totalImpact: reviewGap * 45 + 720,
    market: {
      city,
      totalCompetitors,
      avgRating: 4.65 + Math.abs((seed >> 10) % 3) * 0.05,
      avgReviews: 80 + Math.abs((seed >> 14) % 120),
      rank,
    },
    gaps: [
      {
        ...CONFERENCE_ANALYSIS.gaps[0],
        label: `${reviewGap} reviews to pass ${topName}`,
        current: place.reviewCount || 61,
        target: topReviews,
      },
    ],
  };
}

/** Simple deterministic hash so the same practice always gets the same fallback score */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Check if conference/demo mode is active.
 * Checks URL params first, then localStorage (persists across route changes).
 * Call activateConferenceMode() at flow entry to persist through React Router navigation.
 */
export function isConferenceMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "conference" || params.get("demo") === "true") {
    localStorage.setItem("alloro_conference_mode", "true");
    return true;
  }
  return localStorage.getItem("alloro_conference_mode") === "true";
}

/**
 * True when conference mode is active AND the browser has no network.
 * Skips the API call entirely instead of waiting 5s for an inevitable timeout.
 */
export function isOfflineConference(): boolean {
  return isConferenceMode() && !navigator.onLine;
}

/**
 * Wrap an API call with a timeout. On timeout, returns null (caller uses fallback).
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number
): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}
