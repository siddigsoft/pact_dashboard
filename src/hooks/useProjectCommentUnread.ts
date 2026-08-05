import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

function storageKey(userId: string, projectId: string) {
  return `proj_comment_read_${userId}_${projectId}`;
}

/**
 * Tracks how many project comments have arrived since the current user
 * last viewed the Comments tab.
 *
 * Persistence strategy (layered):
 *   1. localStorage  — read instantly on mount so the badge appears with zero
 *                      latency and clears immediately when the tab is opened.
 *   2. project_comment_reads DB table — authoritative store that survives
 *                      clearing browser storage, device switches, and other browsers.
 *
 * On mount  : use localStorage timestamp immediately, then fetch the DB row
 *             and take whichever timestamp is more recent.
 * markAsRead: write to localStorage first (optimistic, instant badge clear),
 *             then upsert to DB in the background.
 *
 * Only counts comments from *other* users (not the current user).
 */
export function useProjectCommentUnread(
  projectId: string,
  userId: string | undefined,
) {
  const [unreadCount, setUnreadCount] = useState(0);
  // Track the resolved lastRead timestamp (most-recent of localStorage vs DB)
  const lastReadRef = useRef<string | null>(null);

  /* ── helpers ── */
  const localGet = useCallback((): string | null => {
    if (!userId) return null;
    return localStorage.getItem(storageKey(userId, projectId));
  }, [userId, projectId]);

  const localSet = useCallback((iso: string) => {
    if (!userId) return;
    localStorage.setItem(storageKey(userId, projectId), iso);
  }, [userId, projectId]);

  /** Count comments by others posted after `since` (or all if null). */
  const countUnread = useCallback(async (since: string | null) => {
    if (!userId) { setUnreadCount(0); return; }
    let q = supabase
      .from('project_comments')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .neq('author_id', userId);
    if (since) q = q.gt('created_at', since);
    const { count } = await q;
    setUnreadCount(count ?? 0);
  }, [projectId, userId]);

  /** Fetch last_read_at from DB, merge with localStorage, refresh count. */
  const syncFromDb = useCallback(async () => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from('project_comment_reads')
        .select('last_read_at')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

      const dbTs = data?.last_read_at ?? null;
      const lsTs = localGet();

      // Take the more recent of the two
      let best: string | null = null;
      if (dbTs && lsTs) {
        best = dbTs > lsTs ? dbTs : lsTs;
      } else {
        best = dbTs ?? lsTs;
      }

      // Sync localStorage to the DB value if DB is newer
      if (dbTs && (!lsTs || dbTs > lsTs)) {
        localSet(dbTs);
      }

      if (best !== lastReadRef.current) {
        lastReadRef.current = best;
        await countUnread(best);
      }
    } catch {
      // DB unreachable — stay with localStorage value
    }
  }, [projectId, userId, localGet, localSet, countUnread]);

  /* ── mount: instant local read, then authoritative DB sync ── */
  useEffect(() => {
    if (!userId) return;

    // Step 1: instant badge using localStorage (no latency)
    const lsTs = localGet();
    lastReadRef.current = lsTs;
    countUnread(lsTs);

    // Step 2: merge with DB (may update the count if DB is fresher)
    syncFromDb();

    // Step 3: realtime listener for new comments
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
        () => { countUnread(lastReadRef.current); },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [projectId, userId, localGet, countUnread, syncFromDb]);

  /**
   * Call when the user opens the Comments tab.
   * Instantly clears the badge via localStorage, then persists to DB.
   */
  const markAsRead = useCallback(() => {
    if (!userId) return;
    const now = new Date().toISOString();

    // Optimistic: instant clear
    localSet(now);
    lastReadRef.current = now;
    setUnreadCount(0);

    // Durable: upsert to DB (fire-and-forget)
    supabase
      .from('project_comment_reads')
      .upsert(
        { project_id: projectId, user_id: userId, last_read_at: now },
        { onConflict: 'project_id,user_id' },
      )
      .then(({ error }) => {
        if (error) {
          // Non-fatal: localStorage still holds the position
          console.warn('[useProjectCommentUnread] DB upsert failed:', error.message);
        }
      });
  }, [userId, projectId, localSet]);

  return { unreadCount, markAsRead };
}
