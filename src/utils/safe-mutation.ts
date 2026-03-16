import { ensureValidSession } from '@/lib/session-health';

/**
 * Wraps a Supabase mutation callback with automatic session validation.
 * Call this in any component/hook that does supabase.from().insert/update/delete
 * without going through a context that already calls ensureValidSession.
 *
 * Returns null (and logs) if the session is invalid so the caller can bail out.
 *
 * Usage:
 *   const result = await safeMutation(async () => {
 *     return supabase.from('table').update({ ... }).eq('id', id);
 *   });
 *   if (!result) return; // session was invalid
 */
export async function safeMutation<T>(
  fn: () => Promise<T>,
): Promise<T | null> {
  const session = await ensureValidSession();
  if (!session.success) {
    console.warn('[safeMutation] Session invalid, aborting mutation:', session.error);
    return null;
  }
  return fn();
}
