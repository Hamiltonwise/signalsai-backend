/**
 * Field mask for Google Places API detail requests.
 *
 * Full mask used by GET /:placeId — includes internationalPhoneNumber, types, and primaryType.
 */
export const PLACE_DETAILS_FIELD_MASK = [
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
  "reviews",
  "photos",
  // Oz Pearlman homework: deeper signals for personalized reveals
  "editorialSummary",      // Google's AI summary of the business
  "regularOpeningHours",   // Full business hours (for competitor comparison)
  "currentOpeningHours",   // Are they open right now?
  "businessStatus",        // OPERATIONAL, CLOSED_TEMPORARILY, etc.
  "priceLevel",            // Price tier
  "openingDate",           // When the business opened (years in business)
  "reviews.publishTime",   // Review timestamps (for recency analysis)
  // Trust scoring signals (verified Google Places API v1, April 2026)
  "reviewSummary",         // Google's Gemini-generated review summary
  "generativeSummary",     // Google's AI description of the place
  "googleMapsLinks",       // Direct links: writeAReviewUri, reviewsUri, photosUri
  "pureServiceAreaBusiness", // true for mobile/service-area businesses (plumbers, groomers)
  "goodForChildren",       // Relevant for pediatric dentists, orthodontists, family practices
  "accessibilityOptions",  // Wheelchair accessible, etc.
  "paymentOptions",        // Accepts cards, NFC, etc.
].join(",");

/**
 * Reduced field mask used by POST /search (quickSearch).
 * Matches the original search endpoint's field selection exactly.
 */
export const PLACE_SEARCH_FIELD_MASK = [
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

/**
 * Field mask for Text Search used by competitor discovery.
 * Includes all fields needed for ranking algorithm inputs.
 */
export const TEXT_SEARCH_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.rating",
  "places.userRatingCount",
  "places.types",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.regularOpeningHours",
  "places.photos",
  "places.location",
  // Oz Pearlman homework: surprise findings from competitor data
  "places.editorialSummary",    // Google's AI summary of the business
  "places.reviews",             // Review text + timestamps for recency analysis
].join(",");
