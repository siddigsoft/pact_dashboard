import { supabase } from '@/integrations/supabase/client';
import { MMPFile, MMPSiteEntry } from '@/types';
import { toast } from 'sonner';
import { validateCSV, CSVValidationError } from '@/utils/csvValidator';
import { validateSitesAgainstRegistry, SiteMatchResult } from '@/utils/sitesRegistryMatcher';

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
 * Checks for existing site codes in the database
 * @param siteCodes Array of site codes to check
 * @returns Object with duplicate site codes and their details
 */
async function checkExistingSiteCodes(siteCodes: string[]): Promise<{
  duplicates: Array<{ siteCode: string; existingEntry: { id: string; site_name: string; mmp_file_id: string } }>;
  uniqueCodes: string[];
}> {
  if (!siteCodes || siteCodes.length === 0) {
    return { duplicates: [], uniqueCodes: [] };
  }

  // Filter out empty/null site codes
  const validSiteCodes = siteCodes.filter(code => code && code.trim() !== '');
  
  if (validSiteCodes.length === 0) {
    return { duplicates: [], uniqueCodes: [] };
  }

  try {
    // Query database for existing site codes
    const { data: existingEntries, error } = await supabase
      .from('mmp_site_entries')
      .select('id, site_code, site_name, mmp_file_id')
      .in('site_code', validSiteCodes);

    if (error) {
      console.error('Error checking existing site codes:', error);
      // Don't block upload on query error, but log it
      return { duplicates: [], uniqueCodes: validSiteCodes };
    }

    const existingSiteCodes = new Set((existingEntries || []).map(e => e.site_code));
    const duplicates: Array<{ siteCode: string; existingEntry: { id: string; site_name: string; mmp_file_id: string } }> = [];
    const uniqueCodes: string[] = [];

    // Categorize site codes
    validSiteCodes.forEach(code => {
      const existing = (existingEntries || []).find(e => e.site_code === code);
      if (existing) {
        duplicates.push({
          siteCode: code,
          existingEntry: {
            id: existing.id,
            site_name: existing.site_name,
            mmp_file_id: existing.mmp_file_id
          }
        });
      } else {
        uniqueCodes.push(code);
      }
    });

    return { duplicates, uniqueCodes };
  } catch (error) {
    console.error('Unexpected error checking existing site codes:', error);
    return { duplicates: [], uniqueCodes: validSiteCodes };
  }
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

    // Check for duplicate site codes in the database - BLOCKING
    onProgress?.({ current: 40, total: 100, stage: 'Checking for duplicate site codes' });
    const siteCodes = entries.map(e => e.siteCode).filter(Boolean) as string[];
    const { duplicates } = await checkExistingSiteCodes(siteCodes);
    
    // Block upload if duplicate site codes are found
    if (duplicates.length > 0) {
      // Remove uploaded file to avoid orphaned storage object
      try { await supabase.storage.from('mmp-files').remove([filePath]); } catch {}
      
      // Build detailed error message
      const duplicateDetails = duplicates.map(dup => 
        `  - "${dup.siteCode}" (Site: ${dup.existingEntry.site_name || 'Unknown'})`
      ).join('\n');
      
      const errorMessage = `Upload blocked: ${duplicates.length} site code(s) already exist in the database:\n${duplicateDetails}\n\nPlease remove or update these site codes before uploading.`;
      
      // Create error entries for validation report
      const duplicateErrors = duplicates.map(dup => ({
        type: 'error' as const,
        message: `Site Code "${dup.siteCode}" already exists in database (Site: ${dup.existingEntry.site_name || 'Unknown'})`,
        row: entries.findIndex(e => e.siteCode === dup.siteCode) + 1,
        column: 'Site Code',
        category: 'duplicate_site_code_db'
      }));
      
      // Build CSV report
      const header = 'type,row,column,category,message\n';
      const esc = (s: any) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
      const allErrors = [...rawErrors, ...duplicateErrors];
      const rows = allErrors.map(e => [e.type, e.row ?? '', e.column ?? '', e.category ?? '', e.message].map(esc).join(','));
      const report = header + rows.join('\n');
      
      toast.error(`Upload blocked: ${duplicates.length} duplicate site code(s) found in database`);
      
      return {
        success: false,
        error: errorMessage,
        validationReport: report,
        validationErrors: allErrors,
        validationWarnings: rawWarnings,
      };
    }

    // Validate sites against Sites Registry - NON-BLOCKING (warnings only)
    onProgress?.({ current: 45, total: 100, stage: 'Validating sites against registry' });
    let registryValidation: { 
      matches: SiteMatchResult[]; 
      registeredCount: number; 
      unregisteredCount: number; 
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
        }))
      );
      
      // Add registry warnings to the warning list (non-blocking)
      if (registryValidation.unregisteredCount > 0) {
        const registryWarnings: CSVValidationError[] = registryValidation.warnings.slice(0, 10).map((w, idx) => ({
          type: 'warning' as const,
          message: w,
          category: 'sites_registry'
        }));
        
        // Add summary warning if there are more
        if (registryValidation.warnings.length > 10) {
          registryWarnings.push({
            type: 'warning' as const,
            message: `... and ${registryValidation.warnings.length - 10} more sites not found in registry`,
            category: 'sites_registry'
          });
        }
        
        rawWarnings.push(...registryWarnings);
        
        console.log(`Sites Registry validation: ${registryValidation.registeredCount} registered, ${registryValidation.unregisteredCount} not in registry`);
      }
    } catch (registryErr) {
      console.warn('Sites Registry validation failed (non-blocking):', registryErr);
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
    const dbData = {
      name: metadata?.name || file.name.replace(/\.[^/.]+$/, ""),
      hub: metadata?.hub,
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

    // Preflight: prevent duplicate MMP for same project/hub/month
    if (metadata?.projectId && metadata?.hub && metadata?.month) {
      const { data: existingMmp, error: existingErr } = await supabase
        .from('mmp_files')
        .select('id,name,status,deleted_at,archived_at')
        .eq('project_id', metadata.projectId)
        .eq('hub', metadata.hub)
        .eq('month', metadata.month)
        .is('deleted_at', null)
        .limit(1);
      if (!existingErr && existingMmp && existingMmp.length > 0) {
        // Clean up storage file
        try { await supabase.storage.from('mmp-files').remove([filePath]); } catch {}
        return {
          success: false,
          error: `Duplicate MMP exists for selected Project/Hub/Month ("${existingMmp[0].name}"). Upload aborted.`,
        };
      }
    }

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
        
        const additionalData = {
          ...(entry.additionalData || {}),
          ...(registryMatch?.matchedRegistry ? {
            registry_gps: {
              latitude: registryMatch.gpsCoordinates?.latitude || null,
              longitude: registryMatch.gpsCoordinates?.longitude || null,
              source: 'sites_registry',
              site_id: registryMatch.matchedRegistry.id,
              site_code: registryMatch.matchedRegistry.site_code,
              match_type: registryMatch.matchType,
              match_confidence: registryMatch.matchConfidence,
              matched_at: new Date().toISOString(),
            },
          } : {}),
        };
        
        return {
          mmp_file_id: mmpId,
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



