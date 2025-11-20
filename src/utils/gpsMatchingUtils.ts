
import { User, SiteVisit } from '@/types';
import { calculateDistance, calculateUserWorkload } from './collectorUtils';

export const MAX_WORKLOAD = 20;
export const NEARBY_THRESHOLD_KM = 15;

export interface CollectorMatch {
  user: User;
  distance: number;
  workload: number;
  isOverloaded: boolean;
  isNearby: boolean;
  isLocalityMatch: boolean;
  matchScore?: number;
}

export const findBestCollectorMatches = (
  siteVisit: SiteVisit,
  collectors: User[],
  allSiteVisits: SiteVisit[]
): CollectorMatch[] => {
  return collectors
    .filter(collector => 
      (collector.role === 'dataCollector' || collector.role === 'datacollector') &&
      collector.status === 'active' &&
      collector.availability !== 'offline' &&
      collector.location?.latitude &&
      collector.location?.longitude
    )
    .map(collector => {
      const distance = calculateDistance(
        collector.location!.latitude!,
        collector.location!.longitude!,
        siteVisit.coordinates.latitude,
        siteVisit.coordinates.longitude
      );

      const workload = calculateUserWorkload(collector.id, allSiteVisits);
      const isLocalityMatch = collector.stateId === siteVisit.state || 
                             collector.localityId === siteVisit.locality;
      
      // Calculate a match score (lower is better)
      // This weighs distance, workload, and locality matching
      const distanceScore = Math.min(distance / 5, 10); // Cap at 10 points for distance
      const workloadScore = Math.min(workload / 2, 10); // Cap at 10 points for workload
      const localityBonus = isLocalityMatch ? -5 : 0; // Bonus for matching locality
      const overloadPenalty = workload >= MAX_WORKLOAD ? 20 : 0; // Large penalty for overloaded collectors
      
      const matchScore = distanceScore + workloadScore + localityBonus + overloadPenalty;
      
      return {
        user: collector,
        distance,
        workload,
        isOverloaded: workload >= MAX_WORKLOAD,
        isNearby: distance <= NEARBY_THRESHOLD_KM,
        isLocalityMatch,
        matchScore
      };
    })
    .sort((a, b) => {
      // Prioritize non-overloaded collectors
      if (a.isOverloaded && !b.isOverloaded) return 1;
      if (!a.isOverloaded && b.isOverloaded) return -1;
      
      // Then prioritize nearby collectors
      if (a.isNearby && !b.isNearby) return -1;
      if (!a.isNearby && b.isNearby) return 1;
      
      // Then priority locality matches
      if (a.isLocalityMatch && !b.isLocalityMatch) return -1;
      if (!a.isLocalityMatch && b.isLocalityMatch) return 1;
      
      // Finally sort by distance
      return a.distance - b.distance;
    });
};

// Function to find enumerators with overloaded workloads
export const findOverloadedEnumerators = (
  users: User[],
  siteVisits: SiteVisit[]
): User[] => {
  return users.filter(user => {
    const isDataCollector = user.role === 'dataCollector' || user.role === 'datacollector';
    const workload = calculateUserWorkload(user.id, siteVisits);
    return isDataCollector && workload >= MAX_WORKLOAD;
  });
};

// Function to get enumerators sorted by proximity to a site
export const getEnumeratorsByProximity = (
  siteVisit: SiteVisit, 
  users: User[]
): {user: User, distance: number}[] => {
  return users
    .filter(user => 
      (user.role === 'dataCollector' || user.role === 'datacollector') &&
      user.location?.latitude && 
      user.location?.longitude
    )
    .map(user => ({
      user,
      distance: calculateDistance(
        user.location!.latitude!,
        user.location!.longitude!,
        siteVisit.coordinates.latitude,
        siteVisit.coordinates.longitude
      )
    }))
    .sort((a, b) => a.distance - b.distance);
};
