import { useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface SessionTimeoutConfig {
  sessionDuration: number; // total session duration in seconds
  checkInterval: number; // ms
  logout?: () => Promise<void>; // Optional logout function from context
}

const DEFAULT_CONFIG: SessionTimeoutConfig = {
  sessionDuration: 90,
  checkInterval: 1000,
};

function clearAllAuthData() {
  try {
    localStorage.clear();
    sessionStorage.clear();
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
    });
  } catch (err) {
    // ignore
  }
}

export const useSessionTimeout = (config: Partial<SessionTimeoutConfig> = {}) => {
  const navigate = useNavigate();
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const lastActivityRef = useRef<number>(Date.now());
  const logoutCalledRef = useRef<boolean>(false);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const logout = useCallback(async () => {
    if (logoutCalledRef.current) return;
    logoutCalledRef.current = true;
    try {
      if (finalConfig.logout) {
        await finalConfig.logout();
      } else {
        await supabase.auth.signOut();
        clearAllAuthData();
      }
      toast.success('You have been logged out due to inactivity.');
      navigate('/auth', { replace: true });
    } catch (err: any) {
      toast.error('Logout failed. Please refresh the page.');
      clearAllAuthData();
      navigate('/auth', { replace: true });
    }
  }, [finalConfig.logout, navigate]);

  useEffect(() => {
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

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - lastActivityRef.current;
      const remainingMs = finalConfig.sessionDuration * 1000 - elapsedMs;
      if (remainingMs <= 0) {
        logout();
      }
    }, finalConfig.checkInterval);

    lastActivityRef.current = Date.now();

    return () => {
      clearInterval(interval);
      activityEvents.forEach((ev) => document.removeEventListener(ev, handleActivity));
    };
  }, [finalConfig.checkInterval, finalConfig.sessionDuration, logout, updateActivity]);

  // No UI, no return value needed
  return {};
};

export default useSessionTimeout;
