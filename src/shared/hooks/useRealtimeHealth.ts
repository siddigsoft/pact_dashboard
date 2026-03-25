/**
 * React hook for accessing realtime health state
 */

import { useState, useEffect, useCallback } from 'react';
import { realtimeHealth, RealtimeHealthState, RealtimeMetrics } from '@/lib/realtime-health';
import { supabase } from '@/integrations/supabase/client';

export function useRealtimeHealth() {
  const [state, setState] = useState<RealtimeHealthState>(realtimeHealth.getState());
  const [metrics, setMetrics] = useState<RealtimeMetrics>(realtimeHealth.getMetrics());

  useEffect(() => {
    const unsubscribe = realtimeHealth.subscribe((newState) => {
      setState(newState);
      setMetrics(realtimeHealth.getMetrics());
    });

    return unsubscribe;
  }, []);

  const forceReconnect = useCallback(async () => {
    try {
      await supabase.removeAllChannels();
    } catch (error) {
      console.error('Error forcing reconnect:', error);
    }
  }, []);

  return {
    ...state,
    ...metrics,
    enableDebug: () => realtimeHealth.enableDebugMode(),
    disableDebug: () => realtimeHealth.disableDebugMode(),
    forceReconnect,
  };
}
