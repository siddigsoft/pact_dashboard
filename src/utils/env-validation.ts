const REQUIRED_VARS: { key: string; description: string }[] = [
  { key: 'VITE_SUPABASE_URL', description: 'Supabase project URL' },
  { key: 'VITE_SUPABASE_ANON_KEY', description: 'Supabase anonymous API key' },
];

const OPTIONAL_VARS: { key: string; description: string }[] = [
  { key: 'VITE_FIREBASE_API_KEY', description: 'Firebase API key (push notifications)' },
  { key: 'VITE_FIREBASE_PROJECT_ID', description: 'Firebase project ID (push notifications)' },
  { key: 'VITE_FIREBASE_APP_ID', description: 'Firebase app ID (push notifications)' },
  { key: 'VITE_FIREBASE_VAPID_PUBLIC_KEY', description: 'Firebase VAPID key (Web Push)' },
];

export interface EnvValidationResult {
  ok: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates that all required environment variables are present and non-empty.
 * Call this at application startup before rendering to surface misconfigurations
 * immediately rather than encountering silent failures later.
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

  if (missing.length === 0) {
    console.info('[ENV] All required environment variables are present.');
  } else {
    console.error(
      `[ENV] ${missing.length} required variable(s) missing: ${missing.join(', ')}. ` +
      'The application will not function correctly. ' +
      'Add them in the Replit Secrets panel (VITE_-prefixed vars are injected at build time).'
    );
  }

  return { ok: missing.length === 0, missing, warnings };
}
