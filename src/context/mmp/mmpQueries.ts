/**
 * React Query keys and hooks for MMP data.
 * Provides cached, deduplicated fetches for MMP files and site entry counts.
 */
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { transformDBToMMPFile } from './mmpTransform';
import type { MMPFile } from '@/types';
import type { SiteEntryCounts } from './types';

/** Server page size for coordinator / supervisor site-entry lists. */
export const SITE_ENTRIES_PAGE_SIZE = 100;

export const mmpQueryKeys = {
  all: ['mmp'] as const,
  files: () => [...mmpQueryKeys.all, 'files'] as const,
  siteEntryCounts: () => [...mmpQueryKeys.all, 'siteEntryCounts'] as const,
  coordinatorSiteEntries: (userId: string | null) => [...mmpQueryKeys.all, 'coordinatorSiteEntries', userId] as const,
  supervisorSiteEntries: () => [...mmpQueryKeys.all, 'supervisorSiteEntries'] as const,
  siteEntriesForMmp: (mmpId: string) => [...mmpQueryKeys.all, 'siteEntries', mmpId] as const,
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

/**
 * Replaced the previous approach of fetching ALL rows and counting client-side.
 * Now runs 8 parallel COUNT-only queries (HEAD requests — no row data transferred).
 * This is dramatically faster: each request returns a single integer instead of
 * potentially thousands of rows.
 */
async function fetchSiteEntryCounts(): Promise<SiteEntryCounts> {
  if (!navigator.onLine) return defaultSiteEntryCounts;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return defaultSiteEntryCounts;

  try {
    const [
      dispatchedRes,
      acceptedRes,
      smartAssignedRes,
      ongoingRes,
      completedRes,
      rejectedRes,
      costedRes,
      totalRes,
    ] = await Promise.all([
      supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true })
        .eq('status', 'dispatched').is('accepted_by', null),
      supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true })
        .eq('status', 'accepted'),
      supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true })
        .eq('status', 'assigned'),
      supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true })
        .in('status', ['inprogress', 'in_progress', 'ongoing']),
      supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true })
        .eq('status', 'completed'),
      supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true })
        .in('status', ['rejected', 'declined']),
      supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true })
        .in('status', ['approved and costed', 'costed']),
      supabase.from('mmp_site_entries').select('id', { count: 'exact', head: true }),
    ]);

    return {
      dispatched:    dispatchedRes.count    ?? 0,
      accepted:      acceptedRes.count      ?? 0,
      smartAssigned: smartAssignedRes.count ?? 0,
      ongoing:       ongoingRes.count       ?? 0,
      completed:     completedRes.count     ?? 0,
      rejected:      rejectedRes.count      ?? 0,
      approvedCosted: costedRes.count       ?? 0,
      total:         totalRes.count         ?? 0,
    };
  } catch (e) {
    console.warn('[fetchSiteEntryCounts] count query error:', e);
    return defaultSiteEntryCounts;
  }
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
  visit_completed_at: string | null;
  forwarded_to_user_id: string | null;
  created_at: string;
}

export type SiteEntriesPage = {
  rows: CoordinatorSiteEntryRow[];
  nextOffset: number | undefined;
};

export function flattenSiteEntryPages(
  pages?: SiteEntriesPage[]
): CoordinatorSiteEntryRow[] {
  if (!pages?.length) return [];
  return pages.flatMap((p) => p.rows);
}

async function fetchCoordinatorSiteEntriesPage(
  userId: string | null,
  offset: number
): Promise<SiteEntriesPage> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { rows: [], nextOffset: undefined };

  if (!navigator.onLine) return { rows: [], nextOffset: undefined };

  const { data, error } = await supabase.rpc('get_coordinator_site_entries', {
    p_user_id: userId,
    p_limit: SITE_ENTRIES_PAGE_SIZE,
    p_offset: offset,
  });

  if (error) {
    console.warn('[fetchCoordinatorSiteEntries] RPC error:', error.message);
    return { rows: [], nextOffset: undefined };
  }

  const rows = (data ?? []) as CoordinatorSiteEntryRow[];
  const nextOffset =
    rows.length >= SITE_ENTRIES_PAGE_SIZE ? offset + SITE_ENTRIES_PAGE_SIZE : undefined;
  return { rows, nextOffset };
}

// Tighter stale times so data feels fresh on every page visit.
// The counts query is now very cheap (8 HEAD requests), so we poll more aggressively.
const MMP_FILES_STALE_MS  = 20 * 1000;   // 20 s — list metadata
const COUNTS_STALE_MS     =  60 * 1000;  // 1 min — status counts (cheap HEAD queries)
const COUNTS_REFETCH_MS   = 5 * 60 * 1000; // background poll every 5 min while page is open

/**
 * `fetchMMPFiles` intentionally returns each MMP with empty `siteEntries` (loaded on-demand).
 * When React Query refetches, replacing cached data would wipe lazily loaded entries and cause
 * rows to vanish until background loads finish again. Re-attach prior entries per MMP id.
 */
