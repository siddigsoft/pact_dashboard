import { useQuery } from '@tanstack/react-query';
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
  return useQuery({
    queryKey: ['current-user-access-manifest'],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<CurrentUserAccessManifest> => {
      const { data, error } = await (supabase as any).rpc('get_current_user_access_context');
      if (error) throw error;
      return { ...EMPTY_MANIFEST, ...(data ?? {}) } as CurrentUserAccessManifest;
    },
  });
}
