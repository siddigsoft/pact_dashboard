import { useEffect, useRef, useCallback } from 'react';
import { ensureValidSessionForMutation } from '@/lib/session-health';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { realtimeManager } from '@/lib/realtime-manager';

const KEEPALIVE_INTERVAL = 90 * 1000; // 90s — must be shorter than idle threshold
const IDLE_THRESHOLD = 60 * 1000; // 1 minute — detect idle sooner
const DEBOUNCE_MS = 2000;

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const lastActivityRef = useRef(Date.now());
  const checkInProgressRef = useRef(false);
  const lastCheckRef = useRef(0);

  const trackActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const handleReturnFromIdle = useCallback(async () => {
    const idleTime = Date.now() - lastActivityRef.current;
    if (idleTime < IDLE_THRESHOLD) {
      return;
    }

    const now = Date.now();
    if (now - lastCheckRef.current < DEBOUNCE_MS) {
      return;
    }
    if (checkInProgressRef.current) {
      return;
    }

    console.log('[SessionGuard] Return from idle (', Math.round(idleTime / 1000), 's) — recovering session + realtime');
    checkInProgressRef.current = true;
    lastCheckRef.current = now;

    try {
      const isValid = await ensureValidSessionForMutation();
      if (!isValid) {
        toast({
          title: 'Session expired',
          description: 'Your session has timed out. Please log in again.',
          variant: 'destructive',
        });
        return;
      }

      realtimeManager.reconnectAllChannels();
      queryClient.invalidateQueries();
      lastActivityRef.current = Date.now();
    } finally {
      checkInProgressRef.current = false;
    }
  }, [toast]);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(e => document.addEventListener(e, trackActivity, { passive: true }));

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleReturnFromIdle();
      }
    };

    const handleFocus = () => {
      handleReturnFromIdle();
    };

    const handleOnline = async () => {
      toast({ title: 'Back online', description: 'Reconnected. Refreshing data...' });
      await ensureValidSessionForMutation();
      realtimeManager.reconnectAllChannels();
      queryClient.invalidateQueries();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    const interval = setInterval(() => {
      ensureValidSessionForMutation();
    }, KEEPALIVE_INTERVAL);

    return () => {
      events.forEach(e => document.removeEventListener(e, trackActivity));
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      clearInterval(interval);
    };
  }, [trackActivity, handleReturnFromIdle, toast]);

  return <>{children}</>;
}
