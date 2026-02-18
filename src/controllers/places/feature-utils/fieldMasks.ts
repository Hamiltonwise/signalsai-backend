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
