import { supabase } from '@/integrations/supabase/client';
import { SiteRegistry } from '@/types/hub-operations';

export interface SiteMatchResult {
  siteEntryId: string;
  siteName: string;
  siteCode?: string;
  state: string;
  locality: string;
  matchedRegistry: SiteRegistry | null;
  matchType: 'exact_code' | 'name_location' | 'partial' | 'not_found';
  matchConfidence: 'high' | 'medium' | 'low' | 'none';
  gpsCoordinates?: {
    latitude: number;
    longitude: number;
  };
}

export interface RegistryValidationResult {
  matches: SiteMatchResult[];
  registeredCount: number;
  unregisteredCount: number;
  warnings: string[];
}

const normalizeString = (str: string): string => {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
};

export async function fetchAllRegistrySites(): Promise<SiteRegistry[]> {
  try {
    const { data, error } = await supabase
      .from('sites_registry')
      .select('*')
      .order('site_name');
    
    if (error) {
      console.error('Error fetching sites registry:', error);
      return [];
    }
    
    return data || [];
  } catch (err) {
    console.error('Unexpected error fetching sites registry:', err);
    return [];
  }
}

export function matchSiteToRegistry(
  siteEntry: {
    id?: string;
    siteCode?: string;
    siteName?: string;
    site_name?: string;
    state?: string;
    locality?: string;
  },
  registrySites: SiteRegistry[]
): SiteMatchResult {
  const siteName = siteEntry.siteName || siteEntry.site_name || '';
  const siteCode = siteEntry.siteCode || '';
  const state = siteEntry.state || '';
  const locality = siteEntry.locality || '';
  
  const result: SiteMatchResult = {
    siteEntryId: siteEntry.id || '',
    siteName,
    siteCode,
    state,
    locality,
    matchedRegistry: null,
    matchType: 'not_found',
    matchConfidence: 'none',
  };

  if (registrySites.length === 0) {
    return result;
  }

  if (siteCode && siteCode.trim() !== '') {
    const exactMatch = registrySites.find(
      reg => normalizeString(reg.site_code) === normalizeString(siteCode)
    );
    
    if (exactMatch) {
      result.matchedRegistry = exactMatch;
      result.matchType = 'exact_code';
      result.matchConfidence = 'high';
      
      if (exactMatch.gps_latitude && exactMatch.gps_longitude) {
        result.gpsCoordinates = {
          latitude: exactMatch.gps_latitude,
          longitude: exactMatch.gps_longitude,
        };
      }
      return result;
    }
  }

  if (siteName && state && locality) {
    const nameLocationMatch = registrySites.find(reg => {
      const nameMatch = normalizeString(reg.site_name) === normalizeString(siteName);
      const stateMatch = normalizeString(reg.state_name) === normalizeString(state);
      const localityMatch = normalizeString(reg.locality_name) === normalizeString(locality);
      return nameMatch && stateMatch && localityMatch;
    });
    
    if (nameLocationMatch) {
      result.matchedRegistry = nameLocationMatch;
      result.matchType = 'name_location';
      result.matchConfidence = 'high';
      
      if (nameLocationMatch.gps_latitude && nameLocationMatch.gps_longitude) {
        result.gpsCoordinates = {
          latitude: nameLocationMatch.gps_latitude,
          longitude: nameLocationMatch.gps_longitude,
        };
      }
      return result;
    }
  }

  if (siteName && state) {
    const partialMatch = registrySites.find(reg => {
      const nameMatch = normalizeString(reg.site_name) === normalizeString(siteName);
      const stateMatch = normalizeString(reg.state_name) === normalizeString(state);
      return nameMatch && stateMatch;
    });
    
    if (partialMatch) {
      result.matchedRegistry = partialMatch;
      result.matchType = 'partial';
      result.matchConfidence = 'medium';
      
      if (partialMatch.gps_latitude && partialMatch.gps_longitude) {
        result.gpsCoordinates = {
          latitude: partialMatch.gps_latitude,
          longitude: partialMatch.gps_longitude,
        };
      }
      return result;
    }
  }

  if (siteName) {
    const nameOnlyMatch = registrySites.find(reg => 
      normalizeString(reg.site_name) === normalizeString(siteName)
    );
    
    if (nameOnlyMatch) {
      result.matchedRegistry = nameOnlyMatch;
      result.matchType = 'partial';
      result.matchConfidence = 'low';
      
      if (nameOnlyMatch.gps_latitude && nameOnlyMatch.gps_longitude) {
        result.gpsCoordinates = {
          latitude: nameOnlyMatch.gps_latitude,
          longitude: nameOnlyMatch.gps_longitude,
        };
      }
      return result;
    }
  }

  return result;
}

