import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

interface SessionTimeoutConfig {
  warningTime: number; // seconds before showing warning
  sessionDuration: number; // total session duration in seconds
  checkInterval: number; // ms
}

// Default: warn after 60s, logout after 90s
const DEFAULT_CONFIG: SessionTimeoutConfig = {
  warningTime: 60,
  sessionDuration: 90,
  checkInterval: 1000,
};

export const useSessionTimeout = (config: Partial<SessionTimeoutConfig> = {}) => {
  const navigate = useNavigate();
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);
  const logoutCalledRef = useRef<boolean>(false);

  const [isWarningVisible, setIsWarningVisible] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(finalConfig.sessionDuration);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    warningShownRef.current = false;
    setIsWarningVisible(false);
  }, []);

  const logout = useCallback(async () => {
    if (logoutCalledRef.current) return;
    logoutCalledRef.current = true;
    try {
      await supabase.auth.signOut();
    } catch (err) {
      // ignore signOut failure, still navigate
      // eslint-disable-next-line no-console
      console.warn('supabase signOut error', err);
    } finally {
      toast.error('Session expired due to inactivity.');
      navigate('/login');
    }
  }, [navigate]);

  const extendSession = useCallback(() => {
    updateActivity();
    toast.success('Session extended.');
  }, [updateActivity]);

  useEffect(() => {
    // Activity events
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
      'keydown',
      'wheel',
    ];

    const handleActivity = () => updateActivity();

    activityEvents.forEach((ev) =>
      document.addEventListener(ev, handleActivity, { passive: true })
    );

    // Interval checker reads refs to avoid stale closures
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastActivityRef.current;
      const remainingMs = finalConfig.sessionDuration * 1000 - elapsedMs;
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setTimeLeft(remainingSec);

      // Show warning once when threshold crossed
      if (remainingMs <= finalConfig.warningTime * 1000 && !warningShownRef.current && remainingMs > 0) {
        warningShownRef.current = true;
        setIsWarningVisible(true);
        toast.warning(`Session will expire in ${Math.ceil(remainingMs / 1000)}s due to inactivity.`);
      }

      // If time's up, logout once
      if (remainingMs <= 0) {
        logout();
      }
    }, finalConfig.checkInterval);

    // initial values
    lastActivityRef.current = Date.now();
    setTimeLeft(finalConfig.sessionDuration);

    return () => {
      clearInterval(interval);
      activityEvents.forEach((ev) => document.removeEventListener(ev, handleActivity));
    };
  }, [finalConfig.checkInterval, finalConfig.sessionDuration, finalConfig.warningTime, logout, updateActivity]);

  const formatTimeLeft = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    isWarningVisible,
    timeLeft,
    extendSession,
    logout,
    formatTimeLeft,
  };
};

export default useSessionTimeout;
