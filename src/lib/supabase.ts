/**
 * Compatibility shim — do not create a second Supabase client here.
 * All callers share the canonical client (same auth storage / session).
 */
import { supabase } from '@/integrations/supabase/client';

// One-time: move session from the old Field Data storage key into the
// default sb-*-auth-token key used by integrations/supabase/client.
try {
  const legacyKey = 'pact-supabase-auth';
  const legacy = localStorage.getItem(legacyKey);
  if (legacy) {
    const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
    if (url) {
      const projectRef = new URL(url).hostname.split('.')[0];
      const canonicalKey = `sb-${projectRef}-auth-token`;
      if (!localStorage.getItem(canonicalKey)) {
        localStorage.setItem(canonicalKey, legacy);
      }
    }
    localStorage.removeItem(legacyKey);
  }
} catch {
  // ignore storage errors
}

export { supabase };
export { ensureValidSessionForMutation as ensureValidSession } from '@/lib/session-health';
export default supabase;
