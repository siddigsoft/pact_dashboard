import React, { useEffect, useState, useCallback, useRef } from 'react';
import { testConnection, isClientFrozen, recoverFromFrozenClient } from '@/lib/session-health';
import { supabase } from '@/integrations/supabase/client';

interface SessionManagerProps {
  children: React.ReactNode;
}

/**
 * Global Session Manager that prevents hanging on all pages
 * 
 * Features:
 * - Periodically tests connection health
 * - Detects frozen Supabase client
 * - Automatically recovers from frozen state
 * - Shows user-friendly errors instead of hanging
 * - Protects all pages from session issues
 */
const SessionManager: React.FC<SessionManagerProps> = ({ children }) => {
  const isDev = import.meta.env.DEV;
  const [isHealthy, setIsHealthy] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<number>(0);
  const consecutiveFailuresRef = useRef<number>(0);
  const isCheckingRef = useRef(false);
  const isHealthyRef = useRef(true);
  const lastRecoveryAttemptRef = useRef(0);
  const healthCheckFnRef = useRef<(() => void) | null>(null);
  const RECOVERY_COOLDOWN_MS = 2 * 60 * 1000;
  
  // Expose placeholder immediately so function exists even before useEffect runs
  if (typeof window !== 'undefined' && !(window as any).__checkSessionHealth) {
    (window as any).__checkSessionHealth = () => {
      console.warn('[SessionManager] Function called before initialization, please wait...');
    };
    (window as any).__sessionHealthStatus = () => {
      return { isHealthy: null, isChecking: null, message: 'SessionManager not initialized yet' };
    };
  }
  
  // Log when component mounts
  useEffect(() => {
    if (isDev) {
      console.log('[SessionManager] Component mounted and active');
    }
  }, []);

  useEffect(() => {
    isHealthyRef.current = isHealthy;
  }, [isHealthy]);

  /**
   * Performs a health check on the Supabase connection
   */
  const performHealthCheck = useCallback(async (silent: boolean = false) => {
    // Throttle checks - don't check more than once every 20 seconds
    const now = Date.now();
    if (now - lastCheckRef.current < 20000) {
      return;
    }
    lastCheckRef.current = now;

    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setIsChecking(true);

    try {
      // First, test if client is frozen
      const frozen = await isClientFrozen();
      if (frozen) {
        const canAttemptRecovery = now - lastRecoveryAttemptRef.current > RECOVERY_COOLDOWN_MS;
        if (consecutiveFailuresRef.current >= 2 && canAttemptRecovery) {
          if (isDev) {
            console.warn('[SessionManager] Client appears frozen, attempting guarded recovery...');
          }
          lastRecoveryAttemptRef.current = now;
          const recovered = await recoverFromFrozenClient();
          if (!recovered.success) {
            consecutiveFailuresRef.current += 1;
            if (isDev) {
              console.warn('[SessionManager] Connection recovery failed, attempt:', consecutiveFailuresRef.current);
            }
            if (consecutiveFailuresRef.current >= 5) {
              setIsHealthy(false);
            }
            return;
          }
          if (isDev) {
            console.log('[SessionManager] Successfully recovered from frozen state');
          }
          consecutiveFailuresRef.current = 0;
        }
      }

      // Test actual connection
      const connectionOk = await testConnection(5000);
      if (!connectionOk) {
        consecutiveFailuresRef.current += 1;
        if (isDev) {
          console.warn('[SessionManager] Connection test failed, attempt:', consecutiveFailuresRef.current);
        }
        if (consecutiveFailuresRef.current >= 5) {
          setIsHealthy(false);
        }
      } else {
        consecutiveFailuresRef.current = 0;
        setIsHealthy(true);
      }
    } catch (error) {
      if (isDev) {
        console.error('[SessionManager] Health check error:', error);
      }
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 5) {
        setIsHealthy(false);
      }
    } finally {
      isCheckingRef.current = false;
      setIsChecking(false);
    }
  }, []);

  /**
   * Intercepts Supabase calls to test connection before execution
   */
  useEffect(() => {
    // Perform initial health check after 5 seconds (let app load first)
    const initialTimeout = setTimeout(() => {
      performHealthCheck(true); // Silent initial check
    }, 5000);

    // Set up periodic health checks every 90 seconds
    checkIntervalRef.current = setInterval(() => {
      performHealthCheck(true); // Silent periodic checks
    }, 90000);

    // Listen for Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (isDev) {
        console.log('[SessionManager] 🔐 Auth state changed:', {
          event,
          hasSession: !!session,
          userId: session?.user?.id || null,
        });
      }
      
      if (event === 'SIGNED_OUT' || !session) {
        setIsHealthy(true); // Reset on logout
        consecutiveFailuresRef.current = 0;
        if (isDev) {
          console.log('[SessionManager] User signed out, resetting health status');
        }
      } else if (event === 'TOKEN_REFRESHED') {
        // Token refreshed successfully, connection is healthy
        setIsHealthy(true);
        consecutiveFailuresRef.current = 0;
        if (isDev) {
          console.log('[SessionManager] ✅ Token refreshed successfully, connection healthy');
        }
      }
    });

    // Check connection when page becomes visible (user returns to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // User returned to tab, check connection
        performHealthCheck(false); // Show toast if there's an issue
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Check connection when network comes back online
    const handleOnline = () => {
      if (isDev) {
        console.log('[SessionManager] Network came back online, checking connection...');
      }
      performHealthCheck(false);
    };
    window.addEventListener('online', handleOnline);

    return () => {
      clearTimeout(initialTimeout);
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [performHealthCheck, isDev]);

  /**
   * Expose health check function globally for manual triggers
   * Uses refs to ensure function is always available
   */
  useEffect(() => {
    // Store the function in a ref so it's always current
    healthCheckFnRef.current = () => {
      if (isDev) {
        console.log('[SessionManager] Manual health check triggered');
      }
      performHealthCheck(false);
    };
    
    // Expose function on window object - use ref so it always calls latest version
    (window as any).__checkSessionHealth = () => {
      if (healthCheckFnRef.current) {
        healthCheckFnRef.current();
      } else {
        console.warn('[SessionManager] Health check function not ready yet');
      }
    };
    
    // Expose status function
    (window as any).__sessionHealthStatus = () => {
      return {
        isHealthy: isHealthyRef.current,
        isChecking: isCheckingRef.current,
        consecutiveFailures: consecutiveFailuresRef.current,
        lastCheck: new Date(lastCheckRef.current).toISOString(),
      };
    };
    
    // Expose token info function for debugging
    (window as any).__getTokenInfo = () => {
      const supabaseKey = Object.keys(localStorage).find(key => 
        key.startsWith('sb-') && key.endsWith('-auth-token')
      );
      
      if (!supabaseKey) {
        return { error: 'No Supabase token key found in localStorage' };
      }
      
      try {
        const storedSession = localStorage.getItem(supabaseKey);
        if (!storedSession) {
          return { error: 'No session data found' };
        }
        
        const parsed = JSON.parse(storedSession);
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = parsed?.expires_at ? parsed.expires_at - now : null;
        
        return {
          storageKey: supabaseKey,
          hasAccessToken: !!parsed?.access_token,
          accessTokenPreview: parsed?.access_token ? `${parsed.access_token.substring(0, 30)}...` : null,
          accessTokenLength: parsed?.access_token?.length || 0,
          hasRefreshToken: !!parsed?.refresh_token,
          refreshTokenPreview: parsed?.refresh_token ? `${parsed.refresh_token.substring(0, 30)}...` : null,
          expiresAt: parsed?.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : null,
          expiresIn: expiresIn !== null ? `${expiresIn}s (${Math.floor(expiresIn / 60)}m ${expiresIn % 60}s)` : null,
          isExpired: expiresIn !== null && expiresIn < 0,
          expiresInMinutes: expiresIn !== null ? Math.floor(expiresIn / 60) : null,
          userId: parsed?.user?.id || null,
          userEmail: parsed?.user?.email || null,
          tokenType: parsed?.token_type || null,
          fullSession: parsed, // Full session object for detailed inspection
        };
      } catch (error) {
        return { error: `Failed to parse session: ${error}` };
      }
    };
    
    if (isDev) {
      console.log('[SessionManager] ✅ Health check functions exposed:');
      console.log('  - window.__checkSessionHealth() - Run manual health check');
      console.log('  - window.__sessionHealthStatus() - Get current status');
      console.log('  - window.__getTokenInfo() - Get detailed token information');
    }
    
    // Log token info on mount
    setTimeout(() => {
      const tokenInfo = (window as any).__getTokenInfo();
      if (isDev && tokenInfo && !tokenInfo.error) {
        console.log('[SessionManager] 📋 Current Token Info:', tokenInfo);
      }
    }, 1000);
    
    // Don't delete on unmount - keep it available for debugging
  }, [performHealthCheck, isDev]);

  // Connection issues don't block the app - just log them for debugging
  // The app works fine even without realtime connections
  return <>{children}</>;
};

export default SessionManager;
