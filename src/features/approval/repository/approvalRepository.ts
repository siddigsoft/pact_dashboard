/**
 * Approval domain — DB access for approval flows (e.g. super-admin recipients).
 */
import { supabase } from '@/integrations/supabase/client';

export async function fetchActiveSuperAdminUserIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from('super_admins')
    .select('user_id')
    .eq('is_active', true);

  if (error) throw error;
  return (data || []).map((r: { user_id: string }) => r.user_id);
}
