export interface GeoCoordinates {
  latitude: number;
  longitude: number;
}

export interface ProximityConfig {
  radiusKm: number;
  enabled: boolean;
  requireLocationSharing: boolean;
}

export const DEFAULT_PROXIMITY_CONFIG: ProximityConfig = {
  radiusKm: 80,
  enabled: true,
  requireLocationSharing: true,
};

const PROXIMITY_CONFIG_KEY = 'PACT_PROXIMITY_CONFIG';

export function getProximityConfig(): ProximityConfig {
  try {
    const stored = localStorage.getItem(PROXIMITY_CONFIG_KEY);
    if (stored) {
      return { ...DEFAULT_PROXIMITY_CONFIG, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.warn('Failed to load proximity config from localStorage');
  }
  return DEFAULT_PROXIMITY_CONFIG;
}

export function setProximityConfig(config: Partial<ProximityConfig>): void {
  try {
    const current = getProximityConfig();
    const updated = { ...current, ...config };
    localStorage.setItem(PROXIMITY_CONFIG_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save proximity config to localStorage');
  }
}

export function calculateHaversineDistance(
  point1: GeoCoordinates,
  point2: GeoCoordinates
): number {
  const R = 6371;

  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const deltaLatRad = toRadians(point2.latitude - point1.latitude);
  const deltaLonRad = toRadians(point2.longitude - point1.longitude);

  const a =
    Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) *
      Math.sin(deltaLonRad / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function isWithinProximity(
  userLocation: GeoCoordinates,
  siteLocation: GeoCoordinates,
  radiusKm: number = DEFAULT_PROXIMITY_CONFIG.radiusKm
): boolean {
  const distance = calculateHaversineDistance(userLocation, siteLocation);
  return distance <= radiusKm;
}

export function parseGpsCoordinates(
  location: unknown
): GeoCoordinates | null {
  if (!location) return null;

  try {
    let parsed: any = location;
    if (typeof location === 'string') {
      parsed = JSON.parse(location);
    }

    const lat = parsed.latitude ?? parsed.lat;
    const lng = parsed.longitude ?? parsed.lng ?? parsed.lon;

    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return { latitude: lat, longitude: lng };
      }
    }
  } catch (e) {
    return null;
  }

  return null;
}

export interface SiteProximityCheck {
  isWithinState: boolean;
  isWithinRadius: boolean;
  hasGpsCoordinates: boolean;
  distanceKm: number | null;
  canAccess: boolean;
  reason: string | null;
}

/**
 * Check if a user can access a site based on state + GPS proximity rules.
 * 
 * @param userStateName - The user's assigned state NAME (not ID)
 * @param userLocation - The user's current GPS coordinates
 * @param siteStateId - The site's state ID (optional, prefer siteStateName)
 * @param siteStateName - The site's state NAME
 * @param siteLocation - The site's GPS coordinates (optional)
 * @param config - Proximity configuration (radius, requirements)
 */
export function checkSiteProximity(
  userStateName: string | undefined,
  userLocation: GeoCoordinates | null,
  siteStateId: string | undefined,
  siteStateName: string | undefined,
  siteLocation: GeoCoordinates | null,
  config: ProximityConfig = getProximityConfig()
): SiteProximityCheck {
  const result: SiteProximityCheck = {
    isWithinState: false,
    isWithinRadius: false,
    hasGpsCoordinates: !!siteLocation,
    distanceKm: null,
    canAccess: false,
    reason: null,
  };

  if (!userStateName) {
    result.reason = 'Your profile has no state assigned. Contact your supervisor.';
    return result;
  }

  if (config.requireLocationSharing && !userLocation) {
    result.reason = 'Location sharing must be enabled to view sites. Please enable GPS.';
    return result;
  }

  const normalizedUserState = userStateName.toLowerCase().trim();
  const normalizedSiteState = (siteStateId || siteStateName || '').toLowerCase().trim();
  
  result.isWithinState = 
    normalizedSiteState === normalizedUserState ||
    normalizedSiteState.includes(normalizedUserState) ||
    normalizedUserState.includes(normalizedSiteState);

  if (!result.isWithinState) {
    result.reason = `This site is in a different state.`;
    return result;
  }

  if (!siteLocation) {
    result.canAccess = true;
    result.reason = null;
    return result;
  }

  if (!userLocation) {
    result.canAccess = true;
    result.reason = null;
    return result;
  }

  result.distanceKm = calculateHaversineDistance(userLocation, siteLocation);
  result.isWithinRadius = result.distanceKm <= config.radiusKm;

  if (result.isWithinRadius) {
    result.canAccess = true;
    result.reason = null;
  } else {
    result.canAccess = false;
    result.reason = `This site is ${Math.round(result.distanceKm)} km away, beyond the ${config.radiusKm} km limit.`;
  }

  return result;
}

export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return 'Unknown';
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${Math.round(distanceKm)} km`;
}
