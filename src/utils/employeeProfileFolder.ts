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

// Root path — all employee dossiers live under HR/Profiles/{folderName}/
export const HR_ROOT = 'HR/Profiles';

export function getEmployeeFolderPath(folderName: string): string {
  return `${HR_ROOT}/${folderName}`;
}

export function getSummaryStoragePath(folderName: string): string {
  return `${HR_ROOT}/${folderName}/PROFILE_SUMMARY.pdf`;
}

export function getDocumentStoragePath(folderName: string, docType: string, fileName: string): string {
  const safeFile = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${HR_ROOT}/${folderName}/${docType}_${Date.now()}_${safeFile}`;
}

// ── Workspace Hub folder helpers ──────────────────────────────────────────────

async function ensureWorkspaceFolder(
  name: string,
  parentId: string | null,
  createdBy: string | null,
): Promise<string> {
  // Check if folder already exists under this parent (separate queries to avoid ternary-await issues)
  let existingId: string | null = null;
  if (parentId) {
    const { data } = await supabase
      .from('workspace_folders')
      .select('id')
      .eq('name', name)
      .eq('parent_folder_id', parentId)
      .eq('archived', false)
      .limit(1);
    existingId = data?.[0]?.id ?? null;
  } else {
    const { data } = await supabase
      .from('workspace_folders')
      .select('id')
      .eq('name', name)
      .is('parent_folder_id', null)
      .eq('archived', false)
      .limit(1);
    existingId = data?.[0]?.id ?? null;
  }
  if (existingId) return existingId;

  // Create it — use 'internal' so all staff can see the HR folder hierarchy
  const { data: created, error } = await supabase
    .from('workspace_folders')
    .insert({
      name,
      parent_folder_id: parentId,
      security_level: 'internal',
      created_by: createdBy,
      is_system_folder: false,
      archived: false,
    })
    .select('id')
    .single();
  if (error) throw error;
  return (created as any).id;
}

async function upsertWorkspaceFile(
  folderId: string,
  fileName: string,
  storagePath: string,
  publicUrl: string | null,
  fileSizeBytes: number,
  createdBy: string | null,
  description: string | null,
): Promise<void> {
  // Check for existing file with same storage path
  const { data: existing } = await supabase
    .from('workspace_files')
    .select('id')
    .eq('storage_path', storagePath)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('workspace_files')
      .update({
        name: fileName,
        folder_id: folderId,
        public_url: publicUrl,
        file_size: fileSizeBytes,
        last_modified_by: createdBy,
        updated_at: new Date().toISOString(),
        description,
      })
      .eq('id', existing.id);
  } else {
    await supabase.from('workspace_files').insert({
      folder_id: folderId,
      name: fileName,
      description,
      storage_path: storagePath,
      public_url: publicUrl,
      file_size: fileSizeBytes,
      mime_type: 'application/pdf',
      extension: 'pdf',
      security_level: 'confidential',
      created_by: createdBy,
      last_modified_by: createdBy,
      tags: ['hr', 'profile', 'auto-generated'],
      is_pinned: false,
      archived: false,
    });
  }
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
    const folderPath   = getEmployeeFolderPath(folderName);
    const summaryPath  = getSummaryStoragePath(folderName);
    // Workspace Hub uses its own bucket — same logical path, different bucket
    const wsSummaryPath = summaryPath; // reuse the same path string in workspace-files bucket

    // 1. Generate PDF bytes (does NOT trigger a browser download)
    const result = await generateEmployeeCV(user, ctx, { returnBytes: true });
    if (!result) throw new Error('PDF generation returned empty');
    const pdfBytes = result as Uint8Array;

    // 2. Upload / overwrite PROFILE_SUMMARY.pdf to staff-contracts (for profile page signed URL)
    const { error: upErr } = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(summaryPath, pdfBytes, {
        contentType:  'application/pdf',
        upsert:       true,
        cacheControl: '0',
      });
    if (upErr) throw upErr;

    // 3. Also upload to workspace-files bucket so Workspace Hub can serve it
    await supabase.storage
      .from('workspace-files')
      .upload(wsSummaryPath, pdfBytes, {
        contentType:  'application/pdf',
        upsert:       true,
        cacheControl: '0',
      });
    // (non-fatal if workspace bucket upload fails — profile page still works)

    const { data: urlData } = supabase.storage
      .from('workspace-files')
      .getPublicUrl(wsSummaryPath);
    const publicUrl = urlData?.publicUrl ?? null;

    // 4. Ensure Workspace Hub folder hierarchy: HR > Profiles > {folderName}
    const hrFolderId       = await ensureWorkspaceFolder('HR',       null,         user.id).catch(() => null);
    const profilesFolderId = hrFolderId
      ? await ensureWorkspaceFolder('Profiles', hrFolderId,       user.id).catch(() => null)
      : null;
    const empFolderId      = profilesFolderId
      ? await ensureWorkspaceFolder(folderName, profilesFolderId, user.id).catch(() => null)
      : null;

    // 5. Register / update file entry in workspace_files
    if (empFolderId) {
      await upsertWorkspaceFile(
        empFolderId,
        'PROFILE_SUMMARY.pdf',
        wsSummaryPath,
        publicUrl,
        pdfBytes.byteLength,
        user.id,
        `Auto-generated profile summary for ${user.name || user.employeeId}`,
      ).catch(e => console.warn('[profileFolder] workspace_files upsert failed:', e.message));
    }

    // 6. Persist the folder path in hr_employee_personal so we can display it in UI
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

/**
 * Lightweight: ensures the Workspace Hub folder hierarchy (HR > Profiles > {folderName})
 * exists WITHOUT generating a PDF. Called on every profile page load so even employees
 * whose profileFolderPath was already set before this feature existed get their folder.
 */
export async function ensureWorkspaceHubFolders(
  user: { id: string; employeeId?: string | null; name?: string | null },
): Promise<void> {
  if (!user?.id || !user.employeeId) return;
  try {
    const folderName       = computeFolderName(user);
    const hrFolderId       = await ensureWorkspaceFolder('HR',       null,         user.id);
    const profilesFolderId = await ensureWorkspaceFolder('Profiles', hrFolderId,   user.id);
    await ensureWorkspaceFolder(folderName, profilesFolderId, user.id);
  } catch (e: any) {
    console.warn('[profileFolder] ensureWorkspaceHubFolders failed:', e.message);
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
