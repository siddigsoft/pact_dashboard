
import React, { createContext, useContext, useState, useEffect } from 'react';
import { MMPFile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { mmpFiles as mockMMPFiles } from '@/data/mockMMPFiles';
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
    rejectionReason: dbRecord.rejection_reason,
    approvedBy: dbRecord.approved_by,
    approvedAt: dbRecord.approved_at,
    archivedAt: dbRecord.archived_at,
    archivedBy: dbRecord.archived_by,
    deletedAt: dbRecord.deleted_at,
    deletedBy: dbRecord.deleted_by,
    expiryDate: dbRecord.expiry_date,
    region: dbRecord.region,
    month: dbRecord.month,
    year: dbRecord.year,
    version: dbRecord.version,
    modificationHistory: dbRecord.modification_history,
    modifiedAt: dbRecord.modified_at,
    description: dbRecord.description,
    projectName: dbRecord.project_name,
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
    siteVisit: dbRecord.site_visit,
    financial: dbRecord.financial,
    performance: dbRecord.performance,
    cpVerification: dbRecord.cp_verification,
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
  deleteMMPFile: () => {},
  getMMPById: () => undefined,
  getMmpById: () => undefined,
  archiveMMP: () => {},
  approveMMP: () => {},
  rejectMMP: () => {},
  uploadMMP: async () => false,
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
        
        let data = [];
        if (supabase) {
          const { data: mmpData, error } = await supabase
            .from('mmp_files')
            .select('*')
            .order('created_at', { ascending: false });
            
          if (error) {
            console.error('Error fetching MMP files from Supabase:', error);
            throw error;
          }
          
          if (mmpData && mmpData.length > 0) {
            // Transform snake_case database columns to camelCase interface
            data = mmpData.map(transformDBToMMPFile);
            console.log('MMP files loaded from Supabase:', data);
          } else {
            console.log('No MMP files found in Supabase, using mock data');
            const storedMockData = JSON.parse(localStorage.getItem('mock_mmp_files') || '[]');
            data = storedMockData.length > 0 ? storedMockData : mockMMPFiles;
          }
        } else {
          console.log('Supabase not connected, using mock data');
          const storedMockData = JSON.parse(localStorage.getItem('mock_mmp_files') || '[]');
          data = storedMockData.length > 0 ? storedMockData : mockMMPFiles;
        }
        
        setMMPFiles(data);
      } catch (err) {
        console.error('Error loading MMP files:', err);
        setError('Failed to load MMP files');
        const storedMockData = JSON.parse(localStorage.getItem('mock_mmp_files') || '[]');
        setMMPFiles(storedMockData.length > 0 ? storedMockData : mockMMPFiles);
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
  };

  const deleteMMP = (id: string) => {
    setMMPFiles((prev: MMPFile[]) =>
      prev.map((mmp) => {
        if (mmp.id === id) {
          return {
            ...mmp,
            status: 'deleted',
            deletedAt: new Date().toISOString(),
            deletedBy: 'Current User'
          };
        }
        return mmp;
      })
    );
  };

  const restoreMMP = (id: string) => {
    setMMPFiles((prev: MMPFile[]) =>
      prev.map((mmp) => {
        if (mmp.id === id && mmp.status === 'deleted') {
          const { deletedAt, deletedBy, ...restoredMmp } = mmp;
          return {
            ...restoredMmp,
            status: 'pending'
          };
        }
        return mmp;
      })
    );
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
                approvedBy: null
              };
            }
            return mmp;
          })
        );
      }
      return true;
    } catch (error) {
      console.error('Error resetting MMP:', error);
      return false;
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
