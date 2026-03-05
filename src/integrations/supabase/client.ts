import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const url = rawUrl?.trim();
const anonKey = rawAnonKey?.trim();
const isDev = import.meta.env.DEV;
const CLIENT_REPLACE_COOLDOWN_MS = 30_000;

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
let lastClientReplacementAt = 0;

/**
 * Replace the Supabase client with a fresh instance.
 * Call after session recovery when the client is frozen - the new instance
 * reads tokens from localStorage and works for subsequent mutations.
 */
export function replaceSupabaseClient(force = false): void {
  const now = Date.now();
  if (!force && now - lastClientReplacementAt < CLIENT_REPLACE_COOLDOWN_MS) {
    if (isDev) {
      console.warn('[Supabase] Client replacement skipped (cooldown active)');
    }
    return;
  }

  try {
    _client.realtime.disconnect();
  } catch {
  }

  _client = createSupabaseClient();
  lastClientReplacementAt = now;
  if (isDev) {
    console.log('[Supabase] Client replaced (recovery from frozen state)');
  }
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop: string) {
    return ((_client as unknown) as Record<string, unknown>)[prop];
  },
});
