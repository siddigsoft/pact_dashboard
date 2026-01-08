import { supabase } from '@/integrations/supabase/client';
import { sudanStates, SudanState } from '@/data/sudanStates';
import { calculateDistance } from '@/utils/collectorUtils';
import { getProximityConfig } from '@/utils/geoDistance';

export interface CollectorProfile {
  id: string;
  full_name: string | null;
  username: string | null;
  email: string | null;
  state_id: string | null;
  locality_id: string | null;
  hub_id: string | null;
  role: string | null;
  location?: {
    latitude?: number;
    longitude?: number;
    isSharing?: boolean;
    lastUpdated?: string;
  } | null;
  classification?: {
    level: string;
    roleScope: string;
  } | null;
  availability?: string;
}

export interface RecommendedCollector extends CollectorProfile {
  tier: 'in-locality' | 'neighboring' | 'state-wide';
  tierLabel: string;
  distanceKm: number | null;
  localityName: string | null;
  stateName: string | null;
  workloadCount: number;
  isOnline: boolean;
  matchReason: string;
  priority: number;
}

export interface LocalityCoverage {
  localityId: string;
  localityName: string;
  stateId: string;
  stateName: string;
  collectorCount: number;
  hasGap: boolean;
  nearestCollectorDistance: number | null;
  nearestCollectorLocality: string | null;
  recommendedAction: string;
}

export interface CoverageGapAlert {
  type: 'no-collectors' | 'low-coverage' | 'no-nearby';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  localityId: string;
  localityName: string;
  stateName: string;
  suggestedAction: string;
}

export interface CollectorRecommendationResult {
  inLocality: RecommendedCollector[];
  neighboring: RecommendedCollector[];
  stateWide: RecommendedCollector[];
  allRecommendations: RecommendedCollector[];
  coverageGaps: CoverageGapAlert[];
  hasCollectorsInLocality: boolean;
  hasCollectorsInState: boolean;
  totalAvailable: number;
}

const NEIGHBORING_RADIUS_KM = 100;
const LOW_COVERAGE_THRESHOLD = 2;

function getStateName(stateId: string): string | null {
  const state = sudanStates.find(s => s.id === stateId);
  return state?.name || null;
}

function getLocalityName(localityId: string): string | null {
  for (const state of sudanStates) {
    const locality = state.localities.find(l => l.id === localityId);
    if (locality) return locality.name;
  }
  return null;
}

function getStateIdFromLocalityId(localityId: string): string | null {
  for (const state of sudanStates) {
    if (state.localities.some(l => l.id === localityId)) {
      return state.id;
    }
  }
  return null;
}

function getLocalitiesInState(stateId: string): { id: string; name: string }[] {
  const state = sudanStates.find(s => s.id === stateId);
  return state?.localities || [];
}

function normalizeString(str: string | null | undefined): string {
  return (str || '').toLowerCase().trim();
}

function findLocalityByName(localityName: string, stateName?: string): { id: string; name: string; stateId: string; stateName: string } | null {
  const normalizedLocality = normalizeString(localityName);
  const normalizedState = stateName ? normalizeString(stateName) : null;
  
  for (const state of sudanStates) {
    if (normalizedState && !normalizeString(state.name).includes(normalizedState) && !normalizedState.includes(normalizeString(state.name))) {
      continue;
    }
    
    for (const locality of state.localities) {
      if (normalizeString(locality.name) === normalizedLocality || 
          normalizeString(locality.name).includes(normalizedLocality) ||
          normalizedLocality.includes(normalizeString(locality.name))) {
        return {
          id: locality.id,
          name: locality.name,
          stateId: state.id,
          stateName: state.name
        };
      }
    }
  }
  return null;
}

function findStateByName(stateName: string): SudanState | null {
  const normalized = normalizeString(stateName);
  return sudanStates.find(s => 
    normalizeString(s.name) === normalized ||
    normalizeString(s.name).includes(normalized) ||
    normalized.includes(normalizeString(s.name))
  ) || null;
}

export class CollectorRecommendationService {
  
