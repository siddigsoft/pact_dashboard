import { useEffect, useRef, useCallback } from 'react';
import { ensureValidSession } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const KEEPALIVE_INTERVAL = 3 * 60 * 1000;
const IDLE_THRESHOLD = 5 * 60 * 1000;

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const lastActivityRef = useRef(Date.now());

  const trackActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const handleReturnFromIdle = useCallback(async () => {
    const idleTime = Date.now() - lastActivityRef.current;
    if (idleTime < IDLE_THRESHOLD) return;

    const isValid = await ensureValidSession();
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
      await ensureValidSession();
      queryClient.invalidateQueries();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    const interval = setInterval(() => {
      ensureValidSession();
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
