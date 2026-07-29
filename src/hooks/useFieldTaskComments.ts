import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { dispatchNotification } from '@/lib/notify';

export interface FieldTaskComment {
  id: string;
  task_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface FieldTaskCommentNotifyContext {
  projectId: string;
  projectName: string;
  taskTitle: string;
  /** Task creator — always emailed on new comments (unless they are the author). */
  createdBy?: string | null;
  assignedTo?: string | null;
  coAssigneeIds?: string[];
}

export function useFieldTaskComments(
  taskId: string | null,
  notifyCtx?: FieldTaskCommentNotifyContext | null,
) {
  const { toast } = useToast();
  const [comments, setComments] = useState<FieldTaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchComments = useCallback(async () => {
    if (!taskId) { setComments([]); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('field_task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (!error && data) setComments(data as FieldTaskComment[]);
    setLoading(false);
  }, [taskId]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  useEffect(() => {
    if (!taskId) return;
    const channel = supabase
      .channel(`ftc_${taskId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'field_task_comments',
        filter: `task_id=eq.${taskId}`,
      }, () => fetchComments())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [taskId, fetchComments]);

  const addComment = useCallback(async (
    body: string,
    authorId: string,
    authorName: string,
  ): Promise<boolean> => {
    if (!taskId || !body.trim()) return false;
    setSubmitting(true);
    const { error } = await supabase.from('field_task_comments').insert({
      task_id: taskId,
      author_id: authorId,
      author_name: authorName || 'Unknown',
      body: body.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast({ title: 'Failed to post comment', description: error.message, variant: 'destructive' });
      return false;
    }

    // Email creator + assignees (exclude the comment author)
    if (notifyCtx?.projectId) {
      const recipients = Array.from(
        new Set(
          [
            notifyCtx.createdBy,
            notifyCtx.assignedTo,
            ...(notifyCtx.coAssigneeIds ?? []),
          ].filter((id): id is string => !!id && id !== authorId),
        ),
      );
      if (recipients.length > 0) {
        const snippet = body.trim().length > 120 ? `${body.trim().slice(0, 117)}…` : body.trim();
        dispatchNotification({
          event: 'project_task_commented',
          recipientIds: recipients,
          titleEn: 'New comment on field task',
          titleAr: 'تعليق جديد على مهمة ميدانية',
          messageEn: `${authorName} commented on "${notifyCtx.taskTitle}" in "${notifyCtx.projectName}": ${snippet}`,
          messageAr: `علّق ${authorName} على "${notifyCtx.taskTitle}" في "${notifyCtx.projectName}": ${snippet}`,
          priority: 'normal',
          entityType: 'project',
          entityId: notifyCtx.projectId,
          actionUrl: `/projects/${notifyCtx.projectId}?tab=field_tasks&task=${taskId}&panel=comments`,
          sendEmail: true,
          triggeredBy: authorId,
          triggeredByName: authorName,
          metadata: {
            task_name: notifyCtx.taskTitle,
            project_name: notifyCtx.projectName,
            actor: authorName,
            comment: snippet,
          },
        }).catch(() => {});
      }
    }

    await fetchComments();
    return true;
  }, [taskId, toast, fetchComments, notifyCtx]);

  const deleteComment = useCallback(async (commentId: string): Promise<boolean> => {
    const { error } = await supabase
      .from('field_task_comments')
      .delete()
      .eq('id', commentId);
    if (error) {
      toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
      return false;
    }
    setComments(prev => prev.filter(c => c.id !== commentId));
    return true;
  }, [toast]);

  return { comments, loading, submitting, addComment, deleteComment, refetch: fetchComments };
}
