import { supabase } from '@/integrations/supabase/client';
import { SiteRegistry } from '@/types/hub-operations';

// ============================================================================
// ENHANCED DATA STRUCTURES FOR SITE MATCHING
// ============================================================================
//
// CONFIDENCE SCORING & AUTO-ACCEPT BEHAVIOR:
// -------------------------------------------
// The matching system uses discrete confidence scores:
//   - exact_code:     1.00 (100%) - Perfect site code match
//   - name_location:  0.85 (85%)  - Name + State + Locality match
//   - partial:        0.70 (70%)  - Name + partial location match  
//   - fuzzy:          0.50 (50%)  - Fuzzy name similarity match
//   - not_found:      0.00 (0%)   - No match found
//
// AUTO-ACCEPT THRESHOLD: 0.90 (90%)
// This means ONLY exact_code matches (100%) will auto-accept.
// All other matches require manual review:
//   - name_location (85%) -> requires_review = true
//   - partial (70%)       -> requires_review = true  
//   - fuzzy (50%)         -> requires_review = true
//
// This is intentional: only perfect site code matches should be trusted
// for automatic GPS coordinate enrichment without human verification.
// ============================================================================

export interface GPSCoordinates {
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
}

export interface MatchQuery {
  site_code: string;
  site_name: string;
  state: string;
  locality: string;
}

export interface MatchInfo {
  type: 'exact_code' | 'name_location' | 'partial' | 'fuzzy' | 'not_found';
  confidence: number; // 0-1 numeric score
  confidence_level: 'high' | 'medium' | 'low' | 'none';
  rule_applied: string;
  candidates_count: number;
  auto_accepted: boolean;
  requires_review: boolean;
}

export interface MatchAudit {
  matched_at: string;
  matched_by: string;
  source_workflow: 'mmp_upload' | 'dispatch' | 'manual' | 'system';
  override_reason?: string;
}

export interface UnmatchedInfo {
  reason: 'no_registry_entry' | 'multiple_matches' | 'low_confidence' | 'missing_data';
  details: string;
  pending_review: boolean;
  suggested_action?: string;
}

export interface RegistryLinkage {
  // Registry Reference
  registry_site_id: string | null;
  registry_site_code: string | null;
  
  // GPS Coordinates
  gps: GPSCoordinates | null;
  
  // Administrative Hierarchy
  state_id?: string;
  state_name?: string;
  locality_id?: string;
  locality_name?: string;
  
  // Query Inputs (what was used to match)
  query: MatchQuery;
  
  // Match Confidence
  match: MatchInfo;
  
  // Audit Trail
  audit: MatchAudit;
  
  // Unmatched Info (if applicable)
  unmatched: UnmatchedInfo | null;
  
  // Alternative candidates (for manual selection)
  alternative_candidates?: Array<{
    registry_site_id: string;
    site_code: string;
    site_name: string;
    confidence: number;
  }>;
}

export interface MatchCandidate {
  registry: SiteRegistry;
  matchType: 'exact_code' | 'name_location' | 'partial' | 'fuzzy';
  confidence: number;
  rule: string;
}

export interface SiteMatchResult {
  siteEntryId: string;
  siteName: string;
  siteCode?: string;
  state: string;
  locality: string;
  matchedRegistry: SiteRegistry | null;
  matchType: 'exact_code' | 'name_location' | 'partial' | 'fuzzy' | 'not_found';
  matchConfidence: number; // Now numeric 0-1
  matchConfidenceLevel: 'high' | 'medium' | 'low' | 'none';
  autoAccepted: boolean;
  requiresReview: boolean;
  gpsCoordinates?: GPSCoordinates;
  allCandidates: MatchCandidate[];
  registryLinkage: RegistryLinkage;
}

export interface RegistryValidationResult {
  matches: SiteMatchResult[];
  registeredCount: number;
  unregisteredCount: number;
  reviewRequiredCount: number;
  autoAcceptedCount: number;
  warnings: string[];
}

// ============================================================================
// CONFIDENCE THRESHOLDS
// ============================================================================

const CONFIDENCE_THRESHOLDS = {
  AUTO_ACCEPT: 0.90,      // >= 90% = auto-accept
  HIGH: 0.85,             // >= 85% = high confidence
  MEDIUM: 0.70,           // >= 70% = medium confidence
  LOW: 0.50,              // >= 50% = low confidence
};

