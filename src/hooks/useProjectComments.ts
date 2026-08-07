import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ProjectComment {
  id: string;
  project_id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_id?: string | null;
  author_name?: string;
  optimistic?: boolean;
}

interface CommentRow {
  id: string;
  project_id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  // PostgREST may type a many-to-one embed as an object or a 1-element array.
  profiles: { full_name: string | null } | { full_name: string | null }[] | null;
}

function authorNameFromRow(profiles: CommentRow['profiles']): string {
  if (!profiles) return 'Unknown User';
  const profile = Array.isArray(profiles) ? profiles[0] : profiles;
  return profile?.full_name ?? 'Unknown User';
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
    parent_id: row.parent_id ?? null,
    author_name: authorNameFromRow(row.profiles),
  });

  const fetchComments = useCallback(async () => {
    // Try selecting parent_id (requires migration 20260805_project_comments_replies).
    // Fall back to query without parent_id if the column doesn't exist yet.
    let data: CommentRow[] | null = null;

    const withParent = await supabase
      .from('project_comments')
      .select('id, project_id, author_id, content, created_at, parent_id, profiles!project_comments_author_id_fkey(full_name)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true });

    if (withParent.error?.message?.includes('parent_id') || withParent.error?.code === '42703') {
      // Column not yet added — fall back without parent_id (replies disabled until migration runs)
      const fallback = await supabase
        .from('project_comments')
        .select('id, project_id, author_id, content, created_at, profiles!project_comments_author_id_fkey(full_name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });

      if (fallback.error) {
        console.error('Failed to load comments:', fallback.error);
        toast({ title: 'Could not load comments', description: fallback.error.message, variant: 'destructive' });
        setLoading(false);
        return;
      }
      data = ((fallback.data ?? []) as any[]).map(r => ({ ...r, parent_id: null }));
    } else if (withParent.error) {
      console.error('Failed to load comments:', withParent.error);
      const isRlsRecursion =
        withParent.error.message?.includes('infinite recursion') ||
        withParent.error.message?.includes('project_team_members');
      toast({
        title: 'Could not load comments',
        description: isRlsRecursion
          ? 'A database policy fix is required. Ask your admin to run migration 20260807_fix_ptm_rls_recursion_v3.sql in Supabase Studio.'
          : withParent.error.message,
        variant: 'destructive',
      });
      setLoading(false);
      return;
    } else {
      data = (withParent.data ?? []) as CommentRow[];
    }

    setComments(data.map(mapRow));
    setLoading(false);
  }, [projectId, toast]);

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
    async (
      content: string,
      authorId: string,
      authorName?: string,
      parentId?: string | null,
    ): Promise<boolean> => {
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
        parent_id: parentId ?? null,
        author_name: authorName ?? 'You',
        optimistic: true,
      };
      setComments((prev) => [...prev, optimisticComment]);

      const { error } = await supabase.from('project_comments').insert({
        project_id: projectId,
        author_id: authorId,
        user_id: authorId,
        content: content.trim(),
        ...(parentId ? { parent_id: parentId } : {}),
      });

      setSubmitting(false);

      if (error) {
        // Rollback optimistic insert
        setComments((prev) => prev.filter((c) => c.id !== optimisticId));
        toast({ title: 'Failed to post comment', description: error.message, variant: 'destructive' });
        return false;
      }

      // The Realtime subscription will fire fetchComments() to replace the optimistic row.
      setComments((prev) => prev.filter((c) => c.id !== optimisticId));
      await fetchComments();
      return true;
    },
    [projectId, toast, fetchComments]
  );

  const deleteComment = useCallback(
    async (commentId: string): Promise<boolean> => {
      // Optimistic delete (also removes replies if cascade is set up in DB)
      setComments((prev) => prev.filter((c) => c.id !== commentId && c.parent_id !== commentId));

      const { error } = await supabase.from('project_comments').delete().eq('id', commentId);
      if (error) {
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
