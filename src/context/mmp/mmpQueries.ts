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
      ),
      mmp_site_entries (*)
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

  console.log('[fetchMMPFiles] Loaded', rows?.length, 'MMP files');
  if (rows && rows.length > 0) {
    const firstWithEntries = rows.find((r: any) => r.mmp_site_entries?.length > 0);
    if (firstWithEntries) {
      console.log('[fetchMMPFiles] Sample entry keys:', Object.keys(firstWithEntries.mmp_site_entries[0]));
      console.log('[fetchMMPFiles] Sample forwarded_to_user_id:', firstWithEntries.mmp_site_entries[0].forwarded_to_user_id);
    } else {
      console.warn('[fetchMMPFiles] NO MMP files have site entries!');
    }
  }

  return (rows || []).map(transformDBToMMPFile);
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
 * Invalidate MMP files and counts (e.g. after mutations). Use from context or components.
 */
export function useInvalidateMMPQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: mmpQueryKeys.files() });
    queryClient.invalidateQueries({ queryKey: mmpQueryKeys.siteEntryCounts() });
  };
}
