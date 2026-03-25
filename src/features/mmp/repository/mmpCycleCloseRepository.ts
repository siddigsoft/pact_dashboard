import { supabase } from '@/integrations/supabase/client';

type SelectFields = string;

const DEFAULT_APPROVED_STATUS = 'approved';

export async function fetchAdminFomSuperAdminRecipients(): Promise<any[]> {
  const roles = [
    'admin',
    'Admin',
    'super_admin',
    'Super Admin',
    'superAdmin',
    'SuperAdmin',
    'fom',
    'Field Operation Manager (FOM)',
  ];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, hub_id')
    .in('role', roles)
    .eq('status', DEFAULT_APPROVED_STATUS);

  if (error) throw error;
  return (data || []).filter((r: any) => r.email);
}

export async function getSuperAdminEmails(): Promise<string[]> {
  const roles = ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'];

  const { data, error } = await supabase
    .from('profiles')
    .select('email')
    .in('role', roles)
    .eq('status', DEFAULT_APPROVED_STATUS);

  if (error) throw error;
  return (data || []).filter((a: any) => a.email).map((a: any) => a.email);
}

export async function fetchHubNamesByIds(hubIds: string[]): Promise<string[]> {
  if (!hubIds.length) return [];
  const { data, error } = await supabase
    .from('hubs')
    .select('name')
    .in('id', hubIds);

  if (error) throw error;
  return (data || []).map((h: any) => h.name).filter(Boolean);
}

export async function fetchHubIdByNameLike(hubNameLike: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('hubs')
    .select('id')
    .ilike('name', `%${hubNameLike}%`)
    .limit(1);

  if (error) throw error;
  return data?.[0]?.id ?? null;
}

