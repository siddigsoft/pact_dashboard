import React, { createContext, useContext, useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { AppRole } from '@/types';
import {
  useNavBadgeCounts,
  type NavBadgeCounts,
} from '@/hooks/use-nav-badge-counts';

interface NavBadgeCountsContextValue {
  counts: NavBadgeCounts;
  loading: boolean;
  refresh: () => Promise<void>;
  includeAdminBellCounts: boolean;
  includeFomVerifiedCounts: boolean;
}

const NavBadgeCountsContext = createContext<NavBadgeCountsContextValue | null>(null);

export function NavBadgeCountsProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, roles } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { isSuperAdmin } = useSuperAdmin();

  const roleIsCoordinator = hasAnyRole(['coordinator', 'Coordinator']);
  const roleIsSupervisor = hasAnyRole([
    'supervisor',
    'Supervisor',
    'hubSupervisor',
    'hub_supervisor',
  ]);
  const roleIsFomOrAdmin =
    isSuperAdmin ||
    hasAnyRole(['fom', 'FOM', 'admin', 'Admin']);
  const roleIsFinance =
    isSuperAdmin ||
    hasAnyRole([
      'fom',
      'FOM',
      'admin',
      'Admin',
      'financial_auditor',
      'financialAdmin',
      'financialadmin',
    ]);
  const roleCanSeeIncident =
    isSuperAdmin ||
    hasAnyRole([
      'admin',
      'Admin',
      'fom',
      'FOM',
      'supervisor',
      'Supervisor',
      'hubSupervisor',
      'hub_supervisor',
    ]);

  const isDataCollector =
    roles?.includes('DataCollector' as AppRole) ||
    roles?.includes('dataCollector' as AppRole) ||
    currentUser?.role?.toLowerCase() === 'datacollector' ||
    currentUser?.role?.toLowerCase() === 'data collector';

  const includeAdminBellCounts =
    isSuperAdmin || hasAnyRole(['admin', 'Admin', 'super_admin']);
  const includeFomVerifiedCounts = hasAnyRole([
    'fom',
    'FOM',
    'Field Operation Manager (FOM)',
  ]);

  const params = useMemo(
    () => ({
      currentUserId: currentUser?.id,
      hubId: currentUser?.hubId ?? null,
      roleIsSupervisor,
      roleIsFinance,
      roleIsCoordinator,
      roleIsFomOrAdmin,
      roleCanSeeIncident,
      isDataCollector,
      includeAdminBellCounts,
      includeFomVerifiedCounts,
    }),
    [
      currentUser?.id,
      currentUser?.hubId,
      roleIsSupervisor,
      roleIsFinance,
      roleIsCoordinator,
      roleIsFomOrAdmin,
      roleCanSeeIncident,
      isDataCollector,
      includeAdminBellCounts,
      includeFomVerifiedCounts,
    ]
  );

  const { counts, loading, refresh } = useNavBadgeCounts(params);

  const value = useMemo(
    () => ({
      counts,
      loading,
      refresh,
      includeAdminBellCounts,
      includeFomVerifiedCounts,
    }),
    [counts, loading, refresh, includeAdminBellCounts, includeFomVerifiedCounts]
  );

  return (
    <NavBadgeCountsContext.Provider value={value}>
      {children}
    </NavBadgeCountsContext.Provider>
  );
}

export function useNavBadgeCountsContext(): NavBadgeCountsContextValue {
  const ctx = useContext(NavBadgeCountsContext);
  if (!ctx) {
    throw new Error('useNavBadgeCountsContext must be used within NavBadgeCountsProvider');
  }
  return ctx;
}
