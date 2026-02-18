/**
 * Helper function to extract city and state from address components or formatted address
 */
export function extractCityState(
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
