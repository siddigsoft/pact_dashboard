import { supabase } from '@/integrations/supabase/client';
import { MMPFile, MMPSiteEntry } from '@/types';
import { toast } from 'sonner';
import { validateCSV, CSVValidationError } from '@/utils/csvValidator';
import { validateSitesAgainstRegistry, SiteMatchResult, RegistryLinkage } from '@/utils/sitesRegistryMatcher';

// Transform database record (snake_case) to MMPFile interface (camelCase)
const transformDBToMMPFile = (dbRecord: any): MMPFile => {
  // Transform site entries from the joined table
  let siteEntries: MMPSiteEntry[] = [];
  if (dbRecord.mmp_site_entries) {
    siteEntries = dbRecord.mmp_site_entries.map((entry: any) => ({
      id: entry.id,
      siteCode: entry.site_code,
      hubOffice: entry.hub_office,
      state: entry.state,
      locality: entry.locality,
      siteName: entry.site_name,
      cpName: entry.cp_name,
      visitType: entry.visit_type,
      visitDate: entry.visit_date,
      mainActivity: entry.main_activity,
      siteActivity: entry.activity_at_site,
      monitoringBy: entry.monitoring_by,
      surveyTool: entry.survey_tool,
      useMarketDiversion: entry.use_market_diversion,
      useWarehouseMonitoring: entry.use_warehouse_monitoring,
      comments: entry.comments,
      additionalData: entry.additional_data || {},
      status: entry.status
    }));
  } else if (dbRecord.site_entries) {
    // Fallback for old format
    siteEntries = dbRecord.site_entries;
  }

  return {
    id: dbRecord.id,
    name: dbRecord.name,
    hub: dbRecord.hub,
    month: dbRecord.month,
    uploadedBy: dbRecord.uploaded_by || 'Unknown',
    uploadedAt: dbRecord.uploaded_at,
    status: dbRecord.status,
    entries: dbRecord.entries,
    processedEntries: dbRecord.processed_entries,
    mmpId: dbRecord.mmp_id,
    rejectionReason: dbRecord.rejection_reason,
    approvedBy: dbRecord.approved_by,
    approvedAt: dbRecord.approved_at,
    archivedAt: dbRecord.archived_at,
    archivedBy: dbRecord.archived_by,
    deletedAt: dbRecord.deleted_at,
    deletedBy: dbRecord.deleted_by,
    expiryDate: dbRecord.expiry_date,
    region: dbRecord.region,
    year: dbRecord.year,
    version: dbRecord.version,
    modificationHistory: dbRecord.modification_history,
    modifiedAt: dbRecord.modified_at,
    description: dbRecord.description,
    type: dbRecord.type,
    filePath: dbRecord.file_path,
    originalFilename: dbRecord.original_filename,
    fileUrl: dbRecord.file_url,
    projectId: dbRecord.project_id,
    projectName: dbRecord.project?.name || dbRecord.project_name,
    siteEntries: siteEntries,
    workflow: dbRecord.workflow,
    approvalWorkflow: dbRecord.approval_workflow,
    location: dbRecord.location,
    team: dbRecord.team,
    permits: dbRecord.permits,
    siteVisit: dbRecord.site_visit,
    financial: dbRecord.financial,
    performance: dbRecord.performance,
    cpVerification: dbRecord.cp_verification,
    activities: dbRecord.activities,
  };
};

// Notify FOMs/Supervisors that a new MMP has been uploaded
async function notifyStakeholdersOnUpload(mmp: { id: string; name: string; hub?: string }) {
  try {
    const { data: recipients } = await supabase
      .from('profiles')
      .select('id, role, hub_id')
      .in('role', ['fom', 'supervisor']);

    const userIds = (recipients || [])
      .filter(r => !mmp.hub || r.hub_id === mmp.hub)
      .map(r => r.id);

    if (userIds.length === 0) return;

    const rows = userIds.map(uid => ({
      user_id: uid,
      title: 'New MMP uploaded',
      message: `${mmp.name} has been uploaded and is ready for verification`,
      type: 'info',
      link: `/mmp/${mmp.id}`,
      related_entity_id: mmp.id,
      related_entity_type: 'mmpFile'
    }));
    await supabase.from('notifications').insert(rows);
  } catch {}
}

// Update workflow to awaitingPermits after initial upload and sharing
async function setWorkflowStageAwaitingPermits(mmpId: string) {
  try {
    const { data: row } = await supabase
      .from('mmp_files')
      .select('workflow')
      .eq('id', mmpId)
      .single();
    const now = new Date().toISOString();
    const wf = row?.workflow || {};
    const next = { ...wf, currentStage: 'awaitingPermits', lastUpdated: now };
    await supabase.from('mmp_files').update({ workflow: next }).eq('id', mmpId);
  } catch {}
}

/**
 * Site entry for registry processing
 */
interface SiteForRegistry {
  siteCode?: string;
  siteName?: string;
  state?: string;
  locality?: string;
  hubOffice?: string;
  mainActivity?: string;
}

