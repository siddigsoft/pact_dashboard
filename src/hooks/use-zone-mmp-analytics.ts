import { useMemo, useState } from 'react';
import { useMMP } from '@/context/mmp/MMPContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { useAppContext } from '@/context/AppContext';
import { isWithinInterval } from 'date-fns';
import { defaultFilterState, type DashboardFilterState } from '@/components/dashboard/filters/DashboardFilters';
import type { MMPFile, SiteVisit } from '@/types';

export type { DashboardFilterState as ZoneFilterState };
export { defaultFilterState as defaultZoneFilters };

export interface MMPStats {
  total: number;
  approved: number;
  pending: number;
  verified: number;
  rejected: number;
  byClassification: {
    original: number;
    revised: number;
    additional: number;
    supplementary: number;
  };
  completionRate: number;
}

export interface ZoneAnalyticsResult {
  filters: DashboardFilterState;
  setFilters: React.Dispatch<React.SetStateAction<DashboardFilterState>>;
  filteredMmpFiles: MMPFile[];
  filteredSiteVisits: SiteVisit[];
  mmpStats: MMPStats;
  uniqueHubs: string[];
  uniqueRegions: string[];
  selectedMmpId: string | null;
  setSelectedMmpId: React.Dispatch<React.SetStateAction<string | null>>;
  selectedMmp: MMPFile | null;
  canAccessVersioning: boolean;
  isAdmin: boolean;
  isFinance: boolean;
}

export function useZoneMmpAnalytics(): ZoneAnalyticsResult {
  const { mmpFiles } = useMMP();
  const { siteVisits } = useSiteVisitContext();
  const { roles } = useAppContext();

  const [filters, setFilters] = useState<DashboardFilterState>(defaultFilterState);
  const [selectedMmpId, setSelectedMmpId] = useState<string | null>(null);

  const isAdmin = roles?.some(r =>
    ['admin', 'superadmin', 'countrydirector', 'super_admin'].includes(r.toLowerCase())
  ) ?? false;

  const isFinance = roles?.some(r =>
    ['financialadmin', 'finance'].includes(r.toLowerCase())
  ) ?? false;

  const canAccessVersioning = isAdmin || isFinance;

  const uniqueHubs = useMemo(() => {
    const hubs = new Set<string>();
    (mmpFiles || []).forEach(mmp => mmp.hub && hubs.add(mmp.hub));
    return Array.from(hubs).sort();
  }, [mmpFiles]);

  const uniqueRegions = useMemo(() => {
    const regions = new Set<string>();
    (mmpFiles || []).forEach(mmp => mmp.region && regions.add(mmp.region));
    return Array.from(regions).sort();
  }, [mmpFiles]);

  const filteredMmpFiles = useMemo(() => {
    let filtered = [...(mmpFiles || [])];

    if (filters.dateRange.start && filters.dateRange.end) {
      filtered = filtered.filter(mmp => {
        const mmpDate = mmp.uploadedAt ? new Date(mmp.uploadedAt) : null;
        if (!mmpDate) return true;
        return isWithinInterval(mmpDate, {
          start: filters.dateRange.start!,
          end: filters.dateRange.end!,
        });
      });
    }

    if (filters.selectedMonth && filters.selectedYear) {
      const monthNum = parseInt(filters.selectedMonth, 10);
      filtered = filtered.filter(mmp => {
        if (mmp.month && mmp.year) {
          const mmpMonth = typeof mmp.month === 'string' ? parseInt(mmp.month, 10) : mmp.month;
          return mmpMonth === monthNum && mmp.year === filters.selectedYear;
        }
        if (mmp.uploadedAt) {
          const date = new Date(mmp.uploadedAt);
          return date.getMonth() + 1 === monthNum && date.getFullYear() === filters.selectedYear;
        }
        return true;
      });
    } else if (filters.selectedYear) {
      filtered = filtered.filter(mmp => {
        if (mmp.year) return mmp.year === filters.selectedYear;
        if (mmp.uploadedAt) {
          return new Date(mmp.uploadedAt).getFullYear() === filters.selectedYear;
        }
        return true;
      });
    }

    if (filters.hub) {
      filtered = filtered.filter(mmp => mmp.hub === filters.hub);
    }

    if (filters.region) {
      filtered = filtered.filter(mmp => mmp.region === filters.region);
    }

    if (filters.mmpClassification && filters.mmpClassification !== 'all') {
      filtered = filtered.filter(mmp =>
        (mmp as any).classification === filters.mmpClassification
      );
    }

    if (filters.showActiveOnly) {
      filtered = filtered.filter(mmp => mmp.status !== 'deleted');
    }

    return filtered;
  }, [mmpFiles, filters]);

  const selectedMmp = useMemo(() => {
    if (!selectedMmpId) return null;
    return filteredMmpFiles.find(m => m.id === selectedMmpId) || null;
  }, [selectedMmpId, filteredMmpFiles]);

  const filteredSiteVisits = useMemo(() => {
    if (!siteVisits) return [];

    let filtered = [...siteVisits];

    if (selectedMmpId) {
      filtered = filtered.filter(sv => {
        const mmpId = sv.mmpDetails?.mmpId;
        return mmpId === selectedMmpId;
      });
    }

    if (filters.hub) {
      filtered = filtered.filter(sv => sv.hub === filters.hub);
    }

    if (filters.region) {
      filtered = filtered.filter(sv => sv.region === filters.region);
    }

    return filtered;
  }, [siteVisits, selectedMmpId, filters.hub, filters.region]);

  const mmpStats = useMemo((): MMPStats => {
    const total = filteredMmpFiles.length;
    const approved = filteredMmpFiles.filter(m => m.status === 'approved').length;
    const pending = filteredMmpFiles.filter(m => m.status === 'pending').length;
    const verified = filteredMmpFiles.filter(m => m.status === 'verified').length;
    const rejected = filteredMmpFiles.filter(m => m.status === 'rejected').length;

    const byClassification = {
      original: filteredMmpFiles.filter(m => (m as any).classification === 'original').length,
      revised: filteredMmpFiles.filter(m => (m as any).classification === 'revised').length,
      additional: filteredMmpFiles.filter(m => (m as any).classification === 'additional').length,
      supplementary: filteredMmpFiles.filter(m => (m as any).classification === 'supplementary').length,
    };

    const completedVisits = filteredSiteVisits.filter(v => v.status === 'completed').length;
    const completionRate = filteredSiteVisits.length > 0
      ? Math.round((completedVisits / filteredSiteVisits.length) * 100)
      : 0;

    return { total, approved, pending, verified, rejected, byClassification, completionRate };
  }, [filteredMmpFiles, filteredSiteVisits]);

  return {
    filters,
    setFilters,
    filteredMmpFiles,
    filteredSiteVisits,
    mmpStats,
    uniqueHubs,
    uniqueRegions,
    selectedMmpId,
    setSelectedMmpId,
    selectedMmp,
    canAccessVersioning,
    isAdmin,
    isFinance,
  };
}
