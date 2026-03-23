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
