import { useLocation } from 'react-router-dom';
import { PAGE_DEFS } from '@/lib/access-registry';
import { usePagePermissions } from '@/hooks/usePageManageOverride';
import { resolveSlug } from '@/lib/page-roles';

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
 * current page via a `page_access_overrides` row (is_blocked=true or r:false).
 *
 * Super Admins are always allowed (never blocked).
 * Protected unknown routes fail closed until registered.
 */
export function usePageAccessGuard(): PageGuardResult {
  const location = useLocation();

  const slug = resolveSlug(`${location.pathname}${location.search}${location.hash}`)
    ?? resolveSlug(location.pathname);
  const pageDef = slug ? PAGE_DEFS.find(p => p.slug === slug) : null;

  // Use the same canonical manifest and granular permissions as actions.
  const perms = usePagePermissions(slug ?? '');

  // Blocked when an explicit typed override removes access:
  //   • page_access_overrides.is_blocked = true
  //   • r:false in the notes JSON
  const isBlocked = !perms.isLoading && (!slug || perms.isBlocked || !perms.canRead);

  return {
    isBlocked,
    isChecking: perms.isLoading,
    pageLabel: pageDef?.label,
    slug,
  };
}