/**
 * Result of registry site lookup/creation
 */
interface RegistrySiteResult {
  registrySiteId: string;
  siteCode: string;
  isNew: boolean;
  mmpCount: number;
}

/**
 * Normalize string for comparison
 */
const normalizeForMatch = (str: string): string => {
  return (str || '').toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
};

/**
 * Generate a unique site code if not provided
 */
const generateSiteCode = (siteName: string, state: string, locality: string): string => {
  const prefix = (state || 'XX').substring(0, 2).toUpperCase();
  const localPrefix = (locality || 'XX').substring(0, 2).toUpperCase();
  const namePrefix = (siteName || 'SITE').substring(0, 3).toUpperCase();
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}-${localPrefix}-${namePrefix}-${timestamp}`;
};

/**
 * Ensures all sites exist in the sites_registry table.
 * Creates new entries for sites that don't exist.
 * Returns a map of site identifiers to their registry IDs.
 */
async function ensureSitesInRegistry(
  sites: SiteForRegistry[],
  userId: string
): Promise<{
  siteRegistryMap: Map<string, RegistrySiteResult>;
  newSitesCount: number;
  existingSitesCount: number;
  errors: string[];
}> {
  const siteRegistryMap = new Map<string, RegistrySiteResult>();
  const errors: string[] = [];
  let newSitesCount = 0;
  let existingSitesCount = 0;

  if (sites.length === 0) {
    return { siteRegistryMap, newSitesCount, existingSitesCount, errors };
  }

  try {
    // Fetch all existing registry sites for matching
    console.log('[Sites Registry] Fetching existing sites from registry...');
    const { data: existingRegistrySites, error: fetchError } = await supabase
      .from('sites_registry')
      .select('id, site_code, site_name, state_name, locality_name, mmp_count');

    if (fetchError) {
      console.error('[Sites Registry] ERROR fetching sites registry:', fetchError);
      errors.push('Failed to fetch sites registry: ' + fetchError.message);
      return { siteRegistryMap, newSitesCount, existingSitesCount, errors };
    }

    const registrySites = existingRegistrySites || [];
    console.log(`[Sites Registry] Found ${registrySites.length} existing sites in registry`);
    const sitesToCreate: Array<{
      siteKey: string;
      site: SiteForRegistry;
      generatedCode: string;
    }> = [];

    // Process each site - check if exists or needs to be created
    // Track duplicate entries within this upload to count them correctly
    const duplicateCountsInUpload = new Map<string, number>();
    
    for (const site of sites) {
      const siteCode = site.siteCode?.trim() || '';
      const siteName = site.siteName?.trim() || '';
      const state = site.state?.trim() || '';
      const locality = site.locality?.trim() || '';

      // Create a unique key for this site entry (for mapping back)
      const siteKey = `${siteCode}|${siteName}|${state}|${locality}`;

      // Track how many times each site appears in this upload
      const currentCount = duplicateCountsInUpload.get(siteKey) || 0;
      duplicateCountsInUpload.set(siteKey, currentCount + 1);

      // If we already processed this exact site in this upload, skip re-processing
      // but the registry_site_id will still be available in the map
      if (siteRegistryMap.has(siteKey)) {
        continue;
      }

      // Try to find existing site in registry
      let matchedSite = null;

      // 1. Exact site code match (highest priority)
      if (siteCode) {
        matchedSite = registrySites.find(
          reg => normalizeForMatch(reg.site_code) === normalizeForMatch(siteCode)
        );
      }

      // 2. Name + State + Locality match
      if (!matchedSite && siteName && state && locality) {
        matchedSite = registrySites.find(reg => {
          const nameMatch = normalizeForMatch(reg.site_name) === normalizeForMatch(siteName);
          const stateMatch = normalizeForMatch(reg.state_name) === normalizeForMatch(state);
          const localityMatch = normalizeForMatch(reg.locality_name) === normalizeForMatch(locality);
          return nameMatch && stateMatch && localityMatch;
        });
      }

      // 3. Name + State match (fallback)
      if (!matchedSite && siteName && state) {
        matchedSite = registrySites.find(reg => {
          const nameMatch = normalizeForMatch(reg.site_name) === normalizeForMatch(siteName);
          const stateMatch = normalizeForMatch(reg.state_name) === normalizeForMatch(state);
          return nameMatch && stateMatch;
        });
      }

      if (matchedSite) {
        // Site exists - add to map and increment mmp_count later
        console.log(`[Sites Registry] MATCHED: "${siteName}" (${state}/${locality}) -> Registry ID: ${matchedSite.id}, Site Code: ${matchedSite.site_code}`);
        siteRegistryMap.set(siteKey, {
          registrySiteId: matchedSite.id,
          siteCode: matchedSite.site_code,
          isNew: false,
          mmpCount: (matchedSite.mmp_count || 0) + 1,
        });
        existingSitesCount++;
      } else {
        // Site doesn't exist - queue for creation
        const generatedCode = siteCode || generateSiteCode(siteName, state, locality);
        console.log(`[Sites Registry] NEW: "${siteName}" (${state}/${locality}) -> Will create with code: ${generatedCode}`);
        sitesToCreate.push({ siteKey, site, generatedCode });
      }
    }

    // Batch create new sites
    if (sitesToCreate.length > 0) {
      const newSiteRows = sitesToCreate.map(({ site, generatedCode }) => ({
        id: `reg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        site_code: generatedCode,
        site_name: site.siteName || 'Unknown Site',
        state_id: '', // Will be populated if we have state lookup
        state_name: site.state || '',
        locality_id: '',
        locality_name: site.locality || '',
        hub_name: site.hubOffice || null,
        activity_type: site.mainActivity || 'TPM',
        status: 'registered',
        mmp_count: 1,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Insert in batches
      const BATCH_SIZE = 50;
      for (let i = 0; i < newSiteRows.length; i += BATCH_SIZE) {
        const batch = newSiteRows.slice(i, i + BATCH_SIZE);
        const { data: insertedSites, error: insertError } = await supabase
          .from('sites_registry')
          .insert(batch)
          .select('id, site_code');

        if (insertError) {
          console.error('Error inserting new registry sites:', insertError);
          errors.push(`Failed to create ${batch.length} sites in registry: ${insertError.message}`);
          continue;
        }

        // Map the inserted sites back to their keys
        const batchStartIndex = i;
        (insertedSites || []).forEach((insertedSite, idx) => {
          const originalIndex = batchStartIndex + idx;
          if (originalIndex < sitesToCreate.length) {
            const { siteKey } = sitesToCreate[originalIndex];
            siteRegistryMap.set(siteKey, {
              registrySiteId: insertedSite.id,
              siteCode: insertedSite.site_code,
              isNew: true,
              mmpCount: 1,
            });
            newSitesCount++;
          }
        });
      }
    }

    // Update mmp_count for all sites based on their occurrences in this upload
    // For existing sites: increment by number of occurrences
    // For new sites: they already have mmp_count=1, increment by additional occurrences
    for (const [siteKey, result] of siteRegistryMap.entries()) {
      const duplicateCount = duplicateCountsInUpload.get(siteKey) || 1;
      
      // For existing sites, mmpCount already has +1. If there are duplicates, add more.
      // For new sites, they start at 1. Add duplicates - 1 if there are any.
      const additionalCount = result.isNew ? (duplicateCount - 1) : (duplicateCount - 1);
      
      if (additionalCount > 0 || !result.isNew) {
        // Calculate the final count
        const finalMmpCount = result.isNew 
          ? (result.mmpCount + additionalCount)  // New: 1 + (duplicateCount - 1) = duplicateCount
          : (result.mmpCount + additionalCount); // Existing: existing+1 + (duplicateCount - 1) = existing+duplicateCount
        
        const { error: updateError } = await supabase
          .from('sites_registry')
          .update({ 
            mmp_count: finalMmpCount,
            updated_at: new Date().toISOString()
          })
          .eq('id', result.registrySiteId);

        if (updateError) {
          console.error('Error updating mmp_count for site:', result.registrySiteId, updateError);
        }
      }
    }

    // Print detailed summary
    console.log('='.repeat(60));
    console.log('[Sites Registry] UPLOAD COMPLETE - SUMMARY');
    console.log('='.repeat(60));
    console.log(`[Sites Registry] Total sites in file: ${sites.length}`);
    console.log(`[Sites Registry] Existing sites linked (no duplicates created): ${existingSitesCount}`);
    console.log(`[Sites Registry] New sites added to registry: ${newSitesCount}`);
    console.log(`[Sites Registry] Registry entries reused: ${existingSitesCount > 0 ? 'YES - Sites matched to existing registry' : 'N/A - All new sites'}`);
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Unexpected error in ensureSitesInRegistry:', error);
    errors.push('Unexpected error processing sites registry');
  }

  return { siteRegistryMap, newSitesCount, existingSitesCount, errors };
}

