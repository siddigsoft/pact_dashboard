import { supabase } from '@/integrations/supabase/client';
import { MMPFile, MMPSiteEntry } from '@/types';
import { toast } from 'sonner';
import { validateCSV } from '@/utils/csvValidator';

// Transform database record (snake_case) to MMPFile interface (camelCase)
const transformDBToMMPFile = (dbRecord: any): MMPFile => {
  return {
    id: dbRecord.id,
    name: dbRecord.name,
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
    month: dbRecord.month,
    year: dbRecord.year,
    version: dbRecord.version,
    modificationHistory: dbRecord.modification_history,
    modifiedAt: dbRecord.modified_at,
    description: dbRecord.description,
    projectName: dbRecord.project_name,
    type: dbRecord.type,
    filePath: dbRecord.file_path,
    originalFilename: dbRecord.original_filename,
    fileUrl: dbRecord.file_url,
    projectId: dbRecord.project_id,
    siteEntries: dbRecord.site_entries || [],
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

// Parse file through validateCSV and map rows to MMPSiteEntry while preserving unmapped columns
async function parseAndCountEntries(file: File): Promise<{ entries: MMPSiteEntry[]; count: number; errors: string[] }> {
  const issues: string[] = [];
  const entries: MMPSiteEntry[] = [];

  try {
    const result = await validateCSV(file);

    // Collect both errors and warnings as non-blocking issues for this stage
    const toText = (e: any) => e.row ? `${e.message} (Row ${e.row})` : e.message;
    issues.push(...result.errors.map(toText));
    issues.push(...result.warnings.map(toText));

    const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

    // Normalized header -> MMPSiteEntry key mapping (includes synonyms)
    const headerMap: Record<string, keyof MMPSiteEntry> = {
      // Basic fields
      huboffice: 'hubOffice',
      hub: 'hubOffice',
      office: 'hubOffice',
      sitecode: 'siteCode',
      state: 'state',
      statename: 'state',
      locality: 'locality',
      localityname: 'locality',
      sitename: 'siteName',
      site: 'siteName',
      facilityname: 'siteName',
      cpname: 'cpName',
      partner: 'cpName',
      implementingpartner: 'cpName',
      cp: 'cpName',
      mainactivity: 'mainActivity',
      visittype: 'visitType',
      type: 'visitType',
      visitdate: 'visitDate',
      date: 'visitDate',
      comments: 'comments',
      comment: 'comments',
      remarks: 'comments',
      notes: 'comments',
      // Monitoring Plan specific fields
      activityatsite: 'siteActivity',
      siteactivity: 'siteActivity',
      activitysite: 'siteActivity',
      'activity at the site': 'siteActivity',
      monitoringby: 'monitoringBy',
      'monitoring by': 'monitoringBy',
      'monitoring by:': 'monitoringBy',
      surveytool: 'surveyTool',
      'survey under master tool': 'surveyTool',
      'survey under master tool:': 'surveyTool',
      usemarketdiversion: 'useMarketDiversion',
      'use market diversion monitoring': 'useMarketDiversion',
      'use market diversion monitorir': 'useMarketDiversion',
      usewarehousemonitoring: 'useWarehouseMonitoring',
      'use warehouse monitoring': 'useWarehouseMonitoring',
      'use warehouse monitorin': 'useWarehouseMonitoring',
    };

    const timestamp = Date.now();

    result.data.forEach((record: Record<string, any>, index: number) => {
      // Skip empty rows (where all key fields are empty)
      const hasData = record['Site Name'] || record['siteName'] || record['Site Name:'] || 
                     record['Hub Office'] || record['hubOffice'] || record['Hub Office:'] ||
                     record['State'] || record['state'] || record['State:'] ||
                     record['Locality'] || record['locality'] || record['Locality:'];
      
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
            (entry as any)[target] = boolValue === 'yes' || boolValue === 'true' || boolValue === '1';
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

      entries.push(entry);
    });

    return { entries, count: entries.length, errors: issues.map(msg => `⚠️ ${msg}`) };
  } catch (error) {
    const message = `File parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return { entries: [], count: 0, errors: [message] };
  }
}

export async function uploadMMPFile(file: File, projectId?: string): Promise<{ success: boolean; mmpData?: MMPFile; error?: string }> {
  try {
    console.log('Starting MMP file upload:', file.name);
    
    // Check file size (10MB limit)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return { 
        success: false, 
        error: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the 10MB limit` 
      };
    }
    
    // Generate a unique file path for storage
    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const filePath = `${timestamp}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    
    // Upload file to Supabase Storage with timeout
    const uploadPromise = supabase
      .storage
      .from('mmp-files')
      .upload(filePath, file);
    
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Storage upload timeout after 30 seconds')), 30000)
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

    // Get the public URL for the uploaded file
    const { data: { publicUrl } } = supabase
      .storage
      .from('mmp-files')
      .getPublicUrl(filePath);

    console.log('File uploaded successfully. Public URL:', publicUrl);

    // Parse and validate the Excel file
    const { entries, count, errors } = await parseAndCountEntries(file);

    // Show validation errors if any
    if (errors.length > 0) {
      console.warn('File validation errors:', errors);
      toast.warning(`File uploaded with ${errors.length} validation issues. Check console for details.`);
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

    // Create database entry with parsed data
    const dbData = {
      name: file.name.replace(/\.[^/.]+$/, ""),
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
      site_entries: entries,
      workflow: {
        currentStage: 'notStarted',
        lastUpdated: new Date().toISOString()
      },
      file_path: filePath,
      original_filename: file.name,
      file_url: publicUrl,
      ...(projectId && { project_id: projectId })
    };

    console.log('Inserting MMP record into database:', dbData);

  // Insert the record into Supabase with timeout
    const insertPromise = supabase
      .from('mmp_files')
      .insert(dbData)
      .select('*')
      .single();
    
    const insertTimeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database insert timeout after 15 seconds')), 15000)
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
    toast.success(`MMP file uploaded successfully with ${count} entries`);

    // Transform the inserted data to match the MMPFile interface
    const mmpData = transformDBToMMPFile(insertedRow);
    
    return { 
      success: true, 
      mmpData: mmpData
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('MMP upload error:', error);
    toast.error('An unexpected error occurred during upload');
    return { success: false, error: 'An unexpected error occurred during upload: ' + errorMessage };
  }
}



