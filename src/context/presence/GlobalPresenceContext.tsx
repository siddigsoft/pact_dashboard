import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';

interface GlobalPresenceContextValue {
  isConnected: boolean;
  onlineUserIds: string[];
  isUserOnline: (userId: string) => boolean;
  trackPresence: () => void;
}

const GlobalPresenceContext = createContext<GlobalPresenceContextValue>({
  isConnected: false,
  onlineUserIds: [],
  isUserOnline: () => false,
  trackPresence: () => {},
});

export const useGlobalPresence = () => useContext(GlobalPresenceContext);

const GLOBAL_PRESENCE_CHANNEL = 'global-presence';
/** Write last_activity to DB every 5 minutes while the tab is active */
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;
/** Supabase Presence heartbeat — keeps the WebSocket slot alive */
const PRESENCE_HEARTBEAT_MS = 30_000;

interface GlobalPresenceProviderProps {
  children: ReactNode;
}

export function GlobalPresenceProvider({ children }: GlobalPresenceProviderProps) {
  const { currentUser, authReady } = useUser();
  const [isConnected, setIsConnected]       = useState(false);
  const [onlineUserIds, setOnlineUserIds]   = useState<Set<string>>(new Set());

  const channelRef        = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef      = useRef<NodeJS.Timeout | null>(null);
  const activityWriteRef  = useRef<NodeJS.Timeout | null>(null);
  const initializedRef    = useRef(false);

  // ── Write last_activity timestamp to profiles table ──────────────────
  const writeLastActivity = useCallback(async (userId: string) => {
    try {
      await supabase
        .from('profiles')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', userId);
    } catch {
      // Non-critical — ignore errors silently
    }
  }, []);

  const trackPresence = useCallback(() => {
    if (!currentUser?.id || !channelRef.current) return;
    channelRef.current.track({
      user_id: currentUser.id,
      online_at: new Date().toISOString(),
    });
  }, [currentUser?.id]);

  const isUserOnline = useCallback((userId: string) => {
    return onlineUserIds.has(userId);
  }, [onlineUserIds]);

  useEffect(() => {
    if (!authReady || !currentUser?.id) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (heartbeatRef.current)     { clearInterval(heartbeatRef.current);     heartbeatRef.current = null; }
      if (activityWriteRef.current) { clearInterval(activityWriteRef.current); activityWriteRef.current = null; }
      initializedRef.current = false;
      setIsConnected(false);
      setOnlineUserIds(new Set());
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    const userId = currentUser.id;
    console.log('[GlobalPresence] Setting up presence for user:', userId);

    const channel = supabase.channel(GLOBAL_PRESENCE_CHANNEL, {
      config: { presence: { key: userId } },
    });

    channel
      // ── Sync: full reconciliation from server ──
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        Object.values(state).forEach(presences => {
          presences.forEach((p: any) => {
            if (p.user_id) ids.add(p.user_id);
          });
        });
        setOnlineUserIds(ids);
        console.log('[GlobalPresence] Synced, online users:', ids.size);
      })
      // ── Join: someone came online — instant ──
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        newPresences.forEach((p: any) => {
          if (p.user_id) {
            setOnlineUserIds(prev => new Set([...prev, p.user_id]));
            console.log('[GlobalPresence] User joined:', p.user_id);
          }
        });
      })
      // ── Leave: someone went offline — instant ──
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((p: any) => {
          if (p.user_id) {
            setOnlineUserIds(prev => {
              const next = new Set(prev);
              next.delete(p.user_id);
              return next;
            });
            console.log('[GlobalPresence] User left:', p.user_id);
          }
        });
      })
      .subscribe(async (status) => {
        console.log('[GlobalPresence] Channel status:', status);
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          // Track self on Supabase Presence channel
          channel.track({ user_id: userId, online_at: new Date().toISOString() });
          // Write last_activity immediately on connect
          await writeLastActivity(userId);
        }
      });

    channelRef.current = channel;

    // ── Heartbeat: keep Supabase Presence slot alive (30 s) ──
    heartbeatRef.current = setInterval(() => {
      if (channelRef.current && userId) {
        channelRef.current.track({
          user_id: userId,
          online_at: new Date().toISOString(),
        });
      }
    }, PRESENCE_HEARTBEAT_MS);

    // ── Activity write: persist last_activity to DB every 5 minutes ──
    activityWriteRef.current = setInterval(() => {
      writeLastActivity(userId);
    }, ACTIVITY_WRITE_INTERVAL_MS);

    // ── Visibility change: update activity when tab regains focus ──
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && userId) {
        // Re-track presence in case WS reconnected
        channelRef.current?.track({ user_id: userId, online_at: new Date().toISOString() });
        writeLastActivity(userId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // ── Page unload: best-effort final activity write ──
    const handleUnload = () => {
      // sendBeacon is fire-and-forget — works even during page unload
      const payload = JSON.stringify({ last_activity: new Date().toISOString() });
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
        new Blob([payload], { type: 'application/json' }),
      );
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      console.log('[GlobalPresence] Cleaning up');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (heartbeatRef.current)     { clearInterval(heartbeatRef.current);     heartbeatRef.current = null; }
      if (activityWriteRef.current) { clearInterval(activityWriteRef.current); activityWriteRef.current = null; }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      initializedRef.current = false;
    };
  }, [authReady, currentUser?.id, writeLastActivity]);

  return (
    <GlobalPresenceContext.Provider value={{
      isConnected,
      onlineUserIds: Array.from(onlineUserIds),
      isUserOnline,
      trackPresence,
    }}>
      {children}
    </GlobalPresenceContext.Provider>
  );
}
