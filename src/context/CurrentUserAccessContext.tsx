import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useCurrentUserAccessManifest } from '@/hooks/useCurrentUserAccessManifest';
import { isSuperAdminRole } from '@/lib/effectiveAccess';
import { overrideIsActive, manifestIsTabBlocked } from '@/lib/current-user-access';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { resolveFilterVisibility, type FilterVisibilityConfig } from '@/lib/filter-visibility';

interface CurrentUserAccessValue {
  overrides: Map<string, boolean>;
  isTabBlocked: (slug: string) => boolean;
  refresh: () => Promise<void>;
  loading: boolean;
  isFilterVisible: (key: string) => boolean;
  filterLoading: boolean;
  filterError: string | null;
}

const CurrentUserAccessContext = createContext<CurrentUserAccessValue>({
  overrides: new Map(), isTabBlocked: () => true, isFilterVisible: () => false, filterLoading: true, filterError: null,
  refresh: async () => {}, loading: true,
});

/** Hub tabs consume the same authenticated access manifest as route guards. */
export const CurrentUserAccessProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAppContext();
  const query = useCurrentUserAccessManifest(Boolean(currentUser?.id));
  // One shared config load for the whole application. Filter controls consume
  // this cache; they must never issue one query per control.
  const filterQuery = useQuery({
    queryKey: ['current-user-filter-visibility', currentUser?.id],
    enabled: Boolean(currentUser?.id),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('filter_visibility_config')
        .select('filter_key,is_hidden,user_id,role');
      if (error) throw error;
      return data ?? [];
    },
  });
  const manifest = query.data?.user_id === currentUser?.id ? query.data : undefined;
  const overrides = useMemo(() => new Map(
    Object.entries(manifest?.page_overrides ?? {})
      .filter(([, override]) => overrideIsActive(override))
      .map(([slug, override]) => [slug, override.is_blocked]),
  ), [manifest]);
  const isTabBlocked = (slug: string) => {
    if (!currentUser) return true;
    // Profile SA pointer unlocks hub chrome even when canonical role rows lag.
    if (isSuperAdminRole(currentUser.role)) return false;
    if (manifest?.roles.some(isSuperAdminRole)) return false;
    // While the manifest is still loading, do not collapse hub chrome. Hiding
    // every tab and falling back to an unfiltered section makes clicks appear
    // to do nothing (URL changes, panel stays on the default). Route guards
    // and RLS still protect the panel content.
    if (query.isLoading) return false;
    if (!manifest || query.isError) return true;
    return manifestIsTabBlocked(manifest, slug);
  };
  return (
    <CurrentUserAccessContext.Provider value={{
      overrides, isTabBlocked, loading: Boolean(currentUser?.id) && query.isLoading,
      isFilterVisible: (key: string) => resolveFilterVisibility({
        key,
        userId: currentUser?.id,
        roles: currentUser ? [currentUser.role, ...(manifest?.roles ?? [])] : [],
        isSuperAdmin: Boolean(currentUser && (isSuperAdminRole(currentUser.role) || manifest?.roles.some(isSuperAdminRole))),
        rows: filterQuery.data as FilterVisibilityConfig[] | undefined,
        initialLoading: filterQuery.isLoading && !filterQuery.data,
        failedWithoutData: filterQuery.isError && !filterQuery.data,
      }),
      filterLoading: Boolean(currentUser?.id) && filterQuery.isLoading,
      filterError: filterQuery.isError ? 'Filter visibility settings could not be refreshed; filters are conservatively hidden until the last good configuration is available.' : null,
      refresh: async () => { await query.refetch(); await filterQuery.refetch(); },
    }}>
      {children}
    </CurrentUserAccessContext.Provider>
  );
};

export function useCurrentUserAccess(): CurrentUserAccessValue {
  return useContext(CurrentUserAccessContext);
}
