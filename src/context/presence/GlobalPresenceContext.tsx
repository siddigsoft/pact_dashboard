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

/** Web users join this channel via GlobalPresenceContext */
const WEB_CHANNEL   = 'global-presence';
/** Flutter / APK users join this channel via PresenceService */
const MOBILE_CHANNEL = 'user-call-presence';

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const PRESENCE_HEARTBEAT_MS      = 30_000;         // 30 s

interface GlobalPresenceProviderProps { children: ReactNode; }

export function GlobalPresenceProvider({ children }: GlobalPresenceProviderProps) {
  const { currentUser, authReady } = useUser();
  const [isConnected, setIsConnected]     = useState(false);

  /** Two separate sets — merged into a single onlineUserIds array */
  const webIdsRef    = useRef<Set<string>>(new Set());
  const mobileIdsRef = useRef<Set<string>>(new Set());

  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());

  const webChannelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mobileChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef     = useRef<NodeJS.Timeout | null>(null);
  const activityWriteRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef   = useRef(false);

  /** Recompute the merged set and update state */
  const syncMerged = useCallback(() => {
    setOnlineUserIds(new Set([...webIdsRef.current, ...mobileIdsRef.current]));
  }, []);

  const writeLastActivity = useCallback(async (userId: string) => {
    try {
      await (supabase as any)
        .from('profiles')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', userId);
    } catch { /* non-critical */ }
  }, []);

  const trackPresence = useCallback(() => {
    if (!currentUser?.id || !webChannelRef.current) return;
    webChannelRef.current.track({
      user_id: currentUser.id,
      online_at: new Date().toISOString(),
    });
  }, [currentUser?.id]);

  const isUserOnline = useCallback((userId: string) => {
    return onlineUserIds.has(userId);
  }, [onlineUserIds]);

  useEffect(() => {
    if (!authReady || !currentUser?.id) {
      if (webChannelRef.current)    { supabase.removeChannel(webChannelRef.current);    webChannelRef.current = null; }
      if (mobileChannelRef.current) { supabase.removeChannel(mobileChannelRef.current); mobileChannelRef.current = null; }
      if (heartbeatRef.current)     { clearInterval(heartbeatRef.current);     heartbeatRef.current = null; }
      if (activityWriteRef.current) { clearInterval(activityWriteRef.current); activityWriteRef.current = null; }
      initializedRef.current = false;
      webIdsRef.current = new Set();
      mobileIdsRef.current = new Set();
      setIsConnected(false);
      setOnlineUserIds(new Set());
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    const userId = currentUser.id;
    console.log('[GlobalPresence] Setting up presence for user:', userId);

    /* ── 1. Web channel — we join + track ───────────────────────────── */
    const webChannel = supabase.channel(WEB_CHANNEL, {
      config: { presence: { key: userId } },
    });

    const extractIds = (state: Record<string, any[]>) => {
      const ids = new Set<string>();
      Object.values(state).forEach(presences =>
        presences.forEach((p: any) => { if (p.user_id) ids.add(p.user_id); })
      );
      return ids;
    };

    webChannel
      .on('presence', { event: 'sync' }, () => {
        webIdsRef.current = extractIds(webChannel.presenceState());
        syncMerged();
        console.log('[GlobalPresence] Web synced, online:', webIdsRef.current.size);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        newPresences.forEach((p: any) => { if (p.user_id) webIdsRef.current.add(p.user_id); });
        syncMerged();
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((p: any) => { if (p.user_id) webIdsRef.current.delete(p.user_id); });
        syncMerged();
      })
      .subscribe(async (status) => {
        console.log('[GlobalPresence] Web channel:', status);
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          webChannel.track({ user_id: userId, online_at: new Date().toISOString() });
          await writeLastActivity(userId);
        }
      });

    webChannelRef.current = webChannel;

    /* ── 2. Mobile channel — read-only observer ─────────────────────── */
    const mobileChannel = supabase.channel(MOBILE_CHANNEL);

    mobileChannel
      .on('presence', { event: 'sync' }, () => {
        mobileIdsRef.current = extractIds(mobileChannel.presenceState());
        syncMerged();
        console.log('[GlobalPresence] Mobile synced, online:', mobileIdsRef.current.size);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        newPresences.forEach((p: any) => {
          const id = p.user_id || p.odId;
          if (id) mobileIdsRef.current.add(id);
        });
        syncMerged();
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((p: any) => {
          const id = p.user_id || p.odId;
          if (id) mobileIdsRef.current.delete(id);
        });
        syncMerged();
      })
      .subscribe((status) => {
        console.log('[GlobalPresence] Mobile channel:', status);
      });

    mobileChannelRef.current = mobileChannel;

    /* ── 3. Heartbeat: keep web Presence slot alive ─────────────────── */
    heartbeatRef.current = setInterval(() => {
      webChannelRef.current?.track({ user_id: userId, online_at: new Date().toISOString() });
    }, PRESENCE_HEARTBEAT_MS);

    /* ── 4. Activity write every 5 min ──────────────────────────────── */
    activityWriteRef.current = setInterval(() => {
      writeLastActivity(userId);
    }, ACTIVITY_WRITE_INTERVAL_MS);

    /* ── 5. Visibility change ────────────────────────────────────────── */
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && userId) {
        webChannelRef.current?.track({ user_id: userId, online_at: new Date().toISOString() });
        writeLastActivity(userId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    /* ── 6. Page unload — best-effort final write ───────────────────── */
    const handleUnload = () => {
      const payload = JSON.stringify({ last_activity: new Date().toISOString() });
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
        new Blob([payload], { type: 'application/json' }),
      );
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      console.log('[GlobalPresence] Cleaning up');
      if (webChannelRef.current)    { supabase.removeChannel(webChannelRef.current);    webChannelRef.current = null; }
      if (mobileChannelRef.current) { supabase.removeChannel(mobileChannelRef.current); mobileChannelRef.current = null; }
      if (heartbeatRef.current)     { clearInterval(heartbeatRef.current);     heartbeatRef.current = null; }
      if (activityWriteRef.current) { clearInterval(activityWriteRef.current); activityWriteRef.current = null; }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('beforeunload', handleUnload);
      initializedRef.current = false;
    };
  }, [authReady, currentUser?.id, writeLastActivity, syncMerged]);

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
