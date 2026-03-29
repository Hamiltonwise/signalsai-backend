import { extractCityState } from "../feature-utils/addressParser";
import { extractDomainFromUrl } from "../feature-utils/domainExtractor";

/**
 * Full place details returned by GET /:placeId.
 * Includes `types` array and full phone/category fallbacks.
 */
export interface PlaceReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
}

export interface PlacePhoto {
  url: string;
  widthPx: number;
  heightPx: number;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string;
  state: string;
  displayString: string;
  practiceSearchString: string;
  domain: string;
  websiteUri: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number;
  category: string;
  types: string[];
  location: any | null;
  reviews: PlaceReview[];
  photos: PlacePhoto[];
  regularOpeningHours?: {
    weekdayDescriptions?: string[];
    periods?: any[];
  } | null;
  editorialSummary?: string | null;
  openingDate?: string | null;
  businessStatus?: string | null;
}

/**
 * Place details returned by POST /search (quickSearch).
 * Omits `types` and uses narrower phone/category logic.
 */
export interface PlaceSearchDetails {
  placeId: string;
  name: string;
  formattedAddress: string;
  city: string;
  state: string;
  displayString: string;
  practiceSearchString: string;
  domain: string;
  websiteUri: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number;
  category: string;
  location: any | null;
}

/** Autocomplete suggestion returned to the client. */
export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  description: string;
}

/** Minimal suggestion used in the alternatives list for quickSearch. */
export interface PlaceAlternative {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

/**
 * Transform a Google Places detail response into the PlaceDetails shape
 * used by the GET /:placeId endpoint.
 */
export function transformPlaceDetailsResponse(
  data: any,
  fallbackPlaceId: string
): PlaceDetails {
  const { city, state } = extractCityState(
    data.addressComponents,
    data.formattedAddress
  );

  const domain = extractDomainFromUrl(data.websiteUri);
  const name = data.displayName?.text || "";
  const displayString = city && state ? `${name}, ${city}, ${state}` : name;
  const formattedAddress = data.formattedAddress || "";
  const practiceSearchString = formattedAddress
    ? `${name}, ${formattedAddress}`
    : name;

  return {
    placeId: data.id || fallbackPlaceId,
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
    reviews: (data.reviews || []).slice(0, 5).map((r: any) => ({
      authorName: r.authorAttribution?.displayName || "Anonymous",
      rating: r.rating || 0,
      text: r.text?.text || r.originalText?.text || "",
      relativeTime: r.relativePublishTimeDescription || "",
    })),
    photos: (data.photos || []).slice(0, 6).map((p: any) => ({
      url: p.name
        ? `https://places.googleapis.com/v1/${p.name}/media?maxWidthPx=400&key=${process.env.GOOGLE_PLACES_API}`
        : "",
      widthPx: p.widthPx || 400,
      heightPx: p.heightPx || 300,
    })),
    regularOpeningHours: data.regularOpeningHours || null,
    // Deep Oz data: editorial summary, opening date, business status
    editorialSummary: data.editorialSummary?.text || null,
    openingDate: data.openingDate || null,
    businessStatus: data.businessStatus || null,
  };
}

/**
 * Transform a Google Places detail response into the PlaceSearchDetails shape
 * used by the POST /search (quickSearch) endpoint.
 *
 * Preserves the original response differences from GET /:placeId:
 * - phone: only nationalPhoneNumber (no internationalPhoneNumber fallback)
 * - category: only primaryTypeDisplayName (no primaryType fallback)
 * - types field is omitted entirely
 */
export function transformSearchPlaceResponse(
  data: any,
  fallbackPlaceId: string
): PlaceSearchDetails {
  const { city, state } = extractCityState(
    data.addressComponents,
    data.formattedAddress
  );

  const domain = extractDomainFromUrl(data.websiteUri);
  const name = data.displayName?.text || "";
  const displayString = city && state ? `${name}, ${city}, ${state}` : name;
  const formattedAddress = data.formattedAddress || "";
  const practiceSearchString = formattedAddress
    ? `${name}, ${formattedAddress}`
    : name;

  return {
    placeId: data.id || fallbackPlaceId,
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
}

/**
 * Transform Google autocomplete suggestions into our simplified structure.
 */
export function transformAutocompleteSuggestions(
  suggestions: any[]
): PlaceSuggestion[] {
  return (suggestions || []).map((suggestion: any) => {
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
  });
}

/**
 * Transform Google autocomplete suggestions into the alternatives format
 * used by the quickSearch endpoint (skips the first result, takes up to 4).
 */
export function transformSearchAlternatives(
  suggestions: any[]
): PlaceAlternative[] {
  return suggestions.slice(1, 5).map((suggestion: any) => {
    const pred = suggestion.placePrediction || {};
    return {
      placeId: pred.placeId || "",
      mainText:
        pred.structuredFormat?.mainText?.text || pred.text?.text || "",
      secondaryText: pred.structuredFormat?.secondaryText?.text || "",
    };
  });
}
