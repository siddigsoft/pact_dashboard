/**
 * Base coordinates: PACT Country Office, Khartoum.
 * Fee rate: 50 SDG per km (straight-line Haversine distance).
 */
const BASE_LAT = 15.5007;
const BASE_LNG = 32.5599;
const FEE_RATE_PER_KM = 50;
const EARTH_RADIUS_KM = 6371;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Returns the travel fee in SDG for a given GPS coordinate,
 * calculated as the great-circle distance from Khartoum × 50 SDG/km.
 */
export function calculateDistanceFee(latitude: number, longitude: number): number {
  const dLat = toRad(latitude - BASE_LAT);
  const dLng = toRad(longitude - BASE_LNG);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(BASE_LAT)) * Math.cos(toRad(latitude)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const distanceKm = EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(distanceKm * FEE_RATE_PER_KM);
}
