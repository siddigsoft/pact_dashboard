import { createContext, useContext, useMemo, type FC, type ReactNode } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useCurrentUserAccessManifest } from '@/hooks/useCurrentUserAccessManifest';
import { overrideIsActive, manifestIsTabBlocked } from '@/lib/current-user-access';

interface CurrentUserAccessValue {
  overrides: Map<string, boolean>;
  isTabBlocked: (slug: string) => boolean;
  refresh: () => Promise<void>;
  loading: boolean;
}

const CurrentUserAccessContext = createContext<CurrentUserAccessValue>({
  overrides: new Map(), isTabBlocked: () => true,
  refresh: async () => {}, loading: true,
});

/** Hub tabs consume the same authenticated access manifest as route guards. */
export const CurrentUserAccessProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAppContext();
  const query = useCurrentUserAccessManifest(Boolean(currentUser?.id));
  const manifest = query.data?.user_id === currentUser?.id ? query.data : undefined;
  const overrides = useMemo(() => new Map(
    Object.entries(manifest?.page_overrides ?? {})
      .filter(([, override]) => overrideIsActive(override))
      .map(([slug, override]) => [slug, override.is_blocked]),
  ), [manifest]);
  const isTabBlocked = (slug: string) => {
    if (!currentUser || !manifest || query.isError) return true;
    return manifestIsTabBlocked(manifest, slug);
  };
  return (
    <CurrentUserAccessContext.Provider value={{
      overrides, isTabBlocked, loading: Boolean(currentUser?.id) && query.isLoading,
      refresh: async () => { await query.refetch(); },
    }}>
      {children}
    </CurrentUserAccessContext.Provider>
  );
};

export function useCurrentUserAccess(): CurrentUserAccessValue {
  return useContext(CurrentUserAccessContext);
}
