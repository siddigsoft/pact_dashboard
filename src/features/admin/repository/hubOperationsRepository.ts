import { supabase } from '@/integrations/supabase/client';

export function subscribeHubOperationsRealtime(onReload: () => void): () => void {
  const channel = supabase
    .channel('sites_changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'sites_registry' },
      () => onReload(),
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'mmp_site_entries' },
      () => onReload(),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export async function fetchHubsAndHubStatesForHubOperations(): Promise<{
  hubsData: any[];
  hubStatesData: any[];
}> {
  const { data: hubsData, error: hubsError } = await supabase
    .from('hubs')
    .select('*')
    .order('name');

  if (hubsError) throw hubsError;

  const { data: hubStatesData, error: statesError } = await supabase.from('hub_states').select('*');

  if (statesError && statesError.code !== '42P01') throw statesError;

  return {
    hubsData: (hubsData || []) as any[],
    hubStatesData: (hubStatesData || []) as any[],
  };
}

export function fetchSitesRegistryPageRange(startIdx: number, endIdx: number) {
  return supabase
    .from('sites_registry')
    .select('*')
    .order('created_at', { ascending: false })
    .range(startIdx, endIdx);
}

export function countSitesRegistryTotal() {
  return supabase.from('sites_registry').select('id', { count: 'exact', head: true });
}

export function fetchMmpSiteEntriesForHubOperationsFirstPage(mmpColumns: string) {
  return supabase
    .from('mmp_site_entries')
    .select(mmpColumns)
    .order('created_at', { ascending: false });
}

export function fetchMmpEntryForHubOperationsByRegistrySiteId(params: { registrySiteId: string; mmpEnrichSelect: string }) {
  return supabase
    .from('mmp_site_entries')
    .select(params.mmpEnrichSelect)
    .eq('registry_site_id', params.registrySiteId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export function fetchMmpEntryForHubOperationsBySiteCode(params: { siteCode: string; mmpEnrichSelect: string }) {
  return supabase
    .from('mmp_site_entries')
    .select(params.mmpEnrichSelect)
    .eq('site_code', params.siteCode)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export function fetchMmpEntryForHubOperationsByNameAndState(params: { siteName: string; stateName: string; mmpEnrichSelect: string }) {
  return supabase
    .from('mmp_site_entries')
    .select(params.mmpEnrichSelect)
    .ilike('site_name', params.siteName)
    .ilike('state', params.stateName)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
}

export function insertHubRow(hubData: Record<string, unknown>) {
  return supabase.from('hubs').insert(hubData);
}

export function insertHubStatesRows(hubStatesData: Array<Record<string, unknown>>) {
  return supabase.from('hub_states').insert(hubStatesData);
}

export function updateHubRow(hubId: string, payload: Record<string, unknown>) {
  return supabase.from('hubs').update(payload).eq('id', hubId);
}

export function deleteHubStatesByHubId(hubId: string) {
  return supabase.from('hub_states').delete().eq('hub_id', hubId);
}

export function deleteHubRow(hubId: string) {
  return supabase.from('hubs').delete().eq('id', hubId);
}

export function insertSitesRegistryRow(siteData: Record<string, unknown>) {
  return supabase.from('sites_registry').insert(siteData);
}

export function deleteSitesRegistryRow(siteId: string) {
  return supabase.from('sites_registry').delete().eq('id', siteId);
}

export function fetchProjectScopesOrdered() {
  return supabase
    .from('project_scopes')
    .select('*')
    .order('created_at', { ascending: false });
}

export function updateSitesRegistryRow(siteId: string, payload: Record<string, unknown>) {
  return supabase.from('sites_registry').update(payload).eq('id', siteId);
}

