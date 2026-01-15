import express from "express";
import axios from "axios";

const placesRoutes = express.Router();

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API;
const PLACES_API_BASE = "https://places.googleapis.com/v1";

/**
 * Helper function to extract city and state from address components or formatted address
 */
function extractCityState(
  addressComponents?: any[],
  formattedAddress?: string
): { city: string; state: string } {
  let city = "";
  let state = "";

  // Try to extract from address components first (most reliable)
  if (addressComponents && Array.isArray(addressComponents)) {
    for (const component of addressComponents) {
      const types = component.types || [];
      if (types.includes("locality")) {
        city = component.longText || component.shortText || "";
      } else if (types.includes("administrative_area_level_1")) {
        state = component.shortText || "";
      }
    }
  }

  // Fallback: parse from formatted address
  if ((!city || !state) && formattedAddress) {
    // Typical format: "123 Main St, City, State ZIP, Country"
    const parts = formattedAddress.split(",").map((s) => s.trim());
    if (parts.length >= 3) {
      // City is usually the second-to-last US part
      if (!city && parts.length >= 2) {
        city = parts[parts.length - 3] || parts[parts.length - 2] || "";
      }
      // State is in the part with ZIP code (e.g., "NJ 07052")
      if (!state) {
        const stateZipPart = parts[parts.length - 2] || "";
        const stateMatch = stateZipPart.match(/^([A-Z]{2})\s*\d*/);
        if (stateMatch) {
          state = stateMatch[1];
        }
      }
    }
  }

  return { city, state };
}

/**
 * POST /api/places/autocomplete
 *
 * Search for businesses using Google Places Autocomplete
 *
 * Body:
 *   - input: string (search query, e.g., "Garrison Orthodontics")
 *   - sessionToken?: string (optional, for billing optimization)
 *
 * Response:
 *   - suggestions: Array of { placeId, mainText, secondaryText, description }
 */
placesRoutes.post("/autocomplete", async (req, res) => {
  try {
    const { input, sessionToken } = req.body;

    if (!input || typeof input !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'input' field",
      });
    }

    if (!GOOGLE_PLACES_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Google Places API key not configured",
      });
    }

    console.log(`[Places] Autocomplete search: "${input}"`);

    const response = await axios.post(
      `${PLACES_API_BASE}/places:autocomplete`,
      {
        input,
        includedPrimaryTypes: ["establishment"],
        sessionToken,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        },
      }
    );

    const suggestions = (response.data.suggestions || []).map(
      (suggestion: any) => {
        const placePrediction = suggestion.placePrediction || {};
        return {
          placeId: placePrediction.placeId || "",
          mainText:
            placePrediction.structuredFormat?.mainText?.text ||
            placePrediction.text?.text ||
            "",
          secondaryText:
            placePrediction.structuredFormat?.secondaryText?.text || "",
          description: placePrediction.text?.text || "",
        };
      }
    );

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
});

/**
 * GET /api/places/:placeId
 *
 * Get detailed information for a specific place
 *
 * Params:
 *   - placeId: Google Place ID
 *
 * Query:
 *   - sessionToken?: string (optional, for billing optimization)
 *
 * Response:
 *   - place: { placeId, name, formattedAddress, city, state, displayString, domain, websiteUri, ... }
 */
