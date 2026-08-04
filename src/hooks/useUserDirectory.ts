import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import {
  getProfilesByIds,
  searchUserDirectory,
  type SearchUserDirectoryParams,
  type UserDirectoryRow,
} from '@/services/userDirectory';

const PAGE_SIZE = 50;

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

export function useProfilesByIds(ids: string[], enabled = true) {
  const unique = Array.from(new Set(ids.filter(Boolean))).sort();
  return useQuery({
    queryKey: queryKeys.profiles.byIds(unique),
    enabled: enabled && unique.length > 0,
    queryFn: () => getProfilesByIds(unique),
    staleTime: 1000 * 60 * 5,
  });
}

export function flattenDirectoryPages(
  pages?: { rows: UserDirectoryRow[]; totalCount: number }[]
): UserDirectoryRow[] {
  if (!pages?.length) return [];
  return pages.flatMap((p) => p.rows);
}
