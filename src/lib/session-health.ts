import { replaceSupabaseClient, supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/utils/promise-with-timeout';

const isDev = import.meta.env.DEV;

// Deduplicate concurrent ensureValidSession() calls - all callers share one ongoing check
let _ongoingSessionCheck: Promise<{ success: boolean; user?: { id: string; email?: string }; error?: string }> | null = null;

/**
 * Tests Supabase connection using native fetch (bypasses frozen Supabase client)
 * This prevents hanging when the Supabase client is in a frozen/zombie state
 */
export async function testConnection(timeoutMs: number = 3000): Promise<boolean> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      console.error('[SessionHealth] No Supabase URL found');
      return false;
    }

    // Get auth token directly from localStorage (bypasses supabase.auth.getSession())
    const supabaseKey = Object.keys(localStorage).find(key => 
      key.startsWith('sb-') && key.endsWith('-auth-token')
    );
    
    let accessToken: string | null = null;
    if (supabaseKey) {
      try {
        const storedSession = localStorage.getItem(supabaseKey);
        if (storedSession) {
          const parsed = JSON.parse(storedSession);
          accessToken = parsed?.access_token || null;
          
          // Log token info for debugging
          console.log('[SessionHealth] 📋 Token Info:', {
            hasToken: !!accessToken,
            tokenPreview: accessToken ? `${accessToken.substring(0, 20)}...` : null,
            expiresAt: parsed?.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : null,
            expiresIn: parsed?.expires_at ? `${parsed.expires_at - Math.floor(Date.now() / 1000)}s` : null,
            hasRefreshToken: !!parsed?.refresh_token,
            userId: parsed?.user?.id || null,
            storageKey: supabaseKey,
          });
        }
      } catch (e) {
        console.warn('[SessionHealth] Failed to parse stored session:', e);
      }
    } else {
      console.warn('[SessionHealth] No Supabase auth token key found in localStorage');
    }

    // Test connection with native fetch + AbortController (browser MUST respect this)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const testUrl = `${supabaseUrl}/rest/v1/`;
      const headers: HeadersInit = {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      };
      
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const response = await fetch(testUrl, {
        signal: controller.signal,
        method: 'HEAD',
        headers,
      });

      clearTimeout(timeoutId);
      // Any HTTP response (including 401/403/404) means the server is reachable.
      // Only network-level failures (timeout, DNS, no connection) should return false.
      return response.status < 500;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        console.error('[SessionHealth] Connection test timed out after', timeoutMs, 'ms');
        return false;
      }
      throw error;
    }
  } catch (error) {
    console.error('[SessionHealth] Connection test failed:', error);
    return false;
  }
}

/**
 * Checks if Supabase client is frozen by testing if getSession() responds
 */
export async function isClientFrozen(): Promise<boolean> {
  try {
    // Try to get session with a timeout
    const sessionPromise = supabase.auth.getSession();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Timeout')), 4000);
    });

    await Promise.race([sessionPromise, timeoutPromise]);
    return false; // Client responded, not frozen
  } catch (error: any) {
    return error?.message === 'Timeout';
  }
}

/**
 * Ensures a valid session exists before database operations.
 * Wrapped in 10-second timeout to prevent hanging when Supabase client is frozen.
 * Never throws; returns { success: false, error } on timeout or failure.
 *
 * @returns Object with success status, user info, and optional error
 */
