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
  mimeType?: string,
  extraTags?: string[],
): Promise<void> {
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
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
    const tags = ['hr', 'profile', ...(extraTags ?? [])];

    const payload: Record<string, unknown> = {
      folder_id: folderId,
      name: fileName,
      description,
      storage_path: storagePath,
      public_url: publicUrl,
      file_size: fileSizeBytes,
      created_by: createdBy,
      last_modified_by: createdBy,
      tags,
      // Required fields (proven by WorkspaceHub's own insert)
      version: 1,
      allow_download: false,
      archived: false,
    };

    // Optional schema-stable fields — add gracefully
    if (mimeType) {
      payload.mime_type  = mimeType;
      payload.extension  = ext;
    }

    await supabase.from('workspace_files').insert(payload);
  }
}

// ── HR document → Workspace sync ─────────────────────────────────────────────

/**
 * Copies all hr_employee_documents for a user into the workspace-files bucket
 * and registers each in workspace_files so they appear in the Workspace Hub folder.
 * Called from syncProfileFolder (and can be called independently after uploads).
 */
export async function syncHrDocsToWorkspace(
  user: { id: string; employeeId?: string | null; name?: string | null },
  empFolderId: string,
): Promise<void> {
  try {
    const { data: hrDocs } = await supabase
      .from('hr_employee_documents')
      .select('id, doc_type, doc_name, file_path, file_size, file_mime')
      .eq('profile_id', user.id);

    if (!hrDocs || hrDocs.length === 0) return;

    // Which paths are already registered?
    const { data: existingFiles } = await supabase
      .from('workspace_files')
      .select('storage_path')
      .eq('folder_id', empFolderId);
    const registeredPaths = new Set((existingFiles || []).map((f: any) => f.storage_path));

    for (const doc of hrDocs) {
      const wsPath = doc.file_path; // same path key, different bucket

      if (registeredPaths.has(wsPath)) continue; // already in workspace — skip entirely

      // Download from staff-contracts
      const { data: blob, error: dlErr } = await supabase.storage
        .from('staff-contracts')
        .download(doc.file_path);
      if (dlErr || !blob) {
        console.warn('[profileFolder] could not download HR doc:', doc.doc_name, dlErr?.message);
        continue;
      }

      // Upload to workspace-files bucket
      const { error: upErr } = await supabase.storage
        .from('workspace-files')
        .upload(wsPath, blob, {
          contentType: doc.file_mime || 'application/octet-stream',
          upsert: true,
        });
      if (upErr) {
        console.warn('[profileFolder] workspace-files upload failed:', doc.doc_name, upErr.message);
        continue;
      }

      // Register in workspace_files table (blob is guaranteed in scope here)
      const docLabel = (doc.doc_type || 'other').replace(/_/g, ' ')
        .replace(/\b\w/g, (c: string) => c.toUpperCase());
      await upsertWorkspaceFile(
        empFolderId,
        doc.doc_name,
        wsPath,
        null,
        doc.file_size ?? blob.size,
        user.id,
        `HR Document — ${docLabel}`,
        doc.file_mime || undefined,
        ['hr-document', doc.doc_type],
      ).catch(e => console.warn('[profileFolder] HR doc register failed:', doc.doc_name, e.message));
      registeredPaths.add(wsPath);
    }
  } catch (e: any) {
    console.warn('[profileFolder] syncHrDocsToWorkspace error:', e.message);
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
    const wsSummaryPath = summaryPath;

    // 1. Generate PDF bytes
    const result = await generateEmployeeCV(user, ctx, { returnBytes: true });
    if (!result) throw new Error('PDF generation returned empty');
    const pdfBytes = result as Uint8Array;

    // 2. Upload PROFILE_SUMMARY.pdf to staff-contracts (for signed URL on profile page)
    const { error: upErr } = await supabase.storage
      .from(PROFILE_BUCKET)
      .upload(summaryPath, pdfBytes, {
        contentType:  'application/pdf',
        upsert:       true,
        cacheControl: '0',
      });
    if (upErr) throw upErr;

    // 3. Upload to workspace-files bucket so Workspace Hub can serve it
    await supabase.storage
      .from('workspace-files')
      .upload(wsSummaryPath, pdfBytes, {
        contentType:  'application/pdf',
        upsert:       true,
        cacheControl: '0',
      });

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

    // 5. Register PROFILE_SUMMARY.pdf in workspace_files
    if (empFolderId) {
      await upsertWorkspaceFile(
        empFolderId,
        'PROFILE_SUMMARY.pdf',
        wsSummaryPath,
        publicUrl,
        pdfBytes.byteLength,
        user.id,
        `Auto-generated profile summary for ${user.name || user.employeeId}`,
        'application/pdf',
        ['auto-generated'],
      ).catch(e => console.warn('[profileFolder] PROFILE_SUMMARY register failed:', e.message));

      // 6. Also sync all HR profile documents into workspace
      await syncHrDocsToWorkspace(user, empFolderId);
    }

    // 7. Persist the folder path in hr_employee_personal
    const { error: dbErr } = await supabase
      .from('hr_employee_personal')
      .update({ profile_folder_path: folderPath })
      .eq('profile_id', user.id);
    if (dbErr) {
      console.warn('[profileFolder] could not persist folder path:', dbErr.message);
    }

    return { folderPath, folderName, error: null };
  } catch (err: any) {
    console.error('[profileFolder] sync error:', err);
    return { folderPath: null, folderName: null, error: err.message ?? 'Unknown error' };
  }
}

/**
 * Lightweight: ensures the Workspace Hub folder hierarchy exists
 * WITHOUT generating a PDF. Called on every profile page load.
 * Also auto-syncs any HR documents not yet in the workspace folder.
 */
export async function ensureWorkspaceHubFolders(
  user: { id: string; employeeId?: string | null; name?: string | null },
): Promise<void> {
  if (!user?.id || !user.employeeId) return;
  try {
    const folderName       = computeFolderName(user);
    const hrFolderId       = await ensureWorkspaceFolder('HR',       null,         user.id);
    const profilesFolderId = await ensureWorkspaceFolder('Profiles', hrFolderId,   user.id);
    const empFolderId      = await ensureWorkspaceFolder(folderName, profilesFolderId, user.id);

    // Auto-sync HR docs that aren't yet in the workspace folder
    // Quick check: compare hr_employee_documents count vs workspace_files count
    const [{ count: hrCount }, { count: wsCount }] = await Promise.all([
      supabase.from('hr_employee_documents').select('id', { count: 'exact', head: true }).eq('profile_id', user.id),
      supabase.from('workspace_files').select('id', { count: 'exact', head: true }).eq('folder_id', empFolderId),
    ]);
    // If workspace has fewer files than HR (ignoring the PROFILE_SUMMARY.pdf), sync them
    if ((hrCount ?? 0) > 0 && (wsCount ?? 0) < (hrCount ?? 0) + 1) {
      await syncHrDocsToWorkspace(user, empFolderId);
    }
  } catch (e: any) {
    console.warn('[profileFolder] ensureWorkspaceHubFolders failed:', e.message);
  }
}

export async function getProfileSummarySignedUrl(folderPath: string): Promise<string | null> {
  try {
    const summaryPath = `${folderPath}/PROFILE_SUMMARY.pdf`;
    const { data, error } = await supabase.storage
      .from(PROFILE_BUCKET)
      .createSignedUrl(summaryPath, 300);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