export function mergeMMPFilesPreserveLazySiteEntries(
  fresh: MMPFile[],
  prev: MMPFile[] | undefined
): MMPFile[] {
  if (!prev?.length) return fresh;
  const prevById = new Map(prev.map((m) => [m.id, m]));
  return fresh.map((m) => {
    const prior = prevById.get(m.id);
    const priorLen = prior?.siteEntries?.length ?? 0;
    const freshLen = m.siteEntries?.length ?? 0;
    if (priorLen > 0 && freshLen === 0) {
      return { ...m, siteEntries: prior!.siteEntries };
    }
    return m;
  });
}

/**
 * Fetches MMP files (metadata + empty siteEntries). Cached and deduplicated by React Query.
 * Refetch merges previously loaded site entries so the Verified / Forwarded tabs do not flash empty.
 */
export function useMMPFilesQuery(enabled = true) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: mmpQueryKeys.files(),
    queryFn: async () => {
      const fresh = await fetchMMPFiles();
      const prev = queryClient.getQueryData<MMPFile[]>(mmpQueryKeys.files());
      return mergeMMPFilesPreserveLazySiteEntries(fresh, prev);
    },
    staleTime: MMP_FILES_STALE_MS,
    placeholderData: (previousData) => previousData,
    refetchOnWindowFocus: true,
    enabled,
  });
}

/**
 * Fetches site entry counts using parallel COUNT-only HEAD queries (no row data).
 * Fast enough to poll in the background every 30 s.
 */
export function useMMPSiteEntryCountsQuery(enabled = true) {
  return useQuery({
    queryKey: mmpQueryKeys.siteEntryCounts(),
    queryFn: fetchSiteEntryCounts,
    staleTime: COUNTS_STALE_MS,
    refetchInterval: COUNTS_REFETCH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    placeholderData: (previousData) => previousData ?? defaultSiteEntryCounts,
    enabled,
  });
}

/**
 * Fetches coordinator-relevant site entries only (paginated RPC).
 * When isAdmin is true, pass userId = null to get all entries.
 */
const COORDINATOR_SITES_STALE_MS = 60 * 1000;

export function useCoordinatorSiteEntriesQuery(userId: string | null, isAdmin: boolean) {
  const effectiveUserId = isAdmin ? null : userId;
  return useInfiniteQuery({
    queryKey: mmpQueryKeys.coordinatorSiteEntries(effectiveUserId),
    queryFn: ({ pageParam }) => fetchCoordinatorSiteEntriesPage(effectiveUserId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    enabled: isAdmin || !!userId,
    staleTime: COORDINATOR_SITES_STALE_MS,
  });
}

/**
 * One page of site entries for supervisor view — direct table query (no coordinator RPC).
 * Hub/status filtering stays client-side in useCoordinatorSites.
 */
function mapSupervisorSiteEntryRow(row: any): CoordinatorSiteEntryRow {
  return {
    id: row.id,
    mmp_file_id: row.mmp_file_id,
    mmp_name: 'Unknown MMP', // filled in by the hook from contextMmpFiles
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
    visit_completed_at: row.visit_completed_at ?? null,
    forwarded_to_user_id: row.forwarded_to_user_id ?? null,
    created_at: row.created_at,
  };
}

async function fetchSupervisorSiteEntriesPage(offset: number): Promise<SiteEntriesPage> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { rows: [], nextOffset: undefined };
  if (!navigator.onLine) return { rows: [], nextOffset: undefined };

  const from = offset;
  const to = offset + SITE_ENTRIES_PAGE_SIZE - 1;

  // No join — avoids FK registration issues with PostgREST.
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select(
      'id, mmp_file_id, site_code, hub_office, state, locality, site_name,' +
      'cp_name, visit_type, visit_date, main_activity, activity_at_site,' +
      'monitoring_by, survey_tool, use_market_diversion, use_warehouse_monitoring,' +
      'comments, additional_data, status,' +
      'verified_at, verified_by, verification_notes,' +
      'cost, enumerator_fee, transport_fee,' +
      'accepted_by, accepted_at, visit_completed_at, forwarded_to_user_id, created_at'
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    console.warn('[fetchSupervisorSiteEntries] query error:', error.message);
    return { rows: [], nextOffset: undefined };
  }

  const rows = (data || []).map(mapSupervisorSiteEntryRow);
  const nextOffset =
    rows.length >= SITE_ENTRIES_PAGE_SIZE ? offset + SITE_ENTRIES_PAGE_SIZE : undefined;
  return { rows, nextOffset };
}

const SUPERVISOR_SITES_STALE_MS = 60 * 1000;

export function useSupervisorSiteEntriesQuery(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: mmpQueryKeys.supervisorSiteEntries(),
    queryFn: ({ pageParam }) => fetchSupervisorSiteEntriesPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (last) => last.nextOffset,
    enabled,
    staleTime: SUPERVISOR_SITES_STALE_MS,
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
    queryClient.invalidateQueries({ queryKey: mmpQueryKeys.supervisorSiteEntries() });
  };
}
