/**
 * GA4 Property ID Formatter
 *
 * Ensures property IDs are in the correct Google API format: "properties/{id}"
 */

/**
 * Formats a property ID to the Google Analytics API format.
 * If the ID already starts with "properties/", it is returned as-is.
 * Otherwise, the "properties/" prefix is prepended.
 *
 * @param propertyId - Raw property ID (e.g., "123456789" or "properties/123456789")
 * @returns Formatted property ID (e.g., "properties/123456789")
 */
export const formatPropertyId = (propertyId: string): string => {
  return propertyId.startsWith("properties/")
    ? propertyId
    : `properties/${propertyId}`;
};
