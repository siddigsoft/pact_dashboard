import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Make sure your .env has these values.'
  );
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL || '', SUPABASE_ANON_KEY || '', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storageKey: 'pact-supabase-auth',
  },
  global: {
    headers: {
      'x-client-info': 'pact-command-center',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

let _refreshPromise: Promise<boolean> | null = null;

export async function ensureValidSession(): Promise<boolean> {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;
      const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
      const now = Date.now();
      if (expiresAt - now < 2 * 60 * 1000) {
        const { data, error } = await supabase.auth.refreshSession();
        if (error || !data.session) return false;
      }
      return true;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

export default supabase;
