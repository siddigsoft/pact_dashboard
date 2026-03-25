/**
 * Location reference data — hubs, hub_states, sites_registry localities.
 */
import { supabase } from '@/integrations/supabase/client';

export async function hasAuthSession(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

export async function fetchActiveHubs() {
  return supabase
    .from('hubs')
    .select('id, name, description, is_active')
    .eq('is_active', true)
    .order('name');
}

export async function fetchHubStates() {
  return supabase
    .from('hub_states')
    .select('hub_id, state_id, state_name, state_code')
    .order('state_name');
}

export async function fetchSitesRegistryLocalities() {
  return supabase
    .from('sites_registry')
    .select('locality_id, locality_name, state_id')
    .order('locality_name');
}

/** Hub display names for supervisor headers (e.g. SiteVisits). */
export function fetchHubNamesByHubIds(hubIds: string[]) {
  if (hubIds.length === 0) {
    return Promise.resolve({ data: [] as { name: string }[], error: null });
  }
  return supabase.from('hubs').select('name').in('id', hubIds);
}
