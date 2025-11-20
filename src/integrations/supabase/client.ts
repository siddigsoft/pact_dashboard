import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail fast in production if Supabase is not configured
  // Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set
  throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // Ensure SPA persists auth across reloads and handles OAuth callback params
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
