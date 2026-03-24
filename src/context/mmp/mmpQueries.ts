/**
 * React Query keys and hooks for MMP data.
 * Provides cached, deduplicated fetches for MMP files and site entry counts.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { transformDBToMMPFile } from './mmpTransform';
import type { MMPFile } from '@/types';
import type { SiteEntryCounts } from './types';

export const mmpQueryKeys = {
  all: ['mmp'] as const,
  files: () => [...mmpQueryKeys.all, 'files'] as const,
  siteEntryCounts: () => [...mmpQueryKeys.all, 'siteEntryCounts'] as const,
  coordinatorSiteEntries: (userId: string | null) => [...mmpQueryKeys.all, 'coordinatorSiteEntries', userId] as const,
  supervisorSiteEntries: () => [...mmpQueryKeys.all, 'supervisorSiteEntries'] as const,
};

export const defaultSiteEntryCounts: SiteEntryCounts = {
  dispatched: 0,
  accepted: 0,
  smartAssigned: 0,
  ongoing: 0,
  completed: 0,
  rejected: 0,
  approvedCosted: 0,
  total: 0,
};

async function fetchMMPFiles(): Promise<MMPFile[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  if (!navigator.onLine) {
    return [];
  }

  const { data: mmpData, error } = await supabase
    .from('mmp_files')
    .select(`
      *,
      project:projects(
        id,
        name,
        project_code
      )
    `)
    .order('created_at', { ascending: false });

  let rows = mmpData;
  if (error) {
    console.warn('[fetchMMPFiles] Primary query failed, falling back:', error.message);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('mmp_files')
      .select('*')
      .order('created_at', { ascending: false });
    if (fallbackError) throw fallbackError;
    rows = fallbackData;
  }

  // Keep list fetch lightweight; site entries are loaded on-demand.
  return (rows || []).map((row: any) =>
    transformDBToMMPFile({
      ...row,
      mmp_site_entries: [],
    })
  );
}

async function fetchSiteEntryCounts(): Promise<SiteEntryCounts> {
  if (!navigator.onLine) return defaultSiteEntryCounts;

  const { data: rows, error } = await supabase
    .from('mmp_site_entries')
    .select('status, accepted_by');

  if (error) {
    console.warn('Count query error:', error);
    return defaultSiteEntryCounts;
  }

  let dispatched = 0, accepted = 0, smartAssigned = 0, ongoing = 0;
  let completed = 0, rejected = 0, approvedCosted = 0;
  const total = rows?.length || 0;

  for (const r of (rows || [])) {
    const s = (r.status || '').toLowerCase();
    if (s === 'dispatched' && !r.accepted_by) dispatched++;
    else if (s === 'accepted') accepted++;
    else if (s === 'assigned') smartAssigned++;
    else if (s === 'inprogress' || s === 'in_progress' || s === 'ongoing') ongoing++;
    else if (s === 'completed') completed++;
    else if (s === 'rejected' || s === 'declined') rejected++;
    else if (s === 'approved and costed' || s === 'costed') approvedCosted++;
  }

  return { dispatched, accepted, smartAssigned, ongoing, completed, rejected, approvedCosted, total };
}

/** Row shape returned by get_coordinator_site_entries RPC */
export interface CoordinatorSiteEntryRow {
  id: string;
  mmp_file_id: string;
  mmp_name: string;
  site_code: string;
  hub_office: string;
  state: string;
  locality: string;
  site_name: string;
  cp_name: string | null;
  visit_type: string | null;
  visit_date: string | null;
  main_activity: string | null;
  activity_at_site: string | null;
  monitoring_by: string | null;
  survey_tool: string | null;
  use_market_diversion: boolean | null;
  use_warehouse_monitoring: boolean | null;
  comments: string | null;
  additional_data: Record<string, unknown> | null;
  status: string;
  verified_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  cost: number | null;
  enumerator_fee: number | null;
  transport_fee: number | null;
  accepted_by: string | null;
  accepted_at: string | null;
  forwarded_to_user_id: string | null;
  created_at: string;
}

async function fetchCoordinatorSiteEntries(userId: string | null): Promise<CoordinatorSiteEntryRow[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  if (!navigator.onLine) return [];

  const { data, error } = await supabase.rpc('get_coordinator_site_entries', {
    p_user_id: userId,
  });

  if (error) {
    console.warn('[fetchCoordinatorSiteEntries] RPC error:', error.message);
    return [];
  }
  return (data ?? []) as CoordinatorSiteEntryRow[];
}

const MMP_FILES_STALE_MS = 60 * 1000;   // 1 minute
const COUNTS_STALE_MS = 30 * 1000;      // 30 seconds

