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

interface GlobalPresenceProviderProps {
  children: ReactNode;
}

export function GlobalPresenceProvider({ children }: GlobalPresenceProviderProps) {
  const { currentUser, authReady } = useUser();
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const initializedRef = useRef(false);

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
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      initializedRef.current = false;
      setIsConnected(false);
      setOnlineUserIds(new Set());
      return;
    }

    if (initializedRef.current) return;
    initializedRef.current = true;

    console.log('[GlobalPresence] Setting up presence for user:', currentUser.id);

    const channel = supabase.channel(GLOBAL_PRESENCE_CHANNEL, {
      config: { presence: { key: currentUser.id } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const ids = new Set<string>();
        
        Object.values(state).forEach(presences => {
          presences.forEach((presence: any) => {
            if (presence.user_id) {
              ids.add(presence.user_id);
            }
          });
        });
        
        setOnlineUserIds(ids);
        console.log('[GlobalPresence] Synced, online users:', ids.size);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        newPresences.forEach((presence: any) => {
          if (presence.user_id) {
            setOnlineUserIds(prev => new Set([...prev, presence.user_id]));
            console.log('[GlobalPresence] User joined:', presence.user_id);
          }
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        leftPresences.forEach((presence: any) => {
          if (presence.user_id) {
            setOnlineUserIds(prev => {
              const next = new Set(prev);
              next.delete(presence.user_id);
              return next;
            });
            console.log('[GlobalPresence] User left:', presence.user_id);
          }
        });
      })
      .subscribe(async (status) => {
        console.log('[GlobalPresence] Channel status:', status);
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          channel.track({
            user_id: currentUser.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    channelRef.current = channel;

    heartbeatRef.current = setInterval(() => {
      if (channelRef.current && currentUser?.id) {
        channelRef.current.track({
          user_id: currentUser.id,
          online_at: new Date().toISOString(),
        });
      }
    }, 30000);

    return () => {
      console.log('[GlobalPresence] Cleaning up');
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      initializedRef.current = false;
    };
  }, [authReady, currentUser?.id]);

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
