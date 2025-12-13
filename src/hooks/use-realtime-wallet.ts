import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface UseRealtimeWalletOptions {
  enabled?: boolean;
  onUpdate?: (payload: any) => void;
}

export function useRealtimeWallet({ 
  enabled = true,
  onUpdate 
}: UseRealtimeWalletOptions = {}) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const setupRef = useRef(false);

  useEffect(() => {
    if (!enabled || setupRef.current) return;
    setupRef.current = true;

    console.log('[RealtimeWallet] Setting up subscription...');
    setConnectionStatus('connecting');

    const channel = supabase
      .channel('wallet-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'wallets'
      }, (payload) => {
        console.log('[RealtimeWallet] Change detected:', payload.eventType);
        queryClient.invalidateQueries({ queryKey: ['wallets'] });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        setLastRefresh(new Date());
        onUpdate?.(payload);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'wallet_transactions'
      }, (payload) => {
        console.log('[RealtimeWallet] Transaction change detected:', payload.eventType);
        queryClient.invalidateQueries({ queryKey: ['wallets'] });
        queryClient.invalidateQueries({ queryKey: ['wallet'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
        setLastRefresh(new Date());
        onUpdate?.(payload);
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'cost_submissions'
      }, (payload) => {
        console.log('[RealtimeWallet] Cost submission change detected:', payload.eventType);
        queryClient.invalidateQueries({ queryKey: ['cost-submissions'] });
        queryClient.invalidateQueries({ queryKey: ['wallets'] });
        setLastRefresh(new Date());
        onUpdate?.(payload);
      })
      .subscribe((status) => {
        console.log('[RealtimeWallet] Channel status:', status);
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
        console.log('[RealtimeWallet] Cleaning up subscription');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, queryClient, onUpdate]);

  const forceRefresh = useCallback(async () => {
    console.log('[RealtimeWallet] Force refresh triggered');
    await queryClient.invalidateQueries({ queryKey: ['wallets'] });
    await queryClient.invalidateQueries({ queryKey: ['wallet'] });
    await queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
    await queryClient.invalidateQueries({ queryKey: ['cost-submissions'] });
    setLastRefresh(new Date());
  }, [queryClient]);

  return { 
    isConnected, 
    connectionStatus,
    lastRefresh, 
    forceRefresh 
  };
}

export default useRealtimeWallet;