export async function fetchApprovedProfilesByHubIdAndRoles(params: { hubId: string; roles: string[] }): Promise<any[]> {
  const { hubId, roles } = params;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, hub_id, role')
    .in('role', roles)
    .eq('hub_id', hubId)
    .eq('status', DEFAULT_APPROVED_STATUS);

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchUncoveredSiteVisitsForCycleClose(params: {
  mmpIds: string[];
  useNotCoveredFlag: boolean;
}): Promise<any[]> {
  const { mmpIds, useNotCoveredFlag } = params;
  if (!mmpIds.length) return [];

  let q = supabase
    .from('site_visits')
    .select(
      'id, site_name, site_code, state, locality, status, mmp_id, not_covered_flag, not_covered_reason, not_covered_reason_other, not_covered_at, not_covered_by',
    )
    .in('mmp_id', mmpIds);

  if (useNotCoveredFlag) q = q.eq('not_covered_flag', true);
  else q = q.in('status', ['pending', 'assigned', 'dispatched', 'accepted']);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchClosedMmpFiles(): Promise<any[]> {
  const { data, error } = await supabase
    .from('mmp_files')
    .select('id, name, month, hub, cycle_status, cycle_closed_at')
    .eq('cycle_status', 'closed')
    .order('cycle_closed_at', { ascending: false });

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchClosedCycleSiteVisitsStats(mmpIds: string[]): Promise<any[]> {
  if (!mmpIds.length) return [];
  const { data, error } = await supabase
    .from('site_visits')
    .select('mmp_id, status, not_covered_flag, not_covered_reason')
    .in('mmp_id', mmpIds);

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchMmpSiteEntriesScopeOptions(mmpFileId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('hub_office, state, main_activity, activity_at_site')
    .eq('mmp_file_id', mmpFileId);

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchMmpSiteEntryIdsForCloseScope(params: {
  mmpFileId: string;
  scope: 'full' | 'hub' | 'state' | 'activity';
  scopeValue: string;
}): Promise<string[]> {
  const { mmpFileId, scope, scopeValue } = params;

  if (scope === 'hub') {
    const { data, error } = await supabase
      .from('mmp_site_entries')
      .select('id')
      .eq('mmp_file_id', mmpFileId)
      .eq('hub_office', scopeValue);
    if (error) throw error;
    return (data || []).map((e: any) => e.id);
  }

  if (scope === 'state') {
    const { data, error } = await supabase
      .from('mmp_site_entries')
      .select('id')
      .eq('mmp_file_id', mmpFileId)
      .eq('state', scopeValue);
    if (error) throw error;
    return (data || []).map((e: any) => e.id);
  }

  if (scope === 'activity') {
    let activityName = scopeValue;
    let subFilterField: string | null = null;
    let subFilterValue: string | null = null;

    if (scopeValue.includes('||')) {
      const parts = scopeValue.split('||');
      activityName = parts[0];
      const subParts = parts[1]?.split(':');
      if (subParts && subParts.length === 2) {
        subFilterField = subParts[0] === 'state' ? 'state' : 'hub_office';
        subFilterValue = subParts[1];
      }
    }

    let q = supabase
      .from('mmp_site_entries')
      .select('id')
      .eq('mmp_file_id', mmpFileId)
      .or(`main_activity.eq.${activityName},activity_at_site.eq.${activityName}`);

    if (subFilterField && subFilterValue) q = q.eq(subFilterField, subFilterValue);

    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((e: any) => e.id);
  }

  // 'full' should be handled by page flow before calling this.
  return [];
}

export async function fetchMatchedVisitsForCloseScope(params: {
  mmpFileId: string;
  siteEntryIds: string[];
}): Promise<any[]> {
  const { mmpFileId, siteEntryIds } = params;
  if (!siteEntryIds.length) return [];

  const { data, error } = await supabase
    .from('site_visits')
    .select('id')
    .eq('mmp_id', mmpFileId)
    .in('mmp_site_entry_id', siteEntryIds)
    .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);

  if (error) throw error;
  return (data || []) as any[];
}

export async function markSiteVisitsNotCoveredFlagByIds(visitIds: string[]): Promise<void> {
  if (!visitIds.length) return;
  const { error } = await supabase
    .from('site_visits')
    .update({ not_covered_flag: true } as any)
    .in('id', visitIds);

  if (error) throw error;
}

export async function updateMmpFileById(mmpFileId: string, updatePayload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('mmp_files').update(updatePayload as any).eq('id', mmpFileId);
  if (error) throw error;
}

export async function fetchSiteVisitCountsForMmpIds(mmpIds: string[]): Promise<any[]> {
  if (!mmpIds.length) return [];
  const { data, error } = await supabase
    .from('site_visits')
    .select('mmp_id, status')
    .in('mmp_id', mmpIds);

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchSiteVisitsAdditionalDataForQuality(): Promise<any[]> {
  const { data, error } = await supabase
    .from('site_visits')
    .select('mmp_id, additional_data');

  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchAffectedVisitIdsForStartClosingCycle(params: { mmpFileId: string }): Promise<any[]> {
  const { mmpFileId } = params;
  const { data, error } = await supabase
    .from('site_visits')
    .select('id')
    .eq('mmp_id', mmpFileId)
    .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);
  if (error) throw error;
  return (data || []) as any[];
}

export async function markSiteVisitsNotCoveredFlagByMmpId(params: { mmpFileId: string }): Promise<void> {
  const { mmpFileId } = params;
  const { error } = await supabase
    .from('site_visits')
    .update({ not_covered_flag: true } as any)
    .eq('mmp_id', mmpFileId)
    .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);
  if (error) throw error;
}

export async function updateSiteVisitNotCoveredReason(params: { siteVisitId: string; payload: Record<string, unknown> }): Promise<void> {
  const { siteVisitId, payload } = params;
  const { error } = await supabase.from('site_visits').update(payload as any).eq('id', siteVisitId);
  if (error) throw error;
}

export async function bulkUpdateSiteVisitsNotCoveredReason(params: { siteVisitIds: string[]; payload: Record<string, unknown> }): Promise<void> {
  const { siteVisitIds, payload } = params;
  if (!siteVisitIds.length) return;
  const { error } = await supabase.from('site_visits').update(payload as any).in('id', siteVisitIds);
  if (error) throw error;
}

export async function cancelSiteVisitsForClosedCycle(params: { mmpFileId: string }): Promise<void> {
  const { mmpFileId } = params;
  const { error } = await supabase
    .from('site_visits')
    .update({ status: 'cancelled' } as any)
    .eq('mmp_id', mmpFileId)
    .eq('not_covered_flag', true)
    .in('status', ['pending', 'assigned', 'dispatched', 'accepted']);
  if (error) throw error;
}

export async function fetchApprovedProfilesForReminders(params: {
  hubNameLike?: string;
  roles: string[];
}): Promise<any[]> {
  const { hubNameLike, roles } = params;
  let q = supabase
    .from('profiles')
    .select('id, full_name, email, hub_id, role')
    .in('role', roles)
    .eq('status', DEFAULT_APPROVED_STATUS);

  if (hubNameLike) {
    const { data: hubData, error: hubErr } = await supabase
      .from('hubs')
      .select('id')
      .ilike('name', `%${hubNameLike}%`)
      .limit(1);
    if (hubErr) throw hubErr;
    const hubId = hubData?.[0]?.id;
    if (hubId) q = q.eq('hub_id', hubId);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchApprovedSuperAdminsForReminders(): Promise<any[]> {
  const roles = ['super_admin', 'Super Admin', 'superAdmin', 'SuperAdmin'];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, hub_id, role')
    .in('role', roles)
    .eq('status', DEFAULT_APPROVED_STATUS);
  if (error) throw error;
  return (data || []) as any[];
}

