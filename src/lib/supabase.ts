import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  const msg = '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Make sure your .env or Vercel environment variables have these values.';
  if (typeof document !== 'undefined') {
    document.title = 'Configuration Error';
    const root = document.getElementById('root');
    if (root) {
      root.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;padding:20px;text-align:center"><div><h2>Configuration Error</h2><p>Missing database connection settings. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables are set during the build process.</p></div></div>';
    }
  }
  throw new Error(msg);
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
