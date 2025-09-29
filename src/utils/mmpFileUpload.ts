import { supabase } from '@/integrations/supabase/client';
import { MMPFile, MMPSiteEntry } from '@/types';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

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
  };
};

// Parse Excel file and validate entries
async function parseAndCountEntries(file: File): Promise<{ entries: MMPSiteEntry[]; count: number; errors: string[] }> {
  const errors: string[] = [];
  const entries: MMPSiteEntry[] = [];

  try {
    // Read file as array buffer
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Get the first worksheet
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    // Convert to JSON with header row
    const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length < 2) {
      errors.push('File must contain at least a header row and one data row');
      return { entries: [], count: 0, errors };
    }

    // Assume first row is headers
    const headers = jsonData[0] as string[];
    const dataRows = jsonData.slice(1);

    // Expected headers (adjust based on your Excel template)
    const expectedHeaders = [
      'siteCode', 'siteName', 'inMoDa', 'visitedBy', 'mainActivity',
      'visitDate', 'status', 'locality', 'state'
    ];

    // Validate headers
    const missingHeaders = expectedHeaders.filter(h => !headers.some(header =>
      header.toLowerCase().includes(h.toLowerCase())
    ));

    if (missingHeaders.length > 0) {
      errors.push(`Missing required columns: ${missingHeaders.join(', ')}`);
    }

    // Process each data row
    dataRows.forEach((row: any[], index: number) => {
      try {
        const entry: Partial<MMPSiteEntry> = {};

        // Map row data to entry fields (adjust column indices based on your template)
        entry.siteCode = row[0] || '';
        entry.siteName = row[1] || '';
        entry.inMoDa = Boolean(row[2]);
        entry.visitedBy = row[3] || '';
        entry.mainActivity = row[4] || '';
        entry.visitDate = row[5] || '';
        entry.status = row[6] || 'Pending';
        entry.locality = row[7] || '';
        entry.state = row[8] || '';

        // Validate required fields
        if (!entry.siteCode || !entry.siteName) {
          errors.push(`Row ${index + 2}: Missing required fields (siteCode, siteName)`);
          return;
        }

        
        // Generate ID
        entry.id = `site-${Date.now()}-${index}`;

        entries.push(entry as MMPSiteEntry);
      } catch (error) {
        errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : 'Invalid data'}`);
      }
    });

    return { entries, count: entries.length, errors };
  } catch (error) {
    errors.push(`File parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { entries: [], count: 0, errors };
  }
}

export async function uploadMMPFile(file: File, projectId?: string): Promise<{ success: boolean; mmpData?: MMPFile; error?: string }> {
  try {
    console.log('Starting MMP file upload:', file.name);
    
    // Generate a unique file path for storage
    const timestamp = Date.now();
    const fileExt = file.name.split('.').pop();
    const filePath = `${timestamp}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    
    // Upload file to Supabase Storage
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('mmp-files')
      .upload(filePath, file);

    if (storageError) {
      console.error('Storage upload error:', storageError);
      toast.error('Failed to upload file to storage');
      return { success: false, error: 'Failed to upload file to storage: ' + storageError.message };
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

    // Create database entry with parsed data
    const dbData = {
      name: file.name.replace(/\.[^/.]+$/, ""),
      uploaded_at: new Date().toISOString(),
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

    // Insert the record into Supabase
    const { data: insertedDataRaw, error: insertError } = await supabase
      .from('mmp_files')
      .insert(dbData);
      
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
      return { success: false, error: 'Failed to save MMP data: ' + insertError.message };
    }
    
    // Try to normalize the inserted row (Supabase may return null unless select() is chained)
    let insertedRow: any = Array.isArray(insertedDataRaw) ? insertedDataRaw[0] : insertedDataRaw;
    // If we didn't get the row back, fetch it using a unique key (file_path)
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


// Note: This function assumes the existence of a Supabase table named 'mmp_files' exists.
