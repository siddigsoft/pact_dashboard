/**
 * useColumnVisibility
 * Reads `column_visibility_config` for the current user and returns an
 * isVisible(columnKey) predicate for a given page slug.
 *
 * Rules:
 *  - Super Admins always see every column. The check mirrors SuperAdminContext:
 *      1. Normalized role string covers superAdmin / SuperAdmin / super_admin variants.
 *      2. Active membership in the `super_admins` table covers users whose
 *         profiles.role differs from the actual grant (edge-case supported path).
 *    Both checks run in parallel with the column config query; the first
 *    super-admin signal found short-circuits and shows all columns.
 *  - Role-level rows set defaults for every user with that role.
 *  - User-level rows override role defaults (user wins, regardless of direction).
 *  - Falls back to all-visible if the table doesn't exist yet (migration not run).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';

/** Mirrors SuperAdminContext normalisation — covers all supported role aliases. */
function isLikelySuperAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const n = role.toLowerCase().replace(/[\s_-]/g, '');
  return n === 'superadmin';
}

export function useColumnVisibility(pageSlug: string): (columnKey: string) => boolean {
  const { currentUser } = useAppContext();
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUser) {
      setHiddenKeys(new Set());
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        // Run SA membership check and column config fetch in parallel.
        const [saResult, configResult] = await Promise.all([
          // Only query if role isn't already an obvious SA — avoids an unnecessary
          // round-trip for the common case while catching edge-case SA grants.
          isLikelySuperAdminRole(currentUser.role)
            ? Promise.resolve({ data: [{ is_active: true }] })
            : supabase
                .from('super_admins')
                .select('is_active')
                .eq('user_id', currentUser.id)
                .eq('is_active', true)
                .maybeSingle(),
          supabase
            .from('column_visibility_config')
            .select('column_key, is_hidden, user_id, role')
            .eq('page_slug', pageSlug)
            .or(`user_id.eq.${currentUser.id},role.eq.${currentUser.role}`),
        ]);

        if (cancelled) return;

        // Super Admin — always show everything.
        const isSuperAdmin =
          isLikelySuperAdminRole(currentUser.role) ||
          !!(saResult.data && ('is_active' in (saResult.data as any)
            ? (saResult.data as any).is_active
            : Array.isArray(saResult.data) && (saResult.data as any[]).some((r: any) => r.is_active)));

        if (isSuperAdmin) {
          setHiddenKeys(new Set());
          return;
        }

        const rows = configResult.data ?? [];

        // Build merged map: role defaults first, user-level overrides win.
        const merged = new Map<string, boolean>();
        for (const row of rows.filter((r) => r.role && !r.user_id)) {
          merged.set(row.column_key, row.is_hidden);
        }
        for (const row of rows.filter((r) => r.user_id === currentUser.id)) {
          merged.set(row.column_key, row.is_hidden);
        }

        const hidden = new Set<string>();
        for (const [key, isHidden] of merged.entries()) {
          if (isHidden) hidden.add(key);
        }
        setHiddenKeys(hidden);
      } catch {
        // Table may not exist yet (migration not run) — show all columns.
        if (!cancelled) setHiddenKeys(new Set());
      }
    };

    load();
    return () => { cancelled = true; };
  }, [currentUser?.id, currentUser?.role, pageSlug]);

  return useCallback(
    (columnKey: string) => !hiddenKeys.has(columnKey),
    [hiddenKeys],
  );
}
