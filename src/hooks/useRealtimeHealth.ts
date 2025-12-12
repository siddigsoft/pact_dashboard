/**
 * useRealtimeHealth Hook
 * Provides realtime connection health status for the application
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface RealtimeHealthState {
  isOnline: boolean;
  isConnecting: boolean;
  connectedChannels: number;
  lastConnected: Date | null;
  reconnectAttempts: number;
}

export function useRealtimeHealth() {
  const [health, setHealth] = useState<RealtimeHealthState>({
    isOnline: navigator.onLine,
    isConnecting: false,
    connectedChannels: 0,
    lastConnected: null,
    reconnectAttempts: 0,
  });

  useEffect(() => {
    const handleOnline = () => {
      setHealth(prev => ({
        ...prev,
        isOnline: true,
        lastConnected: new Date(),
        reconnectAttempts: 0,
      }));
    };

    const handleOffline = () => {
      setHealth(prev => ({
        ...prev,
        isOnline: false,
      }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const channels = supabase.getChannels();
    setHealth(prev => ({
      ...prev,
      connectedChannels: channels.length,
      isOnline: navigator.onLine,
    }));

    const interval = setInterval(() => {
      const currentChannels = supabase.getChannels();
      setHealth(prev => ({
        ...prev,
        connectedChannels: currentChannels.length,
        isOnline: navigator.onLine,
      }));
    }, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const forceReconnect = useCallback(async () => {
    setHealth(prev => ({ ...prev, isConnecting: true }));
    try {
      await supabase.removeAllChannels();
      setHealth(prev => ({
        ...prev,
        isConnecting: false,
        lastConnected: new Date(),
        reconnectAttempts: 0,
      }));
    } catch (error) {
      setHealth(prev => ({
        ...prev,
        isConnecting: false,
        reconnectAttempts: prev.reconnectAttempts + 1,
      }));
    }
  }, []);

  return {
    ...health,
    forceReconnect,
  };
}
