import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface UseRealtimeSiteVisitsOptions {
  enabled?: boolean;
  onUpdate?: (payload: any) => void;
}

export function useRealtimeSiteVisits({ 
  enabled = true,
  onUpdate 
}: UseRealtimeSiteVisitsOptions = {}) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const setupRef = useRef(false);

  useEffect(() => {
    if (!enabled || setupRef.current) return;
    setupRef.current = true;

    console.log('[RealtimeSiteVisits] Setting up subscription...');
    setConnectionStatus('connecting');

    const channel = supabase
      .channel('site-visits-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'site_visits'
      }, (payload) => {
        console.log('[RealtimeSiteVisits] Change detected:', payload.eventType);
        queryClient.invalidateQueries({ queryKey: ['site-visits'] });
        queryClient.invalidateQueries({ queryKey: ['siteVisits'] });
        setLastRefresh(new Date());
        onUpdate?.(payload);
      })
      .subscribe((status) => {
        console.log('[RealtimeSiteVisits] Channel status:', status);
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          setConnectionStatus('connected');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setIsConnected(false);
          setConnectionStatus('disconnected');
        }
      });

    channelRef.current = channel;

    return () => {
      setupRef.current = false;
      if (channelRef.current) {
        console.log('[RealtimeSiteVisits] Cleaning up subscription');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, queryClient, onUpdate]);

  const forceRefresh = useCallback(async () => {
    console.log('[RealtimeSiteVisits] Force refresh triggered');
    await queryClient.invalidateQueries({ queryKey: ['site-visits'] });
    await queryClient.invalidateQueries({ queryKey: ['siteVisits'] });
    setLastRefresh(new Date());
  }, [queryClient]);

  return { 
    isConnected, 
    connectionStatus,
    lastRefresh, 
    forceRefresh 
  };
}

export default useRealtimeSiteVisits;
