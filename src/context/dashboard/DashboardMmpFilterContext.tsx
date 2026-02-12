import { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { useMMP } from '@/context/mmp/MMPContext';
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
}

const DashboardMmpFilterContext = createContext<DashboardMmpFilterContextType | null>(null);

export function DashboardMmpFilterProvider({ children }: { children: React.ReactNode }) {
  const { mmpFiles } = useMMP();
  const [selectedMmpIds, setSelectedMmpIds] = useState<string[]>([]);

  const availableMmps = useMemo(() => {
    return (mmpFiles || []).sort((a, b) => {
      const dateA = a.uploadedAt ? new Date(a.uploadedAt).getTime() : 0;
      const dateB = b.uploadedAt ? new Date(b.uploadedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [mmpFiles]);

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
    const selectedMmpIdSet = new Set(selectedMmpIds);
    const selectedMmpNames = new Set(availableMmps.filter(m => selectedMmpIdSet.has(m.id)).map(m => m.mmpId).filter(Boolean));
    return visits.filter(visit => {
      const fileId = (visit as any).mmpFileId;
      if (fileId && selectedMmpIdSet.has(fileId)) return true;
      const mmpId = visit.mmpDetails?.mmpId;
      if (mmpId && selectedMmpIdSet.has(mmpId)) return true;
      if (mmpId && selectedMmpNames.has(mmpId)) return true;
      return false;
    });
  }, [selectedMmpIds, availableMmps]);

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
  }), [selectedMmpIds, toggleMmpId, clearSelection, selectAll, isFiltering, availableMmps, selectedMmps, filterSiteVisitsByMmp]);

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
