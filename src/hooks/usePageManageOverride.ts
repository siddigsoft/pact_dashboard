import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { normalizeRole } from '@/utils/roleMapping';
import {
  DENIED_PERMS,
  FULL_PERMS,
  resolveTypedPagePermissions,
  type GranularPerms,
} from '@/lib/pagePermissionsResolve';

/**
 * Full granular page permission result.
 *
 * Authoritative resolution (Phase 2):
 *   1. Super-admin bypass — always full access.
 *   2. page_access_overrides row (notes JSON: {"r","w","c","d"}, or is_blocked).
 *   3. Otherwise role defaults (hasOverride=false).
 *
 * Legacy user_screen_permissions is not consulted at runtime.
 */
export type PagePermissions = GranularPerms & { isLoading: boolean };

/**
 * Returns granular R/W/C/D permissions for the current user on a given page.
 *
 * @param pageSlug - Page slug from PAGE_DEFS (e.g. 'surveys', 'accounting-coa')
 * @param skip     - Pass true to skip all DB checks and return full access.
 *                   Only use this for explicit super-admin bypasses in legacy callers.
 */
export function usePagePermissions(pageSlug: string, skip = false): PagePermissions {
  const { currentUser } = useAppContext();
  const isSuperAdminUser = normalizeRole(currentUser?.role ?? '') === 'superAdmin';
  const shouldSkip = skip || isSuperAdminUser;

  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['page-permissions', currentUser?.id, pageSlug],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const overrideRes = await supabase
        .from('page_access_overrides')
        .select('is_blocked, level, notes')
        .eq('page_slug', pageSlug)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (overrideRes.error && overrideRes.error.code !== 'PGRST116') {
        throw overrideRes.error;
      }
      return { pageOverride: overrideRes.data ?? null };
    },
    enabled: !!currentUser?.id && !shouldSkip,
    staleTime: 60_000,
    retry: 1,
    networkMode: 'online',
  });

  if (isSuperAdminUser || skip) return { ...FULL_PERMS, isLoading: false };

  if (isError) return { ...DENIED_PERMS, isLoading: false };

  if (!data) return { ...DENIED_PERMS, isLoading: (isLoading || isFetching) && !shouldSkip };

  return {
    ...resolveTypedPagePermissions({
      isSuperAdmin: false,
      pageOverride: data.pageOverride,
    }),
    isLoading: false,
  };
}

/**
 * Backward-compatible shim — returns true only when the user has an explicit
 * manage-level override (any write permission granted).
 *
 * Prefer `usePagePermissions` for new code.
 */
export function usePageManageOverride(pageSlug: string, skip = false): boolean {
  const perms = usePagePermissions(pageSlug, skip);
  return !perms.isBlocked && perms.canManage;
}