/**
 * Gets the registry site ID for a given site entry
 */
function getRegistrySiteId(
  siteRegistryMap: Map<string, RegistrySiteResult>,
  entry: SiteForRegistry
): string | null {
  const siteKey = `${entry.siteCode?.trim() || ''}|${entry.siteName?.trim() || ''}|${entry.state?.trim() || ''}|${entry.locality?.trim() || ''}`;
  const result = siteRegistryMap.get(siteKey);
  return result?.registrySiteId || null;
}

// Parse file through validateCSV and map rows to MMPSiteEntry while preserving unmapped columns
async function parseAndCountEntries(file: File): Promise<{ entries: MMPSiteEntry[]; count: number; errors: string[]; warnings: string[]; rawErrors: CSVValidationError[]; rawWarnings: CSVValidationError[] }> {
  const issues: string[] = [];
  const warns: string[] = [];
  const entries: MMPSiteEntry[] = [];

  try {
    const result = await validateCSV(file);

    // Collect both errors and warnings as non-blocking issues for this stage
    const toText = (e: any) => e.row ? `${e.message} (Row ${e.row})` : e.message;
    issues.push(...result.errors.map(toText));
    warns.push(...result.warnings.map(toText));

    const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

    // Define synonyms (keys can be unnormalized; we'll normalize them below)
    const rawHeaderMap: Record<string, keyof MMPSiteEntry> = {
      // Basic fields
      'huboffice': 'hubOffice',
      'hub': 'hubOffice',
      'hubofficename': 'hubOffice',
      'officename': 'hubOffice',
      'office': 'hubOffice',
      'sitecode': 'siteCode',
      'siteid': 'siteCode',
      'code': 'siteCode',
      'state': 'state',
      'statename': 'state',
      'stateprovince': 'state',
      'region': 'state',
      'locality': 'locality',
      'localityname': 'locality',
      'district': 'locality',
      'county': 'locality',
      'lga': 'locality',
      'sitename': 'siteName',
      'site': 'siteName',
      'facilityname': 'siteName',
      'distributionpoint': 'siteName',
      'cpname': 'cpName',
      'cp': 'cpName',
      'partner': 'cpName',
      'partnername': 'cpName',
      'implementingpartner': 'cpName',
      'ipname': 'cpName',
      'mainactivity': 'mainActivity',
      'activity': 'mainActivity',
      'visittype': 'visitType',
      'typeofvisit': 'visitType',
      'type': 'visitType',
      'visitdate': 'visitDate',
      'date': 'visitDate',
      'dateofvisit': 'visitDate',
      'comments': 'comments',
      'comment': 'comments',
      'remarks': 'comments',
      'notes': 'comments',
      // Monitoring Plan specific fields
      'activityatsite': 'siteActivity',
      'siteactivity': 'siteActivity',
      'activitysite': 'siteActivity',
      'activityatthesite': 'siteActivity',
      'monitoringby': 'monitoringBy',
      'monitoringby:': 'monitoringBy',
      'monitoring by': 'monitoringBy',
      'monitoredby': 'monitoringBy',
      'surveytool': 'surveyTool',
      'surveyundermastertool': 'surveyTool',
      'survey under master tool': 'surveyTool',
      'survey under master tool:': 'surveyTool',
      'usemarketdiversion': 'useMarketDiversion',
      'use market diversion monitoring': 'useMarketDiversion',
      'use market diversion monitorir': 'useMarketDiversion',
      'usewarehousemonitoring': 'useWarehouseMonitoring',
      'use warehouse monitoring': 'useWarehouseMonitoring',
      'use warehouse monitorin': 'useWarehouseMonitoring',
    };

    // Normalize the header map keys once
    const headerMap: Record<string, keyof MMPSiteEntry> = Object.entries(rawHeaderMap)
      .reduce((acc, [k, v]) => { acc[norm(k)] = v; return acc; }, {} as Record<string, keyof MMPSiteEntry>);

    const timestamp = Date.now();

    result.data.forEach((record: Record<string, any>, index: number) => {
      // Skip rows that are truly empty (allow flexible header names)
      const hasData = Object.values(record).some(v => String(v ?? '').trim() !== '');
      if (!hasData) {
        return; // Skip this empty row
      }

      const entry: MMPSiteEntry = {
        id: `site-${timestamp}-${index}`,
        status: 'Pending',
      };

      // Prefer ISO OriginalDate when present
      if (record['OriginalDate']) {
        entry.visitDate = String(record['OriginalDate']);
      }

      // Assign mapped fields by normalized header with proper type conversion
      for (const [header, raw] of Object.entries(record)) {
        const n = norm(header);
        if (n === 'originaldate') continue; // handled above
        const target = headerMap[n];
        if (target) {
          const value = raw ?? '';
          
          // Handle boolean fields
          if (target === 'useMarketDiversion' || target === 'useWarehouseMonitoring') {
            const boolValue = String(value).toLowerCase().trim();
            (entry as any)[target] = ['yes','true','1','y','t'].includes(boolValue)
              ? true
              : ['no','false','0','n','f',''].includes(boolValue) ? false : false;
          } else if (target === 'visitDate' && record['OriginalDate']) {
            // If we already set ISO date, do not override with display value
            continue;
          } else {
            (entry as any)[target] = String(value);
          }
        }
      }

      // Build additionalData from any non-mapped, non-empty fields
      const additional: Record<string, string> = {};
      for (const [header, value] of Object.entries(record)) {
        const n = norm(header);
        if (n === 'originaldate') continue;
        if (!headerMap[n] && String(value ?? '').trim() !== '') {
          additional[header] = String(value);
        }
      }
      if (Object.keys(additional).length > 0) {
        entry.additionalData = additional;
      }

      // Heuristic backfill from additionalData when primary headers are irregular
      if (entry.additionalData) {
        const addNormMap: Record<string, string> = {};
        Object.entries(entry.additionalData).forEach(([k, v]) => { addNormMap[norm(k)] = String(v); });

        const setIfEmpty = (key: keyof MMPSiteEntry, value?: string) => {
          if (!value) return;
          if (!(entry as any)[key] || String((entry as any)[key]).trim() === '') {
            (entry as any)[key] = value;
          }
        };

        // 1) Direct synonym match from additionalData
        for (const [k, v] of Object.entries(addNormMap)) {
          const t = headerMap[k];
          if (t) setIfEmpty(t, v);
        }

        // 2) "Month" column sometimes actually contains State names
        const monthVal = addNormMap['month'] || addNormMap['month:'];
        if (!entry.state && monthVal) {
          const v = monthVal.trim();
          const months = ['jan','january','feb','february','mar','march','apr','april','may','jun','june','jul','july','aug','august','sep','september','oct','october','nov','november','dec','december'];
          if (!months.includes(v.toLowerCase())) {
            setIfEmpty('state', v);
          }
        }

        // 3) Headers that look like date/time often hold locality text
        if (!entry.locality) {
          const dateLikeKey = Object.keys(addNormMap).find(k => /(mon|tue|wed|thu|fri|sat|sun)/.test(k) || /\b\d{4}\b/.test(k));
          if (dateLikeKey) {
            const val = addNormMap[dateLikeKey];
            if (val && val.length > 0) setIfEmpty('locality', val);
          }
        }

        // 4) Visit Date fallback from any date-like additional key
        if (!entry.visitDate) {
          const dateKey = Object.keys(addNormMap).find(k => k.includes('date') || k.includes('visitdate'));
          if (dateKey) setIfEmpty('visitDate', addNormMap[dateKey]);
        }
      }

      entries.push(entry);
    });

    return { entries, count: entries.length, errors: issues, warnings: warns, rawErrors: result.errors, rawWarnings: result.warnings };
  } catch (error) {
    const message = `File parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return { entries: [], count: 0, errors: [message], warnings: [], rawErrors: [{ type: 'error', message, category: 'parse_error' } as CSVValidationError], rawWarnings: [] };
  }
}

export async function uploadMMPFile(
  file: File,
  metadata?: { name?: string; hub?: string; month?: string; projectId?: string },
  onProgress?: (progress: { current: number; total: number; stage: string }) => void
): Promise<{ success: boolean; mmpData?: MMPFile; error?: string; validationReport?: string; validationErrors?: CSVValidationError[]; validationWarnings?: CSVValidationError[] }> {
  try {
    console.log('Starting MMP file upload:', file.name);
    onProgress?.({ current: 0, total: 100, stage: 'Starting upload process' });

    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return {
        success: false,
        error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the 10MB limit`
      };
    }

    onProgress?.({ current: 5, total: 100, stage: 'File size validated' });

    // Generate a unique file path for storage
    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const filePath = `${timestamp}_${Math.random().toString(36).substring(2)}.${fileExt}`;

    onProgress?.({ current: 10, total: 100, stage: 'Uploading file to storage' });

    // Upload file to Supabase Storage with timeout
    const uploadPromise = supabase
      .storage
      .from('mmp-files')
      .upload(filePath, file);

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Storage upload timeout after 5 minutes')), 300000)
    );

    const { data: storageData, error: storageError } = await Promise.race([
      uploadPromise,
      timeoutPromise
    ]) as any;

    if (storageError) {
      console.error('Storage upload error:', storageError);
      toast.error('Failed to upload file to storage');
      const storageErrMsg = storageError?.message || JSON.stringify(storageError);
      return { success: false, error: 'Failed to upload file to storage: ' + storageErrMsg };
    }

    onProgress?.({ current: 30, total: 100, stage: 'File uploaded to storage' });

    // Get the public URL for the uploaded file
    const { data: { publicUrl } } = supabase
      .storage
      .from('mmp-files')
      .getPublicUrl(filePath);

    console.log('File uploaded successfully. Public URL:', publicUrl);

    onProgress?.({ current: 35, total: 100, stage: 'Parsing file and extracting entries' });

    // Parse the file once to extract entries (combines validation and parsing)
    const { entries, count, errors: hardErrors, warnings, rawErrors, rawWarnings } = await parseAndCountEntries(file);

    // If there are hard validation errors, cancel upload and provide report
    if (hardErrors.length > 0) {
      console.error('Blocking validation errors found:', rawErrors);
      // Remove uploaded file to avoid orphaned storage object
      try { await supabase.storage.from('mmp-files').remove([filePath]); } catch {}

      // Build CSV report
      const header = 'type,row,column,category,message\n';
      const esc = (s: any) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
      const rows = rawErrors.map(e => [e.type, e.row ?? '', e.column ?? '', e.category ?? '', e.message].map(esc).join(','));
      const report = header + rows.join('\n');

      return {
        success: false,
        error: `Validation failed with ${rawErrors.length} error(s). Please fix and re-upload.`,
        validationReport: report,
        validationErrors: rawErrors,
        validationWarnings: rawWarnings,
      };
    }

    // Get current user ID for registry operations
    let currentUserId = 'system';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) currentUserId = user.id;
    } catch {}

    // Ensure all sites exist in Sites Registry (create if new, link if existing)
    onProgress?.({ current: 40, total: 100, stage: 'Registering sites in Sites Registry' });
    
    const sitesForRegistry: SiteForRegistry[] = entries.map(e => ({
      siteCode: e.siteCode,
      siteName: e.siteName,
      state: e.state,
      locality: e.locality,
      hubOffice: e.hubOffice,
      mainActivity: e.mainActivity,
    }));

    const { 
      siteRegistryMap, 
      newSitesCount, 
      existingSitesCount, 
      errors: registryErrors 
    } = await ensureSitesInRegistry(sitesForRegistry, currentUserId);

    // Log registry processing results
    if (registryErrors.length > 0) {
      console.warn('Some registry errors occurred (non-blocking):', registryErrors);
    }

    // Add informational message about registry processing
    console.log(`[Sites Registry] ===== SUMMARY =====`);
    console.log(`[Sites Registry] Total sites in file: ${sitesForRegistry.length}`);
    console.log(`[Sites Registry] Existing sites linked: ${existingSitesCount}`);
    console.log(`[Sites Registry] New sites created: ${newSitesCount}`);
    console.log(`[Sites Registry] ===================`);
    
    if (newSitesCount > 0 || existingSitesCount > 0) {
      const registryInfo: CSVValidationError = {
        type: 'warning' as const,
        message: `Sites Registry: ${newSitesCount} new sites registered, ${existingSitesCount} existing sites linked`,
        category: 'sites_registry_info'
      };
      rawWarnings.push(registryInfo);
      console.log(`Sites Registry processing: ${newSitesCount} new, ${existingSitesCount} existing`);
    }

    // Also run the validation for GPS matching info (optional enrichment)
    onProgress?.({ current: 45, total: 100, stage: 'Validating site GPS coordinates' });
    let registryValidation: { 
      matches: SiteMatchResult[]; 
      registeredCount: number; 
      unregisteredCount: number; 
      reviewRequiredCount: number;
      autoAcceptedCount: number;
      warnings: string[];
    } | null = null;
    
    try {
      registryValidation = await validateSitesAgainstRegistry(
        entries.map((e, idx) => ({
          id: e.id || `entry-${idx}`,
          siteCode: e.siteCode,
          siteName: e.siteName,
          state: e.state,
          locality: e.locality,
        })),
        {
          userId: currentUserId,
          sourceWorkflow: 'mmp_upload',
        }
      );
    } catch (registryErr) {
      console.warn('Sites Registry GPS validation failed (non-blocking):', registryErr);
    }

    // Prepare uploader info (name and role) for persistence
    let uploaderDisplay = 'Unknown';
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, username, role, email')
          .eq('id', user.id)
          .single();
        const displayName = (profile as any)?.full_name || (profile as any)?.username || user.email?.split('@')[0] || 'User';
        const primaryRole = (profile as any)?.role || 'User';
        uploaderDisplay = `${displayName} (${primaryRole})`;
      }
    } catch {}

    // Create database entry with parsed data (without site_entries initially)
    const mmpName = metadata?.name || file.name.replace(/\.[^/.]+$/, "");
    const dbData = {
      name: mmpName,
      month: metadata?.month,
      uploaded_at: new Date().toISOString(),
      uploaded_by: uploaderDisplay,
      status: 'pending',
      entries: count,
      processed_entries: 0,
      mmp_id: `MMP-${timestamp.toString().substring(5)}`,
      version: {
        major: 1,
        minor: 0,
        updatedAt: new Date().toISOString()
      },
      site_entries: [], // Start with empty array, will populate in batches
      workflow: {
        currentStage: 'notStarted',
        lastUpdated: new Date().toISOString()
      },
      file_path: filePath,
      original_filename: file.name,
      file_url: publicUrl,
      ...(metadata?.projectId && { project_id: metadata.projectId })
    };

    // Preflight: prevent duplicate MMP uploads
    // Business rule: Block only if same (project + month) combination already has an active MMP
    // This allows reusing the same file/template for different months (recurring monitoring)
    
    const normalizedFileName = file.name.trim().toLowerCase();
    const normalizedMmpName = mmpName.trim().toLowerCase();
    const normalizedMonth = metadata?.month?.trim().toLowerCase() || '';
    
    // Status values that indicate an MMP is no longer active (can be re-uploaded)
    const inactiveStatuses = ['archived', 'deleted', 'cancelled'];
    
    console.log('[MMP Duplicate Check] Starting duplicate prevention checks...');
    console.log('[MMP Duplicate Check] File name:', normalizedFileName);
    console.log('[MMP Duplicate Check] MMP name:', normalizedMmpName);
    console.log('[MMP Duplicate Check] Month:', normalizedMonth);
    console.log('[MMP Duplicate Check] Project ID:', metadata?.projectId);

    // Primary duplicate check: Same project + month + file name combination
    // This allows the same file to be used for different months
    if (metadata?.projectId && normalizedMonth) {
      const { data: existingMmps, error: existingErr } = await supabase
        .from('mmp_files')
        .select('id,name,status,month,original_filename')
        .eq('project_id', metadata.projectId);
      
      if (existingErr) {
        console.error('[MMP Duplicate Check] Query error:', existingErr);
      } else {
        console.log('[MMP Duplicate Check] Found', existingMmps?.length || 0, 'MMPs for this project');
        
        if (existingMmps) {
          // Check 1: Same project + month + file name = exact duplicate
          const exactDuplicate = existingMmps.find(m => 
            m.month?.trim().toLowerCase() === normalizedMonth &&
            m.original_filename?.trim().toLowerCase() === normalizedFileName &&
            !inactiveStatuses.includes(m.status?.toLowerCase() || '')
          );
          
          if (exactDuplicate) {
            console.log('[MMP Duplicate Check] BLOCKED: Exact duplicate (same project + month + file):', exactDuplicate.name);
            try { await supabase.storage.from('mmp-files').remove([filePath]); } catch {}
            return {
              success: false,
              error: `This exact file "${file.name}" was already uploaded for this project and month as "${exactDuplicate.name}". To upload again, please archive the existing MMP first.`,
            };
          }
          
          // Check 2: Same project + month (different file) - warn but still allow different file names
          const sameMonthDifferentFile = existingMmps.find(m => 
            m.month?.trim().toLowerCase() === normalizedMonth &&
            m.original_filename?.trim().toLowerCase() !== normalizedFileName &&
            !inactiveStatuses.includes(m.status?.toLowerCase() || '')
          );
          
          if (sameMonthDifferentFile) {
            console.log('[MMP Duplicate Check] WARNING: Another MMP exists for this project+month:', sameMonthDifferentFile.name);
            // We log a warning but allow it - user might be uploading a supplementary file
          }
        }
      }
    } else {
      // Fallback: If no project or month specified, do basic file name check within recent uploads
      console.log('[MMP Duplicate Check] No project/month specified, checking recent file names...');
      
      const { data: recentMmps, error: recentErr } = await supabase
        .from('mmp_files')
        .select('id,name,status,original_filename,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (!recentErr && recentMmps) {
        // Check if same file was uploaded in the last 24 hours (likely accidental re-upload)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const recentDuplicate = recentMmps.find(m => 
          m.original_filename?.trim().toLowerCase() === normalizedFileName &&
          m.created_at > oneDayAgo &&
          !inactiveStatuses.includes(m.status?.toLowerCase() || '')
        );
        
        if (recentDuplicate) {
          console.log('[MMP Duplicate Check] BLOCKED: Same file uploaded within 24 hours:', recentDuplicate.name);
          try { await supabase.storage.from('mmp-files').remove([filePath]); } catch {}
          return {
            success: false,
            error: `This file "${file.name}" was already uploaded recently as "${recentDuplicate.name}". Please select a project and month to upload for a different period.`,
          };
        }
      }
    }
    
    console.log('[MMP Duplicate Check] All checks passed, proceeding with upload...');

    console.log('Inserting MMP record into database:', dbData);

    // Insert the record into Supabase with timeout
    const insertPromise = supabase
      .from('mmp_files')
      .insert(dbData)
      .select('*')
      .single();

    const insertTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Database insert timeout after 5 minutes')), 300000)
    );

    const { data: insertedData, error: insertError } = await Promise.race([
      insertPromise,
      insertTimeoutPromise
    ]) as any;
      
    if (insertError) {
      // If database insert fails, attempt to clean up the uploaded file
      try {
        await supabase.storage.from('mmp-files').remove([filePath]);
        console.log('Cleaned up storage after failed insert');
      } catch (cleanupError) {
        console.error('Error cleaning up storage after failed insert:', cleanupError);
      }
      console.error('Database insert error:', insertError);
      toast.error('Failed to save MMP data');
      const insertErrMsg = insertError?.message || JSON.stringify(insertError);
      return { success: false, error: 'Failed to save MMP data: ' + insertErrMsg };
    }
    
    // Use the returned row; if it's not present, fetch by unique key (file_path)
    let insertedRow: any = insertedData;
    if (!insertedRow) {
      const { data: fetchedRow, error: fetchError } = await supabase
        .from('mmp_files')
        .select('*')
        .eq('file_path', filePath)
        .single();

      if (fetchError) {
        console.error('Failed to fetch inserted MMP row:', fetchError);
        toast.error('Failed to confirm saved MMP data');
        return { success: false, error: 'Failed to confirm saved MMP data: ' + fetchError.message };
      }
      insertedRow = fetchedRow;
    }

    console.log('MMP file record created successfully:', insertedRow);

    // Now insert site entries in batches to avoid database limits
    const BATCH_SIZE = 50;
    const mmpId = insertedRow.id;
    const totalBatches = Math.ceil(entries.length / BATCH_SIZE);

    onProgress?.({ current: 50, total: 100, stage: 'Saving site entries to database' });

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;

      const siteEntriesData = batch.map((entry, batchIdx) => {
        const entryIndex = i + batchIdx;
        const registryMatch = registryValidation?.matches[entryIndex];
        
        // Get the registry site ID from our ensureSitesInRegistry map
        const registrySiteId = getRegistrySiteId(siteRegistryMap, {
          siteCode: entry.siteCode,
          siteName: entry.siteName,
          state: entry.state,
          locality: entry.locality,
        });
        
        // Build enhanced registry_linkage structure
        const additionalData: Record<string, any> = {
          ...(entry.additionalData || {}),
        };
        
        // Always include registry_linkage for tracking (whether matched or not)
        if (registryMatch) {
          additionalData.registry_linkage = registryMatch.registryLinkage;
          
          // Also keep legacy registry_gps for backward compatibility (if auto-accepted)
          if (registryMatch.autoAccepted && registryMatch.gpsCoordinates) {
            additionalData.registry_gps = {
              latitude: registryMatch.gpsCoordinates.latitude,
              longitude: registryMatch.gpsCoordinates.longitude,
              accuracy_meters: registryMatch.gpsCoordinates.accuracy_meters,
              source: 'sites_registry',
              site_id: registryMatch.matchedRegistry?.id,
              site_code: registryMatch.matchedRegistry?.site_code,
              match_type: registryMatch.matchType,
              match_confidence: registryMatch.matchConfidence,
              matched_at: registryMatch.registryLinkage.audit.matched_at,
            };
          }
        }
        
        return {
          mmp_file_id: mmpId,
          registry_site_id: registrySiteId, // Link to Sites Registry
          site_code: entry.siteCode,
          hub_office: entry.hubOffice,
          state: entry.state,
          locality: entry.locality,
          site_name: entry.siteName,
          cp_name: entry.cpName,
          visit_type: entry.visitType,
          visit_date: entry.visitDate,
          main_activity: entry.mainActivity,
          activity_at_site: entry.siteActivity,
          monitoring_by: entry.monitoringBy,
          survey_tool: entry.surveyTool,
          use_market_diversion: entry.useMarketDiversion,
          use_warehouse_monitoring: entry.useWarehouseMonitoring,
          comments: entry.comments,
          additional_data: additionalData,
          status: entry.status || 'Pending'
        };
      });

      const { error: batchError } = await supabase
        .from('mmp_site_entries')
        .insert(siteEntriesData);

      if (batchError) {
        console.error('Error inserting site entries batch:', batchError);
        // Clean up the partially created MMP record
        try {
          await supabase.from('mmp_files').delete().eq('id', mmpId);
          await supabase.storage.from('mmp-files').remove([filePath]);
        } catch (cleanupError) {
          console.error('Error cleaning up after batch insert failure:', cleanupError);
        }
        return { success: false, error: 'Failed to insert site entries: ' + batchError.message };
      }

      // Update progress
      const progressPercent = 50 + Math.round((batchNumber / totalBatches) * 40); // 50-90%
      onProgress?.({
        current: progressPercent,
        total: 100,
        stage: `Saving site entries (${batchNumber}/${totalBatches})`
      });

      console.log(`Inserted batch ${batchNumber} of ${totalBatches}`);
    }

    // Update the MMP record with the correct processed_entries count
    const { error: updateError } = await supabase
      .from('mmp_files')
      .update({ processed_entries: count })
      .eq('id', mmpId);

    if (updateError) {
      console.error('Error updating processed entries count:', updateError);
      // Don't fail the upload for this, just log it
    }

    toast.success(`MMP file uploaded successfully with ${count} entries`);

    // Fetch the final record with site entries
    const { data: finalRecord, error: fetchError } = await supabase
      .from('mmp_files')
      .select(`
        *,
        mmp_site_entries (*)
      `)
      .eq('id', mmpId)
      .single();

    if (fetchError) {
      console.error('Error fetching final MMP record:', fetchError);
      // Return the basic record without site entries
      const mmpData = transformDBToMMPFile(insertedRow);
      // Fire notifications (best-effort)
      await notifyStakeholdersOnUpload({ id: mmpData.id, name: mmpData.name, hub: mmpData.hub });
      return {
        success: true,
        mmpData: mmpData,
        validationWarnings: rawWarnings
      };
    }

    // Transform the final data to match the MMPFile interface
    const mmpData = transformDBToMMPFile(finalRecord);

    // Fire notifications (best-effort)
    await notifyStakeholdersOnUpload({ id: mmpData.id, name: mmpData.name, hub: mmpData.hub });

    return {
      success: true,
      mmpData: mmpData,
      validationWarnings: rawWarnings
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('MMP upload error:', error);
    toast.error('An unexpected error occurred during upload');
    return { success: false, error: 'An unexpected error occurred during upload: ' + errorMessage };
  }
}



