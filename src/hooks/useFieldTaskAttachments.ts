import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { dispatchNotification } from '@/lib/notify';

const BUCKET = 'project-attachments';
const MAX_BYTES = 20 * 1024 * 1024;

export interface FieldTaskAttachment {
  id: string;
  taskId: string;
  projectId: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface FieldTaskAttachmentNotifyContext {
  projectId: string;
  projectName: string;
  taskTitle: string;
  createdBy?: string | null;
  assignedTo?: string | null;
  coAssigneeIds?: string[];
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

export function useFieldTaskAttachments(
  taskId: string | null,
  projectId: string,
  notifyCtx?: FieldTaskAttachmentNotifyContext | null,
) {
  const { toast } = useToast();
  const [attachments, setAttachments] = useState<FieldTaskAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchAttachments = useCallback(async () => {
    if (!taskId) {
      setAttachments([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('project_field_task_attachments')
      .select('id, task_id, project_id, file_name, file_url, file_type, file_size, uploaded_by, created_at, profiles:uploaded_by(full_name)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setAttachments(
        (data as any[]).map(r => ({
          id: r.id,
          taskId: r.task_id,
          projectId: r.project_id,
          fileName: r.file_name,
          fileUrl: r.file_url,
          fileType: r.file_type,
          fileSize: r.file_size,
          uploadedBy: r.uploaded_by,
          uploadedByName: r.profiles?.full_name ?? null,
          createdAt: r.created_at,
        })),
      );
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  useEffect(() => {
    if (!taskId) return;
    const channel = supabase
      .channel(`pfta_${taskId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_field_task_attachments',
          filter: `task_id=eq.${taskId}`,
        },
        () => fetchAttachments(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, fetchAttachments]);

  const uploadFile = useCallback(
    async (file: File, userId?: string, userName?: string): Promise<boolean> => {
      if (!taskId || !projectId) return false;
      if (file.size > MAX_BYTES) {
        toast({
          title: 'File too large',
          description: `${file.name} exceeds the 20 MB limit`,
          variant: 'destructive',
        });
        return false;
      }

      setUploading(true);
      try {
        const safeName = file.name.replace(/\s+/g, '_');
        const path = `field-tasks/${projectId}/${taskId}/${Date.now()}_${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const ext = file.name.split('.').pop() ?? 'bin';

        const { error: dbError } = await supabase.from('project_field_task_attachments').insert({
          task_id: taskId,
          project_id: projectId,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type || ext,
          file_size: file.size,
          uploaded_by: userId ?? null,
        });
        if (dbError) throw dbError;

        if (notifyCtx?.projectId && userId) {
          const recipients = Array.from(
            new Set(
              [
                notifyCtx.createdBy,
                notifyCtx.assignedTo,
                ...(notifyCtx.coAssigneeIds ?? []),
              ].filter((id): id is string => !!id && id !== userId),
            ),
          );
          if (recipients.length > 0) {
            const actor = userName || 'Someone';
            dispatchNotification({
              event: 'project_task_file_uploaded',
              recipientIds: recipients,
              titleEn: 'File uploaded to field task',
              titleAr: 'تم رفع ملف إلى مهمة ميدانية',
              messageEn: `${actor} uploaded "${file.name}" to "${notifyCtx.taskTitle}" in "${notifyCtx.projectName}"`,
              messageAr: `قام ${actor} برفع "${file.name}" إلى "${notifyCtx.taskTitle}" في "${notifyCtx.projectName}"`,
              priority: 'normal',
              entityType: 'project',
              entityId: notifyCtx.projectId,
              actionUrl: `/projects/${notifyCtx.projectId}?tab=field_tasks&task=${taskId}&panel=files`,
              sendEmail: true,
              triggeredBy: userId,
              triggeredByName: actor,
              metadata: {
                task_name: notifyCtx.taskTitle,
                project_name: notifyCtx.projectName,
                actor,
                file_name: file.name,
                file_url: urlData.publicUrl,
              },
            }).catch(() => {});
          }
        }

        await fetchAttachments();
        return true;
      } catch (err: any) {
        toast({
          title: 'Upload failed',
          description: err?.message ?? 'Could not upload file',
          variant: 'destructive',
        });
        return false;
      } finally {
        setUploading(false);
      }
    },
    [taskId, projectId, toast, fetchAttachments, notifyCtx],
  );

  const deleteAttachment = useCallback(
    async (id: string): Promise<boolean> => {
      const attachment = attachments.find(a => a.id === id);
      setDeletingId(id);
      try {
        if (attachment) {
          const storagePath = storagePathFromUrl(attachment.fileUrl);
          if (storagePath) {
            await supabase.storage.from(BUCKET).remove([storagePath]);
          }
        }
        const { error } = await supabase
          .from('project_field_task_attachments')
          .delete()
          .eq('id', id);
        if (error) throw error;
        setAttachments(prev => prev.filter(a => a.id !== id));
        return true;
      } catch (err: any) {
        toast({
          title: 'Delete failed',
          description: err?.message ?? 'Could not remove attachment',
          variant: 'destructive',
        });
        return false;
      } finally {
        setDeletingId(null);
      }
    },
    [attachments, toast],
  );

  return {
    attachments,
    loading,
    uploading,
    deletingId,
    uploadFile,
    deleteAttachment,
    refetch: fetchAttachments,
  };
}
