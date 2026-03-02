import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.error('[Supabase] Configuration missing');
}

function createSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured || !url || !anonKey) {
    return new Proxy({} as SupabaseClient, {
      get() {
        return () => Promise.reject(new Error('Supabase is not configured'));
      },
    });
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: localStorage, // 🔥 critical fix (web + mobile)
    },
  });
}

let _client = createSupabaseClient();

/**
 * Replace the Supabase client with a fresh instance.
 * Call after session recovery when the client is frozen - the new instance
 * reads tokens from localStorage and works for subsequent mutations.
 */
export function replaceSupabaseClient(): void {
  _client = createSupabaseClient();
  console.log('[Supabase] Client replaced (recovery from frozen state)');
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string) {
    return ((_client as unknown) as Record<string, unknown>)[prop];
  },
});
