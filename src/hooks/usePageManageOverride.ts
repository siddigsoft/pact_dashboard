import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { parsePermissions, DEFAULT_PERMS, Perms } from '@/pages/PageAccessControl';

/**
 * Full granular page permission result.
 * Reads the `notes` JSON column ({"r","w","c","d"}) that the
 * Page Access Control panel writes for per-user overrides.
 *
 * Falls back gracefully when notes is null (old row → treat as Read-only).
 */
export interface PagePermissions {
  canRead:   boolean;
  canWrite:  boolean;
  canCreate: boolean;
  canDelete: boolean;
  /** True when any write permission is granted (w | c | d). */
  canManage: boolean;
  /** True if an explicit override row exists (grant OR block). */
  hasOverride: boolean;
  /** True if the user has been explicitly blocked from this page. */
  isBlocked: boolean;
  isLoading: boolean;
}

const DENIED: PagePermissions = {
  canRead: false, canWrite: false, canCreate: false, canDelete: false,
  canManage: false, hasOverride: false, isBlocked: false, isLoading: false,
};

/**
 * Returns granular R/W/C/D permissions for the current user on a given page.
 *
 * @param pageSlug - Page slug from PAGE_DEFS (e.g. 'surveys', 'acct-coa')
 * @param skip     - Pass true when the user already has full rights via their role
 *                   (prevents an unnecessary DB round-trip)
 */
export function usePagePermissions(pageSlug: string, skip = false): PagePermissions {
  const { currentUser } = useAppContext();

  const { data, isLoading } = useQuery({
    queryKey: ['page-permissions', currentUser?.id, pageSlug],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const { data } = await supabase
        .from('page_access_overrides')
        .select('is_blocked, level, notes')
        .eq('page_slug', pageSlug)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentUser?.id && !skip,
    staleTime: 60_000,
  });

  if (!data) return { ...DENIED, isLoading: isLoading && !skip };

  if (data.is_blocked) {
    return { ...DENIED, hasOverride: true, isBlocked: true, isLoading: false };
  }

  // Parse granular perms from notes JSON; fall back to DEFAULT_PERMS (Read only)
  const p: Perms = parsePermissions(data.notes ?? null);

  return {
    canRead:    p.r,
    canWrite:   p.w,
    canCreate:  p.c,
    canDelete:  p.d,
    canManage:  p.w || p.c || p.d,
    hasOverride: true,
    isBlocked:  false,
    isLoading:  false,
  };
}

/**
 * Backward-compatible shim — returns true only when the user has an explicit
 * manage-level override (any write permission granted).
 *
 * Prefer `usePagePermissions` for new code.
 *
 * @param pageSlug - The page slug from PAGE_DEFS
 * @param skip     - Pass true when the user already has manage rights via role
 */
export function usePageManageOverride(pageSlug: string, skip = false): boolean {
  const perms = usePagePermissions(pageSlug, skip);
  return !perms.isBlocked && perms.canManage;
}