export async function validateSitesAgainstRegistry(
  siteEntries: Array<{
    id?: string;
    siteCode?: string;
    siteName?: string;
    site_name?: string;
    state?: string;
    locality?: string;
  }>
): Promise<RegistryValidationResult> {
  const registrySites = await fetchAllRegistrySites();
  const matches: SiteMatchResult[] = [];
  const warnings: string[] = [];
  let registeredCount = 0;
  let unregisteredCount = 0;

  for (const entry of siteEntries) {
    const matchResult = matchSiteToRegistry(entry, registrySites);
    matches.push(matchResult);

    if (matchResult.matchedRegistry) {
      registeredCount++;
      
      if (matchResult.matchConfidence === 'low') {
        warnings.push(
          `Site "${matchResult.siteName}" matched with low confidence to registry site "${matchResult.matchedRegistry.site_name}" - verify location details`
        );
      }
    } else {
      unregisteredCount++;
      warnings.push(
        `Site "${matchResult.siteName}" (${matchResult.state}/${matchResult.locality}) is not in the Sites Registry - GPS coordinates will not be available`
      );
    }
  }

  return {
    matches,
    registeredCount,
    unregisteredCount,
    warnings,
  };
}

export async function lookupSiteGPSFromRegistry(
  siteCode?: string,
  siteName?: string,
  state?: string,
  locality?: string
): Promise<{ latitude: number; longitude: number } | null> {
  try {
    const registrySites = await fetchAllRegistrySites();
    
    const matchResult = matchSiteToRegistry(
      { siteCode, siteName, state, locality },
      registrySites
    );

    return matchResult.gpsCoordinates || null;
  } catch (err) {
    console.error('Error looking up site GPS from registry:', err);
    return null;
  }
}

export async function enrichSiteEntriesWithRegistry(
  siteEntries: Array<{
    id: string;
    siteCode?: string;
    siteName?: string;
    site_name?: string;
    state?: string;
    locality?: string;
    additional_data?: Record<string, any>;
  }>
): Promise<Array<{
  id: string;
  registry_site_id?: string;
  gps_latitude?: number;
  gps_longitude?: number;
  registry_match_type?: string;
  registry_match_confidence?: string;
}>> {
  const registrySites = await fetchAllRegistrySites();
  const enrichedData: Array<{
    id: string;
    registry_site_id?: string;
    gps_latitude?: number;
    gps_longitude?: number;
    registry_match_type?: string;
    registry_match_confidence?: string;
  }> = [];

  for (const entry of siteEntries) {
    const matchResult = matchSiteToRegistry(entry, registrySites);
    
    const enriched: typeof enrichedData[0] = {
      id: entry.id,
    };

    if (matchResult.matchedRegistry) {
      enriched.registry_site_id = matchResult.matchedRegistry.id;
      enriched.registry_match_type = matchResult.matchType;
      enriched.registry_match_confidence = matchResult.matchConfidence;
      
      if (matchResult.gpsCoordinates) {
        enriched.gps_latitude = matchResult.gpsCoordinates.latitude;
        enriched.gps_longitude = matchResult.gpsCoordinates.longitude;
      }
    }

    enrichedData.push(enriched);
  }

  return enrichedData;
}
