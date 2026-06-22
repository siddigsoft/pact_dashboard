/**
 * React Query keys and hooks for Site Visit data.
 * Provides cached, deduplicated fetches for site visits.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSiteVisits } from './supabase';
import type { SiteVisit } from '@/types';

export const siteVisitQueryKeys = {
  all: ['site-visits'] as const,
  list: () => [...siteVisitQueryKeys.all] as const,
};

const STALE_MS = 5 * 60 * 1000; // 5 minutes — avoid re-fetching on every navigation

export function useSiteVisitsQuery(enabled = true) {
  return useQuery({
    queryKey: siteVisitQueryKeys.list(),
    queryFn: fetchSiteVisits,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useInvalidateSiteVisitsQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: siteVisitQueryKeys.all });
  };
}
