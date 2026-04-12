/**
 * Conference Mode Fallback Data
 *
 * Pre-seeded demo data used when:
 * - URL includes ?mode=conference or ?demo=true
 * - API calls timeout after 5 seconds
 *
 * Default demo: Valley Endodontics, Salt Lake City (matches the
 * paper PDF handed out at AAE). Competitor names are fictional.
 */

import type { PlaceDetails } from "../../api/places";

export const CONFERENCE_PLACE: PlaceDetails = {
  placeId: "conference-demo-slc",
  name: "Valley Endodontics",
  formattedAddress: "123 S State St, Salt Lake City, UT 84111",
  city: "Salt Lake City",
  state: "UT",
  displayString: "Valley Endodontics, Salt Lake City, UT",
  practiceSearchString: "Valley Endodontics, Salt Lake City, UT",
  domain: "valleyendodontics.com",
  websiteUri: null,
  phone: null,
  rating: 4.6,
  reviewCount: 61,
  category: "Endodontist",
  types: ["health", "professional_services"],
  location: { latitude: 40.7608, longitude: -111.891 },
};

export const CONFERENCE_ANALYSIS = {
  success: true as const,
  score: {
    composite: 61,
    googlePosition: 22,
    reviewHealth: 20,
    gbpCompleteness: 19,
    trustSignal: 18,
    firstImpression: 20,
    responsiveness: 13,
    competitiveEdge: 10,
    visibility: 18,
    reputation: 20,
    competitive: 13,
  },
  topCompetitor: {
    name: "Wasatch Endodontics",
    rating: 4.9,
    reviewCount: 284,
    placeId: "conf-wasatch",
    location: { lat: 40.745, lng: -111.865 },
  },
  competitors: [
    { name: "Wasatch Endodontics", rating: 4.9, reviewCount: 284, placeId: "conf-wasatch", location: { lat: 40.745, lng: -111.865 }, driveTimeMinutes: 8 },
    { name: "Pioneer Endodontics", rating: 4.8, reviewCount: 156, placeId: "conf-pioneer", location: { lat: 40.771, lng: -111.902 }, driveTimeMinutes: 12 },
    { name: "Summit Endodontics", rating: 4.7, reviewCount: 98, placeId: "conf-summit", location: { lat: 40.758, lng: -111.876 }, driveTimeMinutes: 15 },
    { name: "Desert Endodontics", rating: 4.6, reviewCount: 67, placeId: "conf-desert", location: { lat: 40.782, lng: -111.921 }, driveTimeMinutes: 18 },
  ],
  findings: [
    {
      type: "review_gap",
      title: "Review Gap",
      detail: "Wasatch Endodontics has 223 more reviews than you. Reviews are the single biggest factor in local search visibility.",
      value: 223,
      impact: 10035,
    },
    {
      type: "rating_strong",
      title: "Rating Comparison",
      detail: "Your 4.6-star rating is competitive but Wasatch leads with 4.9 stars across 284 reviews.",
      value: 0.3,
      impact: 720,
    },
    {
      type: "market_rank",
      title: "Your Market",
      detail: "4 competitors in Salt Lake City. Wasatch and Pioneer have more reviews and are more visible on Google.",
      value: 3,
      impact: 0,
    },
    {
      type: "sentiment_insight",
      title: "Your reviews mention response time",
      detail: "Practices that respond to every review within 24 hours consistently outperform on Google. Check your recent reviews to see how you compare.",
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
    rank: 0,
  },
  gaps: [
    {
      id: "review_race",
      label: "223 reviews to pass Wasatch Endodontics",
      current: 61,
      target: 284,
      unit: "reviews",
      action: "Ask 3 clients for a Google review this week. At that pace, you close the gap in 18 weeks.",
      timeEstimate: "~18 weeks at current pace",
      competitorName: "Wasatch Endodontics",
      velocity: {
        clientWeekly: 0.6,
        competitorWeekly: 2.7,
        weeksToPass: 73,
        thisWeekAsk: 3,
        competitorName: "Wasatch Endodontics",
      },
    },
  ],
};

// ─── Barber demo (conference mode ?vertical=barber) ────────────────

export const BARBER_DEMO_PLACE: PlaceDetails = {
  placeId: "conference-demo-barber",
  name: "Main Street Barbers",
  formattedAddress: "2401 S Congress Ave, Austin, TX 78704",
  city: "Austin",
  state: "TX",
  displayString: "Main Street Barbers, Austin, TX",
  practiceSearchString: "Main Street Barbers, Austin, TX",
  domain: "mainstreetbarbers.com",
  websiteUri: null,
  phone: null,
  rating: 4.7,
  reviewCount: 38,
  category: "Barber shop",
  types: ["barber_shop", "beauty_salon"],
  location: { latitude: 30.2469, longitude: -97.7495 },
};

export const BARBER_DEMO_ANALYSIS = {
  success: true as const,
  score: {
    composite: 54,
    googlePosition: 16,
    reviewHealth: 20,
    gbpCompleteness: 18,
    trustSignal: 16,
    firstImpression: 18,
    responsiveness: 10,
    competitiveEdge: 10,
    visibility: 16,
    reputation: 18,
    competitive: 10,
  },
  topCompetitor: {
    name: "South Congress Cuts",
    rating: 4.8,
    reviewCount: 127,
    placeId: "conf-scc",
    location: { lat: 30.249, lng: -97.751 },
  },
  competitors: [
    { name: "South Congress Cuts", rating: 4.8, reviewCount: 127, placeId: "conf-scc", location: { lat: 30.249, lng: -97.751 }, driveTimeMinutes: 4 },
    { name: "Finley's Barber Shop", rating: 4.6, reviewCount: 89, placeId: "conf-finley", location: { lat: 30.244, lng: -97.745 }, driveTimeMinutes: 6 },
    { name: "The Bourgeois Pig", rating: 4.5, reviewCount: 64, placeId: "conf-bp", location: { lat: 30.251, lng: -97.753 }, driveTimeMinutes: 5 },
  ],
  findings: [
    {
      type: "review_gap",
      title: "89 reviews separate you from Finley's",
      detail: "South Congress Cuts has 127 reviews to your 38. Customers searching 'barber near me' see them first.",
      value: 89,
      impact: 2800,
    },
    {
      type: "rating_gap",
      title: "Your 4.7 is strong but not #1",
      detail: "South Congress Cuts holds 4.8. That 0.1 gap costs visibility in Google's local pack.",
      value: 0.1,
      impact: 140,
    },
    {
      type: "market_rank",
      title: "4 barbers on South Congress compete for visibility",
      detail: "South Congress Cuts and Finley's have more reviews and are more visible on Google.",
      value: 3,
      impact: 0,
    },
    {
      type: "sentiment_insight",
      title: "Your reviews mention atmosphere",
      detail: "Businesses whose reviews highlight the experience, not just the service, tend to build stronger loyalty. Check what your reviews say about you.",
      value: 0,
      impact: 0,
    },
  ],
  totalImpact: 2940,
  market: {
    city: "Austin",
    totalCompetitors: 3,
    avgRating: 4.65,
    avgReviews: 80,
    rank: 0,
  },
  gaps: [
    {
      id: "review_race",
      label: "89 reviews to pass South Congress Cuts",
      current: 38,
      target: 127,
      unit: "reviews",
      action: "Ask 3 clients for a Google review this week. Text the link right after their cut.",
      timeEstimate: "~12 weeks at 2/week",
      competitorName: "South Congress Cuts",
      velocity: {
        clientWeekly: 0.8,
        competitorWeekly: 2.1,
        weeksToPass: 69,
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
 * Get the conference demo vertical (e.g. "barber", "cpa").
 * Defaults to null (use dental/specialist demo).
 */
export function getConferenceVertical(): string | null {
  const params = new URLSearchParams(window.location.search);
  const v = params.get("vertical");
  if (v) {
    localStorage.setItem("alloro_conference_vertical", v);
    return v;
  }
  return localStorage.getItem("alloro_conference_vertical");
}

/**
 * Clear all persisted flow params (call after flow completes).
 */
export function clearFlowParams(): void {
  localStorage.removeItem("alloro_conference_mode");
  localStorage.removeItem("alloro_source_channel");
  localStorage.removeItem("alloro_conference_vertical");
}

/** Healthcare-adjacent types from Google Places */
const HEALTHCARE_TYPES = new Set([
  "health", "doctor", "dentist", "hospital", "physiotherapist",
  "pharmacy", "medical_lab", "veterinary_care",
]);

/**
 * Build a vertical-aware sentiment finding for conference fallback.
 * Healthcare verticals get "response time"; others get "review response" framing.
 */
function buildSentimentFinding(place: PlaceDetails): typeof CONFERENCE_ANALYSIS.findings[0] {
  const types = place.types || [];
  const category = (place.category || "").toLowerCase();
  const isHealthcare = types.some((t) => HEALTHCARE_TYPES.has(t))
    || ["dentist", "doctor", "health", "medical", "veterinary", "chiropractic", "orthodont", "endodont", "periodont"].some((kw) => category.includes(kw));

  if (isHealthcare) {
    return {
      type: "sentiment_insight",
      title: "Review response patterns",
      detail: "Practices that respond to every review within 24 hours consistently outperform on Google. Check your recent reviews to see how you compare.",
      value: 0,
      impact: 0,
    };
  }

  return {
    type: "sentiment_insight",
    title: "Review response patterns",
    detail: "Businesses that respond to every review consistently outperform on Google. Check your recent reviews to see how you compare.",
    value: 0,
    impact: 0,
  };
}

/**
 * Build a personalized conference fallback using the real practice's data.
 * Randomizes the score in a realistic range and injects the actual
 * practice name, city, rating, and review count so every attendee
 * sees their own data, not identical demo numbers.
 *
 * Competitor names are generic and category-aware (never hardcoded
 * dental names). A plumber sees "Top-rated plumber in Columbus",
 * an endodontist sees "Top-rated endodontist in Salt Lake City".
 */
export function personalizeConferenceFallback(place: PlaceDetails): typeof CONFERENCE_ANALYSIS {
  const seed = hashCode(place.placeId || place.name);

  // Composite 38-72 (realistic range for most practices)
  const composite = 38 + Math.abs(seed % 35);
  // Three sub-scores: position /34, reviews /33, gbp /33
  const rank = 2 + Math.abs((seed >> 12) % 4); // #2 through #5
  const googlePosition = rank === 2 ? 28 : rank === 3 ? 22 : 16;
  const reviewHealth = 8 + Math.abs((seed >> 4) % 14); // 8-21
  const gbpCompleteness = Math.max(5, composite - googlePosition - reviewHealth);
  // Legacy aliases
  const trustSignal = reviewHealth;
  const firstImpression = gbpCompleteness;
  const responsiveness = 4 + Math.abs((seed >> 8) % 10);
  const competitiveEdge = googlePosition;
  const totalCompetitors = 4 + Math.abs((seed >> 16) % 4); // 4-7

  const topReviews = (place.reviewCount || 61) + 80 + Math.abs((seed >> 6) % 200);
  const reviewGap = topReviews - (place.reviewCount || 61);

  const category = place.category || "business";
  const categoryLower = category.toLowerCase();
  const city = place.city || "your area";

  // Generic, category-aware competitor names. Never fake business names.
  const topName = `Top-rated ${categoryLower} in ${city}`;
  const competitorNames = [
    topName,
    `Nearby ${categoryLower}`,
    `${city} ${category}`,
    `Local ${categoryLower}`,
  ];

  const topRating = 4.6 + Math.abs((seed >> 3) % 4) * 0.1; // 4.6-4.9

  // Build category-aware competitors with realistic spread
  const personalizedCompetitors = competitorNames.map((name, i) => {
    const revSpread = [topReviews, topReviews - 40 - Math.abs((seed >> (i * 3)) % 80), topReviews - 120 - Math.abs((seed >> (i * 4)) % 60), topReviews - 180 - Math.abs((seed >> (i * 5)) % 40)];
    const ratSpread = [topRating, topRating - 0.1, topRating - 0.2, topRating - 0.1];
    return {
      name,
      rating: Math.max(4.0, ratSpread[i] || 4.5),
      reviewCount: Math.max(10, revSpread[i] || 50),
      placeId: `conf-gen-${i}`,
      location: {
        lat: (place.location?.latitude || 40.76) + (i * 0.01 - 0.015),
        lng: (place.location?.longitude || -111.89) + (i * 0.012 - 0.018),
      },
      driveTimeMinutes: 5 + i * 4,
    };
  });

  return {
    ...CONFERENCE_ANALYSIS,
    score: {
      composite,
      googlePosition,
      reviewHealth,
      gbpCompleteness,
      trustSignal,
      firstImpression,
      responsiveness,
      competitiveEdge,
      visibility: trustSignal,
      reputation: firstImpression,
      competitive: responsiveness,
    },
    topCompetitor: {
      name: topName,
      reviewCount: topReviews,
      rating: topRating,
      placeId: "conf-gen-0",
      location: personalizedCompetitors[0].location,
    },
    competitors: personalizedCompetitors,
    findings: [
      {
        type: "review_gap",
        title: "Review Gap",
        detail: `Your top competitor has ${reviewGap} more reviews than you. Reviews are the single biggest factor in local search visibility.`,
        value: reviewGap,
        impact: 0,
      },
      {
        type: "rating_strong",
        title: "Rating Comparison",
        detail: `Your ${place.rating || 4.6}-star rating is ${(place.rating || 4.6) >= 4.7 ? "strong" : "competitive"} but the top ${categoryLower} in ${city} leads with ${topRating.toFixed(1)} stars across ${topReviews} reviews.`,
        value: 0.3,
        impact: 0,
      },
      {
        type: "market_rank",
        title: "Your Market",
        detail: `${totalCompetitors} ${categoryLower}s in ${city} compete for the same searches. Reviews, photos, and profile completeness determine who appears first.`,
        value: rank,
        impact: 0,
      },
      buildSentimentFinding(place),
    ],
    totalImpact: 0,
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
        label: `${reviewGap} reviews to pass your top competitor`,
        current: place.reviewCount || 61,
        target: topReviews,
        competitorName: topName,
        velocity: {
          clientWeekly: 0.6 + Math.abs((seed >> 7) % 5) * 0.2,
          competitorWeekly: 1.5 + Math.abs((seed >> 9) % 8) * 0.3,
          weeksToPass: Math.max(8, Math.ceil(reviewGap / 2)),
          thisWeekAsk: 3,
          competitorName: topName,
        },
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