export async function ensureValidSession(): Promise<{
  success: boolean;
  user?: { id: string; email?: string };
  error?: string;
}> {
  // If a session check is already in progress, reuse it instead of starting a new one.
  // This prevents 3+ concurrent callers (keepalive, return-from-idle, approve button)
  // from all racing to call refreshSession() at the same time.
  if (_ongoingSessionCheck) {
    if (isDev) {
      console.log('[SessionHealth] ensureValidSession() deduplicated - joining existing check');
    }
    return _ongoingSessionCheck;
  }

  const SESSION_TIMEOUT_MS = 25000;
  if (isDev) {
    console.log('[SessionHealth] ensureValidSession() called (likely from mutation or SessionGuard)');
  }

  _ongoingSessionCheck = (async () => {
  try {
    return await withTimeout(
      ensureValidSessionCore(),
      SESSION_TIMEOUT_MS,
      'Session check timed out. Please refresh the page and try again.'
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Session check failed.';
    const isTimeoutOrFrozen =
      msg.includes('Session check timed out') ||
      msg.includes('Session read timed out') ||
      msg.includes('refreshSession timed out');
    if (isTimeoutOrFrozen) {
      if (msg.includes('Session check timed out')) {
        console.error('[SessionHealth] ⏱️ Session check timed out after', SESSION_TIMEOUT_MS, 'ms - refreshSession() likely hung (Supabase client frozen)');
      } else {
        console.warn('[SessionHealth] ⚠️ Inner timeout (getSession/refreshSession) - attempting recovery without full page refresh');
      }
      const recovered = await recoverFromFrozenClient();
      if (recovered.success) {
        return {
          success: true,
          user: recovered.user,
        };
      }
    }
    return {
      success: false,
      error: msg,
    };
  }
  })();

  try {
    return await _ongoingSessionCheck;
  } finally {
    _ongoingSessionCheck = null;
  }
}

/**
 * Boolean adapter for callers that expect Promise<boolean> (e.g. SessionGuard).
 */
export async function ensureValidSessionForMutation(): Promise<boolean> {
  const { success } = await ensureValidSession();
  return success;
}

async function ensureValidSessionCore(): Promise<{
  success: boolean;
  user?: { id: string; email?: string };
  error?: string;
}> {
  try {
    if (isDev) {
      console.log('[SessionHealth] 🔐 Session check started');
    }

    const now = Math.floor(Date.now() / 1000);
    const minRemainingSeconds = 60;

    // Fast path: use current session if still valid enough.
    const sessionRead = await withTimeout(
      supabase.auth.getSession(),
      3000,
      'Session read timed out'
    );

    const currentSession = sessionRead.data.session;
    if (currentSession?.user?.id && currentSession.expires_at && currentSession.expires_at - now > minRemainingSeconds) {
      return {
        success: true,
        user: {
          id: currentSession.user.id,
          email: currentSession.user.email,
        },
      };
    }

    // Quick check: is the Supabase client already frozen before we call refreshSession?
    const frozen = await isClientFrozen();
    if (frozen) {
      // Skip refreshSession() and getSession() - both hang on frozen client. Use recovery only.
      console.warn('[SessionHealth] ⚠️ Supabase client frozen - using recovery path');
      const recovered = await recoverFromFrozenClient();
      if (recovered.success) {
        if (isDev) {
          console.log('[SessionHealth] ✅ Session recovered (bypassed frozen client)');
        }
        return {
          success: true,
          user: recovered.user,
        };
      }
      return {
        success: false,
        error: 'Session could not be recovered. Please refresh the page.',
      };
    }

    if (isDev) {
      console.log('[SessionHealth] 📞 Calling supabase.auth.refreshSession()...');
    }
    const { data: sessionData, error: refreshError } = await withTimeout(
      supabase.auth.refreshSession(),
      5000,
      'refreshSession timed out'
    );

    if (!refreshError && sessionData?.session) {
      if (isDev) {
        console.log('[SessionHealth] ✅ Session valid/refreshed');
      }
      return {
        success: true,
        user: {
          id: sessionData.session.user.id,
          email: sessionData.session.user.email,
        },
      };
    }
    
    // If refresh failed, try recovery via native fetch (do NOT call getSession - client may be frozen)
    console.warn('[SessionHealth] ⚠️ Supabase refresh failed, attempting recovery...');
    const recovered = await recoverFromFrozenClient();

    if (recovered.success) {
      if (isDev) {
        console.log('[SessionHealth] ✅ Session recovered successfully');
      }
      return {
        success: true,
        user: recovered.user,
      };
    }
    
    // Session is truly expired/invalid
    console.error('[SessionHealth] ❌ Unable to ensure valid session');
    return {
      success: false,
      error: refreshError?.message || 'Session expired. Please log in again.',
    };
  } catch (error: any) {
    console.error('[SessionHealth] ❌ Error ensuring valid session:', error);
    const msg = error?.message || 'Authentication error. Please log in again.';
    // When getSession() or refreshSession() times out (frozen client), try recovery before giving up
    if (msg.includes('Session read timed out') || msg.includes('refreshSession timed out')) {
      console.warn('[SessionHealth] ⚠️ Timeout in core - attempting recovery via native fetch');
      const recovered = await recoverFromFrozenClient();
      if (recovered.success) {
        return {
          success: true,
          user: recovered.user,
        };
      }
    }
    return {
      success: false,
      error: msg,
    };
  }
}

export type RecoverResult =
  | { success: true; user: { id: string; email?: string } }
  | { success: false };

/**
 * Recovers session using native fetch when Supabase client is frozen.
 * Returns user info so callers never need to call getSession() on the frozen client.
 */
export async function recoverFromFrozenClient(): Promise<RecoverResult> {
  if (isDev) {
    console.warn('[SessionHealth] Attempting to recover from frozen client...');
  }

  const connectionOk = await testConnection(3000);
  if (!connectionOk) {
    console.error('[SessionHealth] Connection test failed, cannot recover');
    return { success: false };
  }

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = Object.keys(localStorage).find((key) =>
      key.startsWith('sb-') && key.endsWith('-auth-token')
    );

    if (!supabaseKey) return { success: false };

    const storedSession = localStorage.getItem(supabaseKey);
    if (!storedSession) {
      console.warn('[SessionHealth] No stored session found for recovery');
      return { success: false };
    }

    const parsed = JSON.parse(storedSession);
    const refreshToken = parsed?.refresh_token;

    if (isDev) {
      console.log('[SessionHealth] 🔄 Recovery attempt - Token info:', {
        hasRefreshToken: !!refreshToken,
        refreshTokenPreview: refreshToken ? `${refreshToken.substring(0, 20)}...` : null,
        currentAccessToken: parsed?.access_token ? `${parsed.access_token.substring(0, 20)}...` : null,
        expiresAt: parsed?.expires_at ? new Date(parsed.expires_at * 1000).toISOString() : null,
        expiresIn: parsed?.expires_at ? `${parsed.expires_at - Math.floor(Date.now() / 1000)}s` : null,
      });
    }

    if (!refreshToken) return { success: false };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) return { success: false };

    const data = await response.json();
    const resolvedUser = data.user ?? parsed?.user;
    if (!resolvedUser?.id) {
      console.warn('[SessionHealth] Recovery response missing user info');
      return { success: false };
    }

    const newSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
      expires_in: data.expires_in,
      token_type: data.token_type,
      user: resolvedUser,
    };
    localStorage.setItem(supabaseKey, JSON.stringify(newSession));
    if (isDev) {
      console.log('[SessionHealth] ✅ Session refreshed successfully');
    }

    // Replace frozen client with fresh instance so mutations (supabase.from().update())
    // use the new client that reads tokens from localStorage
    replaceSupabaseClient(true);

    const userObj = resolvedUser as { id: string; email?: string; user_metadata?: { email?: string } };
    return {
      success: true,
      user: {
        id: userObj.id,
        email: userObj.email ?? userObj.user_metadata?.email,
      },
    };
  } catch (error) {
    console.error('[SessionHealth] Failed to recover:', error);
    return { success: false };
  }
}

