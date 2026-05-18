import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';

/**
 * Check if the current user has been granted 'manage' level access
 * to a specific page via the page_access_overrides table.
 *
 * @param pageSlug - The page slug from PAGE_DEFS (e.g. 'surveys', 'acct-coa')
 * @param skip     - Pass true when the user already has manage rights via their role.
 *                   This prevents an unnecessary DB query.
 */
export function usePageManageOverride(pageSlug: string, skip = false): boolean {
  const { currentUser } = useAppContext();
  const { data } = useQuery({
    queryKey: ['page-manage-override', currentUser?.id, pageSlug],
    queryFn: async () => {
      if (!currentUser?.id) return null;
      const { data } = await supabase
        .from('page_access_overrides')
        .select('level, is_blocked')
        .eq('page_slug', pageSlug)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      return data;
    },
    enabled: !!currentUser?.id && !skip,
    staleTime: 60_000,
  });
  return data?.is_blocked === false && data?.level === 'manage';
}
