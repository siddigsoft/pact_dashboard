import { supabase } from '@/integrations/supabase/client';
import { ensureValidSession } from '@/lib/session-health';

export type NotificationInsertRow = Record<string, unknown>;

/**
 * Insert one or more notifications via SECURITY DEFINER RPC.
 * Avoids RLS failures when the client JWT role is not `authenticated`.
 */
export async function insertNotificationsToDb(
  rows: NotificationInsertRow[]
): Promise<string[]> {
  if (!rows?.length) return [];

  const session = await ensureValidSession();
  if (!session.success) {
    console.warn('[insertNotificationsToDb] No valid session, skipping insert');
    return [];
  }

  const { data, error } = await supabase.rpc('insert_notifications_secure', {
    p_rows: rows,
  });

  if (error) {
    console.error('[insertNotificationsToDb] RPC failed:', error);
    throw error;
  }

  return (data as string[] | null) ?? [];
}
