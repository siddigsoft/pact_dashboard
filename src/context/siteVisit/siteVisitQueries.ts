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

const STALE_MS = 60 * 1000;

export function useSiteVisitsQuery() {
  return useQuery({
    queryKey: siteVisitQueryKeys.list(),
    queryFn: fetchSiteVisits,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
  });
}

export function useInvalidateSiteVisitsQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: siteVisitQueryKeys.all });
  };
}
