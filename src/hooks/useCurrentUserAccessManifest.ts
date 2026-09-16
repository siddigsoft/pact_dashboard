import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppContext } from '@/context/AppContext';
import { supabase } from '@/integrations/supabase/client';
import type { CurrentUserAccessManifest } from '@/lib/current-user-access';

export type { CurrentUserAccessManifest } from '@/lib/current-user-access';

const EMPTY_MANIFEST: CurrentUserAccessManifest = {
  user_id: '',
  roles: [],
  page_role_configs: {},
  page_overrides: {},
  action_overrides: {},
  role_permissions: [],
  generated_at: '',
};

/**
 * Fetches the signed-in user's access inputs in one server-derived response.
 * This deliberately has no user-id argument: callers cannot inspect another
 * user's roles or exceptions by changing a browser parameter.
 */
export function useCurrentUserAccessManifest(enabled: boolean) {
  const { currentUser } = useAppContext();
  const userId = currentUser?.id;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['current-user-access-manifest', userId],
    enabled: enabled && !!userId,
    staleTime: 30_000,
    refetchInterval: enabled ? 30_000 : false,
    queryFn: async (): Promise<CurrentUserAccessManifest> => {
      const { data, error } = await (supabase as any).rpc('get_current_user_access_context');
      if (error) throw error;
      // Never render another session's cached permissions after an account switch.
      if (!data || data.user_id !== userId) throw new Error('Access context identity mismatch');
      return { ...EMPTY_MANIFEST, ...(data ?? {}) } as CurrentUserAccessManifest;
    },
  });

  useEffect(() => {
    if (!enabled || !userId || !query.data) return;
    const expiries = [
      ...Object.values(query.data.page_overrides),
      ...Object.values(query.data.action_overrides),
    ].map(value => value.expires_at ? Date.parse(value.expires_at) : NaN)
      .filter(value => Number.isFinite(value) && value > Date.now());
    if (!expiries.length) return;
    const timeout = setTimeout(() => {
      // Evict grants immediately at expiry even if a network refetch fails.
      queryClient.setQueryData<CurrentUserAccessManifest>(
        ['current-user-access-manifest', userId],
        current => current ? {
          ...current,
          page_overrides: Object.fromEntries(Object.entries(current.page_overrides)
            .filter(([, value]) => !value.expires_at || Date.parse(value.expires_at) > Date.now())),
          action_overrides: Object.fromEntries(Object.entries(current.action_overrides)
            .filter(([, value]) => !value.expires_at || Date.parse(value.expires_at) > Date.now())),
        } : current,
      );
      void queryClient.invalidateQueries({ queryKey: ['current-user-access-manifest', userId] });
    }, Math.min(Math.max(1, Math.min(...expiries) - Date.now()), 2_147_483_647));
    return () => clearTimeout(timeout);
  }, [enabled, userId, query.data, queryClient]);

  // Disabled preview observers must not expose the real user's cached grants.
  // A failed refresh also cannot silently keep rendering stale capabilities.
  return { ...query, data: enabled && !query.isError ? query.data : undefined };
}
