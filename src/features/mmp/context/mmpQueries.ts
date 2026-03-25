/**
 * React Query hooks for MMP data.
 * Fetch logic lives in mmpRepository — this file owns only the hooks and cache keys.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchMMPFiles,
  fetchSiteEntryCounts,
  fetchCoordinatorSiteEntries,
  fetchSupervisorSiteEntries,
  defaultSiteEntryCounts,
} from '@/features/mmp/repository/mmpRepository';
import type { CoordinatorSiteEntryRow } from '@/features/mmp/repository/mmpRepository';
import type { SiteEntryCounts } from './types';

export type { CoordinatorSiteEntryRow };
export { defaultSiteEntryCounts };

export const mmpQueryKeys = {
  all: ['mmp'] as const,
  files: () => [...mmpQueryKeys.all, 'files'] as const,
  siteEntryCounts: () => [...mmpQueryKeys.all, 'siteEntryCounts'] as const,
  coordinatorSiteEntries: (userId: string | null) => [...mmpQueryKeys.all, 'coordinatorSiteEntries', userId] as const,
  supervisorSiteEntries: () => [...mmpQueryKeys.all, 'supervisorSiteEntries'] as const,
};

const MMP_FILES_STALE_MS = 60 * 1000;
const COUNTS_STALE_MS = 30 * 1000;
const COORDINATOR_SITES_STALE_MS = 60 * 1000;
const SUPERVISOR_SITES_STALE_MS = 60 * 1000;

export function useMMPFilesQuery() {
  return useQuery({
    queryKey: mmpQueryKeys.files(),
    queryFn: fetchMMPFiles,
    staleTime: MMP_FILES_STALE_MS,
    placeholderData: (previousData) => previousData,
  });
}

export function useMMPSiteEntryCountsQuery() {
  return useQuery({
    queryKey: mmpQueryKeys.siteEntryCounts(),
    queryFn: fetchSiteEntryCounts,
    staleTime: COUNTS_STALE_MS,
    placeholderData: (previousData) => previousData ?? defaultSiteEntryCounts,
  });
}

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

export function useSupervisorSiteEntriesQuery(enabled: boolean) {
  return useQuery({
    queryKey: mmpQueryKeys.supervisorSiteEntries(),
    queryFn: fetchSupervisorSiteEntries,
    enabled,
    staleTime: SUPERVISOR_SITES_STALE_MS,
    placeholderData: (previousData) => previousData,
  });
}

export function useInvalidateMMPQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: mmpQueryKeys.files() });
    queryClient.invalidateQueries({ queryKey: mmpQueryKeys.siteEntryCounts() });
    queryClient.invalidateQueries({ queryKey: [...mmpQueryKeys.all, 'coordinatorSiteEntries'] });
  };
}
