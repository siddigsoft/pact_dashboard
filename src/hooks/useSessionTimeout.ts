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
    // Don't clear auth data when offline - preserve session for offline use
    if (!navigator.onLine) {
      console.log('[SessionTimeout] Skipping clearAllAuthData - user is offline');
      return;
    }
    
    // Preserve Supabase session keys and user data before clearing
    const supabaseKeys: Record<string, string> = {};
    const userData: Record<string, string> = {};
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        if (key.startsWith('sb-') || key.includes('supabase')) {
          supabaseKeys[key] = localStorage.getItem(key) || '';
        } else if (key === 'PACTCurrentUser' || key.startsWith('user-')) {
          userData[key] = localStorage.getItem(key) || '';
        }
      }
    }
    
    // Clear all localStorage
    localStorage.clear();
    
    // Note: We don't restore the keys here because this function is only called
    // during explicit logout when online. When offline, this function won't be called
    // due to the early return above, preserving all session data.
    
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
    
    // Don't log out when offline - preserve session for offline use
    if (!navigator.onLine) {
      console.log('[SessionTimeout] Skipping logout - user is offline');
      return;
    }
    
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
      // If logout fails due to network error, don't clear local session
      if (!navigator.onLine) {
        console.log('[SessionTimeout] Logout failed - user is offline, preserving session');
        logoutCalledRef.current = false; // Allow retry when back online
        return;
      }
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
      // Don't log out users when offline - preserve session for offline use
      if (!navigator.onLine) {
        return;
      }
      
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
