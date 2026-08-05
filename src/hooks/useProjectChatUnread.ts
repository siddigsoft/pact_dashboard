import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChatService } from '@/services/ChatService';

function storageKey(userId: string, projectId: string) {
  return `proj_chat_seen_${userId}_${projectId}`;
}

/**
 * Tracks how many project chat messages have arrived since the current user
 * last opened the Team Chat drawer for this project.
 *
 * Persistence strategy:
 *   localStorage — instant badge on mount; cleared immediately when drawer opens.
 *
 * Only counts messages from *other* users (not the current user's own messages).
 *
 * Usage:
 *   const { unreadCount, markAsRead } = useProjectChatUnread(projectId, userId);
 *   - Render `unreadCount` as a badge on the Team Chat button.
 *   - Call `markAsRead()` when the drawer is opened.
 */
export function useProjectChatUnread(
  projectId: string,
  userId: string | undefined,
) {
  const [unreadCount, setUnreadCount] = useState(0);
  const chatIdRef = useRef<string | null>(null);
  const lastSeenRef = useRef<string | null>(null);

  const localGet = useCallback((): string | null => {
    if (!userId) return null;
    return localStorage.getItem(storageKey(userId, projectId));
  }, [userId, projectId]);

  const localSet = useCallback((iso: string) => {
    if (!userId) return;
    localStorage.setItem(storageKey(userId, projectId), iso);
  }, [userId, projectId]);

  /** Count messages from others in the chat room posted after `since`. */
  const countUnread = useCallback(async (chatId: string, since: string | null) => {
    if (!userId) { setUnreadCount(0); return; }
    let q = supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('chat_id', chatId)
      .neq('sender_id', userId);
    if (since) q = q.gt('created_at', since);
    const { count } = await q;
    setUnreadCount(count ?? 0);
  }, [userId]);

  useEffect(() => {
    if (!userId || !projectId) return;

    let alive = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      // Step 1: resolve the chat room ID
      const chat = await ChatService.getProjectChat(projectId);
      if (!alive || !chat) return;

      chatIdRef.current = chat.id;

      // Step 2: count unread using localStorage timestamp (instant)
      const since = localGet();
      lastSeenRef.current = since;
      await countUnread(chat.id, since);

      if (!alive) return;

      // Step 3: realtime subscription for new messages
      channel = supabase
        .channel(`proj_chat_unread_${projectId}_${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'chat_messages',
            filter: `chat_id=eq.${chat.id}`,
          },
          () => {
            if (chatIdRef.current) {
              countUnread(chatIdRef.current, lastSeenRef.current);
            }
          },
        )
        .subscribe();
    }

    init();

    return () => {
      alive = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, [projectId, userId, localGet, countUnread]);

  /**
   * Call when the user opens the Team Chat drawer.
   * Instantly clears the badge via localStorage.
   */
  const markAsRead = useCallback(() => {
    if (!userId) return;
    const now = new Date().toISOString();
    localSet(now);
    lastSeenRef.current = now;
    setUnreadCount(0);
  }, [userId, localSet]);

  return { unreadCount, markAsRead };
}
