import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ProjectDocument {
  id: string;
  project_id: string;
  uploader_id: string;
  label: string;
  file_name: string;
  storage_path: string;
  public_url: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  uploader_name?: string;
}

interface DocumentRow {
  id: string;
  project_id: string;
  uploaded_by: string;
  name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

const BUCKET = 'mmp-files';
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

function storagePathFromPublicUrl(publicUrl: string): string | null {
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(publicUrl.slice(idx + marker.length));
}

const mapRow = (row: DocumentRow): ProjectDocument => ({
  id: row.id,
  project_id: row.project_id,
  uploader_id: row.uploaded_by,
  label: row.name,
  file_name: row.name,
  storage_path: storagePathFromPublicUrl(row.file_url) ?? row.file_url,
  public_url: row.file_url,
  file_size: row.file_size,
  mime_type: row.file_type,
  created_at: row.created_at,
  uploader_name: row.profiles?.full_name ?? 'Unknown',
});

export function useProjectDocuments(projectId: string) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('project_documents')
      .select('id, project_id, uploaded_by, name, file_url, file_type, file_size, created_at, profiles(full_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load documents:', error);
    } else {
      setDocuments((data as DocumentRow[]).map(mapRow));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const uploadDocument = useCallback(
    async (file: File, label: string, uploaderId: string): Promise<boolean> => {
      if (!label.trim()) {
        toast({ title: 'Label required', description: 'Please enter a label for the document.', variant: 'destructive' });
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        toast({ title: 'File too large', description: 'Maximum allowed size is 20 MB.', variant: 'destructive' });
        return false;
      }
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast({ title: 'Unsupported file type', description: 'Allowed: PDF, Word, Excel, and common images.', variant: 'destructive' });
        return false;
      }

      setUploading(true);
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
        const safeFilename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const storagePath = `project-documents/${projectId}/${safeFilename}`;

        const { error: storageError } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, file, { cacheControl: '3600', upsert: false });

        if (storageError) throw storageError;

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

        const { error: dbError } = await supabase.from('project_documents').insert({
          project_id: projectId,
          uploaded_by: uploaderId,
          name: label.trim(),
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
        });

        if (dbError) {
          await supabase.storage.from(BUCKET).remove([storagePath]);
          throw dbError;
        }

        await fetchDocuments();
        toast({ title: 'Document uploaded' });
        return true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        toast({ title: 'Upload failed', description: msg, variant: 'destructive' });
        return false;
      } finally {
        setUploading(false);
      }
    },
    [projectId, toast, fetchDocuments]
  );

  const deleteDocument = useCallback(
    async (doc: ProjectDocument): Promise<boolean> => {
      const storagePath = doc.storage_path.startsWith('project-documents/')
        ? doc.storage_path
        : storagePathFromPublicUrl(doc.public_url);
      if (storagePath) {
        const { error: storageError } = await supabase.storage.from(BUCKET).remove([storagePath]);
        if (storageError) {
          console.warn('Storage delete warning:', storageError.message);
        }
      }
      const { error } = await supabase.from('project_documents').delete().eq('id', doc.id);
      if (error) {
        toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
        return false;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      return true;
    },
    [toast]
  );

  return { documents, loading, uploading, uploadDocument, deleteDocument, refetch: fetchDocuments };
}
