/**
 * Profiles — helpers shared by presence / notifications.
 */
import { supabase } from '@/integrations/supabase/client';

/** Minimal profile row for admin wallet / user pickers. */
export function fetchProfileAdminBrief(userId: string) {
  return supabase
    .from('profiles')
    .select('id, full_name, email, role, hub_id')
    .eq('id', userId)
    .single();
}

/** Full listing for audit / activity UIs (actor filter dropdowns). */
export function fetchProfilesForAuditListing() {
  return supabase
    .from('profiles')
    .select('id, full_name, email, role, status, created_at, updated_at, hub_id')
    .order('updated_at', { ascending: false });
}

/** Resolve display names for a set of profile UUIDs (e.g. coordinator / action-by labels). */
export function fetchProfileNamesByIds(ids: string[]) {
  if (ids.length === 0) {
    return Promise.resolve({ data: [] as { id: string; full_name: string | null }[], error: null });
  }
  return supabase.from('profiles').select('id, full_name').in('id', ids);
}

/** Chained queries (large MMP views). Prefer named helpers when a query is stable. */
export function fromProfiles() {
  return supabase.from('profiles');
}

export async function updateProfileLastActivity(userId: string): Promise<void> {
  try {
    await (supabase as any)
      .from('profiles')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', userId);
  } catch {
    /* non-critical */
  }
}

export async function fetchProfileRole(userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return profile?.role ?? null;
}

export async function fetchTeamProjectIds(userId: string): Promise<string[]> {
  const { data: teamMemberships, error: teamError } = await supabase
    .from('team_members')
    .select('project_id')
    .eq('user_id', userId);

  if (teamError || !teamMemberships) return [];
  return teamMemberships
    .map((m) => m.project_id)
    .filter((id): id is string => id !== null);
}
