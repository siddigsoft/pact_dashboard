const REQUIRED_VARS: { key: string; description: string }[] = [
  { key: 'VITE_SUPABASE_URL', description: 'Supabase project URL' },
  { key: 'VITE_SUPABASE_ANON_KEY', description: 'Supabase anonymous API key' },
];

const OPTIONAL_VARS: { key: string; description: string }[] = [
  { key: 'VITE_FIREBASE_API_KEY', description: 'Firebase API key (push notifications)' },
  { key: 'VITE_FIREBASE_AUTH_DOMAIN', description: 'Firebase auth domain' },
  { key: 'VITE_FIREBASE_PROJECT_ID', description: 'Firebase project ID' },
  { key: 'VITE_FIREBASE_STORAGE_BUCKET', description: 'Firebase storage bucket' },
  { key: 'VITE_FIREBASE_MESSAGING_SENDER_ID', description: 'Firebase messaging sender ID' },
  { key: 'VITE_FIREBASE_APP_ID', description: 'Firebase app ID' },
  { key: 'VITE_FIREBASE_VAPID_PUBLIC_KEY', description: 'Firebase VAPID key (Web Push)' },
];

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates that all required client-side environment variables are present and non-empty.
 * Call at application startup (before ReactDOM.createRoot) so misconfigurations are
 * surfaced immediately as console errors rather than silent failures at runtime.
 *
 * Note: Server-side secrets (GOOGLE_AI_API_KEY for Gemini OCR, GROQ_API_KEY for the
 * Groq OCR fallback, FIREBASE_SERVICE_ACCOUNT_JSON for FCM admin) are consumed by the
 * Vite dev middleware / Supabase Edge Functions and cannot be validated in the client
 * bundle. Ensure they are present in the Replit Secrets panel before deploying.
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const { key, description } of REQUIRED_VARS) {
    const val = (import.meta.env as Record<string, string | undefined>)[key]?.trim();
    if (!val) {
      missing.push(key);
      console.error(`[ENV] Missing required variable: ${key} — ${description}`);
    }
  }

  for (const { key, description } of OPTIONAL_VARS) {
    const val = (import.meta.env as Record<string, string | undefined>)[key]?.trim();
    if (!val) {
      warnings.push(key);
      console.warn(`[ENV] Missing optional variable: ${key} — ${description}`);
    }
  }

  if (missing.length === 0 && warnings.length === 0) {
    console.info('[ENV] All required and optional environment variables are present.');
  } else if (missing.length > 0) {
    console.error(
      `[ENV] ${missing.length} required variable(s) missing: ${missing.join(', ')}. ` +
      'The application will not function correctly. ' +
      'Add them in the Replit Secrets panel (VITE_-prefixed vars are baked in at build time).'
    );
  }

  return { ok: missing.length === 0, missing, warnings };
}

/**
 * Verifies that both service worker files are reachable (HTTP 200) before they
 * are registered. Call once after the DOM is ready to detect 404 errors caused
 * by missing files in the production build output, rather than surfacing them
 * as opaque ServiceWorker registration failures.
 */
export async function verifyServiceWorkerFiles(): Promise<{ ok: boolean; errors: string[] }> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: true, errors: [] };
  }

  const swFiles = ['/service-worker.js', '/firebase-messaging-sw.js'];
  const errors: string[] = [];

  await Promise.all(
    swFiles.map(async (path) => {
      try {
        const res = await fetch(path, { method: 'HEAD', cache: 'no-store' });
        if (!res.ok) {
          errors.push(`${path} returned HTTP ${res.status}`);
          console.error(`[SW] Service worker not accessible: ${path} → HTTP ${res.status}`);
        } else {
          console.info(`[SW] Service worker reachable: ${path} → HTTP ${res.status}`);
        }
      } catch (err) {
        errors.push(`${path} network error`);
        console.error(`[SW] Service worker unreachable: ${path}`, err);
      }
    })
  );

  return { ok: errors.length === 0, errors };
}
