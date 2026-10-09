import { useCallback } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useCurrentUserAccessManifest } from '@/hooks/useCurrentUserAccessManifest';
import { PAGE_DEFS } from '@/lib/access-registry';
import { evaluateManifestPageAccess } from '@/lib/current-user-access';
import { resolveRoutePermission } from '@/lib/page-roles';

/**
 * Same page decision the sidebar makes (role page defaults + overrides), for
 * in-page tabs that map to their own PAGE_DEFS entry. Fails closed while the
 * access manifest loads.
 */
export function usePageSlugAccess() {
  const { currentUser } = useAppContext();
  const { isSuperAdmin } = useAuthorization();
  const superAdmin = isSuperAdmin();
  const { data: manifest, isLoading } = useCurrentUserAccessManifest(!!currentUser?.id && !superAdmin);

  const canSeePage = useCallback((slug: string): boolean => {
    if (superAdmin) return true;
    if (!manifest) return false;
    const def = PAGE_DEFS.find(page => page.slug === slug);
    if (!def) return false;
    const [pathWithQuery, hash = ''] = def.path.split('#', 2);
    const [pathname, query = ''] = pathWithQuery.split('?', 2);
    return evaluateManifestPageAccess(
      manifest,
      slug,
      resolveRoutePermission(pathname, query ? `?${query}` : '', hash ? `#${hash}` : ''),
    ).allowed;
  }, [manifest, superAdmin]);

  return { canSeePage, loading: !superAdmin && isLoading };
}
