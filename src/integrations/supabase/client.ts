import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Flag to check if Supabase is properly configured
export const isSupabaseConfigured = !!(url && anonKey);

// Log configuration status for debugging (especially useful for mobile APK debugging)
if (!isSupabaseConfigured) {
  console.error('[Supabase] Configuration missing. VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.');
  console.error('[Supabase] URL present:', !!url, '| Key present:', !!anonKey);
}

// Create a placeholder client that will fail gracefully if not configured
// This prevents the app from crashing on startup
let supabaseClient: SupabaseClient;

if (isSupabaseConfigured) {
  supabaseClient = createClient(url, anonKey, {
    auth: {
      // Ensure SPA persists auth across reloads and handles OAuth callback params
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
} else {
  // Create a dummy client that will throw helpful errors when used
  // This allows the app to at least render and show an error message
  supabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      if (prop === 'auth') {
        return new Proxy({}, {
          get() {
            return () => Promise.reject(new Error('Supabase is not configured'));
          }
        });
      }
      return () => ({
        select: () => Promise.reject(new Error('Supabase is not configured')),
        insert: () => Promise.reject(new Error('Supabase is not configured')),
        update: () => Promise.reject(new Error('Supabase is not configured')),
        delete: () => Promise.reject(new Error('Supabase is not configured')),
        eq: () => Promise.reject(new Error('Supabase is not configured')),
      });
    }
  });
}

export const supabase = supabaseClient;
