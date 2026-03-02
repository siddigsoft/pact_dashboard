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

/**
 * @deprecated Use ensureValidSessionForMutation from @/lib/session-health instead.
 * Re-exports for backward compatibility. Uses integrations client via session-health.
 */
export { ensureValidSessionForMutation as ensureValidSession } from '@/lib/session-health';

export default supabase;
