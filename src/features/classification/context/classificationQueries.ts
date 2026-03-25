/**
 * React Query keys and hooks for Classification data.
 * Fetch logic lives in classificationRepository — this file owns only the hooks and cache keys.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUserClassifications,
  fetchFeeStructures,
  transformUserClassificationFromDB,
  transformFeeStructureFromDB,
} from '@/features/classification/repository/classificationRepository';

export { transformUserClassificationFromDB, transformFeeStructureFromDB };

export const classificationQueryKeys = {
  all: ['classification'] as const,
  userClassifications: () => [...classificationQueryKeys.all, 'user'] as const,
  feeStructures: () => [...classificationQueryKeys.all, 'fee'] as const,
};

const STALE_MS = 60 * 1000;

export function useUserClassificationsQuery(enabled = true) {
  return useQuery({
    queryKey: classificationQueryKeys.userClassifications(),
    queryFn: fetchUserClassifications,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useFeeStructuresQuery(enabled = true) {
  return useQuery({
    queryKey: classificationQueryKeys.feeStructures(),
    queryFn: fetchFeeStructures,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useInvalidateClassificationQueries() {
  const queryClient = useQueryClient();
  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: classificationQueryKeys.all }),
    invalidateUserClassifications: () => queryClient.invalidateQueries({ queryKey: classificationQueryKeys.userClassifications() }),
    invalidateFeeStructures: () => queryClient.invalidateQueries({ queryKey: classificationQueryKeys.feeStructures() }),
  };
}
