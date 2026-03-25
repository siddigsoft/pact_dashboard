import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useMMP } from '@/features/mmp/context/MMPContext';
import { useSiteVisitContext } from '@/features/siteVisit/context/SiteVisitContext';
import type { MMPFile } from '@/types';

interface DashboardMmpFilterContextType {
  selectedMmpIds: string[];
  setSelectedMmpIds: (ids: string[]) => void;
  toggleMmpId: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  isFiltering: boolean;
  availableMmps: MMPFile[];
  selectedMmps: MMPFile[];
  filterSiteVisitsByMmp: <T extends { mmpDetails?: { mmpId?: string }; mmpFileId?: string }>(visits: T[]) => T[];
  getLiveSiteCount: (mmpId: string) => number;
}

const DashboardMmpFilterContext = createContext<DashboardMmpFilterContextType | null>(null);

export function DashboardMmpFilterProvider({ children }: { children: React.ReactNode }) {
  const { mmpFiles } = useMMP();
  const { siteVisits: allSiteVisits } = useSiteVisitContext();
  const [selectedMmpIds, setSelectedMmpIds] = useState<string[]>([]);

  const availableMmps = useMemo(() => {
    return (mmpFiles || []).sort((a, b) => {
      const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [mmpFiles]);

  const matchVisitToMmp = useCallback((visit: any, mmpId: string, mmpMmpId?: string, mmpName?: string): boolean => {
    const fileId = visit.mmpFileId;
    if (fileId && fileId === mmpId) return true;

    const visitMmpId = visit.mmpDetails?.mmpId;
    if (visitMmpId) {
      if (visitMmpId === mmpId) return true;
      if (mmpMmpId && visitMmpId === mmpMmpId) return true;
    }

    if (mmpName) {
      const projectName = visit.mmpDetails?.projectName || visit.projectName || '';
      if (projectName && projectName.toLowerCase() === mmpName.toLowerCase()) return true;
    }

    return false;
  }, []);

  const mmpSiteCountMap = useMemo(() => {
    const countMap = new Map<string, number>();

    for (const mmp of availableMmps) {
      let count = 0;
      for (const visit of allSiteVisits) {
        if (matchVisitToMmp(visit, mmp.id, mmp.mmpId, mmp.name)) {
          count++;
        }
      }
      countMap.set(mmp.id, count);
    }
    return countMap;
  }, [allSiteVisits, availableMmps, matchVisitToMmp]);

  const getLiveSiteCount = useCallback((mmpId: string) => {
    return mmpSiteCountMap.get(mmpId) || 0;
  }, [mmpSiteCountMap]);

  const selectedMmps = useMemo(() => {
    if (selectedMmpIds.length === 0) return [];
    return availableMmps.filter(m => selectedMmpIds.includes(m.id));
  }, [availableMmps, selectedMmpIds]);

  const isFiltering = selectedMmpIds.length > 0;

  const toggleMmpId = useCallback((id: string) => {
    setSelectedMmpIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedMmpIds([]);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedMmpIds(availableMmps.map(m => m.id));
  }, [availableMmps]);

  const filterSiteVisitsByMmp = useCallback(<T extends { mmpDetails?: { mmpId?: string }; mmpFileId?: string }>(visits: T[]): T[] => {
    if (selectedMmpIds.length === 0) return visits;
    const selectedSet = availableMmps.filter(m => selectedMmpIds.includes(m.id));

    return visits.filter(visit => {
      return selectedSet.some(mmp => matchVisitToMmp(visit, mmp.id, mmp.mmpId, mmp.name));
    });
  }, [selectedMmpIds, availableMmps, matchVisitToMmp]);

  const value = useMemo(() => ({
    selectedMmpIds,
    setSelectedMmpIds,
    toggleMmpId,
    clearSelection,
    selectAll,
    isFiltering,
    availableMmps,
    selectedMmps,
    filterSiteVisitsByMmp,
    getLiveSiteCount,
  }), [selectedMmpIds, toggleMmpId, clearSelection, selectAll, isFiltering, availableMmps, selectedMmps, filterSiteVisitsByMmp, getLiveSiteCount]);

  return (
    <DashboardMmpFilterContext.Provider value={value}>
      {children}
    </DashboardMmpFilterContext.Provider>
  );
}

export function useDashboardMmpFilter() {
  const ctx = useContext(DashboardMmpFilterContext);
  if (!ctx) {
    throw new Error('useDashboardMmpFilter must be used within DashboardMmpFilterProvider');
  }
  return ctx;
}
