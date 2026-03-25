/**
 * React Query keys and hooks for Down Payment data.
 * Provides cached, deduplicated fetches for down payment requests.
 * Fetch logic lives in downPaymentRepository — this file owns only the hooks and cache keys.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { withTimeout } from '@/utils/promise-with-timeout';
import {
  fetchDownPaymentRequests,
} from '@/features/downPayment/repository/downPaymentRepository';

export type { UserForDownPayment } from '@/features/downPayment/repository/downPaymentRepository';

export const downPaymentQueryKeys = {
  all: ['down-payment'] as const,
  requests: (userId?: string | null, hubId?: string | null, secondaryHubId?: string | null, role?: string | null) =>
    [...downPaymentQueryKeys.all, 'requests', userId ?? '', hubId ?? '', secondaryHubId ?? '', role ?? ''] as const,
};

const STALE_MS = 60 * 1000;

/**
 * Fetches down payment requests for the current user with role-based filtering.
 * Cached and deduplicated by React Query.
 */
export function useDownPaymentRequestsQuery(user: import('@/features/downPayment/repository/downPaymentRepository').UserForDownPayment | null) {
  const enabled = !!user?.id;

  return useQuery({
    queryKey: downPaymentQueryKeys.requests(user?.id, user?.hubId, user?.secondaryHubId, user?.role),
    queryFn: () =>
      withTimeout(
        fetchDownPaymentRequests(user!),
        20000,
        'Failed to load requests. Please refresh the page.'
      ),
    staleTime: STALE_MS,
    placeholderData: (previousData) => previousData,
    enabled,
  });
}

/**
 * Invalidate down payment requests (e.g. after mutations or realtime). Use from context or components.
 */
export function useInvalidateDownPaymentQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: downPaymentQueryKeys.all });
  };
}
