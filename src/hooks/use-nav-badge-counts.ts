import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Serialized badge fetches avoid thundering the PostgREST pool on micro instances (503s under load). */
const INITIAL_DELAY_MS = 400;
const REFRESH_INTERVAL_MS = 5 * 60_000;

export interface NavBadgeCounts {
  pendingCostTier1Hub: number;
  pendingDpSupervisor: number;
  pendingTier2Cost: number;
  pendingDpAdmin: number;
  pendingUsers: number;
  mmpVerifiedSites: number;
  pendingMmpCoordinator: number;
  pendingMmpUnassigned: number;
  pendingFinanceDp: number;
  unreadNotifications: number;
  openIncidents: number;
  pendingVerification: number;
  pendingWallet: number;
  pendingReclaimCount: number;
}

const emptyCounts = (): NavBadgeCounts => ({
  pendingCostTier1Hub: 0,
  pendingDpSupervisor: 0,
  pendingTier2Cost: 0,
  pendingDpAdmin: 0,
  pendingUsers: 0,
  mmpVerifiedSites: 0,
  pendingMmpCoordinator: 0,
  pendingMmpUnassigned: 0,
  pendingFinanceDp: 0,
  unreadNotifications: 0,
  openIncidents: 0,
  pendingVerification: 0,
  pendingWallet: 0,
  pendingReclaimCount: 0,
});

interface UseNavBadgeCountsParams {
  currentUserId?: string;
  hubId?: string | null;
  roleIsSupervisor: boolean;
  roleIsFinance: boolean;
  roleIsCoordinator: boolean;
  roleIsFomOrAdmin: boolean;
  roleCanSeeIncident: boolean;
  isDataCollector: boolean;
  /** Navbar admin-only bell items (pending users, tier-2 label, DP admin); avoids extra queries for FOM-only users */
  includeAdminBellCounts: boolean;
  /** Verified sites count — FOM navigation bell only */
  includeFomVerifiedCounts: boolean;
}

/**
 * Single place for nav badge HEAD/count queries. Runs sequentially to reduce
 * concurrent DB connections on small Supabase tiers (matches Supabase Postgres
 * connection-pooling guidance for bursty clients).
 */
export function useNavBadgeCounts({
  currentUserId,
  hubId,
  roleIsSupervisor,
  roleIsFinance,
  roleIsCoordinator,
  roleIsFomOrAdmin,
  roleCanSeeIncident,
  isDataCollector,
  includeAdminBellCounts,
  includeFomVerifiedCounts,
}: UseNavBadgeCountsParams) {
  const [counts, setCounts] = useState<NavBadgeCounts>(emptyCounts);
  const [loading, setLoading] = useState(false);
  const genRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!currentUserId) {
      setCounts(emptyCounts());
      return;
    }

    const gen = ++genRef.current;
    setLoading(true);
    const next = emptyCounts();

    const headCount = async (
      fn: () => Promise<{ count: number | null }>
    ): Promise<number> => {
      const { count } = await fn();
      return count ?? 0;
    };

    try {
      if (roleIsSupervisor && hubId) {
        next.pendingCostTier1Hub = await headCount(() =>
          supabase
            .from('operational_cost_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('hub_id', hubId)
            .eq('tier1_status', 'pending')
            .neq('submitted_by', currentUserId)
        );
        next.pendingDpSupervisor = await headCount(() =>
          supabase
            .from('down_payment_requests')
            .select('id', { count: 'exact', head: true })
            .eq('hub_id', hubId)
            .eq('status', 'pending_supervisor')
        );
      }

      if (roleIsFomOrAdmin) {
        next.pendingTier2Cost = await headCount(() =>
          supabase
            .from('operational_cost_submissions')
            .select('id', { count: 'exact', head: true })
            .eq('tier1_status', 'approved')
            .eq('tier2_status', 'pending')
        );
        if (includeAdminBellCounts) {
          next.pendingUsers = await headCount(() =>
            supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending')
          );
          next.pendingDpAdmin = await headCount(() =>
            supabase
              .from('down_payment_requests')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending_admin')
          );
        }
        if (includeFomVerifiedCounts) {
          next.mmpVerifiedSites = await headCount(() =>
            supabase
              .from('mmp_site_entries')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'verified')
          );
        }
      }

      if (roleIsCoordinator) {
        next.pendingMmpCoordinator = await headCount(() =>
          supabase
            .from('mmp_files')
            .select('id', { count: 'exact', head: true })
            .eq('coordinator_id', currentUserId)
            .in('status', ['forwarded_to_coordinator', 'pending_acceptance'])
        );
        next.pendingVerification = await headCount(() =>
          supabase
            .from('mmp_site_entries')
            .select('id', { count: 'exact', head: true })
            .eq('accepted_by', currentUserId)
            .or('status.eq.dispatched,status.eq.Dispatched')
        );
      } else if (roleIsFomOrAdmin) {
        next.pendingMmpUnassigned = await headCount(() =>
          supabase
            .from('mmp_files')
            .select('id', { count: 'exact', head: true })
            .is('coordinator_id', null)
            .not('status', 'in', '("completed","archived","deleted","rejected","cancelled")')
        );
      }

      if (roleIsFinance) {
        next.pendingFinanceDp = await headCount(() =>
          supabase
            .from('down_payment_requests')
            .select('id', { count: 'exact', head: true })
            .in('status', ['supervisor_approved', 'pending_admin'])
        );

        const { data: reclaimRows } = await supabase
          .from('down_payment_requests')
          .select('id, metadata')
          .neq('status', 'cancelled');
        if (reclaimRows) {
          next.pendingReclaimCount = reclaimRows.filter((r: { metadata?: unknown }) => {
            try {
              const meta =
                typeof r.metadata === 'string'
                  ? JSON.parse(r.metadata)
                  : (r.metadata || {}) as Record<string, unknown>;
              return meta?.manual_reconciliation_required === true;
            } catch {
              return false;
            }
          }).length;
        }
      }

      next.unreadNotifications = await headCount(() =>
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('recipient_id', currentUserId)
          .eq('is_read', false)
      );

      if (roleCanSeeIncident) {
        next.openIncidents = await headCount(() =>
          supabase
            .from('incident_reports')
            .select('id', { count: 'exact', head: true })
            .in('status', ['open', 'investigating'])
        );
      }

      if (roleIsCoordinator || isDataCollector) {
        next.pendingWallet = await headCount(() =>
          supabase
            .from('down_payment_requests')
            .select('id', { count: 'exact', head: true })
            .eq('requested_by', currentUserId)
            .eq('status', 'supervisor_approved')
        );
      }

      if (gen === genRef.current) {
        setCounts(next);
      }
    } catch (e) {
      console.warn('[useNavBadgeCounts] refresh error:', e);
    } finally {
      if (gen === genRef.current) {
        setLoading(false);
      }
    }
  }, [
    currentUserId,
    hubId,
    roleIsSupervisor,
    roleIsFinance,
    roleIsCoordinator,
    roleIsFomOrAdmin,
    roleCanSeeIncident,
    isDataCollector,
    includeAdminBellCounts,
    includeFomVerifiedCounts,
  ]);

  useEffect(() => {
    if (!currentUserId) return;

    const t0 = setTimeout(() => {
      void refresh();
    }, INITIAL_DELAY_MS);

    const interval = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);

    return () => {
      clearTimeout(t0);
      clearInterval(interval);
    };
  }, [currentUserId, refresh]);

  return { counts, loading, refresh };
}
