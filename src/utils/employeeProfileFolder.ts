import { supabase } from '@/integrations/supabase/client';
import { generateEmployeeCV, type CVContext } from './employeeCvExport';

export const PROFILE_BUCKET = 'staff-contracts';

export function computeFolderName(
  user: { employeeId?: string | null; name?: string | null },
): string {
  const empId = (user.employeeId || 'NOID').replace(/[^a-zA-Z0-9]/g, '_');
  const parts = (user.name || 'Unknown Employee').trim().split(/\s+/);
  const first = parts[0] || 'Unknown';
  const last  = parts.length > 1 ? parts[parts.length - 1] : '';
  const s = (v: string) => v.replace(/[^a-zA-Z0-9]/g, '_');
  return last ? `${empId}_${s(first)}_${s(last)}` : `${empId}_${s(first)}`;
}

export function getSummaryStoragePath(folderName: string): string {
  return `profiles/${folderName}/PROFILE_SUMMARY.pdf`;
}

export async function syncProfileFolder(
  user: any,
  ctx: CVContext,
): Promise<{ folderPath: string | null; folderName: string | null; error: string | null }> {
  try {
    if (!user?.id) {
      return { folderPath: null, folderName: null, error: 'No user ID' };
    }
    if (!user.employeeId) {
      return { folderPath: null, folderName: null, error: 'Employee ID not assigned yet — set one first' };
    }

    const folderName   = computeFolderName(user);
    const folderPath   = `profiles/${folderName}`;
    const summaryPath  = getSummaryStoragePath(folderName);

    // 1. Generate PDF bytes (does NOT trigger a browser download)
    const result = await generateEmployeeCV(user, ctx, { returnBytes: true });
    if (!result) throw new Error('PDF generation returned empty');
    const pdfBytes = result as Uint8Array;

    // 2. Upload / overwrite PROFILE_SUMMARY.pdf — upsert: true so it's always replaced
    const { error: upErr } = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(summaryPath, pdfBytes, {
        contentType:  'application/pdf',
        upsert:       true,
        cacheControl: '0',
      });
    if (upErr) throw upErr;

    // 3. Persist the folder path in hr_employee_personal so we can display it in UI
    const { error: dbErr } = await supabase
      .from('hr_employee_personal')
      .update({ profile_folder_path: folderPath })
      .eq('profile_id', user.id);
    if (dbErr) {
      // Non-fatal — storage file was written, only the DB record is missing
      console.warn('[profileFolder] could not persist folder path:', dbErr.message);
    }

    return { folderPath, folderName, error: null };
  } catch (err: any) {
    console.error('[profileFolder] sync error:', err);
    return { folderPath: null, folderName: null, error: err.message ?? 'Unknown error' };
  }
}

export async function getProfileSummarySignedUrl(folderPath: string): Promise<string | null> {
  try {
    const summaryPath = `${folderPath}/PROFILE_SUMMARY.pdf`;
    const { data, error } = await supabase.storage
      .from(PROFILE_BUCKET)
      .createSignedUrl(summaryPath, 300); // 5-minute link
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
