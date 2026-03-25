import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { MMPFile } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';
import { MMPContextType } from './types';
import { useMMPOperations } from './hooks/useMMPOperations';
import { useMMPStatusOperations } from './hooks/useMMPStatusOperations';
import { useMMPVersioning } from './hooks/useMMPVersioning';
import { useMMPUpload } from './hooks/useMMPUpload';
import {
  fetchSiteEntriesForMMP,
  fetchSiteEntriesRaw,
  getPermitsByMmpId as dbGetPermitsByMmpId,
  softDeleteMMPWithReversals,
  restoreMMPRecord,
  resetMMPRecord,
  attachPermitsDB,
  updateMMPWithEntries,
} from '@/features/mmp/repository/mmpRepository';
import {
  useMMPFilesQuery,
  useMMPSiteEntryCountsQuery,
  mmpQueryKeys,
  defaultSiteEntryCounts,
} from './mmpQueries';

// camelCase → snake_case map for updateMMP partial patches
const MMP_FIELD_MAP: Record<string, string> = {
  uploadedAt: 'uploaded_at',
  uploadedBy: 'uploaded_by',
  hub: 'hub',
  month: 'month',
  processedEntries: 'processed_entries',
  mmpId: 'mmp_id',
  filePath: 'file_path',
  originalFilename: 'original_filename',
  fileUrl: 'file_url',
  projectId: 'project_id',
  projectName: 'project_name',
  approvalWorkflow: 'approval_workflow',
  siteEntries: 'site_entries',
  cpVerification: 'cp_verification',
  comprehensiveVerification: 'comprehensive_verification',
  rejectionReason: 'rejectionreason',
  approvedBy: 'approvedby',
  approvedAt: 'approvedat',
  verifiedBy: 'verified_by',
  verifiedAt: 'verified_at',
  archivedBy: 'archivedby',
  archivedAt: 'archivedat',
  deletedBy: 'deletedby',
  deletedAt: 'deletedat',
  expiryDate: 'expirydate',
  modificationHistory: 'modificationhistory',
  modifiedAt: 'modified_at',
};

function toDBPartial(p: Partial<MMPFile>): Record<string, any> {
  const out: any = { updated_at: new Date().toISOString() };
  const safeInput: any = { ...p };
  delete safeInput.comprehensiveVerification; // not a DB column
  Object.entries(safeInput).forEach(([k, v]) => {
    out[MMP_FIELD_MAP[k] || k] = v;
  });
  return out;
}

const MMPContext = createContext<MMPContextType>({
  mmpFiles: [],
  loading: true,
  error: null,
  siteEntryCounts: defaultSiteEntryCounts,
  currentMMP: null,
  setCurrentMMP: () => {},
  addMMPFile: () => {},
  updateMMPFile: () => {},
  deleteMMPFile: async () => false,
  getMMPById: () => undefined,
  getMmpById: () => undefined,
  getPermitsByMmpId: async () => undefined,
  verifyMMP: async () => {},
  archiveMMP: async () => {},
  approveMMP: async () => {},
  rejectMMP: async () => {},
  uploadMMP: async () => ({ success: false }),
  updateMMP: async () => false,
  updateMMPVersion: async () => false,
  deleteMMP: async () => false,
  restoreMMP: async () => {},
  resetMMP: async () => false,
  attachPermitsToMMP: async () => {},
  refreshMMPFiles: async () => {},
  fetchSiteEntriesForMMP: async () => [],
  loadSiteEntriesForMMPs: async () => {},
  refreshSiteEntryCounts: async () => {},
});

