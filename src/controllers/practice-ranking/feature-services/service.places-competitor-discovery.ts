/**
 * Places API Competitor Discovery Service
 *
 * Replaces Apify for competitor discovery. Uses Google Places Text Search
 * for fast, accurate, location-aware results. Category filtering ensures
 * only specialty-relevant competitors are included.
 *
 * Apify is still used downstream for deep scrape (review text, dates, distribution).
 */

import {
  textSearch,
  getPlaceDetails,
} from "../../places/feature-services/GooglePlacesApiService";
import { SPECIALTY_CATEGORIES } from "./service.ranking-algorithm";

// =====================================================================
// TYPES
// =====================================================================

export interface DiscoveredCompetitor {
  placeId: string;
  name: string;
  address: string;
  category: string;
  primaryType: string;
  types: string[];
  totalScore: number;
  reviewsCount: number;
  url: string;
  website?: string;
  phone?: string;
  hasHours: boolean;
  hoursComplete: boolean;
  photosCount: number;
  location?: {
    lat: number;
    lng: number;
  };
}

// Google Places API primaryType values mapped to our specialty keys
// These are the machine-readable types Google uses (snake_case)
const SPECIALTY_PRIMARY_TYPES: Record<string, string[]> = {
  orthodontics: ["orthodontist"],
  endodontics: ["endodontist"],
  periodontics: ["periodontist"],
  oral_surgery: ["oral_surgeon"],
  pediatric: ["pediatric_dentist"],
  prosthodontics: ["prosthodontist"],
  general: ["dentist", "dental_clinic"],
};

// All dental-related primary types (for broad filtering of non-dental junk)
const ALL_DENTAL_TYPES = [
  "dentist",
  "dental_clinic",
  "orthodontist",
  "endodontist",
  "periodontist",
  "oral_surgeon",
  "pediatric_dentist",
  "prosthodontist",
];

// =====================================================================
// HELPERS
// =====================================================================

function log(message: string): void {
  console.log(`[PLACES-DISCOVERY] ${message}`);
}

/**
 * Normalize specialty input to internal key (same logic as ranking algorithm)
 */
function normalizeSpecialty(specialty: string): string {
  const aliases: Record<string, string> = {
    orthodontist: "orthodontics",
    endodontist: "endodontics",
    periodontist: "periodontics",
    "oral surgeon": "oral_surgery",
    prosthodontist: "prosthodontics",
    "pediatric dentist": "pediatric",
    dentist: "general",
    orthodontics: "orthodontics",
    endodontics: "endodontics",
    periodontics: "periodontics",
    oral_surgery: "oral_surgery",
    pediatric: "pediatric",
    prosthodontics: "prosthodontics",
    general: "general",
  };
  return aliases[specialty.toLowerCase().trim()] || "general";
}

// =====================================================================
// DISCOVERY
// =====================================================================

/**
 * Discover competitors via Google Places Text Search API.
 *
 * @param specialty - Practice specialty (e.g. "endodontist", "orthodontics")
 * @param marketLocation - Market location (e.g. "Austin, TX")
 * @param limit - Maximum results (default 20)
 * @returns Array of discovered competitors
 */
export async function discoverCompetitorsViaPlaces(
  specialty: string,
  marketLocation: string,
  limit: number = 20,
  locationBias?: { lat: number; lng: number; radiusMeters?: number },
): Promise<DiscoveredCompetitor[]> {
  const searchQuery = `${specialty} in ${marketLocation}`;
  log(`Searching: "${searchQuery}" (limit: ${limit})${locationBias ? ` [biased to ${locationBias.lat.toFixed(4)},${locationBias.lng.toFixed(4)}]` : ""}`);

  const places = await textSearch(searchQuery, limit, locationBias);
  log(`Found ${places.length} raw results`);

  const competitors: DiscoveredCompetitor[] = places.map((place: any) => {
    const hours = place.regularOpeningHours;
    const hasHours = !!hours;
    const hoursComplete = hasHours
      ? (hours.periods?.length || 0) >= 5
      : false;

    return {
      placeId: place.id,
      name: place.displayName?.text || "",
      address: place.formattedAddress || "",
      category: place.primaryTypeDisplayName?.text || place.primaryType || "Unknown",
      primaryType: place.primaryType || "",
      types: place.types || [],
      totalScore: place.rating ?? 0,
      reviewsCount: place.userRatingCount ?? 0,
      url: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
      website: place.websiteUri,
      phone: place.nationalPhoneNumber,
      hasHours,
      hoursComplete,
      photosCount: place.photos?.length ?? 0,
      location: place.location
        ? { lat: place.location.latitude, lng: place.location.longitude }
        : undefined,
    };
  });

  // Sort by review count (desc), then rating (desc), then placeId (deterministic)
  competitors.sort((a, b) => {
    if (b.reviewsCount !== a.reviewsCount) return b.reviewsCount - a.reviewsCount;
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    return a.placeId.localeCompare(b.placeId);
  });

  return competitors;
}

