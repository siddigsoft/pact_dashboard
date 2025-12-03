import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User } from '@/types/user';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';

interface TeamMemberLocation {
  id: string;
  name: string;
  avatar?: string;
  role: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    lastUpdated: string;
    isSharing: boolean;
  } | null;
  availability: 'online' | 'offline' | 'busy';
  lastActive: string;
  isOnline: boolean;
  presenceState?: 'online' | 'away' | 'offline';
}

interface UseRealtimeTeamLocationsOptions {
  enabled?: boolean;
  refreshInterval?: number;
  onLocationUpdate?: (userId: string, location: any) => void;
  onPresenceChange?: (userId: string, status: string) => void;
}

const PRESENCE_CHANNEL = 'team-presence';
const LOCATION_CHANNEL = 'team-locations';
const DEFAULT_REFRESH_INTERVAL = 15000;
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;

const generateSessionId = () => {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

const sessionId = generateSessionId();

export function useRealtimeTeamLocations({
  enabled = true,
  refreshInterval = DEFAULT_REFRESH_INTERVAL,
  onLocationUpdate,
  onPresenceChange
}: UseRealtimeTeamLocationsOptions = {}) {
  const { users, refreshUsers } = useUser();
  const { currentUser } = useAppContext();
  
  const [teamLocations, setTeamLocations] = useState<TeamMemberLocation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  
  const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const locationChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const calculateOnlineStatus = useCallback((user: User, presenceOnline: boolean): boolean => {
    if (presenceOnline) return true;
    
    const lastSeenTime = user.location?.lastUpdated || user.lastActive;
    if (!lastSeenTime) return false;
    
    try {
      const lastSeenDate = new Date(lastSeenTime);
      const now = new Date();
      const timeDiff = now.getTime() - lastSeenDate.getTime();
      
      return timeDiff < ONLINE_THRESHOLD_MS && 
             user.location?.latitude != null && 
             user.location?.longitude != null;
    } catch {
      return false;
    }
  }, []);

  const transformUserToLocation = useCallback((user: User, presenceOnline: boolean): TeamMemberLocation => {
    const isOnline = calculateOnlineStatus(user, presenceOnline);
    
    const lastUpdatedValue = user.location?.lastUpdated;
    const lastUpdatedIso = lastUpdatedValue 
      ? (typeof lastUpdatedValue === 'string' ? lastUpdatedValue : new Date(lastUpdatedValue).toISOString())
      : new Date().toISOString();
    
    const lastActiveValue = user.lastActive;
    const lastActiveIso = lastActiveValue
      ? (typeof lastActiveValue === 'string' ? lastActiveValue : new Date(lastActiveValue).toISOString())
      : new Date().toISOString();
    
    return {
      id: user.id,
      name: user.name || user.fullName || 'Unknown',
      avatar: user.avatar,
      role: user.roles?.[0] || user.role || 'Team Member',
      location: user.location?.latitude && user.location?.longitude ? {
        latitude: user.location.latitude,
        longitude: user.location.longitude,
        accuracy: user.location.accuracy,
        lastUpdated: lastUpdatedIso,
        isSharing: user.location.isSharing ?? true
      } : null,
      availability: (user.availability as 'online' | 'offline' | 'busy') || 'offline',
      lastActive: lastActiveIso,
      isOnline,
      presenceState: presenceOnline ? 'online' : (isOnline ? 'away' : 'offline')
    };
  }, [calculateOnlineStatus]);

  const updateTeamLocations = useCallback(() => {
    if (!users) return;
    
    const fieldTeamRoles = ['coordinator', 'datacollector', 'supervisor', 'fom'];
    const fieldTeamUsers = users.filter(user => 
      user.roles?.some(role => fieldTeamRoles.includes(role.toLowerCase()))
    );
    
    const locations = fieldTeamUsers.map(user => 
      transformUserToLocation(user, onlineUserIds.has(user.id))
    );
    
    locations.sort((a, b) => {
      if (a.isOnline && !b.isOnline) return -1;
      if (!a.isOnline && b.isOnline) return 1;
      
      const aTime = new Date(a.location?.lastUpdated || a.lastActive).getTime();
      const bTime = new Date(b.location?.lastUpdated || b.lastActive).getTime();
      return bTime - aTime;
    });
    
    setTeamLocations(locations);
    setLastRefresh(new Date());
  }, [users, onlineUserIds, transformUserToLocation]);

  const handleProfileUpdate = useCallback(async (payload: any) => {
    const { new: newRecord } = payload;
    if (!newRecord) return;
    
    console.log('[RealtimeTeamLocations] Profile updated:', newRecord.id);
    
    let locationData = null;
    if (newRecord.location) {
      try {
        locationData = typeof newRecord.location === 'string' 
          ? JSON.parse(newRecord.location) 
          : newRecord.location;
      } catch (e) {
        console.error('Error parsing location:', e);
      }
    }
    
    setTeamLocations(prev => {
      const existingIndex = prev.findIndex(m => m.id === newRecord.id);
      if (existingIndex === -1) return prev;
      
      const updated = [...prev];
      updated[existingIndex] = {
        ...updated[existingIndex],
        location: locationData ? {
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          accuracy: locationData.accuracy,
          lastUpdated: locationData.lastUpdated || new Date().toISOString(),
          isSharing: locationData.isSharing ?? true
        } : updated[existingIndex].location,
        availability: newRecord.availability || updated[existingIndex].availability,
        isOnline: calculateOnlineStatus(
          { ...updated[existingIndex], location: locationData } as any,
          onlineUserIds.has(newRecord.id)
        )
      };
      
      return updated;
    });
    
    onLocationUpdate?.(newRecord.id, locationData);
  }, [onlineUserIds, calculateOnlineStatus, onLocationUpdate]);

  const handlePresenceSync = useCallback((state: Record<string, any[]>) => {
    const onlineIds = new Set<string>();
    
    Object.values(state).forEach(presences => {
      presences.forEach(presence => {
        if (presence.user_id) {
          onlineIds.add(presence.user_id);
        }
      });
    });
    
    setOnlineUserIds(onlineIds);
    
    setTeamLocations(prev => 
      prev.map(member => ({
        ...member,
        isOnline: onlineIds.has(member.id) || calculateOnlineStatus(member as any, onlineIds.has(member.id)),
        presenceState: onlineIds.has(member.id) ? 'online' : (member.isOnline ? 'away' : 'offline')
      }))
    );
  }, [calculateOnlineStatus]);

  const handlePresenceJoin = useCallback((key: string, newPresences: any[]) => {
    newPresences.forEach(presence => {
      if (presence.user_id) {
        console.log('[RealtimeTeamLocations] User joined:', presence.user_id);
        setOnlineUserIds(prev => new Set([...prev, presence.user_id]));
        onPresenceChange?.(presence.user_id, 'online');
      }
    });
  }, [onPresenceChange]);

  const handlePresenceLeave = useCallback((key: string, leftPresences: any[]) => {
    leftPresences.forEach(presence => {
      if (presence.user_id) {
        console.log('[RealtimeTeamLocations] User left:', presence.user_id);
        setOnlineUserIds(prev => {
          const next = new Set(prev);
          next.delete(presence.user_id);
          return next;
        });
        onPresenceChange?.(presence.user_id, 'offline');
      }
    });
  }, [onPresenceChange]);

  const trackPresence = useCallback(() => {
    if (!currentUser?.id || !presenceChannelRef.current) return;
    
    presenceChannelRef.current.track({
      user_id: currentUser.id,
      online_at: new Date().toISOString(),
      location: currentUser.location ? {
        latitude: currentUser.location.latitude,
        longitude: currentUser.location.longitude
      } : null
    });
  }, [currentUser]);

  const forceRefresh = useCallback(async () => {
    console.log('[RealtimeTeamLocations] Force refreshing...');
    await refreshUsers();
    updateTeamLocations();
  }, [refreshUsers, updateTeamLocations]);

  useEffect(() => {
    if (!enabled) {
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      if (locationChannelRef.current) {
        supabase.removeChannel(locationChannelRef.current);
        locationChannelRef.current = null;
      }
      setConnectionStatus('disconnected');
      return;
    }

    console.log('[RealtimeTeamLocations] Setting up realtime subscriptions...');
    setConnectionStatus('connecting');
    
    let presenceSubscribed = false;
    let locationSubscribed = false;

    // Fallback timeout - if subscriptions don't complete within 5 seconds, mark as connected anyway
    // This handles cases where Supabase Realtime isn't fully configured or presence channels aren't available
    const connectionTimeoutId = setTimeout(() => {
      if (!presenceSubscribed && !locationSubscribed) {
        console.log('[RealtimeTeamLocations] Connection timeout - using fallback');
        setIsConnected(true);
        setConnectionStatus('connected');
      }
    }, 5000);

    const presenceKey = currentUser?.id || sessionId;
    const presenceChannel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: presenceKey } }
    });

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        handlePresenceSync(state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        handlePresenceJoin(key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        handlePresenceLeave(key, leftPresences);
      })
      .subscribe(async (status) => {
        console.log('[RealtimeTeamLocations] Presence channel:', status);
        if (status === 'SUBSCRIBED') {
          presenceSubscribed = true;
          clearTimeout(connectionTimeoutId);
          setIsConnected(true);
          setConnectionStatus('connected');
          trackPresence();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[RealtimeTeamLocations] Presence channel error:', status);
          // Still try to work without presence
          setIsConnected(true);
          setConnectionStatus('connected');
        }
      });

    presenceChannelRef.current = presenceChannel;

    const locationChannel = supabase
      .channel(LOCATION_CHANNEL)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        },
        handleProfileUpdate
      )
      .subscribe((status) => {
        console.log('[RealtimeTeamLocations] Location channel:', status);
        if (status === 'SUBSCRIBED') {
          locationSubscribed = true;
          clearTimeout(connectionTimeoutId);
          setIsConnected(true);
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[RealtimeTeamLocations] Location channel error:', status);
          setIsConnected(true);
          setConnectionStatus('connected');
        }
      });

    locationChannelRef.current = locationChannel;

    return () => {
      clearTimeout(connectionTimeoutId);
      console.log('[RealtimeTeamLocations] Cleaning up subscriptions');
      if (presenceChannelRef.current) {
        supabase.removeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      }
      if (locationChannelRef.current) {
        supabase.removeChannel(locationChannelRef.current);
        locationChannelRef.current = null;
      }
    };
  }, [enabled, handleProfileUpdate, handlePresenceSync, handlePresenceJoin, handlePresenceLeave, trackPresence]);

  useEffect(() => {
    if (!enabled) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      return;
    }

    heartbeatIntervalRef.current = setInterval(() => {
      trackPresence();
    }, 30000);

    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [enabled, trackPresence]);

  useEffect(() => {
    if (!enabled) {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
      return;
    }

    refreshIntervalRef.current = setInterval(async () => {
      console.log('[RealtimeTeamLocations] Background refresh...');
      await refreshUsers();
    }, refreshInterval);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
        refreshIntervalRef.current = null;
      }
    };
  }, [enabled, refreshInterval, refreshUsers]);

  useEffect(() => {
    updateTeamLocations();
  }, [users, onlineUserIds, updateTeamLocations]);

  const onlineCount = teamLocations.filter(m => m.isOnline).length;
  const offlineCount = teamLocations.filter(m => !m.isOnline).length;
  const withLocationCount = teamLocations.filter(m => m.location !== null).length;

  return {
    teamLocations,
    onlineUserIds,
    isConnected,
    connectionStatus,
    lastRefresh,
    onlineCount,
    offlineCount,
    withLocationCount,
    totalCount: teamLocations.length,
    forceRefresh
  };
}

export default useRealtimeTeamLocations;