export const useMMPProvider = () => {
  const queryClient = useQueryClient();
  const filesQuery = useMMPFilesQuery();
  const countsQuery = useMMPSiteEntryCountsQuery();

  const mmpFiles = filesQuery.data ?? [];
  const loading = filesQuery.isLoading;
  const error = filesQuery.error ? 'Failed to load MMP files' : null;
  const siteEntryCounts = countsQuery.data ?? defaultSiteEntryCounts;

  const setMMPFiles = useCallback(
    (updater: MMPFile[] | ((prev: MMPFile[]) => MMPFile[])) => {
      queryClient.setQueryData(mmpQueryKeys.files(), (prev: MMPFile[] | undefined) =>
        typeof updater === 'function' ? updater(prev ?? []) : updater
      );
    },
    [queryClient],
  );

  const { currentMMP, setCurrentMMP, getMmpById, addMMPFile, updateMMPFile, deleteMMPFile } =
    useMMPOperations(mmpFiles, setMMPFiles);
  const { verifyMMP, archiveMMP, approveMMP, rejectMMP } = useMMPStatusOperations(setMMPFiles);
  const { updateMMPVersion } = useMMPVersioning(setMMPFiles);
  const { uploadMMP } = useMMPUpload(addMMPFile);

  // ─── attachPermitsToMMP ────────────────────────────────────────────────────

  const attachPermitsToMMP = async (
    id: string,
    permits: { federal: File | null; state?: File | null; local?: File | null },
  ) => {
    const session = await ensureValidSession();
    if (!session.success) throw new Error(session.error || 'Session expired. Please refresh and try again.');
    if (!id || !permits.federal) throw new Error('Federal permit is required');

    const uploadFile = async (file: File, type: string) => ({
      type,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      fileUrl: URL.createObjectURL(file),
    });

    const uploadedDocs: any[] = [];
    if (permits.federal) uploadedDocs.push(await uploadFile(permits.federal, 'federal'));
    if (permits.state) uploadedDocs.push(await uploadFile(permits.state, 'state'));
    if (permits.local) uploadedDocs.push(await uploadFile(permits.local, 'local'));

    const permitsPayload = {
      federal: !!permits.federal,
      state: !!permits.state,
      local: !!permits.local,
      documents: uploadedDocs,
    };

    // Update local state
    setMMPFiles((prev: MMPFile[]) =>
      prev.map(mmp => mmp.id === id ? { ...mmp, permits: permitsPayload } : mmp)
    );

    await withTimeout(attachPermitsDB(id, permitsPayload), 15000, 'Attach permits timed out');
  };

  // ─── refreshes ────────────────────────────────────────────────────────────

  const refreshSiteEntryCounts = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: mmpQueryKeys.siteEntryCounts() });
  }, [queryClient]);

  const refreshMMPFiles = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: mmpQueryKeys.files() });
    await queryClient.invalidateQueries({ queryKey: mmpQueryKeys.siteEntryCounts() });
  }, [queryClient]);

  // ─── Background batch site entry loading ──────────────────────────────────

  const loadSiteEntriesInBackground = useCallback(async (mmpIds: string[]) => {
    if (mmpIds.length === 0) return;
    const BATCH_SIZE = 5;
    const batches: string[][] = [];
    for (let i = 0; i < mmpIds.length; i += BATCH_SIZE) {
      batches.push(mmpIds.slice(i, i + BATCH_SIZE));
    }

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map(async (mmpId) => {
          try {
            const entries = await fetchSiteEntriesRaw(mmpId);
            return { mmpId, entries };
          } catch (e) {
            console.error('Background load failed for MMP:', mmpId, e);
            return null;
          }
        }),
      );

      const validResults = results.filter(
        (r): r is { mmpId: string; entries: any[] } => r !== null,
      );
      if (validResults.length > 0) {
        setMMPFiles((prev: MMPFile[]) =>
          prev.map((mmp) => {
            const found = validResults.find((r) => r.mmpId === mmp.id);
            if (!found) return mmp;
            const enrichedEntries = found.entries.map((entry: any) => ({
              ...entry,
              cpName: entry.cpName || mmp.projectName || '',
              cp_name: entry.cp_name || mmp.projectName || '',
            }));
            return { ...mmp, siteEntries: enrichedEntries };
          })
        );
      }
    }
  }, []);

  // ─── updateMMP (file metadata + optional site entries sync) ───────────────

  const updateMMP = async (id: string, updatedMMP: Partial<MMPFile>): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) throw new Error(session.error || 'Session expired. Please refresh and try again.');

    // Optimistic local update
    setMMPFiles((prev: MMPFile[]) =>
      prev.map((mmp) => (mmp.id === id ? { ...mmp, ...updatedMMP } : mmp))
    );

    try {
      return await withTimeout(
        (async () => {
          const dbUpdate = toDBPartial(updatedMMP);
          const entries = typeof updatedMMP.siteEntries !== 'undefined'
            ? (updatedMMP.siteEntries as any[]) || []
            : undefined;

          const result = await updateMMPWithEntries(id, dbUpdate, entries);
          if (!result.success) return false;

          if (result.normalizedEntries) {
            setMMPFiles((prev: MMPFile[]) =>
              prev.map(m => (m.id === id ? { ...m, siteEntries: result.normalizedEntries } : m))
            );
          }
          return true;
        })(),
        15000,
        'Update MMP timed out',
      );
    } catch (e) {
      console.error('Failed to persist MMP update:', e);
      return false;
    }
  };

  // ─── deleteMMP (soft delete with wallet reversals) ─────────────────────────

  const deleteMMP = async (id: string) => {
    const session = await ensureValidSession();
    if (!session.success) throw new Error(session.error || 'Session expired. Please refresh and try again.');

    try {
      return await withTimeout(
        (async () => {
          const deletedAt = new Date().toISOString();
          setMMPFiles((prev: MMPFile[]) =>
            prev.map((mmp) => (mmp.id === id ? { ...mmp, status: 'deleted', deletedAt } : mmp))
          );
          await softDeleteMMPWithReversals(id);
          return true;
        })(),
        15000,
        'Delete MMP timed out',
      );
    } catch (e) {
      console.error('Failed to delete MMP:', e);
      return false;
    }
  };

  // ─── restoreMMP ───────────────────────────────────────────────────────────

  const restoreMMP = async (id: string) => {
    const session = await ensureValidSession();
    if (!session.success) throw new Error(session.error || 'Session expired. Please refresh and try again.');

    setMMPFiles((prev: MMPFile[]) =>
      prev.map((mmp) =>
        mmp.id === id && mmp.status === 'deleted'
          ? { ...mmp, status: 'pending', deletedAt: undefined, deletedBy: undefined }
          : mmp
      )
    );
    try {
      await withTimeout(restoreMMPRecord(id), 15000, 'Restore MMP timed out');
    } catch (e) {
      console.error('Failed to persist restoreMMP:', e);
    }
  };

  // ─── resetMMP ─────────────────────────────────────────────────────────────

  const resetMMP = async (id?: string): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) throw new Error(session.error || 'Session expired. Please refresh and try again.');

    try {
      setCurrentMMP(null);
      if (id) {
        setMMPFiles((prev: MMPFile[]) =>
          prev.map((mmp) =>
            mmp.id === id
              ? {
                  ...mmp,
                  status: 'pending',
                  approvalWorkflow: null,
                  rejectionReason: null,
                  approvedAt: null,
                  approvedBy: null,
                  verifiedAt: null,
                  verifiedBy: null,
                }
              : mmp
          )
        );
        try {
          await withTimeout(resetMMPRecord(id), 15000, 'Reset MMP timed out');
        } catch (dbErr) {
          console.error('Failed to persist resetMMP to DB:', dbErr);
        }
      }
      return true;
    } catch (error) {
      console.error('Error resetting MMP:', error);
      return false;
    }
  };

  // ─── fetchSiteEntriesForMMP (on-demand lazy load) ─────────────────────────

  const fetchSiteEntriesForMMPLocal = useCallback(async (mmpId: string): Promise<any[]> => {
    try {
      const entries = await fetchSiteEntriesForMMP(mmpId);
      setMMPFiles((prev: MMPFile[]) =>
        prev.map((mmp) => (mmp.id === mmpId ? { ...mmp, siteEntries: entries } : mmp))
      );
      return entries;
    } catch (e) {
      console.error('fetchSiteEntriesForMMP failed:', e);
      return [];
    }
  }, []);

  // ─── getPermitsByMmpId ────────────────────────────────────────────────────

  const getPermitsByMmpId = async (id: string) => {
    try {
      const local = (mmpFiles || []).find((m) => m.id === id);
      if (local && typeof local.permits !== 'undefined') return local.permits;
      return await dbGetPermitsByMmpId(id);
    } catch (e) {
      console.error('getPermitsByMmpId failed:', e);
      return undefined;
    }
  };

  // ─── Online listener ──────────────────────────────────────────────────────

  useEffect(() => {
    let appStateListener: any = null;
    const handleOnline = () => refreshMMPFiles();
    window.addEventListener('online', handleOnline);

    const setupAppStateListener = async () => {
      try {
        if (typeof (window as any).Capacitor !== 'undefined') {
          const { App } = await import('@capacitor/app');
          appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
            if (isActive && navigator.onLine) refreshMMPFiles();
          });
        }
      } catch {
        console.debug('Capacitor App plugin not available');
      }
    };
    setupAppStateListener();

    return () => {
      if (appStateListener) appStateListener.remove();
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshMMPFiles]);

  useEffect(() => {
    console.log('[MMP] Using manual refresh mode - data updates on user actions only');
  }, []);

  return {
    mmpFiles,
    loading,
    error,
    siteEntryCounts,
    currentMMP,
    setCurrentMMP,
    addMMPFile,
    updateMMPFile,
    deleteMMPFile,
    getMmpById,
    getMMPById: getMmpById,
    getPermitsByMmpId,
    verifyMMP,
    archiveMMP,
    approveMMP,
    rejectMMP,
    uploadMMP,
    updateMMP,
    updateMMPVersion,
    deleteMMP,
    restoreMMP,
    resetMMP,
    attachPermitsToMMP,
    refreshMMPFiles,
    fetchSiteEntriesForMMP: fetchSiteEntriesForMMPLocal,
    loadSiteEntriesForMMPs: loadSiteEntriesInBackground,
    refreshSiteEntryCounts,
  };
};

export const MMPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mmpContext = useMMPProvider();
  return <MMPContext.Provider value={mmpContext}>{children}</MMPContext.Provider>;
};

export const useMMP = () => useContext(MMPContext);
