import { supabase } from '@/integrations/supabase/client';

const WORKSPACE_BUCKET = 'workspace-files';
const PROJECTS_ROOT = 'Projects';

function sanitizeFolderName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'Untitled';
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function ensureWorkspaceFolder(
  name: string,
  parentId: string | null,
  createdBy: string | null,
): Promise<string> {
  const safeName = sanitizeFolderName(name);
  let existingId: string | null = null;

  if (parentId) {
    const { data } = await supabase
      .from('workspace_folders')
      .select('id, name')
      .ilike('name', safeName)
      .eq('parent_folder_id', parentId)
      .eq('archived', false)
      .limit(1);
    existingId = data?.[0]?.id ?? null;
    if (existingId && data?.[0]?.name !== safeName) {
      await supabase.from('workspace_folders').update({ name: safeName }).eq('id', existingId);
    }
  } else {
    const { data } = await supabase
      .from('workspace_folders')
      .select('id, name')
      .ilike('name', safeName)
      .is('parent_folder_id', null)
      .eq('archived', false)
      .limit(1);
    existingId = data?.[0]?.id ?? null;
    if (existingId && data?.[0]?.name !== safeName) {
      await supabase.from('workspace_folders').update({ name: safeName }).eq('id', existingId);
    }
  }

  if (existingId) return existingId;

  const { data: created, error } = await supabase
    .from('workspace_folders')
    .insert({
      name: safeName,
      parent_folder_id: parentId,
      security_level: 'internal',
      created_by: createdBy,
      is_system_folder: false,
      archived: false,
    })
    .select('id')
    .single();

  if (error) throw error;
  return (created as { id: string }).id;
}

async function upsertWorkspaceFile(params: {
  folderId: string;
  fileName: string;
  storagePath: string;
  publicUrl: string | null;
  fileSize: number;
  mimeType: string | null;
  createdBy: string;
  description: string | null;
}): Promise<void> {
  const { data: existing } = await supabase
    .from('workspace_files')
    .select('id')
    .eq('storage_path', params.storagePath)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from('workspace_files')
      .update({
        name: params.fileName,
        folder_id: params.folderId,
        public_url: params.publicUrl,
        file_size: params.fileSize,
        last_modified_by: params.createdBy,
        updated_at: new Date().toISOString(),
        description: params.description,
      })
      .eq('id', existing.id);
    return;
  }

  const ext = params.fileName.includes('.')
    ? params.fileName.split('.').pop()!.toLowerCase()
    : '';

  const { error } = await supabase.from('workspace_files').insert({
    folder_id: params.folderId,
    name: params.fileName,
    description: params.description,
    storage_path: params.storagePath,
    public_url: params.publicUrl,
    file_size: params.fileSize,
    mime_type: params.mimeType,
    extension: ext || null,
    created_by: params.createdBy,
    last_modified_by: params.createdBy,
    tags: ['project', 'project-document'],
    version: 1,
    allow_download: true,
    archived: false,
    security_level: 'internal',
  });

  if (error) throw error;
}

/**
 * Mirrors a project document into Workspace Hub:
 * Projects / {Project Name} / {Uploader Name} / file
 * Non-throwing callers should wrap; this throws on hard failures.
 */
export async function mirrorProjectDocumentToWorkspace(input: {
  projectId: string;
  uploaderId: string;
  file: File;
  label: string;
}): Promise<void> {
  const [{ data: project }, { data: profile }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('id', input.projectId).maybeSingle(),
    supabase.from('profiles').select('id, full_name').eq('id', input.uploaderId).maybeSingle(),
  ]);

  const projectName = (project as { name?: string } | null)?.name?.trim() || `Project ${input.projectId.slice(0, 8)}`;
  const uploaderName =
    (profile as { full_name?: string | null } | null)?.full_name?.trim() || 'Unknown Uploader';

  const projectsRootId = await ensureWorkspaceFolder(PROJECTS_ROOT, null, input.uploaderId);
  const projectFolderId = await ensureWorkspaceFolder(projectName, projectsRootId, input.uploaderId);
  const uploaderFolderId = await ensureWorkspaceFolder(uploaderName, projectFolderId, input.uploaderId);

  const ext = input.file.name.includes('.')
    ? input.file.name.split('.').pop()!.toLowerCase()
    : 'bin';
  const displayName = input.label.trim().includes('.')
    ? sanitizeFileName(input.label.trim())
    : `${sanitizeFileName(input.label.trim())}.${ext}`;

  const storagePath = `Projects/${input.projectId}/${input.uploaderId}/${Date.now()}_${sanitizeFileName(input.file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from(WORKSPACE_BUCKET)
    .upload(storagePath, input.file, {
      contentType: input.file.type || 'application/octet-stream',
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(WORKSPACE_BUCKET).getPublicUrl(storagePath);

  try {
    await upsertWorkspaceFile({
      folderId: uploaderFolderId,
      fileName: displayName,
      storagePath,
      publicUrl: urlData?.publicUrl ?? null,
      fileSize: input.file.size,
      mimeType: input.file.type || null,
      createdBy: input.uploaderId,
      description: `Project document — ${projectName}`,
    });
  } catch (err) {
    await supabase.storage.from(WORKSPACE_BUCKET).remove([storagePath]).catch(() => undefined);
    throw err;
  }
}