/**
 * Fetches MMP files with site entries. Cached and deduplicated by React Query.
 */
export function useMMPFilesQuery() {
  return useQuery({
    queryKey: mmpQueryKeys.files(),
    queryFn: fetchMMPFiles,
    staleTime: MMP_FILES_STALE_MS,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetches site entry counts (dispatched, accepted, etc.). Cached and deduplicated.
 */
export function useMMPSiteEntryCountsQuery() {
  return useQuery({
    queryKey: mmpQueryKeys.siteEntryCounts(),
    queryFn: fetchSiteEntryCounts,
    staleTime: COUNTS_STALE_MS,
    placeholderData: (previousData) => previousData ?? defaultSiteEntryCounts,
  });
}

/**
 * Fetches coordinator-relevant site entries only (RPC). Use for coordinator page to avoid loading all MMP + entries.
 * When isAdmin is true, pass userId = null to get all entries.
 */
const COORDINATOR_SITES_STALE_MS = 60 * 1000;

export function useCoordinatorSiteEntriesQuery(userId: string | null, isAdmin: boolean) {
  const effectiveUserId = isAdmin ? null : userId;
  return useQuery({
    queryKey: mmpQueryKeys.coordinatorSiteEntries(effectiveUserId),
    queryFn: () => fetchCoordinatorSiteEntries(effectiveUserId),
    enabled: isAdmin || !!userId,
    staleTime: COORDINATOR_SITES_STALE_MS,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetches all site entries for supervisor view — direct table query bypassing the coordinator RPC.
 * Returns all pipeline-relevant entries joined with their MMP name.
 * Hub/status filtering is applied client-side in useCoordinatorSites.
 */
async function fetchSupervisorSiteEntries(): Promise<CoordinatorSiteEntryRow[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  if (!navigator.onLine) return [];

  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select(`
      id, mmp_file_id, site_code, hub_office, state, locality, site_name,
      cp_name, visit_type, visit_date, main_activity, activity_at_site,
      monitoring_by, survey_tool, use_market_diversion, use_warehouse_monitoring,
      comments, additional_data, status,
      verified_at, verified_by, verification_notes,
      cost, enumerator_fee, transport_fee,
      accepted_by, accepted_at, forwarded_to_user_id, created_at,
      mmp_files(name)
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[fetchSupervisorSiteEntries] query error:', error.message);
    return [];
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    mmp_file_id: row.mmp_file_id,
    mmp_name: row.mmp_files?.name || 'Unknown MMP',
    site_code: row.site_code,
    hub_office: row.hub_office,
    state: row.state,
    locality: row.locality,
    site_name: row.site_name,
    cp_name: row.cp_name ?? null,
    visit_type: row.visit_type ?? null,
    visit_date: row.visit_date ?? null,
    main_activity: row.main_activity ?? null,
    activity_at_site: row.activity_at_site ?? null,
    monitoring_by: row.monitoring_by ?? null,
    survey_tool: row.survey_tool ?? null,
    use_market_diversion: row.use_market_diversion ?? null,
    use_warehouse_monitoring: row.use_warehouse_monitoring ?? null,
    comments: row.comments ?? null,
    additional_data: row.additional_data ?? null,
    status: row.status,
    verified_at: row.verified_at ?? null,
    verified_by: row.verified_by ?? null,
    verification_notes: row.verification_notes ?? null,
    cost: row.cost ?? null,
    enumerator_fee: row.enumerator_fee ?? null,
    transport_fee: row.transport_fee ?? null,
    accepted_by: row.accepted_by ?? null,
    accepted_at: row.accepted_at ?? null,
    forwarded_to_user_id: row.forwarded_to_user_id ?? null,
    created_at: row.created_at,
  })) as CoordinatorSiteEntryRow[];
}

const SUPERVISOR_SITES_STALE_MS = 60 * 1000;

export function useSupervisorSiteEntriesQuery(enabled: boolean) {
  return useQuery({
    queryKey: mmpQueryKeys.supervisorSiteEntries(),
    queryFn: fetchSupervisorSiteEntries,
    enabled,
    staleTime: SUPERVISOR_SITES_STALE_MS,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Invalidate MMP files and counts (e.g. after mutations). Use from context or components.
 */
export function useInvalidateMMPQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: mmpQueryKeys.files() });
    queryClient.invalidateQueries({ queryKey: mmpQueryKeys.siteEntryCounts() });
    queryClient.invalidateQueries({ queryKey: [...mmpQueryKeys.all, 'coordinatorSiteEntries'] });
  };
}