placesRoutes.get("/:placeId", async (req, res) => {
  try {
    const { placeId } = req.params;
    const { sessionToken } = req.query;

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: "Missing placeId",
      });
    }

    if (!GOOGLE_PLACES_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Google Places API key not configured",
      });
    }

    console.log(`[Places] Getting details for: ${placeId}`);

    // Field mask for the data we need
    const fieldMask = [
      "id",
      "displayName",
      "formattedAddress",
      "addressComponents",
      "websiteUri",
      "nationalPhoneNumber",
      "internationalPhoneNumber",
      "rating",
      "userRatingCount",
      "types",
      "primaryType",
      "primaryTypeDisplayName",
      "location",
    ].join(",");

    const response = await axios.get(`${PLACES_API_BASE}/places/${placeId}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": fieldMask,
      },
      params: sessionToken ? { sessionToken } : {},
    });

    const data = response.data;

    // Extract city and state
    const { city, state } = extractCityState(
      data.addressComponents,
      data.formattedAddress
    );

    // Extract domain from websiteUri
    let domain = "";
    if (data.websiteUri) {
      try {
        const url = new URL(data.websiteUri);
        domain = url.hostname.replace(/^www\./, "");
      } catch {
        domain = data.websiteUri;
      }
    }

    const name = data.displayName?.text || "";
    const displayString = city && state ? `${name}, ${city}, ${state}` : name;
    const formattedAddress = data.formattedAddress || "";
    // Practice search string format: "Business Name, Full Address"
    const practiceSearchString = formattedAddress
      ? `${name}, ${formattedAddress}`
      : name;

    const place = {
      placeId: data.id || placeId,
      name,
      formattedAddress,
      city,
      state,
      displayString,
      practiceSearchString,
      domain,
      websiteUri: data.websiteUri || null,
      phone: data.nationalPhoneNumber || data.internationalPhoneNumber || null,
      rating: data.rating || null,
      reviewCount: data.userRatingCount || 0,
      category: data.primaryTypeDisplayName?.text || data.primaryType || "",
      types: data.types || [],
      location: data.location || null,
    };

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
});

/**
 * POST /api/places/search
 *
 * Combined endpoint: autocomplete + get first result details
 * Useful for quick lookups where user just wants the top match
 *
 * Body:
 *   - query: string (search query)
 *
 * Response:
 *   - place: Full place details (same as /:placeId endpoint)
 *   - alternatives: Array of other suggestions (placeId, mainText, secondaryText)
 */
placesRoutes.post("/search", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid 'query' field",
      });
    }

    if (!GOOGLE_PLACES_API_KEY) {
      return res.status(500).json({
        success: false,
        error: "Google Places API key not configured",
      });
    }

    console.log(`[Places] Quick search: "${query}"`);

    // Step 1: Autocomplete
    const autocompleteResponse = await axios.post(
      `${PLACES_API_BASE}/places:autocomplete`,
      {
        input: query,
        includedPrimaryTypes: ["establishment"],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        },
      }
    );

    const suggestions = autocompleteResponse.data.suggestions || [];

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

    const fieldMask = [
      "id",
      "displayName",
      "formattedAddress",
      "addressComponents",
      "websiteUri",
      "nationalPhoneNumber",
      "rating",
      "userRatingCount",
      "primaryTypeDisplayName",
      "location",
    ].join(",");

    const detailsResponse = await axios.get(
      `${PLACES_API_BASE}/places/${firstPlaceId}`,
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask": fieldMask,
        },
      }
    );

    const data = detailsResponse.data;
    const { city, state } = extractCityState(
      data.addressComponents,
      data.formattedAddress
    );

    let domain = "";
    if (data.websiteUri) {
      try {
        const url = new URL(data.websiteUri);
        domain = url.hostname.replace(/^www\./, "");
      } catch {
        domain = data.websiteUri;
      }
    }

    const name = data.displayName?.text || "";
    const displayString = city && state ? `${name}, ${city}, ${state}` : name;
    const formattedAddress = data.formattedAddress || "";
    // Practice search string format: "Business Name, Full Address"
    const practiceSearchString = formattedAddress
      ? `${name}, ${formattedAddress}`
      : name;

    const place = {
      placeId: data.id || firstPlaceId,
      name,
      formattedAddress,
      city,
      state,
      displayString,
      practiceSearchString,
      domain,
      websiteUri: data.websiteUri || null,
      phone: data.nationalPhoneNumber || null,
      rating: data.rating || null,
      reviewCount: data.userRatingCount || 0,
      category: data.primaryTypeDisplayName?.text || "",
      location: data.location || null,
    };

    // Map alternatives (skip the first one since we returned its details)
    const alternatives = suggestions.slice(1, 5).map((suggestion: any) => {
      const pred = suggestion.placePrediction || {};
      return {
        placeId: pred.placeId || "",
        mainText:
          pred.structuredFormat?.mainText?.text || pred.text?.text || "",
        secondaryText: pred.structuredFormat?.secondaryText?.text || "",
      };
    });

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
});

export default placesRoutes;
