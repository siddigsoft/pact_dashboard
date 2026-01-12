import { supabase } from '@/integrations/supabase/client';
import { normalizeStateId, normalizeLocalityId } from '@/utils/siteNormalization';

export interface SiteRegistryEntry {
  id: string;
  site_code: string;
  site_name: string;
  state_id: string;
  state_name: string;
  locality_id: string;
  locality_name: string;
  hub_id?: string;
  hub_name?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  activity_type: string;
  status: string;
  mmp_count: number;
  created_at?: string;
  updated_at?: string;
}

export interface SiteMatchInput {
  siteId?: string;
  siteCode?: string;
  siteName: string;
  state: string;
  locality: string;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SiteMatchResult {
  matched: boolean;
  matchType: 'site_code' | 'name_state_locality' | 'name_state' | 'gps_proximity' | 'none';
  existingSite?: SiteRegistryEntry;
  confidence: number;
}

const GPS_PROXIMITY_THRESHOLD_KM = 0.5;

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, '')
    .replace(/[^\w]/g, '');
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class SiteRegistryService {
  private cache: Map<string, SiteRegistryEntry[]> = new Map();
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  async loadSitesForState(stateId: string): Promise<SiteRegistryEntry[]> {
    const normalizedStateId = normalizeStateId(stateId) || stateId;
    const cacheKey = normalizedStateId;
    
    if (this.cache.has(cacheKey) && Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cache.get(cacheKey) || [];
    }

    const { data, error } = await supabase
      .from('sites_registry')
      .select('*')
      .or(`state_id.eq.${normalizedStateId},state_id.ilike.%${normalizedStateId}%`);

    if (error) {
      console.error('[SiteRegistryService] Error loading sites:', error);
      return [];
    }

    const sites = (data || []) as SiteRegistryEntry[];
    this.cache.set(cacheKey, sites);
    this.cacheTimestamp = Date.now();
    return sites;
  }

  async loadAllSites(): Promise<SiteRegistryEntry[]> {
    const cacheKey = '__all__';
    
    if (this.cache.has(cacheKey) && Date.now() - this.cacheTimestamp < this.CACHE_TTL_MS) {
      return this.cache.get(cacheKey) || [];
    }

    const { data, error } = await supabase
      .from('sites_registry')
      .select('*');

    if (error) {
      console.error('[SiteRegistryService] Error loading all sites:', error);
      return [];
    }

    const sites = (data || []) as SiteRegistryEntry[];
    this.cache.set(cacheKey, sites);
    this.cacheTimestamp = Date.now();
    return sites;
  }

  async matchSite(input: SiteMatchInput): Promise<SiteMatchResult> {
    const normalizedStateId = normalizeStateId(input.state) || input.state;
    const normalizedLocalityId = normalizeLocalityId(input.locality, normalizedStateId) || input.locality;
    
    const sites = await this.loadAllSites();
    
    if (input.siteCode || input.siteId) {
      const codeToMatch = normalizeString(input.siteCode || input.siteId || '');
      const matchBySiteCode = sites.find(s => 
        normalizeString(s.site_code) === codeToMatch
      );
      if (matchBySiteCode) {
        return {
          matched: true,
          matchType: 'site_code',
          existingSite: matchBySiteCode,
          confidence: 100
        };
      }
    }

    const normalizedInputName = normalizeString(input.siteName);
    const normalizedInputState = normalizeString(normalizedStateId);
    const normalizedInputLocality = normalizeString(normalizedLocalityId);

    const matchByNameStateLocality = sites.find(s => {
      const siteNameMatch = normalizeString(s.site_name) === normalizedInputName;
      const stateMatch = normalizeString(s.state_id) === normalizedInputState || 
                         normalizeString(s.state_name) === normalizedInputState;
      const localityMatch = normalizeString(s.locality_id) === normalizedInputLocality || 
                            normalizeString(s.locality_name) === normalizedInputLocality;
      return siteNameMatch && stateMatch && localityMatch;
    });

    if (matchByNameStateLocality) {
      return {
        matched: true,
        matchType: 'name_state_locality',
        existingSite: matchByNameStateLocality,
        confidence: 95
      };
    }

    const matchByNameState = sites.find(s => {
      const siteNameMatch = normalizeString(s.site_name) === normalizedInputName;
      const stateMatch = normalizeString(s.state_id) === normalizedInputState || 
                         normalizeString(s.state_name) === normalizedInputState;
      return siteNameMatch && stateMatch;
    });

    if (matchByNameState) {
      return {
        matched: true,
        matchType: 'name_state',
        existingSite: matchByNameState,
        confidence: 80
      };
    }

    if (input.latitude != null && input.longitude != null) {
      const sitesWithGPS = sites.filter(s => s.gps_latitude != null && s.gps_longitude != null);
      
      for (const site of sitesWithGPS) {
        const distance = calculateDistance(
          input.latitude,
          input.longitude,
          site.gps_latitude!,
          site.gps_longitude!
        );
        
        if (distance <= GPS_PROXIMITY_THRESHOLD_KM) {
          const stateMatch = normalizeString(site.state_id) === normalizedInputState || 
                             normalizeString(site.state_name) === normalizedInputState;
          if (stateMatch) {
            return {
              matched: true,
              matchType: 'gps_proximity',
              existingSite: site,
              confidence: 70
            };
          }
        }
      }
    }

    return {
      matched: false,
      matchType: 'none',
      confidence: 0
    };
  }

  async matchSitesBatch(inputs: SiteMatchInput[]): Promise<Map<number, SiteMatchResult>> {
    await this.loadAllSites();
    
    const results = new Map<number, SiteMatchResult>();
    
    for (let i = 0; i < inputs.length; i++) {
      const result = await this.matchSite(inputs[i]);
      results.set(i, result);
    }
    
    return results;
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamp = 0;
  }
}

export const siteRegistryService = new SiteRegistryService();