// =====================================================================
// CATEGORY FILTERING
// =====================================================================

/**
 * Filter out non-dental results from Text Search.
 *
 * Google classifies most dental specialists as primaryType: "dentist"
 * regardless of actual specialty (endodontists, periodontists, etc. all
 * show as "dentist"). The Text Search query already scopes by specialty
 * (e.g. "endodontist in Austin, TX"), so this filter's job is just to
 * remove non-dental junk (restaurants, pharmacies, medical offices).
 *
 * For specialty-specific filtering, we check the display category name
 * against SPECIALTY_CATEGORIES as a secondary signal.
 *
 * @param competitors - Raw discovered competitors
 * @param specialty - Target specialty (e.g. "endodontist", "endodontics")
 * @returns Filtered competitors that are dental businesses
 */
export function filterBySpecialty(
  competitors: DiscoveredCompetitor[],
  specialty: string,
): DiscoveredCompetitor[] {
  const normalizedSpecialty = normalizeSpecialty(specialty);
  const targetDisplayNames = (
    SPECIALTY_CATEGORIES[normalizedSpecialty] || []
  ).map((name) => name.toLowerCase());

  const beforeCount = competitors.length;

  // For specialists, only accept same-specialty matches.
  // For general dentists, accept all dental types.
  const isGeneral = normalizedSpecialty === "general";
  const specialtyTypes = SPECIALTY_PRIMARY_TYPES[normalizedSpecialty] || [];

  const filtered = competitors.filter((comp) => {
    const pt = comp.primaryType.toLowerCase();
    const displayCat = comp.category.toLowerCase();

    // First gate: must be a dental business at all (reject non-dental junk)
    const isDental =
      ALL_DENTAL_TYPES.includes(pt) ||
      comp.types?.some((t) => ALL_DENTAL_TYPES.includes(t.toLowerCase()));
    if (!isDental) return false;

    // General dentists: accept any dental business
    if (isGeneral) return true;

    // Specialists: accept if primaryType matches the target specialty
    if (specialtyTypes.includes(pt)) return true;

    // Also accept if any type in the types array matches
    if (comp.types?.some((t) => specialtyTypes.includes(t.toLowerCase()))) return true;

    // Fallback: match on display category name from SPECIALTY_CATEGORIES
    if (targetDisplayNames.some((name) => displayCat.includes(name))) return true;

    return false;
  });

  const afterCount = filtered.length;
  log(
    `Category filter (${specialty}): ${beforeCount} → ${afterCount} competitors`,
  );

  if (afterCount < 5) {
    log(
      `⚠ Only ${afterCount} competitors match specialty "${specialty}". Consider broadening search.`,
    );
  }

  return filtered;
}

// =====================================================================
// CLIENT PHOTOS
// =====================================================================

/**
 * Get client's photo count via Google Places API.
 * Replaces the 2 Apify runs (search + detail scrape) previously used.
 *
 * @param practiceName - Client business name
 * @param marketLocation - Market location (e.g. "Austin, TX")
 * @returns Object with placeId and photosCount
 */
export async function getClientPhotosViaPlaces(
  practiceName: string,
  marketLocation: string,
): Promise<{ placeId: string | null; photosCount: number }> {
  const searchQuery = `${practiceName} ${marketLocation}`;
  log(`Searching for client: "${searchQuery}"`);

  const places = await textSearch(searchQuery, 5);

  if (places.length === 0) {
    log(`✗ No results found for client`);
    return { placeId: null, photosCount: 0 };
  }

  // Find client in results by name match
  const clientNameLower = practiceName.toLowerCase().trim();
  const match = places.find((place: any) => {
    const placeName = (place.displayName?.text || "").toLowerCase().trim();
    return (
      placeName === clientNameLower ||
      placeName.includes(clientNameLower) ||
      clientNameLower.includes(placeName)
    );
  });

  if (!match) {
    log(
      `✗ Could not match client name. Results: ${places
        .map((p: any) => p.displayName?.text)
        .join(", ")}`,
    );
    return { placeId: null, photosCount: 0 };
  }

  const placeId = match.id;
  const photosCount = match.photos?.length ?? 0;

  log(`✓ Found client: ${match.displayName?.text} (${placeId}), ${photosCount} photos`);

  return { placeId, photosCount };
}
