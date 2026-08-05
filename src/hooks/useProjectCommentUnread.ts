import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

function storageKey(userId: string, projectId: string) {
  return `proj_comment_read_${userId}_${projectId}`;
}

/**
 * Tracks how many project comments have arrived since the current user
 * last viewed the Comments tab. Uses localStorage for the "last read"
 * timestamp so it persists across page reloads without a DB table.
 *
 * Only counts comments from *other* users (i.e. not the current user).
 */
export function useProjectCommentUnread(
  projectId: string,
  userId: string | undefined,
) {
  const [unreadCount, setUnreadCount] = useState(0);

  const getLastRead = useCallback((): string | null => {
    if (!userId) return null;
    return localStorage.getItem(storageKey(userId, projectId));
  }, [userId, projectId]);

  const fetchUnread = useCallback(async () => {
    if (!userId) {
      setUnreadCount(0);
      return;
    }
    const lastRead = getLastRead();

    // Count comments by others, posted after lastRead (or all if never read)
    let query = supabase
      .from('project_comments')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .neq('author_id', userId);

    if (lastRead) {
      query = query.gt('created_at', lastRead);
    }

    const { count } = await query;
    setUnreadCount(count ?? 0);
  }, [projectId, userId, getLastRead]);

  // Initial fetch + realtime listener
  useEffect(() => {
    if (!userId) return;
    fetchUnread();

    const channel = supabase
      .channel(`proj_comment_unread_${projectId}_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'project_comments',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          fetchUnread();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, userId, fetchUnread]);

  /** Call when the user opens the Comments tab — saves current time and resets count. */
  const markAsRead = useCallback(() => {
    if (!userId) return;
    localStorage.setItem(storageKey(userId, projectId), new Date().toISOString());
    setUnreadCount(0);
  }, [userId, projectId]);

  return { unreadCount, markAsRead };
}
