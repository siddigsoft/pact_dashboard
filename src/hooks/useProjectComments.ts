import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ProjectComment {
  id: string;
  project_id: string;
  author_id: string;
  content: string;
  created_at: string;
  author_name?: string;
  optimistic?: boolean;
}

interface CommentRow {
  id: string;
  project_id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles: { full_name: string | null } | null;
}

export function useProjectComments(projectId: string) {
  const { toast } = useToast();
  const [comments, setComments] = useState<ProjectComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const mapRow = (row: CommentRow): ProjectComment => ({
    id: row.id,
    project_id: row.project_id,
    author_id: row.author_id,
    content: row.content,
    created_at: row.created_at,
    author_name: row.profiles?.full_name ?? 'Unknown User',
  });

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from('project_comments')
      .select('id, project_id, author_id, content, created_at, profiles(full_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to load comments:', error);
    } else {
      setComments((data as CommentRow[]).map(mapRow));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    fetchComments();

    const channel = supabase
      .channel(`project_comments_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'project_comments',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, fetchComments]);

  const addComment = useCallback(
    async (content: string, authorId: string, authorName?: string): Promise<boolean> => {
      if (!content.trim()) return false;
      setSubmitting(true);

      // Optimistic insert
      const optimisticId = `optimistic_${Date.now()}`;
      const optimisticComment: ProjectComment = {
        id: optimisticId,
        project_id: projectId,
        author_id: authorId,
        content: content.trim(),
        created_at: new Date().toISOString(),
        author_name: authorName ?? 'You',
        optimistic: true,
      };
      setComments((prev) => [optimisticComment, ...prev]);

      const { error } = await supabase.from('project_comments').insert({
        project_id: projectId,
        author_id: authorId,
        content: content.trim(),
      });

      setSubmitting(false);

      if (error) {
        // Rollback optimistic insert
        setComments((prev) => prev.filter((c) => c.id !== optimisticId));
        toast({ title: 'Failed to post comment', description: error.message, variant: 'destructive' });
        return false;
      }

      // The Realtime subscription will fire fetchComments() to replace the optimistic row with the real one.
      // Ensure no duplicate by removing the optimistic entry now (fetchComments replaces it).
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      await fetchComments();
      return true;
    },
    [projectId, toast, fetchComments]
  );

  const deleteComment = useCallback(
    async (commentId: string): Promise<boolean> => {
      // Optimistic delete
      setComments((prev) => prev.filter((c) => c.id !== commentId));

      const { error } = await supabase.from('project_comments').delete().eq('id', commentId);
      if (error) {
        // Rollback: re-fetch to restore the deleted item
        fetchComments();
        toast({ title: 'Failed to delete comment', description: error.message, variant: 'destructive' });
        return false;
      }
      return true;
    },
    [toast, fetchComments]
  );

  return { comments, loading, submitting, addComment, deleteComment, refetch: fetchComments };
}
