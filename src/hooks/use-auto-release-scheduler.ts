import { useState, useEffect, useRef, useCallback } from 'react';
import { AutoReleaseService } from '@/services/auto-release.service';

interface SchedulerState {
  isRunning: boolean;
  lastRun: Date | null;
  nextRun: Date | null;
  lastResult: {
    processed: number;
    released: number;
    errors: number;
  } | null;
}

interface UseAutoReleaseSchedulerOptions {
  intervalMs?: number;
  autoStart?: boolean;
}

export function useAutoReleaseScheduler(options: UseAutoReleaseSchedulerOptions = {}) {
  const { intervalMs = 5 * 60 * 1000, autoStart = false } = options;
  
  const [state, setState] = useState<SchedulerState>({
    isRunning: false,
    lastRun: null,
    nextRun: null,
    lastResult: null,
  });
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runCheck = useCallback(async () => {
    console.log('[AutoReleaseScheduler] Running auto-release check...');
    
    try {
      const result = await AutoReleaseService.processAutoReleases();
      
      const now = new Date();
      setState(prev => ({
        ...prev,
        lastRun: now,
        nextRun: prev.isRunning ? new Date(now.getTime() + intervalMs) : null,
        lastResult: {
          processed: result.processed,
          released: result.released,
          errors: result.errors,
        },
      }));

      console.log(`[AutoReleaseScheduler] Check complete: ${result.released}/${result.processed} released`);
      
      return result;
    } catch (error) {
      console.error('[AutoReleaseScheduler] Error during check:', error);
      throw error;
    }
  }, [intervalMs]);

  const start = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    runCheck();

    intervalRef.current = setInterval(runCheck, intervalMs);
    
    setState(prev => ({
      ...prev,
      isRunning: true,
      nextRun: new Date(Date.now() + intervalMs),
    }));

    console.log(`[AutoReleaseScheduler] Started with ${intervalMs}ms interval`);
  }, [intervalMs, runCheck]);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isRunning: false,
      nextRun: null,
    }));

    console.log('[AutoReleaseScheduler] Stopped');
  }, []);

  const toggle = useCallback(() => {
    if (state.isRunning) {
      stop();
    } else {
      start();
    }
  }, [state.isRunning, start, stop]);

  const runOnce = useCallback(async () => {
    return await runCheck();
  }, [runCheck]);

  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoStart, start]);

  return {
    ...state,
    start,
    stop,
    toggle,
    runOnce,
  };
}

export default useAutoReleaseScheduler;
