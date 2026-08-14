/**
 * CurrentUserAccessContext
 * Caches the CURRENTLY LOGGED-IN USER's page_access_overrides.
 * Hub components use this to filter which tabs they show — no extra DB calls per hub.
 */
import { createContext, useContext, useCallback, useEffect, useState, type FC, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';

interface CurrentUserAccessValue {
  /** Map of page_slug → is_blocked for the current user's overrides */
  overrides: Map<string, boolean>;
  /**
   * Returns true if a hub tab should be hidden for the current user.
   * slug format: `{hubSlug}:{tabId}` e.g. `admin-hub:users`
   * Returns false for super admins (always full access).
   * Returns false when no override exists (tabs are visible by default).
   */
  isTabBlocked: (slug: string) => boolean;
  /** Refresh overrides from DB — call after saving an override in the admin UI */
  refresh: () => Promise<void>;
  loading: boolean;
}

const CurrentUserAccessContext = createContext<CurrentUserAccessValue>({
  overrides: new Map(),
  isTabBlocked: () => false,
  refresh: async () => {},
  loading: false,
});

export const CurrentUserAccessProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { currentUser } = useAppContext();
  const [overrides, setOverrides]   = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading]       = useState(false);

  const load = useCallback(async () => {
    const uid = currentUser?.id;
    if (!uid) { setOverrides(new Map()); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('page_access_overrides')
        .select('page_slug, is_blocked')
        .eq('user_id', uid);
      setOverrides(new Map((data ?? []).map(r => [r.page_slug, r.is_blocked as boolean])));
    } catch {
      // silently keep existing cache on network errors
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id]);

  useEffect(() => { load(); }, [load]);

  const isTabBlocked = useCallback((slug: string): boolean => {
    if (!currentUser) return false;
    // Bypass for super admins — handle both DB snake_case and normalised camelCase
    const r = (currentUser.role ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (r === 'superadmin') return false;
    // Only explicit is_blocked=true hides a tab — missing entry means visible
    return overrides.get(slug) === true;
  }, [overrides, currentUser]);

  return (
    <CurrentUserAccessContext.Provider value={{ overrides, isTabBlocked, refresh: load, loading }}>
      {children}
    </CurrentUserAccessContext.Provider>
  );
};

export function useCurrentUserAccess(): CurrentUserAccessValue {
  return useContext(CurrentUserAccessContext);
}
