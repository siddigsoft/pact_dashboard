import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { normalizeRole } from '@/utils/roleMapping';
import { supabase } from '@/integrations/supabase/client';
import { PAGE_DEFS } from '@/pages/PageAccessControl';

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
  /** True when the current user has an explicit is_blocked=true override for this page. */
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
 * current page via a `page_access_overrides` row.
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

  const enabled = !!currentUser?.id && !!slug && !isSuperAdmin;

  const { data, isLoading } = useQuery({
    queryKey: ['page-guard', currentUser?.id, slug],
    queryFn: async () => {
      const { data } = await supabase
        .from('page_access_overrides')
        .select('is_blocked')
        .eq('page_slug', slug!)
        .eq('user_id', currentUser!.id)
        .maybeSingle();
      return data;
    },
    enabled,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  return {
    isBlocked: enabled && data?.is_blocked === true,
    isChecking: enabled && isLoading,
    pageLabel: pageDef?.label,
    slug,
  };
}
