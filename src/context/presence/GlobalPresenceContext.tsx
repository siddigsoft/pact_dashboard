import { createContext, useContext, useEffect, useRef, useCallback, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';

export type PresenceSource = 'web' | 'mobile';

interface GlobalPresenceContextValue {
  isConnected: boolean;
  onlineUserIds: string[];
  webUserIds: string[];
  mobileUserIds: string[];
  isUserOnline: (userId: string) => boolean;
  getUserSources: (userId: string) => PresenceSource[];
  trackPresence: () => void;
}

const GlobalPresenceContext = createContext<GlobalPresenceContextValue>({
  isConnected: false,
  onlineUserIds: [],
  webUserIds: [],
  mobileUserIds: [],
  isUserOnline: () => false,
  getUserSources: () => [],
  trackPresence: () => {},
});

export const useGlobalPresence = () => useContext(GlobalPresenceContext);

/** Web users join this channel via GlobalPresenceContext */
const WEB_CHANNEL   = 'global-presence';
/** Flutter / APK users join this channel via PresenceService */
const MOBILE_CHANNEL = 'user-call-presence';

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000; // 5 min
const PRESENCE_HEARTBEAT_MS      = 30_000;         // 30 s
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface PresencePayload {
  user_id?: string;
  odId?: string;
  userId?: string;
  payload?: {
    user_id?: string;
    odId?: string;
    userId?: string;
  };
}

function presenceUserId(entry?: PresencePayload | null, key?: string): string | undefined {
  const fromPayload =
    entry?.user_id ||
    entry?.odId ||
    entry?.userId ||
    entry?.payload?.user_id ||
    entry?.payload?.odId ||
    entry?.payload?.userId;
  if (typeof fromPayload === 'string' && fromPayload) return fromPayload;
  if (typeof key === 'string' && UUID_RE.test(key)) return key;
  return undefined;
}

function extractIds(state: Record<string, PresencePayload[]>): Set<string> {
  const ids = new Set<string>();
  Object.entries(state || {}).forEach(([key, presences]) => {
    const list = Array.isArray(presences) ? presences : [];
    if (list.length === 0) {
      const id = presenceUserId(undefined, key);
      if (id) ids.add(id);
      return;
    }
    list.forEach((p) => {
      const id = presenceUserId(p, key);
      if (id) ids.add(id);
    });
  });
  return ids;
}

interface GlobalPresenceProviderProps { children: ReactNode; }

export function GlobalPresenceProvider({ children }: GlobalPresenceProviderProps) {
  const { currentUser, authReady } = useUser();
  const [isConnected, setIsConnected]     = useState(false);

  /** Two separate sets — merged into a single onlineUserIds array */
  const webIdsRef    = useRef<Set<string>>(new Set());
  const mobileIdsRef = useRef<Set<string>>(new Set());

  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [webUserIds, setWebUserIds]       = useState<string[]>([]);
  const [mobileUserIds, setMobileUserIds] = useState<string[]>([]);

  const webChannelRef    = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const mobileChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef     = useRef<NodeJS.Timeout | null>(null);
  const activityWriteRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef   = useRef(false);

  /** Recompute the merged set and update state */
  const syncMerged = useCallback(() => {
    const web = Array.from(webIdsRef.current);
    const mobile = Array.from(mobileIdsRef.current);
    setWebUserIds(web);
    setMobileUserIds(mobile);
    setOnlineUserIds(new Set([...web, ...mobile]));
  }, []);

  const writeLastActivity = useCallback(async (userId: string) => {
    try {
      await supabase
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
      source: 'web',
    });
  }, [currentUser?.id]);

  const isUserOnline = useCallback((userId: string) => {
    return onlineUserIds.has(userId);
  }, [onlineUserIds]);

  const getUserSources = useCallback((userId: string): PresenceSource[] => {
    const sources: PresenceSource[] = [];
    if (webUserIds.includes(userId)) sources.push('web');
    if (mobileUserIds.includes(userId)) sources.push('mobile');
    return sources;
  }, [webUserIds, mobileUserIds]);

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
      setWebUserIds([]);
      setMobileUserIds([]);
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

    webChannel
      .on('presence', { event: 'sync' }, () => {
        webIdsRef.current = extractIds(webChannel.presenceState());
        syncMerged();
        console.log('[GlobalPresence] Web synced, online:', webIdsRef.current.size);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        newPresences.forEach((p) => {
          const id = presenceUserId(p as PresencePayload);
          if (id) webIdsRef.current.add(id);
        });
        syncMerged();
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((p) => {
          const id = presenceUserId(p as PresencePayload);
          if (id) webIdsRef.current.delete(id);
        });
        syncMerged();
      })
      .subscribe(async (status) => {
        console.log('[GlobalPresence] Web channel:', status);
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          webChannel.track({ user_id: userId, online_at: new Date().toISOString(), source: 'web' });
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
        newPresences.forEach((p) => {
          const id = presenceUserId(p as PresencePayload);
          if (id) mobileIdsRef.current.add(id);
        });
        syncMerged();
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((p) => {
          const id = presenceUserId(p);
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
      webChannelRef.current?.track({ user_id: userId, online_at: new Date().toISOString(), source: 'web' });
    }, PRESENCE_HEARTBEAT_MS);

    /* ── 4. Activity write every 5 min ──────────────────────────────── */
    activityWriteRef.current = setInterval(() => {
      writeLastActivity(userId);
    }, ACTIVITY_WRITE_INTERVAL_MS);

    /* ── 5. Visibility change ────────────────────────────────────────── */
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && userId) {
        webChannelRef.current?.track({ user_id: userId, online_at: new Date().toISOString(), source: 'web' });
        writeLastActivity(userId);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    /* ── 6. Page unload — best-effort final write via keepalive (avoids CORS * + credentials) ── */
    const handleUnload = () => {
      try {
        void supabase
          .from('profiles')
          .update({ last_activity: new Date().toISOString() })
          .eq('id', userId);
      } catch { /* unload — ignore */ }
    };
    window.addEventListener('pagehide', handleUnload);

    return () => {
      console.log('[GlobalPresence] Cleaning up');
      if (webChannelRef.current)    { supabase.removeChannel(webChannelRef.current);    webChannelRef.current = null; }
      if (mobileChannelRef.current) { supabase.removeChannel(mobileChannelRef.current); mobileChannelRef.current = null; }
      if (heartbeatRef.current)     { clearInterval(heartbeatRef.current);     heartbeatRef.current = null; }
      if (activityWriteRef.current) { clearInterval(activityWriteRef.current); activityWriteRef.current = null; }
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handleUnload);
      initializedRef.current = false;
    };
  }, [authReady, currentUser?.id, writeLastActivity, syncMerged]);

  return (
    <GlobalPresenceContext.Provider value={{
      isConnected,
      onlineUserIds: Array.from(onlineUserIds),
      webUserIds,
      mobileUserIds,
      isUserOnline,
      getUserSources,
      trackPresence,
    }}>
      {children}
    </GlobalPresenceContext.Provider>
  );
}
