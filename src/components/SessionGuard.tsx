import { useEffect, useRef, useCallback } from 'react';
import { ensureValidSessionForMutation } from '@/lib/session-health';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const KEEPALIVE_INTERVAL = 3 * 60 * 1000;
const IDLE_THRESHOLD = 2 * 60 * 1000; // 2 minutes - recovery runs sooner when user returns
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
      console.log('[SessionGuard] Return from idle skipped: idleTime', Math.round(idleTime / 1000), 's < threshold', IDLE_THRESHOLD / 1000, 's');
      return;
    }

    const now = Date.now();
    if (now - lastCheckRef.current < DEBOUNCE_MS) {
      console.log('[SessionGuard] Return from idle skipped: debounce (last check', Math.round((now - lastCheckRef.current) / 1000), 's ago)');
      return;
    }
    if (checkInProgressRef.current) {
      console.log('[SessionGuard] Return from idle skipped: check already in progress');
      return;
    }

    console.log('[SessionGuard] 🔄 Return from idle: running proactive session check (idleTime:', Math.round(idleTime / 1000), 's, visibility:', document.visibilityState, ')');
    checkInProgressRef.current = true;
    lastCheckRef.current = now;

    try {
      const isValid = await ensureValidSessionForMutation();
      console.log('[SessionGuard] Proactive session check result: valid =', isValid);
      if (!isValid) {
        toast({
          title: 'Session expired',
          description: 'Your session has timed out. Please log in again.',
          variant: 'destructive',
        });
        return;
      }

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
      console.log('[SessionGuard] Visibility changed: document.visibilityState =', document.visibilityState);
      if (document.visibilityState === 'visible') {
        handleReturnFromIdle();
      }
    };

    const handleFocus = () => {
      console.log('[SessionGuard] Window focus - checking for return from idle');
      handleReturnFromIdle();
    };

    const handleOnline = async () => {
      toast({ title: 'Back online', description: 'Reconnected. Refreshing data...' });
      await ensureValidSessionForMutation();
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
