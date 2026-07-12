import { useLocation } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { normalizeRole } from '@/utils/roleMapping';
import { PAGE_DEFS } from '@/pages/PageAccessControl';
import { usePagePermissions } from '@/hooks/usePageManageOverride';

/**
 * Resolves the current pathname to a PAGE_DEFS slug.
 * Tries exact match first, then longest-prefix match so that
 * /crm/partners → 'crm', /accounting → 'accounting-hub', etc.
 */
function pathToSlug(pathname: string): string | null {
  const clean = pathname.endsWith('/') && pathname !== '/'
    ? pathname.slice(0, -1)
    : pathname;

  const exact = PAGE_DEFS.find(p => p.path.split('?')[0] === clean);
  if (exact) return exact.slug;

  const prefix = PAGE_DEFS
    .filter(p => {
      const base = p.path.split('?')[0];
      return clean.startsWith(base + '/') || base === clean;
    })
    .sort((a, b) => b.path.split('?')[0].length - a.path.split('?')[0].length)[0];

  return prefix?.slug ?? null;
}

export interface PageGuardResult {
  /** True when the current user is explicitly blocked or stripped of read access for this page. */
  isBlocked: boolean;
  /** True while the DB query is in-flight (avoid flash of denied screen). */
  isChecking: boolean;
  /** Human-readable label of the current page (from PAGE_DEFS), if resolved. */
  pageLabel: string | undefined;
  /** The resolved slug for the current path, or null if the route is unknown. */
  slug: string | null;
}

/**
 * Checks whether the currently-authenticated user is blocked from the
 * current page via a `page_access_overrides` row (is_blocked=true or r:false)
 * OR via a `user_screen_permissions` row (isVisible=false or read:false).
 *
 * Super Admins are always allowed (never blocked).
 * Unknown routes (no matching slug) are always allowed (fail-open for
 * pages not yet registered in PAGE_DEFS).
 */
export function usePageAccessGuard(): PageGuardResult {
  const { currentUser } = useAppContext();
  const location = useLocation();
  const isSuperAdmin = normalizeRole(currentUser?.role ?? '') === 'superAdmin';

  const slug = pathToSlug(location.pathname);
  const pageDef = slug ? PAGE_DEFS.find(p => p.slug === slug) : null;

  // Delegate to the full 3-layer resolver.
  // skip=true for super admins (always allowed) and unknown routes (fail-open).
  const perms = usePagePermissions(slug ?? '', isSuperAdmin || !slug);

  // Blocked when an explicit override exists that removes access:
  //   • page_access_overrides.is_blocked = true
  //   • user_screen_permissions.isVisible = false
  //   • r:false in the notes JSON
  const isBlocked = !isSuperAdmin && !!slug && perms.hasOverride &&
    (perms.isBlocked || !perms.canRead);

  return {
    isBlocked,
    isChecking: perms.isLoading,
    pageLabel: pageDef?.label,
    slug,
  };
}
