/**
 * React Query keys and hooks for Project data.
 * Fetch logic lives in projectRepository — this file owns only the hooks and cache keys.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchProjects,
  mapDbProjectToProject,
  mapProjectToDbProject,
} from '@/features/project/repository/projectRepository';

export { mapDbProjectToProject, mapProjectToDbProject };

export const projectQueryKeys = {
  all: ['projects'] as const,
};

const STALE_MS = 60 * 1000;

export function useProjectsQuery(enabled = true) {
  return useQuery({
    queryKey: projectQueryKeys.all,
    queryFn: fetchProjects,
    staleTime: STALE_MS,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useInvalidateProjectsQueries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: projectQueryKeys.all });
}
