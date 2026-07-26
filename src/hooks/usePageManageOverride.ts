import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { normalizeRole } from '@/utils/roleMapping';
import { parsePermissions, DEFAULT_PERMS, Perms } from '@/pages/PageAccessControl';

/**
 * Full granular page permission result.
 *
 * Three-layer resolution (highest priority wins):
 *   1. Super-admin override — always full access, no DB query.
 *   2. page_access_overrides row (notes JSON: {"r","w","c","d"}, or is_blocked).
 *   3. user_screen_permissions.screens entry for the matching screenId.
 *
 * When neither layer has a row, hasOverride is false and the caller should fall
 * back to role-based defaults (useRestrictedAction.check() returns true).
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

const FULL_ACCESS: PagePermissions = {
  canRead: true, canWrite: true, canCreate: true, canDelete: true,
  canManage: true, hasOverride: false, isBlocked: false, isLoading: false,
};

/**
 * Returns granular R/W/C/D permissions for the current user on a given page.
 *
 * Resolution order:
 *   page_access_overrides (highest) → user_screen_permissions → role defaults
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
      // Fetch both override sources in parallel for minimal latency.
      const [overrideRes, screenPermRes] = await Promise.all([
        supabase
          .from('page_access_overrides')
          .select('is_blocked, level, notes')
          .eq('page_slug', pageSlug)
          .eq('user_id', currentUser.id)
          .maybeSingle(),
        supabase
          .from('user_screen_permissions' as any)
          .select('screens')
          .eq('user_id', currentUser.id)
          .maybeSingle(),
      ]);
      // Surface hard failures so React Query can stop loading (fail-open below)
      if (overrideRes.error && overrideRes.error.code !== 'PGRST116') {
        throw overrideRes.error;
      }
      return {
        pageOverride: overrideRes.data ?? null,
        screenPerms:  (screenPermRes.data as any) ?? null,
      };
    },
    enabled: !!currentUser?.id && !shouldSkip,
    staleTime: 60_000,
    // Don't leave the UI on an infinite spinner if Supabase/SW flakes
    retry: 1,
    networkMode: 'online',
  });

  // Super admins and explicitly-skipped callers always have full access.
  if (isSuperAdminUser || skip) return { ...FULL_ACCESS };

  // Fail open: if the check errors or never resolves data, don't block the page.
  if (isError) return { ...DENIED, isLoading: false };

  if (!data) return { ...DENIED, isLoading: (isLoading || isFetching) && !shouldSkip };

  // ── Layer 3 (highest priority): page_access_overrides ──────────────────
  if (data.pageOverride) {
    if (data.pageOverride.is_blocked) {
      return { ...DENIED, hasOverride: true, isBlocked: true, isLoading: false };
    }
    const p: Perms = parsePermissions(data.pageOverride.notes ?? null);
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

  // ── Layer 2 (middle): user_screen_permissions.screens JSON ─────────────
  if (data.screenPerms) {
    try {
      const rawScreens = data.screenPerms.screens;
      const screens: any[] = typeof rawScreens === 'string'
        ? JSON.parse(rawScreens)
        : rawScreens;
      if (Array.isArray(screens)) {
        const screen = screens.find((s: any) => s.screenId === pageSlug);
        if (screen) {
          const p = screen.permissions ?? {};
          const isVisible = screen.isVisible !== false;
          return {
            canRead:    !!p.read,
            canWrite:   !!p.write,
            canCreate:  !!p.create,
            canDelete:  !!p.delete,
            canManage:  !!(p.write || p.create || p.delete),
            hasOverride: true,
            isBlocked:  !isVisible,
            isLoading:  false,
          };
        }
      }
    } catch { /* ignore JSON parse errors — fall through to role defaults */ }
  }

  // ── Layer 1 (base): no override row — role defaults apply ───────────────
  // hasOverride: false signals useRestrictedAction.check() to allow the action.
  return { ...DENIED, isLoading: false };
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
