import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  directoryRowToUser,
  fieldTeamRowToUser,
  getProfilesByIds,
  listFieldTeamProfiles,
  listProfilesWithLocation,
  profileWithLocationToUser,
  searchUserDirectory,
  type FieldTeamProfileRow,
  type SearchUserDirectoryParams,
  type UserDirectoryRow,
} from '@/services/userDirectory';

const PAGE_SIZE = 50;
const FIELD_TEAM_PAGE_SIZE = 100;

export function useUserDirectory(
  params: Omit<SearchUserDirectoryParams, 'offset'> & { enabled?: boolean } = {}
) {
  const {
    search = '',
    limit = PAGE_SIZE,
    status = null,
    activeOnly = true,
    enabled = true,
  } = params;

  return useInfiniteQuery({
    queryKey: queryKeys.profiles.directory({ search, limit, status, activeOnly }),
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      searchUserDirectory({
        search,
        limit,
        offset: pageParam,
        status,
        activeOnly,
      }),
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      const next = lastOffset + limit;
      return next < lastPage.totalCount ? next : undefined;
    },
    staleTime: 1000 * 60 * 2,
  });
}

/** Paginated field-team profiles (coordinators / collectors) with GPS when present. */
export function useFieldTeamDirectory(
  params: { search?: string; limit?: number; enabled?: boolean } = {}
) {
  const { search = '', limit = FIELD_TEAM_PAGE_SIZE, enabled = true } = params;
  return useInfiniteQuery({
    queryKey: queryKeys.profiles.fieldTeam({ search, limit }),
    enabled,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) =>
      listFieldTeamProfiles({ search, limit, offset: pageParam }),
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      const next = lastOffset + limit;
      return next < lastPage.totalCount ? next : undefined;
    },
    staleTime: 1000 * 60,
  });
}

export function useProfilesByIds(ids: string[], enabled = true) {
  const unique = Array.from(new Set(ids.filter(Boolean))).sort();
  return useQuery({
    queryKey: queryKeys.profiles.byIds(unique),
    enabled: enabled && unique.length > 0,
    queryFn: () => getProfilesByIds(unique),
    staleTime: 1000 * 60 * 5,
  });
}

export function useProfilesWithLocation(limit = 200, enabled = true) {
  return useQuery({
    queryKey: queryKeys.profiles.withLocation(limit),
    enabled,
    queryFn: async () => {
      const rows = await listProfilesWithLocation(limit);
      return rows.map(profileWithLocationToUser);
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
  });
}

export function flattenDirectoryPages(
  pages?: { rows: UserDirectoryRow[]; totalCount: number }[]
): UserDirectoryRow[] {
  if (!pages?.length) return [];
  return pages.flatMap((p) => p.rows);
}

export function flattenDirectoryPagesAsUsers(
  pages?: { rows: UserDirectoryRow[]; totalCount: number }[]
) {
  return flattenDirectoryPages(pages).map(directoryRowToUser);
}

export function flattenFieldTeamPagesAsUsers(
  pages?: { rows: FieldTeamProfileRow[]; totalCount: number }[]
) {
  if (!pages?.length) return [];
  return pages.flatMap((p) => p.rows.map(fieldTeamRowToUser));
}

export function useInvalidateFieldTeamDirectory() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: [...queryKeys.profiles.all, 'fieldTeam'] });
}
