/**
 * React hook for accessing realtime health state
 */

import { useState, useEffect } from 'react';
import { realtimeHealth, RealtimeHealthState, RealtimeMetrics } from '@/lib/realtime-health';

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

  return {
    ...state,
    ...metrics,
    enableDebug: () => realtimeHealth.enableDebugMode(),
    disableDebug: () => realtimeHealth.disableDebugMode(),
  };
}
