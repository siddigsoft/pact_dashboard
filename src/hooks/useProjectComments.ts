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
    setLoading(true);
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
    async (content: string, authorId: string): Promise<boolean> => {
      if (!content.trim()) return false;
      setSubmitting(true);
      const { error } = await supabase.from('project_comments').insert({
        project_id: projectId,
        author_id: authorId,
        content: content.trim(),
      });
      setSubmitting(false);
      if (error) {
        toast({ title: 'Failed to post comment', description: error.message, variant: 'destructive' });
        return false;
      }
      return true;
    },
    [projectId, toast]
  );

  const deleteComment = useCallback(
    async (commentId: string): Promise<boolean> => {
      const { error } = await supabase.from('project_comments').delete().eq('id', commentId);
      if (error) {
        toast({ title: 'Failed to delete comment', description: error.message, variant: 'destructive' });
        return false;
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      return true;
    },
    [toast]
  );

  return { comments, loading, submitting, addComment, deleteComment, refetch: fetchComments };
}
