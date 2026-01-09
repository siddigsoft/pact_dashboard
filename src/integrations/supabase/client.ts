import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.error('[Supabase] Configuration missing');
}

let supabaseClient: SupabaseClient;

if (isSupabaseConfigured) {
  supabaseClient = createClient(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: localStorage, // 🔥 critical fix (web + mobile)
    },
  });
} else {
  supabaseClient = new Proxy({} as SupabaseClient, {
    get() {
      return () =>
        Promise.reject(new Error('Supabase is not configured'));
    },
  });
}

export const supabase = supabaseClient;
