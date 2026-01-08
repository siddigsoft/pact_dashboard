import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
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
  const { toast } = useToast();
  const [isHealthy, setIsHealthy] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastCheckRef = useRef<number>(0);
  const consecutiveFailuresRef = useRef<number>(0);
  const healthCheckFnRef = useRef<(() => void) | null>(null);
  
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
    console.log('[SessionManager] Component mounted and active');
  }, []);

  /**
   * Performs a health check on the Supabase connection
   */
  const performHealthCheck = useCallback(async (silent: boolean = false) => {
    // Throttle checks - don't check more than once every 10 seconds
    const now = Date.now();
    if (now - lastCheckRef.current < 10000 && !silent) {
      return;
    }
    lastCheckRef.current = now;

    if (isChecking) return;
    setIsChecking(true);

    try {
      // First, test if client is frozen
      const frozen = await isClientFrozen();
      if (frozen) {
        console.warn('[SessionManager] Client appears frozen, attempting recovery...');
        const recovered = await recoverFromFrozenClient();
        if (!recovered) {
          consecutiveFailuresRef.current += 1;
          if (consecutiveFailuresRef.current >= 3) {
            setIsHealthy(false);
            if (!silent) {
              toast({
                title: 'Connection Issue Detected',
                description: 'The connection appears to be frozen. Please refresh the page.',
                variant: 'destructive',
                action: (
                  <button
                    onClick={() => window.location.reload()}
                    className="underline font-medium"
                  >
                    Refresh Now
                  </button>
                ),
              });
            }
          }
          setIsChecking(false);
          return;
        }
        console.log('[SessionManager] Successfully recovered from frozen state');
        consecutiveFailuresRef.current = 0;
      }

      // Test actual connection
      const connectionOk = await testConnection(3000);
      if (!connectionOk) {
        consecutiveFailuresRef.current += 1;
        if (consecutiveFailuresRef.current >= 3) {
          setIsHealthy(false);
          if (!silent) {
            toast({
              title: 'Connection Problem',
              description: 'Unable to connect to the server. Please check your internet connection.',
              variant: 'destructive',
            });
          }
        }
      } else {
        consecutiveFailuresRef.current = 0;
        setIsHealthy(true);
      }
    } catch (error) {
      console.error('[SessionManager] Health check error:', error);
      consecutiveFailuresRef.current += 1;
      if (consecutiveFailuresRef.current >= 3) {
        setIsHealthy(false);
      }
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, toast]);

  /**
   * Intercepts Supabase calls to test connection before execution
   */
  useEffect(() => {
    // Perform initial health check after 5 seconds (let app load first)
    const initialTimeout = setTimeout(() => {
      performHealthCheck(true); // Silent initial check
    }, 5000);

    // Set up periodic health checks every 30 seconds
    checkIntervalRef.current = setInterval(() => {
      performHealthCheck(true); // Silent periodic checks
    }, 30000);

    // Listen for Supabase auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[SessionManager] 🔐 Auth state changed:', {
        event,
        hasSession: !!session,
        userId: session?.user?.id || null,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
        expiresIn: session?.expires_at ? `${session.expires_at - Math.floor(Date.now() / 1000)}s` : null,
        accessToken: session?.access_token ? `${session.access_token.substring(0, 20)}...` : null,
        hasRefreshToken: !!session?.refresh_token,
      });
      
      if (event === 'SIGNED_OUT' || !session) {
        setIsHealthy(true); // Reset on logout
        consecutiveFailuresRef.current = 0;
        console.log('[SessionManager] User signed out, resetting health status');
      } else if (event === 'TOKEN_REFRESHED') {
        // Token refreshed successfully, connection is healthy
        setIsHealthy(true);
        consecutiveFailuresRef.current = 0;
        console.log('[SessionManager] ✅ Token refreshed successfully, connection healthy');
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
      console.log('[SessionManager] Network came back online, checking connection...');
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
  }, [performHealthCheck]);

  /**
   * Expose health check function globally for manual triggers
   * Uses refs to ensure function is always available
   */
  useEffect(() => {
    // Store the function in a ref so it's always current
    healthCheckFnRef.current = () => {
      console.log('[SessionManager] Manual health check triggered');
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
        isHealthy,
        isChecking,
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
    
    console.log('[SessionManager] ✅ Health check functions exposed:');
    console.log('  - window.__checkSessionHealth() - Run manual health check');
    console.log('  - window.__sessionHealthStatus() - Get current status');
    console.log('  - window.__getTokenInfo() - Get detailed token information');
    
    // Log token info on mount
    setTimeout(() => {
      const tokenInfo = (window as any).__getTokenInfo();
      if (tokenInfo && !tokenInfo.error) {
        console.log('[SessionManager] 📋 Current Token Info:', tokenInfo);
      }
    }, 1000);
    
    // Don't delete on unmount - keep it available for debugging
  }, [performHealthCheck, isHealthy, isChecking]);

  // Show warning banner if connection is unhealthy
  if (!isHealthy && !isChecking) {
    return (
      <>
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-600 text-white p-3 text-center shadow-lg">
          <div className="flex items-center justify-center gap-3">
            <span className="font-medium">Connection Issue Detected</span>
            <button
              onClick={() => {
                performHealthCheck(false);
              }}
              className="px-3 py-1 bg-white text-red-600 rounded hover:bg-gray-100 font-medium"
            >
              Retry
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-white text-red-600 rounded hover:bg-gray-100 font-medium"
            >
              Refresh Page
            </button>
          </div>
        </div>
        {children}
      </>
    );
  }

  return <>{children}</>;
};

export default SessionManager;
