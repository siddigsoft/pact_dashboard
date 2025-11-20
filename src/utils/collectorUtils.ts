
import { User, SiteVisit } from '@/types';

// Calculate distance between two points using the Haversine formula
export const calculateDistance = (
  lat1: number, 
  lon1: number, 
  lat2: number, 
  lon2: number
): number => {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  return distance;
};

// Check if user is near a site within a specific radius
export const isUserNearSite = (
  user: User, 
  site: SiteVisit, 
  maxDistanceKm: number = 30
): boolean => {
  // Skip if user location or site coordinates are missing
  if (
    !user.location?.latitude || 
    !user.location?.longitude || 
    !site.coordinates?.latitude || 
    !site.coordinates?.longitude
  ) {
    return false;
  }
  
  // Calculate distance between user and site
  const distance = calculateDistance(
    user.location.latitude, 
    user.location.longitude, 
    site.coordinates.latitude, 
    site.coordinates.longitude
  );
  
  // Check if user is within the specified radius
  return distance <= maxDistanceKm;
};

// Calculate user's current workload
export const calculateUserWorkload = (
  userId: string, 
  siteVisits: SiteVisit[]
): number => {
  // Count the number of active assignments for the user
  return siteVisits.filter(visit => 
    visit.assignedTo === userId && 
    ['assigned', 'inProgress'].includes(visit.status)
  ).length;
};

// Find users near a site
export const findNearbyUsers = (
  users: User[], 
  site: SiteVisit, 
  maxDistanceKm: number = 30
): User[] => {
  // Filter users by distance
  return users.filter(user => isUserNearSite(user, site, maxDistanceKm));
};

// Get estimated time to arrival at site
export const getEstimatedTimeToArrival = (
  userLat: number, 
  userLon: number, 
  siteLat: number, 
  siteLon: number,
  avgSpeedKmh: number = 30
): string => {
  // Calculate distance in km
  const distanceKm = calculateDistance(userLat, userLon, siteLat, siteLon);
  
  // Calculate time in hours based on average speed
  const timeHours = distanceKm / avgSpeedKmh;
  
  if (timeHours < 1) {
    // Convert to minutes if less than 1 hour
    return `${Math.round(timeHours * 60)} mins`;
  }
  
  // Round to 1 decimal place if more than 1 hour
  return `${Math.round(timeHours * 10) / 10} hours`;
};
