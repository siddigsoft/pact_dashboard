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
  // Prefer site entries from the relational table if present; fallback to JSONB
  let siteEntries: any[] = [];
  if (dbRecord.mmp_site_entries) {
    siteEntries = (dbRecord.mmp_site_entries as any[]).map((entry: any) => ({
      id: entry.id,
      siteCode: entry.site_code,
      hubOffice: entry.hub_office,
      state: entry.state,
      locality: entry.locality,
      siteName: entry.site_name,
      cpName: entry.cp_name,
      visitType: entry.visit_type,
      visitDate: entry.visit_date,
      mainActivity: entry.main_activity,
      siteActivity: entry.activity_at_site,
      monitoringBy: entry.monitoring_by,
      surveyTool: entry.survey_tool,
      useMarketDiversion: entry.use_market_diversion,
      useWarehouseMonitoring: entry.use_warehouse_monitoring,
      comments: entry.comments,
      cost: entry.cost,
      additionalData: entry.additional_data || {},
      status: entry.status,
    }));
  } else if (dbRecord.site_entries) {
    siteEntries = dbRecord.site_entries;
  }

  return {
    id: dbRecord.id,
    name: dbRecord.name,
    hub: dbRecord.hub,
    month: dbRecord.month,
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
    year: dbRecord.year,
    version: dbRecord.version,
    modificationHistory: dbRecord.modification_history || dbRecord.modificationhistory,
    modifiedAt: dbRecord.modified_at,
    description: dbRecord.description,
    type: dbRecord.type,
    filePath: dbRecord.file_path,
    originalFilename: dbRecord.original_filename,
    fileUrl: dbRecord.file_url,
    projectId: dbRecord.project_id,
    projectName: dbRecord.project?.name || dbRecord.project_name || dbRecord.projectname || dbRecord.name,
    siteEntries,
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
  updateMMP: async () => false,
  updateMMPVersion: async () => false,
  deleteMMP: () => {},
  restoreMMP: () => {},
  resetMMP: async () => false,
  attachPermitsToMMP: async () => {},
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

  // Attach permits to MMP (federal required, state/local optional)
  const attachPermitsToMMP = async (id: string, permits: { federal: File | null; state?: File | null; local?: File | null }) => {
    if (!id || !permits.federal) throw new Error('Federal permit is required');
    // Simulate upload: In real app, upload files to storage and get URLs
    const uploadedDocs: any[] = [];
    const uploadFile = async (file: File, type: string) => {
      // Simulate upload and return a fake URL
      return {
        type,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
        fileUrl: URL.createObjectURL(file),
      };
    };
    if (permits.federal) uploadedDocs.push(await uploadFile(permits.federal, 'federal'));
    if (permits.state) uploadedDocs.push(await uploadFile(permits.state, 'state'));
    if (permits.local) uploadedDocs.push(await uploadFile(permits.local, 'local'));

    // Update local state
    setMMPFiles((prev: MMPFile[]) => prev.map(mmp => mmp.id === id ? {
      ...mmp,
      permits: {
        ...mmp.permits,
        federal: !!permits.federal,
        state: !!permits.state,
        local: !!permits.local,
        documents: uploadedDocs,
      }
    } : mmp));

    // Persist to Supabase (store metadata, not files)
    await supabase.from('mmp_files').update({
      permits: {
        federal: !!permits.federal,
        state: !!permits.state,
        local: !!permits.local,
        documents: uploadedDocs,
      }
    }).eq('id', id);
  };

  useEffect(() => {
    const fetchMMPFiles = async () => {
      try {
        setLoading(true);
        
        const { data: mmpData, error } = await supabase
          .from('mmp_files')
          .select(`
            *,
            project:projects(
              id,
              name,
              project_code
            ),
            mmp_site_entries (*)
          `)
          .order('created_at', { ascending: false });

        let rows = mmpData;
        if (error) {
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('mmp_files')
            .select('*')
            .order('created_at', { ascending: false });
          if (fallbackError) {
            throw fallbackError;
          }
          rows = fallbackData;
        }

        const mapped = (rows || []).map(transformDBToMMPFile);
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

  const updateMMP = async (id: string, updatedMMP: Partial<MMPFile>): Promise<boolean> => {
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
      const out: any = { updated_at: new Date().toISOString() };
      const safeInput: any = { ...p };
      // Avoid updating non-existent wide JSON columns unless explicitly supported by schema
      delete safeInput.comprehensiveVerification;
      Object.entries(safeInput).forEach(([k, v]) => {
        const dbk = (map as any)[k] || k;
        out[dbk] = v;
      });
      return out;
    };

    try {
      const dbUpdate = toDBPartial(updatedMMP);
      const { error: mfErr } = await supabase.from('mmp_files').update(dbUpdate).eq('id', id);
      if (mfErr) {
        console.error('Supabase updateMMP error:', mfErr);
        return false;
      }

      if (typeof updatedMMP.siteEntries !== 'undefined') {
        const entries = (updatedMMP.siteEntries as any[]) || [];
        const { data: existingRows, error: selErr } = await supabase
          .from('mmp_site_entries')
          .select('id')
          .eq('mmp_file_id', id);
        if (selErr) {
          console.error('Failed to load existing mmp_site_entries for sync:', selErr);
          return false;
        }

        const existingIds = (existingRows || []).map((r: any) => r.id);
        const updatedIds = entries.map((e: any) => e?.id).filter(Boolean);
        const deleteIds = existingIds.filter((x: string) => !updatedIds.includes(x));

        const toBool = (v: any) => {
          if (typeof v === 'boolean') return v;
          const s = String(v ?? '').toLowerCase();
          return s === 'yes' || s === 'true' || s === '1';
        };
        const toNum = (v: any) => {
          if (v === null || typeof v === 'undefined' || v === '') return null;
          if (typeof v === 'number') return v;
          const s = String(v).replace(/[^0-9.\-]/g, '');
          if (!s) return null;
          const n = parseFloat(s);
          return isNaN(n) ? null : n;
        };

        const mapRow = (e: any) => ({
          ...(e.id ? { id: e.id } : {}),
          mmp_file_id: id,
          site_code: e.siteCode ?? e.site_code ?? e?.additionalData?.['Site Code'] ?? null,
          hub_office: e.hubOffice ?? e.hub_office ?? e?.additionalData?.['Hub Office'] ?? null,
          state: e.state ?? e.state_name ?? e?.additionalData?.['State'] ?? null,
          locality: e.locality ?? e.locality_name ?? e?.additionalData?.['Locality'] ?? null,
          site_name: e.siteName ?? e.site_name ?? e?.additionalData?.['Site Name'] ?? null,
          cp_name: e.cpName ?? e.cp_name ?? e?.additionalData?.['CP Name'] ?? null,
          visit_type: e.visitType ?? e.visit_type ?? null,
          visit_date: e.visitDate ?? e.visit_date ?? null,
          main_activity: e.mainActivity ?? e.main_activity ?? null,
          activity_at_site: e.siteActivity ?? e.activity_at_site ?? e.activity ?? null,
          monitoring_by: e.monitoringBy ?? e.monitoring_by ?? null,
          survey_tool: e.surveyTool ?? e.survey_tool ?? e?.additionalData?.['Survey Tool'] ?? e?.additionalData?.['Survey under Master tool'] ?? null,
          use_market_diversion: toBool(e.useMarketDiversion ?? e.use_market_diversion),
          use_warehouse_monitoring: toBool(e.useWarehouseMonitoring ?? e.use_warehouse_monitoring),
          comments: e.comments ?? null,
          cost: toNum(e.cost ?? e.price ?? e?.additionalData?.['Cost'] ?? e?.additionalData?.['Amount'] ?? e?.additionalData?.['Price']),
          additional_data: e.additionalData ?? {},
          status: e.status ?? 'Pending',
        });

        const toUpsert = entries.filter((e: any) => !!e.id).map(mapRow);
        const toInsert = entries.filter((e: any) => !e.id).map(mapRow);

        if (deleteIds.length) {
          const { error: delErr } = await supabase.from('mmp_site_entries').delete().in('id', deleteIds);
          if (delErr) {
            console.error('mmp_site_entries delete error:', delErr);
            return false;
          }
        }

        if (toUpsert.length) {
          const { error: upErr } = await supabase.from('mmp_site_entries').upsert(toUpsert, { onConflict: 'id' as any });
          if (upErr) {
            console.error('mmp_site_entries upsert error:', upErr);
            return false;
          }
        }

        if (toInsert.length) {
          const { error: insErr } = await supabase.from('mmp_site_entries').insert(toInsert);
          if (insErr) {
            console.error('mmp_site_entries insert error:', insErr);
            return false;
          }
        }

        // Re-fetch from DB and update local state to the authoritative rows
        const { data: syncedRows, error: syncErr } = await supabase
          .from('mmp_site_entries')
          .select('*')
          .eq('mmp_file_id', id)
          .order('created_at', { ascending: true });
        if (syncErr) {
          console.error('Failed to re-fetch mmp_site_entries after save:', syncErr);
        } else {
          const normalized = (syncedRows || []).map((entry: any) => ({
            id: entry.id,
            siteCode: entry.site_code,
            hubOffice: entry.hub_office,
            state: entry.state,
            locality: entry.locality,
            siteName: entry.site_name,
            cpName: entry.cp_name,
            visitType: entry.visit_type,
            visitDate: entry.visit_date,
            mainActivity: entry.main_activity,
            siteActivity: entry.activity_at_site,
            monitoringBy: entry.monitoring_by,
            surveyTool: entry.survey_tool,
            useMarketDiversion: entry.use_market_diversion,
            useWarehouseMonitoring: entry.use_warehouse_monitoring,
            comments: entry.comments,
            cost: entry.cost,
            additionalData: entry.additional_data || {},
            status: entry.status,
          }));
          setMMPFiles((prev: MMPFile[]) => prev.map(m => (m.id === id ? { ...m, siteEntries: normalized } : m)));
        }
      }
      return true;
    } catch (e) {
      console.error('Failed to persist MMP update:', e);
      return false;
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
  // attachPermitsToMMP, (removed stray comma operator usage)
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
    ,attachPermitsToMMP
  };
};

export const MMPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mmpContext = useMMPProvider();
  return <MMPContext.Provider value={mmpContext}>{children}</MMPContext.Provider>;
};

export const useMMP = () => useContext(MMPContext);
