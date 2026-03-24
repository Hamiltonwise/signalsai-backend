/**
 * Conference Mode Fallback Data
 *
 * Pre-seeded SLC demo data used when:
 * - URL includes ?mode=conference or ?demo=true
 * - API calls timeout after 5 seconds
 *
 * All competitor names are fictional.
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
  domain: "valleyendoslc.com",
  websiteUri: null,
  phone: null,
  rating: 4.6,
  reviewCount: 61,
  category: "Endodontist",
  types: ["dentist", "dental_clinic"],
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
    name: "Wasatch Endodontics",
    rating: 4.9,
    reviewCount: 284,
    placeId: "conf-wasatch",
    location: { lat: 40.758, lng: -111.876 },
  },
  competitors: [
    { name: "Wasatch Endodontics", rating: 4.9, reviewCount: 284, placeId: "conf-wasatch", location: { lat: 40.758, lng: -111.876 }, driveTimeMinutes: 8 },
    { name: "Pioneer Endodontics", rating: 4.8, reviewCount: 156, placeId: "conf-pioneer", location: { lat: 40.771, lng: -111.902 }, driveTimeMinutes: 12 },
    { name: "Summit Endodontics", rating: 4.7, reviewCount: 98, placeId: "conf-summit", location: { lat: 40.745, lng: -111.865 }, driveTimeMinutes: 15 },
    { name: "Desert Endodontics", rating: 4.6, reviewCount: 67, placeId: "conf-desert", location: { lat: 40.782, lng: -111.921 }, driveTimeMinutes: 18 },
  ],
  findings: [
    {
      type: "review_gap",
      title: "Review Gap",
      detail: "Wasatch Endodontics has 223 more reviews than you. At your current pace, that gap grows by 8 reviews per month.",
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
      title: "Market Position",
      detail: "You rank #3 of 5 endodontists in Salt Lake City. Patients searching for an endodontist see Wasatch and Pioneer before you.",
      value: 3,
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
  gaps: [],
};

/**
 * Check if conference/demo mode is active from URL params.
 */
export function isConferenceMode(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "conference" || params.get("demo") === "true";
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
