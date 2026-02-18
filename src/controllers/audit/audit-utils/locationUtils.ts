// Default fallback coordinates: West Orange, NJ
const DEFAULT_LAT = 40.7964763;
const DEFAULT_LNG = -74.2613414;

// Offsets to spread competitors within ~2 mile radius
const COMPETITOR_OFFSETS = [
  { lat: 0.015, lng: -0.01 },
  { lat: -0.02, lng: 0.008 },
  { lat: 0.01, lng: 0.015 },
  { lat: -0.008, lng: -0.02 },
  { lat: 0.025, lng: 0.005 },
  { lat: -0.015, lng: 0.012 },
];

export function ensureLatLng(
  location: any,
  selfLocation: any,
  index: number
): { lat: number; lng: number } {
  if (location?.lat && location?.lng) {
    return location;
  }

  // Use self location as base, or fallback to West Orange, NJ area
  const baseLat = selfLocation?.lat || DEFAULT_LAT;
  const baseLng = selfLocation?.lng || DEFAULT_LNG;

  // Offset each competitor slightly (within ~2 mile radius)
  const offset = COMPETITOR_OFFSETS[index % COMPETITOR_OFFSETS.length];

  return {
    lat: location?.lat ?? baseLat + offset.lat,
    lng: location?.lng ?? baseLng + offset.lng,
  };
}
