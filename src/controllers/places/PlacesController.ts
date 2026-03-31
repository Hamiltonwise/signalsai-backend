import { Request, Response } from "express";
import axios from "axios";
import {
  autocomplete as googleAutocomplete,
  getPlaceDetails as googleGetPlaceDetails,
  getSearchPlaceDetails,
  isApiKeyConfigured,
} from "./feature-services/GooglePlacesApiService";
import {
  transformAutocompleteSuggestions,
  transformPlaceDetailsResponse,
  transformSearchPlaceResponse,
  transformSearchAlternatives,
} from "./feature-services/PlaceDataTransformService";

// Cache IP geolocation results (IP -> {lat, lng}) for 1 hour
const ipGeoCache = new Map<string, { lat: number; lng: number; ts: number }>();
const IP_GEO_CACHE_MS = 60 * 60 * 1000;

async function getLocationFromIP(ip: string): Promise<{ lat: number; lng: number } | null> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return null;
  const cached = ipGeoCache.get(ip);
  if (cached && Date.now() - cached.ts < IP_GEO_CACHE_MS) return { lat: cached.lat, lng: cached.lng };
  try {
    const res = await axios.get(`https://ipapi.co/${ip}/json/`, { timeout: 2000 });
    if (res.data?.latitude && res.data?.longitude) {
      const loc = { lat: res.data.latitude, lng: res.data.longitude };
      ipGeoCache.set(ip, { ...loc, ts: Date.now() });
      return loc;
    }
  } catch { /* silent */ }
  return null;
}

/**
 * POST /api/places/autocomplete
 *
 * Search for businesses using Google Places Autocomplete.
 */
export async function autocomplete(req: Request, res: Response) {
  try {
    const { input, sessionToken, lat, lng } = req.body;

    if (!input || typeof input !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'input' field",
      });
    }

    if (!isApiKeyConfigured()) {
      return res.status(500).json({
        success: false,
        error: "Google Places API key not configured",
      });
    }

    // Build location bias: client coordinates > IP geolocation > no bias
    let locationBias =
      typeof lat === "number" && typeof lng === "number"
        ? { lat, lng }
        : undefined;

    // Server-side IP fallback when client sends no coordinates
    if (!locationBias) {
      const clientIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "";
      const ipLoc = await getLocationFromIP(clientIp);
      if (ipLoc) locationBias = ipLoc;
    }

    console.log(
      `[Places] Autocomplete search: "${input}"${locationBias ? ` (biased to ${locationBias.lat.toFixed(2)},${locationBias.lng.toFixed(2)})` : " (no location bias)"}`
    );

    const rawSuggestions = await googleAutocomplete(input, sessionToken, locationBias);
    const suggestions = transformAutocompleteSuggestions(rawSuggestions);

    console.log(`[Places] Found ${suggestions.length} suggestions`);

    return res.json({
      success: true,
      suggestions,
    });
  } catch (error: any) {
    console.error(
      "[Places] Autocomplete error:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || "Autocomplete failed",
    });
  }
}

/**
 * GET /api/places/:placeId
 *
 * Get detailed information for a specific place.
 */
export async function getPlaceDetails(req: Request, res: Response) {
  try {
    const { placeId } = req.params;
    const { sessionToken } = req.query;

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "Missing placeId",
      });
    }

    if (!isApiKeyConfigured()) {
      return res.status(500).json({
        success: false,
        error: "Google Places API key not configured",
      });
    }

    console.log(`[Places] Getting details for: ${placeId}`);

    const data = await googleGetPlaceDetails(
      placeId,
      sessionToken as string | undefined
    );
    const place = transformPlaceDetailsResponse(data, placeId);

    console.log(
      `[Places] Got details: ${place.displayString} | Domain: ${place.domain}`
    );

    return res.json({
      success: true,
      place,
    });
  } catch (error: any) {
    console.error(
      "[Places] Details error:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      error:
        error.response?.data?.error?.message || "Failed to get place details",
    });
  }
}

/**
 * POST /api/places/search
 *
 * Combined endpoint: autocomplete + get first result details.
 * Useful for quick lookups where user just wants the top match.
 */
export async function quickSearch(req: Request, res: Response) {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'query' field",
      });
    }

    if (!isApiKeyConfigured()) {
      return res.status(500).json({
        success: false,
        error: "Google Places API key not configured",
      });
    }

    console.log(`[Places] Quick search: "${query}"`);

    // Step 1: Autocomplete
    const suggestions = await googleAutocomplete(query);

    if (suggestions.length === 0) {
      return res.json({
        success: true,
        place: null,
        alternatives: [],
        message: "No results found",
      });
    }

    // Step 2: Get details for the first result
    const firstPlaceId = suggestions[0].placePrediction?.placeId;

    if (!firstPlaceId) {
      return res.json({
        success: true,
        place: null,
        alternatives: [],
        message: "No valid place ID in results",
      });
    }

    const data = await getSearchPlaceDetails(firstPlaceId);
    const place = transformSearchPlaceResponse(data, firstPlaceId);
    const alternatives = transformSearchAlternatives(suggestions);

    console.log(
      `[Places] Found: ${place.displayString} | Domain: ${place.domain} | ${alternatives.length} alternatives`
    );

    return res.json({
      success: true,
      place,
      alternatives,
    });
  } catch (error: any) {
    console.error(
      "[Places] Search error:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || "Search failed",
    });
  }
}
