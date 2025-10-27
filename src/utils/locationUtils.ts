import { hubs } from '@/data/sudanStates';

/**
 * Get fallback coordinates for a site when location data is missing or invalid
 * Uses hub coordinates as fallback based on state information
 */
export const getFallbackCoordinates = (state?: string, locality?: string): { latitude: number; longitude: number } | null => {
  if (!state) return null;

  // Find the hub that covers this state
  const hub = hubs.find(h => h.states.includes(state.toLowerCase()));
  
  if (hub) {
    return {
      latitude: hub.coordinates.latitude,
      longitude: hub.coordinates.longitude
    };
  }

  // Default to Sudan center if no hub found
  return {
    latitude: 15.5007,
    longitude: 32.5599
  };
};

/**
 * Check if location data is valid (not empty, not 0,0)
 */
export const isValidLocation = (location?: { latitude?: number; longitude?: number } | null): boolean => {
  if (!location) return false;
  
  const lat = location.latitude;
  const lon = location.longitude;
  
  return (
    typeof lat === 'number' && 
    typeof lon === 'number' &&
    Number.isFinite(lat) && 
    Number.isFinite(lon) &&
    !(lat === 0 && lon === 0)
  );
};

/**
 * Get coordinates for a site visit, using fallback if needed
 */
export const getSiteCoordinates = (siteVisit: { 
  location?: { latitude?: number; longitude?: number } | null;
  state?: string;
  locality?: string;
}): { latitude: number; longitude: number } | null => {
  // First try to use the actual location data
  if (isValidLocation(siteVisit.location)) {
    return {
      latitude: siteVisit.location!.latitude!,
      longitude: siteVisit.location!.longitude!
    };
  }

  // If location is invalid, try to get fallback coordinates
  return getFallbackCoordinates(siteVisit.state, siteVisit.locality);
};
