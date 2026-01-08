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
      if (event === 'SIGNED_OUT' || !session) {
        setIsHealthy(true); // Reset on logout
        consecutiveFailuresRef.current = 0;
      } else if (event === 'TOKEN_REFRESHED') {
        // Token refreshed successfully, connection is healthy
        setIsHealthy(true);
        consecutiveFailuresRef.current = 0;
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
   */
  useEffect(() => {
    (window as any).__checkSessionHealth = () => {
      performHealthCheck(false);
    };
    return () => {
      delete (window as any).__checkSessionHealth;
    };
  }, [performHealthCheck]);

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
