
import React, { createContext, useContext, useState, useEffect } from 'react';
import { MMPFile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { MMPContextType } from './types';
import { useMMPOperations } from './hooks/useMMPOperations';
import { useMMPStatusOperations } from './hooks/useMMPStatusOperations';
import { useMMPVersioning } from './hooks/useMMPVersioning';
import { useMMPUpload } from './hooks/useMMPUpload';

// Transform database record (snake_case) to MMPFile interface (camelCase)
const transformDBToMMPFile = (dbRecord: any): MMPFile => {
  return {
    id: dbRecord.id,
    name: dbRecord.name,
    uploadedBy: dbRecord.uploaded_by || 'Unknown',
    uploadedAt: dbRecord.uploaded_at,
    status: dbRecord.status,
    entries: dbRecord.entries,
    processedEntries: dbRecord.processed_entries,
    mmpId: dbRecord.mmp_id,
    rejectionReason: dbRecord.rejection_reason || dbRecord.rejectionreason,
    approvedBy: dbRecord.approved_by || dbRecord.approvedby,
    approvedAt: dbRecord.approved_at || dbRecord.approvedat,
    verifiedBy: dbRecord.verified_by,
    verifiedAt: dbRecord.verified_at,
    archivedAt: dbRecord.archived_at || dbRecord.archivedat,
    archivedBy: dbRecord.archived_by || dbRecord.archivedby,
    deletedAt: dbRecord.deleted_at || dbRecord.deletedat,
    deletedBy: dbRecord.deleted_by || dbRecord.deletedby,
    expiryDate: dbRecord.expiry_date || dbRecord.expirydate,
    region: dbRecord.region,
    month: dbRecord.month,
    year: dbRecord.year,
    version: dbRecord.version,
    modificationHistory: dbRecord.modification_history || dbRecord.modificationhistory,
    modifiedAt: dbRecord.modified_at,
    description: dbRecord.description,
    projectName: dbRecord.project_name || dbRecord.projectname,
    type: dbRecord.type,
    filePath: dbRecord.file_path,
    originalFilename: dbRecord.original_filename,
    fileUrl: dbRecord.file_url,
    projectId: dbRecord.project_id,
    siteEntries: dbRecord.site_entries || [],
    workflow: dbRecord.workflow,
    approvalWorkflow: dbRecord.approval_workflow,
    location: dbRecord.location,
    team: dbRecord.team,
    permits: dbRecord.permits,
    siteVisit: dbRecord.site_visit || dbRecord.sitevisit,
    financial: dbRecord.financial,
    performance: dbRecord.performance,
    cpVerification: dbRecord.cp_verification || dbRecord.cpverification,
    comprehensiveVerification: dbRecord.comprehensive_verification,
    activities: dbRecord.activities,
  } as MMPFile; // Type assertion to handle any remaining type issues
};

const MMPContext = createContext<MMPContextType>({
  mmpFiles: [],
  loading: true,
  error: null,
  currentMMP: null,
  setCurrentMMP: () => {},
  addMMPFile: () => {},
  updateMMPFile: () => {},
  deleteMMPFile: async () => false,
  getMMPById: () => undefined,
  getMmpById: () => undefined,
  getPermitsByMmpId: async () => undefined,
  archiveMMP: async () => {},
  approveMMP: async () => {},
  rejectMMP: async () => {},
  uploadMMP: async () => ({ success: false }),
  updateMMP: () => {},
  updateMMPVersion: async () => false,
  deleteMMP: () => {},
  restoreMMP: () => {},
  resetMMP: async () => false,
});

export const useMMPProvider = () => {
  const [mmpFiles, setMMPFiles] = useState<MMPFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const {
    currentMMP,
    setCurrentMMP,
    getMmpById,
    addMMPFile,
    updateMMPFile,
    deleteMMPFile,
  } = useMMPOperations(mmpFiles, setMMPFiles);

  const { archiveMMP, approveMMP, rejectMMP } = useMMPStatusOperations(setMMPFiles);
  const { updateMMPVersion } = useMMPVersioning(setMMPFiles);
  const { uploadMMP } = useMMPUpload(addMMPFile);

  useEffect(() => {
    const fetchMMPFiles = async () => {
      try {
        setLoading(true);
        
        const { data: mmpData, error } = await supabase
          .from('mmp_files')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching MMP files from Supabase:', error);
          throw error;
        }

        const mapped = (mmpData || []).map(transformDBToMMPFile);
        setMMPFiles(mapped);
      } catch (err) {
        console.error('Error loading MMP files:', err);
        setError('Failed to load MMP files');
        setMMPFiles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMMPFiles();
  }, []);

  const updateMMP = (id: string, updatedMMP: Partial<MMPFile>) => {
    setMMPFiles((prev: MMPFile[]) =>
      prev.map((mmp) => {
        if (mmp.id === id) {
          return { ...mmp, ...updatedMMP };
        }
        return mmp;
      })
    );

    // Persist to Supabase (map camelCase to snake_case)
    const toDBPartial = (p: Partial<MMPFile>) => {
      const map: Record<string, string> = {
        uploadedAt: 'uploaded_at',
        uploadedBy: 'uploaded_by',
        processedEntries: 'processed_entries',
        mmpId: 'mmp_id',
        filePath: 'file_path',
        originalFilename: 'original_filename',
        fileUrl: 'file_url',
        approvalWorkflow: 'approval_workflow',
        siteEntries: 'site_entries',
        projectName: 'projectname',
        cpVerification: 'cpverification',
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
      const out: any = { updated_at: new Date().toISOString() };
      Object.entries(p).forEach(([k, v]) => {
        const dbk = (map as any)[k] || k;
        out[dbk] = v;
      });
      return out;
    };

    try {
      const dbUpdate = toDBPartial(updatedMMP);
      supabase.from('mmp_files').update(dbUpdate).eq('id', id).then(({ error }) => {
        if (error) console.error('Supabase updateMMP error:', error);
      });
    } catch (e) {
      console.error('Failed to persist MMP update:', e);
    }
  };

  const deleteMMP = (id: string) => {
    // Soft delete in DB and local state
    const deletedAt = new Date().toISOString();
    setMMPFiles((prev: MMPFile[]) =>
      prev.map((mmp) => (mmp.id === id ? { ...mmp, status: 'deleted', deletedAt } : mmp))
    );

    try {
      supabase
        .from('mmp_files')
        .update({ status: 'deleted', deleted_at: deletedAt })
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('Supabase delete (soft) error:', error);
        });
    } catch (e) {
      console.error('Failed to persist deleteMMP:', e);
    }
  };

  const restoreMMP = (id: string) => {
    setMMPFiles((prev: MMPFile[]) =>
      prev.map((mmp) => (mmp.id === id && mmp.status === 'deleted' ? { ...mmp, status: 'pending', deletedAt: undefined, deletedBy: undefined } : mmp))
    );
    try {
      supabase
        .from('mmp_files')
        .update({ status: 'pending', deleted_at: null, deleted_by: null })
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('Supabase restoreMMP error:', error);
        });
    } catch (e) {
      console.error('Failed to persist restoreMMP:', e);
    }
  };

  const resetMMP = async (id?: string): Promise<boolean> => {
    try {
      setCurrentMMP(null);
      if (id) {
        setMMPFiles((prev: MMPFile[]) =>
          prev.map((mmp) => {
            if (mmp.id === id) {
              return {
                ...mmp,
                status: 'pending',
                approvalWorkflow: null,
                rejectionReason: null,
                approvedAt: null,
                approvedBy: null,
                verifiedAt: null,
                verifiedBy: null
              };
            }
            return mmp;
          })
        );

        // Persist reset to DB (avoid columns that may not exist across envs)
        try {
          await supabase
            .from('mmp_files')
            .update({
              status: 'pending',
              approval_workflow: null,
              rejection_reason: null,
              approved_by: null,
              approved_at: null,
              verified_by: null,
              verified_at: null,
            })
            .eq('id', id);
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

  // Always return permits attached to this MMP id (fresh from local state or DB)
  const getPermitsByMmpId = async (id: string) => {
    try {
      const local = (mmpFiles || []).find((m) => m.id === id);
      if (local && typeof local.permits !== 'undefined') {
        return local.permits;
      }
      const { data, error } = await supabase
        .from('mmp_files')
        .select('permits')
        .eq('id', id)
        .single();
      if (error) {
        console.error('Error fetching permits by MMP id:', error);
        return undefined;
      }
      return data?.permits;
    } catch (e) {
      console.error('getPermitsByMmpId failed:', e);
      return undefined;
    }
  };

  return {
    mmpFiles,
    loading,
    error,
    currentMMP,
    setCurrentMMP,
    addMMPFile,
    updateMMPFile,
    deleteMMPFile,
    getMmpById,
    getMMPById: getMmpById,
    getPermitsByMmpId,
    archiveMMP,
    approveMMP,
    rejectMMP,
    uploadMMP,
    updateMMP,
    updateMMPVersion,
    deleteMMP,
    restoreMMP,
    resetMMP
  };
};

export const MMPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mmpContext = useMMPProvider();
  return <MMPContext.Provider value={mmpContext}>{children}</MMPContext.Provider>;
};

export const useMMP = () => useContext(MMPContext);
