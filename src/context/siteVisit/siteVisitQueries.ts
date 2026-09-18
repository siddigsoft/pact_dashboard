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
const FETCH_TIMEOUT_MS = 30_000;

export function useSiteVisitsQuery(enabled = true) {
  return useQuery({
    queryKey: siteVisitQueryKeys.list(),
    queryFn: async ({ signal }) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Site visits fetch timed out')),
          FETCH_TIMEOUT_MS
        );
      });
      try {
        return await Promise.race([fetchSiteVisits(signal), timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
    retry: 1,
  });
}

export function useInvalidateSiteVisitsQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: siteVisitQueryKeys.all });
  };
}