  static async getRecommendationsForSite(
    siteState: string,
    siteLocality: string,
    siteCoordinates?: { latitude: number; longitude: number } | null
  ): Promise<CollectorRecommendationResult> {
    const result: CollectorRecommendationResult = {
      inLocality: [],
      neighboring: [],
      stateWide: [],
      allRecommendations: [],
      coverageGaps: [],
      hasCollectorsInLocality: false,
      hasCollectorsInState: false,
      totalAvailable: 0
    };
    
    try {
      const stateInfo = findStateByName(siteState);
      const localityInfo = findLocalityByName(siteLocality, siteState);
      
      if (!stateInfo) {
        result.coverageGaps.push({
          type: 'no-collectors',
          severity: 'critical',
          message: `Unknown state: ${siteState}`,
          localityId: '',
          localityName: siteLocality,
          stateName: siteState,
          suggestedAction: 'Verify the state name in the site data'
        });
        return result;
      }
      
      const { data: collectors, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, email, state_id, locality_id, hub_id, role, location, classification, availability')
        .in('role', ['dataCollector', 'datacollector', 'coordinator']);
      
      if (error || !collectors) {
        console.error('Failed to fetch collectors:', error);
        return result;
      }
      
      const { data: workloadData } = await supabase
        .from('mmp_site_entries')
        .select('additional_data, status')
        .in('status', ['Dispatched', 'Assigned', 'In Progress', 'dispatched', 'assigned', 'in_progress']);
      
      const workloadCounts: Record<string, number> = {};
      (workloadData || []).forEach((entry: any) => {
        const assignedTo = entry.additional_data?.assigned_to;
        if (assignedTo) {
          workloadCounts[assignedTo] = (workloadCounts[assignedTo] || 0) + 1;
        }
      });
      
      const stateCollectors = collectors.filter(c => c.state_id === stateInfo.id);
      result.hasCollectorsInState = stateCollectors.length > 0;
      
      const localityCollectors = localityInfo 
        ? stateCollectors.filter(c => c.locality_id === localityInfo.id)
        : [];
      result.hasCollectorsInLocality = localityCollectors.length > 0;
      
      const enhanceCollector = (
        collector: any, 
        tier: 'in-locality' | 'neighboring' | 'state-wide',
        matchReason: string
      ): RecommendedCollector => {
        let distanceKm: number | null = null;
        
        if (siteCoordinates && collector.location?.latitude && collector.location?.longitude) {
          distanceKm = calculateDistance(
            siteCoordinates.latitude,
            siteCoordinates.longitude,
            collector.location.latitude,
            collector.location.longitude
          );
        }
        
        const isOnline = collector.availability === 'online';
        const workload = workloadCounts[collector.id] || 0;
        
        let priority = 0;
        if (tier === 'in-locality') priority = 100;
        else if (tier === 'neighboring') priority = 50;
        else priority = 10;
        
        if (isOnline) priority += 20;
        priority -= Math.min(workload * 2, 15);
        if (distanceKm !== null) priority -= Math.min(distanceKm / 10, 10);
        
        return {
          ...collector,
          tier,
          tierLabel: tier === 'in-locality' ? 'Same Locality' : tier === 'neighboring' ? 'Nearby Locality' : 'Same State',
          distanceKm,
          localityName: getLocalityName(collector.locality_id) || null,
          stateName: getStateName(collector.state_id) || null,
          workloadCount: workload,
          isOnline,
          matchReason,
          priority
        };
      };
      
      result.inLocality = localityCollectors.map(c => 
        enhanceCollector(c, 'in-locality', `Assigned to ${localityInfo?.name || siteLocality}`)
      );
      
      const neighboringCollectors: RecommendedCollector[] = [];
      const otherLocalityCollectors = stateCollectors.filter(c => 
        !localityCollectors.some(lc => lc.id === c.id)
      );
      
      for (const collector of otherLocalityCollectors) {
        let distanceKm: number | null = null;
        let isNeighboring = false;
        
        if (siteCoordinates && collector.location?.latitude && collector.location?.longitude) {
          distanceKm = calculateDistance(
            siteCoordinates.latitude,
            siteCoordinates.longitude,
            collector.location.latitude,
            collector.location.longitude
          );
          isNeighboring = distanceKm <= NEIGHBORING_RADIUS_KM;
        }
        
        if (isNeighboring) {
          const collectorLocalityName = getLocalityName(collector.locality_id);
          neighboringCollectors.push(
            enhanceCollector(
              collector, 
              'neighboring', 
              `${collectorLocalityName || 'Nearby'} - ${distanceKm?.toFixed(1)} km away`
            )
          );
        }
      }
      result.neighboring = neighboringCollectors;
      
      const remainingCollectors = otherLocalityCollectors.filter(c =>
        !neighboringCollectors.some(nc => nc.id === c.id)
      );
      
      const proximityConfig = getProximityConfig();
      result.stateWide = remainingCollectors
        .map(c => {
          let distanceKm: number | null = null;
          if (siteCoordinates && c.location?.latitude && c.location?.longitude) {
            distanceKm = calculateDistance(
              siteCoordinates.latitude,
              siteCoordinates.longitude,
              c.location.latitude,
              c.location.longitude
            );
          }
          
          const collectorLocalityName = getLocalityName(c.locality_id);
          return enhanceCollector(
            c, 
            'state-wide', 
            `${collectorLocalityName || 'Unknown locality'} in ${stateInfo.name}`
          );
        })
        .filter(c => {
          if (c.distanceKm === null) return true;
          return c.distanceKm <= proximityConfig.radiusKm;
        });
      
      result.allRecommendations = [
        ...result.inLocality,
        ...result.neighboring,
        ...result.stateWide
      ].sort((a, b) => b.priority - a.priority);
      
      result.totalAvailable = result.allRecommendations.length;
      
      if (!result.hasCollectorsInLocality) {
        const severity = result.hasCollectorsInState ? 'warning' : 'critical';
        result.coverageGaps.push({
          type: 'no-collectors',
          severity,
          message: `No data collectors assigned to ${localityInfo?.name || siteLocality}`,
          localityId: localityInfo?.id || '',
          localityName: localityInfo?.name || siteLocality,
          stateName: stateInfo.name,
          suggestedAction: result.neighboring.length > 0 
            ? `Consider dispatching to nearby collectors (${result.neighboring.length} available within ${NEIGHBORING_RADIUS_KM}km)`
            : result.stateWide.length > 0
              ? `Dispatch to state-wide collectors (${result.stateWide.length} available in ${stateInfo.name})`
              : 'Assign data collectors to this locality'
        });
      } else if (localityCollectors.length <= LOW_COVERAGE_THRESHOLD) {
        result.coverageGaps.push({
          type: 'low-coverage',
          severity: 'info',
          message: `Low coverage in ${localityInfo?.name || siteLocality}: only ${localityCollectors.length} collector(s)`,
          localityId: localityInfo?.id || '',
          localityName: localityInfo?.name || siteLocality,
          stateName: stateInfo.name,
          suggestedAction: `Consider adding more data collectors to this locality`
        });
      }
      
      if (!result.hasCollectorsInState) {
        result.coverageGaps.push({
          type: 'no-nearby',
          severity: 'critical',
          message: `No data collectors available in ${stateInfo.name}`,
          localityId: localityInfo?.id || '',
          localityName: localityInfo?.name || siteLocality,
          stateName: stateInfo.name,
          suggestedAction: 'Assign data collectors to this state before dispatching'
        });
      }
      
    } catch (error) {
      console.error('Error getting collector recommendations:', error);
    }
    
    return result;
  }
  
  static async getLocalityCoverage(stateId: string): Promise<LocalityCoverage[]> {
    const state = sudanStates.find(s => s.id === stateId);
    if (!state) return [];
    
    const { data: collectors } = await supabase
      .from('profiles')
      .select('id, locality_id')
      .eq('state_id', stateId)
      .in('role', ['dataCollector', 'datacollector', 'coordinator']);
    
    const localityCounts: Record<string, number> = {};
    (collectors || []).forEach(c => {
      if (c.locality_id) {
        localityCounts[c.locality_id] = (localityCounts[c.locality_id] || 0) + 1;
      }
    });
    
    return state.localities.map(locality => ({
      localityId: locality.id,
      localityName: locality.name,
      stateId: state.id,
      stateName: state.name,
      collectorCount: localityCounts[locality.id] || 0,
      hasGap: (localityCounts[locality.id] || 0) === 0,
      nearestCollectorDistance: null,
      nearestCollectorLocality: null,
      recommendedAction: localityCounts[locality.id] === 0 
        ? 'Assign data collectors to this locality'
        : localityCounts[locality.id] <= LOW_COVERAGE_THRESHOLD
          ? 'Consider adding more collectors'
          : 'Coverage adequate'
    }));
  }
  
  static async getAllCoverageGaps(): Promise<CoverageGapAlert[]> {
    const gaps: CoverageGapAlert[] = [];
    
    for (const state of sudanStates) {
      const coverage = await this.getLocalityCoverage(state.id);
      
      for (const locality of coverage) {
        if (locality.hasGap) {
          gaps.push({
            type: 'no-collectors',
            severity: 'warning',
            message: `No data collectors in ${locality.localityName}`,
            localityId: locality.localityId,
            localityName: locality.localityName,
            stateName: locality.stateName,
            suggestedAction: locality.recommendedAction
          });
        }
      }
    }
    
    return gaps;
  }
}
