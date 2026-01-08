import { supabase } from '@/integrations/supabase/client';

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
        }
      } catch (e) {
        console.warn('[SessionHealth] Failed to parse stored session:', e);
      }
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
      return response.ok || response.status === 404; // 404 is OK, means server is reachable
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
      setTimeout(() => reject(new Error('Timeout')), 2000);
    });

    await Promise.race([sessionPromise, timeoutPromise]);
    return false; // Client responded, not frozen
  } catch (error) {
    // If timeout or error, client might be frozen
    return true;
  }
}

/**
 * Attempts to recover from frozen client state
 */
export async function recoverFromFrozenClient(): Promise<boolean> {
  console.warn('[SessionHealth] Attempting to recover from frozen client...');
  
  // Test connection with native fetch
  const connectionOk = await testConnection(3000);
  if (!connectionOk) {
    console.error('[SessionHealth] Connection test failed, cannot recover');
    return false;
  }

  // Try to refresh session using native fetch
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = Object.keys(localStorage).find(key => 
      key.startsWith('sb-') && key.endsWith('-auth-token')
    );
    
    if (!supabaseKey) {
      return false;
    }

    const storedSession = localStorage.getItem(supabaseKey);
    if (!storedSession) {
      return false;
    }

    const parsed = JSON.parse(storedSession);
    const refreshToken = parsed?.refresh_token;

    if (!refreshToken) {
      return false;
    }

    // Use native fetch to refresh session
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      signal: controller.signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY || '',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      // Update localStorage with new session
      const newSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        expires_in: data.expires_in,
        token_type: data.token_type,
        user: parsed.user,
      };
      localStorage.setItem(supabaseKey, JSON.stringify(newSession));
      console.log('[SessionHealth] Session refreshed successfully');
      return true;
    }

    return false;
  } catch (error) {
    console.error('[SessionHealth] Failed to recover:', error);
    return false;
  }
}

