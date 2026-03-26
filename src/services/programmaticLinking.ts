/**
 * AEO Internal Linking — Hub-and-Spoke System
 *
 * Hub pages: one per specialty (e.g., /endodontist)
 *   Links to top 10 city pages for that specialty
 *
 * Spoke pages: specialty-city combos (e.g., /endodontist-scottsdale)
 *   Each spoke links to:
 *   1. Its specialty hub page
 *   2. Same specialty in nearest city (by Haversine distance)
 *   3. Different specialty in the same city
 */

import {
  CITY_DATA,
  SPECIALTIES,
  buildPageSlug,
  type CityData,
  type SpecialtyData,
} from "../data/cityData";

export interface InternalLink {
  url: string;
  anchorText: string;
  rel: "internal";
  type: "hub" | "nearby_city" | "same_city_specialty";
}

// ---------------------------------------------------------------------------
// Haversine formula — distance in km between two lat/lng points
// ---------------------------------------------------------------------------

function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // Earth radius in km
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------------------------------------------------------------------
// Find the nearest city to a given city (excluding itself)
// ---------------------------------------------------------------------------

function findNearestCity(targetCity: CityData): CityData | null {
  let nearest: CityData | null = null;
  let shortestDistance = Infinity;

  for (const city of CITY_DATA) {
    if (city.slug === targetCity.slug) continue;

    const dist = haversineDistanceKm(
      targetCity.lat,
      targetCity.lng,
      city.lat,
      city.lng
    );

    if (dist < shortestDistance) {
      shortestDistance = dist;
      nearest = city;
    }
  }

  return nearest;
}

// ---------------------------------------------------------------------------
// Spoke page links — returns 3 internal links for a city+specialty page
// ---------------------------------------------------------------------------

/**
 * Get internal links for a spoke page (individual city+specialty page).
 *
 * Returns up to 3 links:
 * 1. Hub link — back to the specialty hub (e.g., /endodontist)
 * 2. Nearby city — same specialty in geographically closest city
 * 3. Same city, different specialty — cross-specialty link in the same city
 */
export function getInternalLinks(
  specialtySlug: string,
  citySlug: string
): InternalLink[] {
  const links: InternalLink[] = [];

  // Find the matching specialty and city
  const specialty = SPECIALTIES.find((s) => s.slug === specialtySlug);
  const city = CITY_DATA.find((c) => c.slug === citySlug);

  if (!specialty || !city) return links;

  // 1. Hub link — back to the specialty hub page
  links.push({
    url: `/${specialtySlug}`,
    anchorText: `All ${specialty.name} Markets`,
    rel: "internal",
    type: "hub",
  });

  // 2. Nearby city — same specialty, geographically nearest city
  const nearestCity = findNearestCity(city);
  if (nearestCity) {
    const nearbySlug = buildPageSlug(specialtySlug, nearestCity);
    links.push({
      url: `/${nearbySlug}`,
      anchorText: `${specialty.name} in ${nearestCity.city}, ${nearestCity.stateAbbr}`,
      rel: "internal",
      type: "nearby_city",
    });
  }

  // 3. Different specialty in the same city
  const otherSpecialty = SPECIALTIES.find((s) => s.slug !== specialtySlug);
  if (otherSpecialty) {
    const crossSlug = buildPageSlug(otherSpecialty.slug, city);
    links.push({
      url: `/${crossSlug}`,
      anchorText: `${otherSpecialty.name} in ${city.city}, ${city.stateAbbr}`,
      rel: "internal",
      type: "same_city_specialty",
    });
  }

  return links;
}

// ---------------------------------------------------------------------------
// Hub page links — returns top 10 city spoke pages for a specialty
// ---------------------------------------------------------------------------

/**
 * Get internal links for a hub page (specialty overview page).
 *
 * Returns links to the top 10 cities by ICP density rank for the given specialty.
 */
export function getHubPageLinks(specialtySlug: string): InternalLink[] {
  const specialty = SPECIALTIES.find((s) => s.slug === specialtySlug);
  if (!specialty) return [];

  // Top 10 cities by ICP density rank (lower rank = higher density)
  const topCities = [...CITY_DATA]
    .sort((a, b) => a.icpDensityRank - b.icpDensityRank)
    .slice(0, 10);

  return topCities.map((city) => ({
    url: `/${buildPageSlug(specialtySlug, city)}`,
    anchorText: `${specialty.name} in ${city.city}, ${city.stateAbbr}`,
    rel: "internal" as const,
    type: "nearby_city" as const, // spoke pages from hub perspective
  }));
}