const MATCH_TYPE_CONFIDENCE = {
  exact_code: 1.0,        // 100% - exact site code match
  name_location: 0.85,    // 85% - name + state + locality match
  partial_state: 0.70,    // 70% - name + state only
  fuzzy_name: 0.50,       // 50% - name only match
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const normalizeString = (str: string): string => {
  return (str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
};

const getConfidenceLevel = (confidence: number): 'high' | 'medium' | 'low' | 'none' => {
  if (confidence >= CONFIDENCE_THRESHOLDS.HIGH) return 'high';
  if (confidence >= CONFIDENCE_THRESHOLDS.MEDIUM) return 'medium';
  if (confidence >= CONFIDENCE_THRESHOLDS.LOW) return 'low';
  return 'none';
};

// ============================================================================
// REGISTRY FETCH
// ============================================================================

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

// ============================================================================
// ENHANCED SITE MATCHING WITH RANKED CANDIDATES
// ============================================================================

export function matchSiteToRegistry(
  siteEntry: {
    id?: string;
    siteCode?: string;
    siteName?: string;
    site_name?: string;
    state?: string;
    locality?: string;
  },
  registrySites: SiteRegistry[],
  options: {
    userId?: string;
    sourceWorkflow?: 'mmp_upload' | 'dispatch' | 'manual' | 'system';
  } = {}
): SiteMatchResult {
  const siteName = siteEntry.siteName || siteEntry.site_name || '';
  const siteCode = siteEntry.siteCode || '';
  const state = siteEntry.state || '';
  const locality = siteEntry.locality || '';
  const userId = options.userId || 'system';
  const sourceWorkflow = options.sourceWorkflow || 'system';
  
  // Collect all matching candidates with their confidence scores
  const candidates: MatchCandidate[] = [];
  
  if (registrySites.length > 0) {
    // 1. Exact site code match (100% confidence)
    if (siteCode && siteCode.trim() !== '') {
      const codeMatches = registrySites.filter(
        reg => normalizeString(reg.site_code) === normalizeString(siteCode)
      );
      codeMatches.forEach(reg => {
        candidates.push({
          registry: reg,
          matchType: 'exact_code',
          confidence: MATCH_TYPE_CONFIDENCE.exact_code,
          rule: 'exact_site_code_match',
        });
      });
    }
    
    // 2. Name + State + Locality match (85% confidence)
    if (siteName && state && locality) {
      const nameLocationMatches = registrySites.filter(reg => {
        const nameMatch = normalizeString(reg.site_name) === normalizeString(siteName);
        const stateMatch = normalizeString(reg.state_name) === normalizeString(state);
        const localityMatch = normalizeString(reg.locality_name) === normalizeString(locality);
        return nameMatch && stateMatch && localityMatch;
      });
      nameLocationMatches.forEach(reg => {
        // Don't add if already matched by code
        if (!candidates.some(c => c.registry.id === reg.id)) {
          candidates.push({
            registry: reg,
            matchType: 'name_location',
            confidence: MATCH_TYPE_CONFIDENCE.name_location,
            rule: 'name_state_locality_match',
          });
        }
      });
    }
    
    // 3. Name + State match only (70% confidence)
    if (siteName && state) {
      const partialMatches = registrySites.filter(reg => {
        const nameMatch = normalizeString(reg.site_name) === normalizeString(siteName);
        const stateMatch = normalizeString(reg.state_name) === normalizeString(state);
        return nameMatch && stateMatch;
      });
      partialMatches.forEach(reg => {
        // Don't add if already matched
        if (!candidates.some(c => c.registry.id === reg.id)) {
          candidates.push({
            registry: reg,
            matchType: 'partial',
            confidence: MATCH_TYPE_CONFIDENCE.partial_state,
            rule: 'name_state_only_match',
          });
        }
      });
    }
    
    // 4. Name only match (50% confidence)
    if (siteName) {
      const nameOnlyMatches = registrySites.filter(reg => 
        normalizeString(reg.site_name) === normalizeString(siteName)
      );
      nameOnlyMatches.forEach(reg => {
        // Don't add if already matched
        if (!candidates.some(c => c.registry.id === reg.id)) {
          candidates.push({
            registry: reg,
            matchType: 'fuzzy',
            confidence: MATCH_TYPE_CONFIDENCE.fuzzy_name,
            rule: 'name_only_match',
          });
        }
      });
    }
  }
  
  // Sort candidates by confidence (highest first)
  candidates.sort((a, b) => b.confidence - a.confidence);
  
  // Determine best match and auto-accept logic
  const bestCandidate = candidates.length > 0 ? candidates[0] : null;
  const autoAccepted = bestCandidate !== null && bestCandidate.confidence >= CONFIDENCE_THRESHOLDS.AUTO_ACCEPT;
  const requiresReview = bestCandidate !== null && !autoAccepted && bestCandidate.confidence > 0;
  
  // Build the query object
  const query: MatchQuery = {
    site_code: siteCode,
    site_name: siteName,
    state: state,
    locality: locality,
  };
  
  // Build GPS coordinates if available
  let gpsCoordinates: GPSCoordinates | undefined;
  if (bestCandidate?.registry.gps_latitude && bestCandidate?.registry.gps_longitude) {
    gpsCoordinates = {
      latitude: bestCandidate.registry.gps_latitude,
      longitude: bestCandidate.registry.gps_longitude,
    };
  }
  
  // Build match info
  const matchInfo: MatchInfo = {
    type: bestCandidate?.matchType || 'not_found',
    confidence: bestCandidate?.confidence || 0,
    confidence_level: getConfidenceLevel(bestCandidate?.confidence || 0),
    rule_applied: bestCandidate?.rule || 'no_match',
    candidates_count: candidates.length,
    auto_accepted: autoAccepted,
    requires_review: requiresReview,
  };
  
  // Build audit info
  const audit: MatchAudit = {
    matched_at: new Date().toISOString(),
    matched_by: userId,
    source_workflow: sourceWorkflow,
  };
  
  // Build unmatched info if no match found or requires review
  let unmatched: UnmatchedInfo | null = null;
  if (!bestCandidate) {
    unmatched = {
      reason: 'no_registry_entry',
      details: `Site "${siteName}" (${state}/${locality}) not found in Sites Registry`,
      pending_review: true,
      suggested_action: 'Register this site in Hub Operations > Sites Registry',
    };
  } else if (candidates.length > 1 && !autoAccepted) {
    unmatched = {
      reason: 'multiple_matches',
      details: `Found ${candidates.length} potential matches, manual selection required`,
      pending_review: true,
      suggested_action: 'Review and select the correct registry entry',
    };
  } else if (requiresReview) {
    unmatched = {
      reason: 'low_confidence',
      details: `Match confidence ${Math.round(bestCandidate.confidence * 100)}% is below auto-accept threshold (90%)`,
      pending_review: true,
      suggested_action: 'Verify the matched registry entry is correct',
    };
  }
  
  // Build alternative candidates for manual selection (top 5)
  const alternativeCandidates = candidates.slice(0, 5).map(c => ({
    registry_site_id: c.registry.id,
    site_code: c.registry.site_code,
    site_name: c.registry.site_name,
    confidence: c.confidence,
  }));
  
  // Build the full registry linkage object
  const registryLinkage: RegistryLinkage = {
    registry_site_id: autoAccepted && bestCandidate ? bestCandidate.registry.id : null,
    registry_site_code: autoAccepted && bestCandidate ? bestCandidate.registry.site_code : null,
    gps: autoAccepted && gpsCoordinates ? gpsCoordinates : null,
    state_id: bestCandidate?.registry.state_id,
    state_name: bestCandidate?.registry.state_name,
    locality_id: bestCandidate?.registry.locality_id,
    locality_name: bestCandidate?.registry.locality_name,
    query,
    match: matchInfo,
    audit,
    unmatched,
    alternative_candidates: alternativeCandidates.length > 1 ? alternativeCandidates : undefined,
  };
  
  return {
    siteEntryId: siteEntry.id || '',
    siteName,
    siteCode,
    state,
    locality,
    matchedRegistry: autoAccepted && bestCandidate ? bestCandidate.registry : null,
    matchType: bestCandidate?.matchType || 'not_found',
    matchConfidence: bestCandidate?.confidence || 0,
    matchConfidenceLevel: getConfidenceLevel(bestCandidate?.confidence || 0),
    autoAccepted,
    requiresReview,
    gpsCoordinates: autoAccepted ? gpsCoordinates : undefined,
    allCandidates: candidates,
    registryLinkage,
  };
}

// ============================================================================
// BATCH VALIDATION
// ============================================================================

export async function validateSitesAgainstRegistry(
  siteEntries: Array<{
    id?: string;
    siteCode?: string;
    siteName?: string;
    site_name?: string;
    state?: string;
    locality?: string;
  }>,
  options: {
    userId?: string;
    sourceWorkflow?: 'mmp_upload' | 'dispatch' | 'manual' | 'system';
  } = {}
): Promise<RegistryValidationResult> {
  const registrySites = await fetchAllRegistrySites();
  const matches: SiteMatchResult[] = [];
  const warnings: string[] = [];
  let registeredCount = 0;
  let unregisteredCount = 0;
  let reviewRequiredCount = 0;
  let autoAcceptedCount = 0;

  for (const entry of siteEntries) {
    const matchResult = matchSiteToRegistry(entry, registrySites, options);
    matches.push(matchResult);

    if (matchResult.autoAccepted && matchResult.matchedRegistry) {
      registeredCount++;
      autoAcceptedCount++;
    } else if (matchResult.requiresReview) {
      reviewRequiredCount++;
      warnings.push(
        `Site "${matchResult.siteName}" requires manual review - ${matchResult.allCandidates.length} candidate(s) found with ${Math.round(matchResult.matchConfidence * 100)}% confidence`
      );
    } else {
      unregisteredCount++;
      warnings.push(
        `Site "${matchResult.siteName}" (${matchResult.state}/${matchResult.locality}) is not in the Sites Registry - flagged for review`
      );
    }
  }

  return {
    matches,
    registeredCount,
    unregisteredCount,
    reviewRequiredCount,
    autoAcceptedCount,
    warnings,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export async function lookupSiteGPSFromRegistry(
  siteCode?: string,
  siteName?: string,
  state?: string,
  locality?: string
): Promise<GPSCoordinates | null> {
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
  }>,
  options: {
    userId?: string;
    sourceWorkflow?: 'mmp_upload' | 'dispatch' | 'manual' | 'system';
  } = {}
): Promise<Array<{
  id: string;
  registryLinkage: RegistryLinkage;
}>> {
  const registrySites = await fetchAllRegistrySites();
  const enrichedData: Array<{
    id: string;
    registryLinkage: RegistryLinkage;
  }> = [];

  for (const entry of siteEntries) {
    const matchResult = matchSiteToRegistry(entry, registrySites, options);
    
    enrichedData.push({
      id: entry.id,
      registryLinkage: matchResult.registryLinkage,
    });
  }

  return enrichedData;
}

// ============================================================================
// BUILD REGISTRY LINKAGE FOR STORAGE
// ============================================================================

export function buildRegistryLinkageForStorage(
  matchResult: SiteMatchResult,
  existingLinkage?: RegistryLinkage | null
): RegistryLinkage | null {
  // If no match and no existing linkage, return the new unmatched linkage
  if (!matchResult.matchedRegistry && !existingLinkage) {
    return matchResult.registryLinkage;
  }
  
  // If we have a new auto-accepted match, use it
  if (matchResult.autoAccepted && matchResult.matchedRegistry) {
    return matchResult.registryLinkage;
  }
  
  // If we have a match that requires review but no existing linkage, store it for review
  if (matchResult.requiresReview && !existingLinkage) {
    return matchResult.registryLinkage;
  }
  
  // If existing linkage exists and new match doesn't auto-accept, preserve existing
  if (existingLinkage && existingLinkage.registry_site_id && !matchResult.autoAccepted) {
    return existingLinkage;
  }
  
  // Default: return the new linkage
  return matchResult.registryLinkage;
}

// ============================================================================
// GPS SAVE TO REGISTRY
// ============================================================================

export interface GPSSaveResult {
  success: boolean;
  registrySiteId?: string;
  error?: string;
  previousGps?: GPSCoordinates | null;
}

/**
 * Saves GPS coordinates to the Sites Registry after a site visit is completed.
 * This enriches the master site record with GPS data from field visits.
 * 
 * @param registrySiteId - The ID of the site in sites_registry (from mmp_site_entries.registry_site_id)
 * @param coordinates - GPS coordinates captured during the site visit
 * @param options - Additional options for the save operation
 * @returns Result of the GPS save operation
 */
export async function saveGPSToRegistry(
  registrySiteId: string,
  coordinates: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  },
  options: {
    userId?: string;
    sourceType?: 'site_visit' | 'manual_entry' | 'device_capture';
    overwriteExisting?: boolean;
  } = {}
): Promise<GPSSaveResult> {
  const { userId = 'system', sourceType = 'site_visit', overwriteExisting = false } = options;

  if (!registrySiteId) {
    return {
      success: false,
      error: 'No registry site ID provided',
    };
  }

  if (!coordinates || typeof coordinates.latitude !== 'number' || typeof coordinates.longitude !== 'number') {
    return {
      success: false,
      error: 'Invalid GPS coordinates provided',
    };
  }

  try {
    // First, check if the site exists and get current GPS data
    const { data: existingSite, error: fetchError } = await supabase
      .from('sites_registry')
      .select('id, site_code, site_name, gps_latitude, gps_longitude')
      .eq('id', registrySiteId)
      .single();

    if (fetchError || !existingSite) {
      console.error('Error fetching site from registry:', fetchError);
      return {
        success: false,
        registrySiteId,
        error: `Site not found in registry: ${fetchError?.message || 'Unknown error'}`,
      };
    }

    // Check if GPS already exists and we shouldn't overwrite
    const hasExistingGps = existingSite.gps_latitude !== null && existingSite.gps_longitude !== null;
    if (hasExistingGps && !overwriteExisting) {
      console.log(`GPS already exists for site ${registrySiteId}, skipping update (overwriteExisting=false)`);
      return {
        success: true,
        registrySiteId,
        previousGps: {
          latitude: existingSite.gps_latitude,
          longitude: existingSite.gps_longitude,
        },
      };
    }

    // Store previous GPS for audit
    const previousGps: GPSCoordinates | null = hasExistingGps 
      ? { latitude: existingSite.gps_latitude, longitude: existingSite.gps_longitude }
      : null;

    // Update the registry site with GPS coordinates
    const { error: updateError } = await supabase
      .from('sites_registry')
      .update({
        gps_latitude: coordinates.latitude,
        gps_longitude: coordinates.longitude,
        updated_at: new Date().toISOString(),
      })
      .eq('id', registrySiteId);

    if (updateError) {
      console.error('Error saving GPS to registry:', updateError);
      return {
        success: false,
        registrySiteId,
        error: `Failed to save GPS: ${updateError.message}`,
        previousGps,
      };
    }

    console.log(`GPS saved to registry for site ${registrySiteId}: (${coordinates.latitude}, ${coordinates.longitude})`);

    return {
      success: true,
      registrySiteId,
      previousGps,
    };
  } catch (error) {
    console.error('Unexpected error saving GPS to registry:', error);
    return {
      success: false,
      registrySiteId,
      error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Saves GPS coordinates to the Sites Registry using the mmp_site_entry ID.
 * This is a convenience function that looks up the registry_site_id from mmp_site_entries.
 * 
 * @param mmpSiteEntryId - The ID of the site entry in mmp_site_entries
 * @param coordinates - GPS coordinates captured during the site visit
 * @param options - Additional options for the save operation
 * @returns Result of the GPS save operation
 */
export async function saveGPSToRegistryFromSiteEntry(
  mmpSiteEntryId: string,
  coordinates: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  },
  options: {
    userId?: string;
    sourceType?: 'site_visit' | 'manual_entry' | 'device_capture';
    overwriteExisting?: boolean;
  } = {}
): Promise<GPSSaveResult> {
  if (!mmpSiteEntryId) {
    return {
      success: false,
      error: 'No MMP site entry ID provided',
    };
  }

  try {
    // Look up the registry_site_id from mmp_site_entries
    const { data: siteEntry, error: fetchError } = await supabase
      .from('mmp_site_entries')
      .select('registry_site_id')
      .eq('id', mmpSiteEntryId)
      .single();

    if (fetchError || !siteEntry) {
      console.error('Error fetching site entry:', fetchError);
      return {
        success: false,
        error: `Site entry not found: ${fetchError?.message || 'Unknown error'}`,
      };
    }

    const registrySiteId = siteEntry.registry_site_id;
    if (!registrySiteId) {
      console.warn(`Site entry ${mmpSiteEntryId} has no linked registry site, cannot save GPS`);
      return {
        success: false,
        error: 'Site entry is not linked to Sites Registry',
      };
    }

    // Delegate to the main GPS save function
    return await saveGPSToRegistry(registrySiteId, coordinates, options);
  } catch (error) {
    console.error('Unexpected error in saveGPSToRegistryFromSiteEntry:', error);
    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
