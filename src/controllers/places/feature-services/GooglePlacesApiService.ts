import axios from "axios";
import {
  PLACE_DETAILS_FIELD_MASK,
  PLACE_SEARCH_FIELD_MASK,
  TEXT_SEARCH_FIELD_MASK,
} from "../feature-utils/fieldMasks";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API;
const PLACES_API_BASE = "https://places.googleapis.com/v1";

/**
 * Calls the Google Places Autocomplete API.
 *
 * Returns the raw suggestions array from the response.
 */
export async function autocomplete(
  input: string,
  sessionToken?: string
): Promise<any[]> {
  const response = await axios.post(
    `${PLACES_API_BASE}/places:autocomplete`,
    {
      input,
      includedPrimaryTypes: ["establishment"],
      includePureServiceAreaBusinesses: true,
      ...(sessionToken ? { sessionToken } : {}),
    },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      },
    }
  );

  return response.data.suggestions || [];
}

/**
 * Calls the Google Places Details API with the full field mask.
 * Used by GET /:placeId.
 *
 * Returns the raw Google response data.
 */
export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string
): Promise<any> {
  const response = await axios.get(`${PLACES_API_BASE}/places/${placeId}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": PLACE_DETAILS_FIELD_MASK,
    },
    params: sessionToken ? { sessionToken } : {},
  });

  return response.data;
}

/**
 * Calls the Google Places Details API with the search-specific field mask.
 * Used by POST /search (quickSearch).
 *
 * Returns the raw Google response data.
 */
export async function getSearchPlaceDetails(placeId: string): Promise<any> {
  const response = await axios.get(`${PLACES_API_BASE}/places/${placeId}`, {
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask": PLACE_SEARCH_FIELD_MASK,
    },
  });

  return response.data;
}

/**
 * Calls the Google Places Text Search API.
 * Used for competitor discovery — searches for businesses by query string.
 *
 * @param textQuery - Search query (e.g. "endodontist in Austin, TX")
 * @param maxResultCount - Maximum results (default 20, max 20)
 * @returns Array of place objects from Google
 */
export async function textSearch(
  textQuery: string,
  maxResultCount: number = 20,
  locationBias?: { lat: number; lng: number; radiusMeters?: number },
): Promise<any[]> {
  const body: Record<string, unknown> = { textQuery, maxResultCount };

  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: locationBias.radiusMeters ?? 40234, // default 25 miles
      },
    };
  }

  const response = await axios.post(
    `${PLACES_API_BASE}/places:searchText`,
    body,
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY!,
        "X-Goog-FieldMask": TEXT_SEARCH_FIELD_MASK,
      },
    },
  );

  return response.data.places || [];
}

/**
 * Check that the Google Places API key is configured.
 * Returns true if available, false otherwise.
 */
export function isApiKeyConfigured(): boolean {
  return !!GOOGLE_PLACES_API_KEY;
}
