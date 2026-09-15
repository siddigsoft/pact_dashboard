import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CurrentUserAccessManifest {
  user_id: string;
  roles: string[];
  page_role_configs: Record<string, string[]>;
  page_overrides: Record<string, { is_blocked: boolean; notes?: string | null }>;
  action_overrides: Record<string, { is_granted: boolean; expires_at?: string | null; reason?: string | null }>;
  role_permissions: Array<{ resource: string; action: string }>;
  generated_at: string;
}

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
