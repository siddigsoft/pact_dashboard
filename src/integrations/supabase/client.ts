import { createClient, SupabaseClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const url = rawUrl?.trim();
const anonKey = rawAnonKey?.trim();
const isDev = import.meta.env.DEV;
const CLIENT_REPLACE_COOLDOWN_MS = 15_000;

export const isSupabaseConfigured = Boolean(url && anonKey);

const _missingVars: string[] = [];
if (!url) _missingVars.push('VITE_SUPABASE_URL');
if (!anonKey) _missingVars.push('VITE_SUPABASE_ANON_KEY');

if (_missingVars.length > 0) {
  console.error(
    `[Supabase] Missing required environment variable(s): ${_missingVars.join(', ')}. ` +
    'The app will not be able to connect to the database. ' +
    'Ensure these are set in the Replit Secrets panel before deploying.'
  );
}

/** Returns the list of missing Supabase env vars (empty when fully configured). */
export function getMissingSupabaseVars(): string[] {
  return [..._missingVars];
}

/**
 * Custom lock function for Supabase auth.
 * Uses navigator.locks with an AbortSignal timeout so that zombie locks
 * (held by frozen/backgrounded tab operations) cannot block new auth calls.
 * Falls back to simple execution if Web Locks API is unavailable.
 */
function createAuthLock() {
  const LOCK_ACQUIRE_TIMEOUT_MS = 8000;

  return async function lock<R>(name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
    if (typeof navigator === 'undefined' || !navigator.locks?.request) {
      return await fn();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), LOCK_ACQUIRE_TIMEOUT_MS);

    try {
      return await navigator.locks.request(name, { signal: controller.signal }, fn);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // Lock was held too long (zombie lock). Run without lock as fallback.
        console.warn('[Supabase] Auth lock timed out, running without lock:', name);
        return await fn();
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  };
}

/**
 * Global fetch wrapper with AbortController timeout.
 * Prevents REST API calls from hanging indefinitely on stuck TCP connections.
 */
const FETCH_TIMEOUT_MS = 20_000;
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const signal = init?.signal
    ? anySignal([init.signal, controller.signal])
    : controller.signal;
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timeoutId));
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) { controller.abort(signal.reason); break; }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
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
      storage: localStorage,
      lock: createAuthLock(),
    },
    global: {
      fetch: fetchWithTimeout,
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

// Session liveness is managed by SessionGuard/SessionManager; avoid extra
// periodic getSession() heartbeats here to prevent overlapping refresh storms.
