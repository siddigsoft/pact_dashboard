import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MMPFile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { MMPContextType } from './types';
import { useMMPOperations } from './hooks/useMMPOperations';
import { useMMPStatusOperations } from './hooks/useMMPStatusOperations';
import { useMMPVersioning } from './hooks/useMMPVersioning';
import { useMMPUpload } from './hooks/useMMPUpload';

// Migration function: Move data from additional_data to proper columns if column is empty
const migrateAdditionalDataToColumns = (entry: any): any => {
  const migrated = { ...entry };
  const ad = migrated.additional_data || migrated.additionalData || {};
  
  // Mapping of additional_data keys (various formats) to column names (snake_case)
  const columnMappings: Record<string, string> = {
    // Direct mappings
    'Site Code': 'site_code',
    'site_code': 'site_code',
    'siteCode': 'site_code',
    'Hub Office': 'hub_office',
    'Hub Office:': 'hub_office',
    'hub_office': 'hub_office',
    'hubOffice': 'hub_office',
    'State': 'state',
    'State:': 'state',
    'state': 'state',
    'state_name': 'state',
    'Locality': 'locality',
    'Locality:': 'locality',
    'locality': 'locality',
    'locality_name': 'locality',
    'Site Name': 'site_name',
    'Site Name:': 'site_name',
    'site_name': 'site_name',
    'siteName': 'site_name',
    'CP Name': 'cp_name',
    'CP name': 'cp_name',
    'CP Name:': 'cp_name',
    'cp_name': 'cp_name',
    'cpName': 'cp_name',
    'Visit Type': 'visit_type',
    'visit_type': 'visit_type',
    'visitType': 'visit_type',
    'Visit Date': 'visit_date',
    'visit_date': 'visit_date',
    'visitDate': 'visit_date',
    'Main Activity': 'main_activity',
    'main_activity': 'main_activity',
    'mainActivity': 'main_activity',
    'Activity at Site': 'activity_at_site',
    'Activity at the site': 'activity_at_site',
    'Activity at the site:': 'activity_at_site',
    'activity_at_site': 'activity_at_site',
    'siteActivity': 'activity_at_site',
    'Monitoring By': 'monitoring_by',
    'monitoring by': 'monitoring_by',
    'monitoring by:': 'monitoring_by',
    'monitoring_by': 'monitoring_by',
    'monitoringBy': 'monitoring_by',
    'Survey Tool': 'survey_tool',
    'Survey under Master tool': 'survey_tool',
    'Survey under Master tool:': 'survey_tool',
    'survey_tool': 'survey_tool',
    'surveyTool': 'survey_tool',
    'Use Market Diversion Monitoring': 'use_market_diversion',
    'use_market_diversion': 'use_market_diversion',
    'useMarketDiversion': 'use_market_diversion',
    'Use Warehouse Monitoring': 'use_warehouse_monitoring',
    'use_warehouse_monitoring': 'use_warehouse_monitoring',
    'useWarehouseMonitoring': 'use_warehouse_monitoring',
    'Comments': 'comments',
    'comments': 'comments',
    'Cost': 'cost',
    'Price': 'cost',
    'Amount': 'cost',
    'cost': 'cost',
    'price': 'cost',
    'Enumerator Fee': 'enumerator_fee',
    'enumerator_fee': 'enumerator_fee',
    'Transport Fee': 'transport_fee',
    'transport_fee': 'transport_fee',
    'Verification Notes': 'verification_notes',
    'Verification Notes:': 'verification_notes',
    'verification_notes': 'verification_notes',
    'Verified By': 'verified_by',
    'Verified By:': 'verified_by',
    'verified_by': 'verified_by',
    'Verified At': 'verified_at',
    'verified_at': 'verified_at',
    'Dispatched By': 'dispatched_by',
    'dispatched_by': 'dispatched_by',
    'Dispatched At': 'dispatched_at',
    'dispatched_at': 'dispatched_at',
    'Status': 'status',
    'Status:': 'status',
    'status': 'status',
    'Rejection Comments': 'rejection_comments',
    'rejection_comments': 'rejection_comments',
    'rejection_reason': 'rejection_comments',
    'Rejected By': 'rejected_by',
    'rejected_by': 'rejected_by',
    'Rejected At': 'rejected_at',
    'rejected_at': 'rejected_at',
  };

  // Helper to convert value to boolean
  const toBool = (v: any): boolean | null => {
    if (typeof v === 'boolean') return v;
    if (v === null || v === undefined || v === '') return null;
    const s = String(v).toLowerCase().trim();
    return s === 'yes' || s === 'true' || s === '1' || s === 'y';
  };

  // Helper to convert value to number
  const toNum = (v: any): number | null => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[^0-9.\-]/g, '');
    if (!s) return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };

  // Helper to convert date string to ISO string
  const toDate = (v: any): string | null => {
    if (!v) return null;
    try {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  };

  // Migrate each field from additional_data to column if column is empty
  for (const [adKey, columnName] of Object.entries(columnMappings)) {
    const columnValue = migrated[columnName];
    const adValue = ad[adKey];
    
    // Only migrate if column is empty/null/undefined and additional_data has a value
    if ((columnValue === null || columnValue === undefined || columnValue === '') && 
        adValue !== null && adValue !== undefined && adValue !== '') {
      
      // Type conversion based on column
      if (columnName === 'use_market_diversion' || columnName === 'use_warehouse_monitoring') {
        const boolVal = toBool(adValue);
        if (boolVal !== null) {
          migrated[columnName] = boolVal;
        }
      } else if (columnName === 'cost' || columnName === 'enumerator_fee' || columnName === 'transport_fee') {
        const numVal = toNum(adValue);
        if (numVal !== null) {
          migrated[columnName] = numVal;
        }
      } else if (columnName === 'verified_at' || columnName === 'dispatched_at' || columnName === 'accepted_at' || columnName === 'rejected_at') {
        const dateVal = toDate(adValue);
        if (dateVal !== null) {
          migrated[columnName] = dateVal;
        }
      } else if (columnName === 'rejected_by') {
        // Handle UUID for rejected_by
        const uuidVal = String(adValue).trim();
        if (uuidVal && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuidVal)) {
          migrated[columnName] = uuidVal;
        }
      } else {
        // String fields
        migrated[columnName] = String(adValue).trim();
      }
    }
  }

  return migrated;
};

// Transform database record (snake_case) to MMPFile interface (camelCase)
const transformDBToMMPFile = (dbRecord: any): MMPFile => {
  // Prefer site entries from the relational table if present; fallback to JSONB
  let siteEntries: any[] = [];
  if (dbRecord.mmp_site_entries) {
    siteEntries = (dbRecord.mmp_site_entries as any[]).map((entry: any) => {
      // Migrate data from additional_data to columns
      const migrated = migrateAdditionalDataToColumns(entry);
      
      return {
        id: migrated.id,
        siteCode: migrated.site_code,
        hubOffice: migrated.hub_office,
        state: migrated.state,
        locality: migrated.locality,
        siteName: migrated.site_name,
        cpName: migrated.cp_name,
        visitType: migrated.visit_type,
        visitDate: migrated.visit_date,
        mainActivity: migrated.main_activity,
        siteActivity: migrated.activity_at_site,
        monitoringBy: migrated.monitoring_by,
        surveyTool: migrated.survey_tool,
        useMarketDiversion: migrated.use_market_diversion,
        useWarehouseMonitoring: migrated.use_warehouse_monitoring,
        comments: migrated.comments,
        cost: migrated.cost,
        enumerator_fee: migrated.enumerator_fee,
        transport_fee: migrated.transport_fee,
        verified_by: migrated.verified_by,
        verified_at: migrated.verified_at,
        verification_notes: migrated.verification_notes,
        dispatched_by: migrated.dispatched_by,
        dispatched_at: migrated.dispatched_at,
        additionalData: migrated.additional_data || {},
        status: migrated.status,
      };
    });
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
  refreshMMPFiles: async () => {},
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

  const refreshMMPFiles = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    refreshMMPFiles();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('mmp_context_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mmp_files' },
        () => {
          refreshMMPFiles();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mmp_site_entries' },
        () => {
          refreshMMPFiles();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ MMP context real-time subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ MMP context real-time subscription error - Check if replication is enabled in Supabase');
        } else if (status === 'TIMED_OUT') {
          console.warn('⏱️ MMP context real-time subscription timed out');
        } else {
          console.log('MMP context subscription status:', status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshMMPFiles]);

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

        const mapRow = (e: any) => {
          // Migrate data from additional_data to columns first
          const migrated = migrateAdditionalDataToColumns(e);
          
          return {
            ...(migrated.id ? { id: migrated.id } : {}),
            mmp_file_id: id,
            site_code: migrated.site_code ?? migrated.siteCode ?? null,
            hub_office: migrated.hub_office ?? migrated.hubOffice ?? null,
            state: migrated.state ?? migrated.state_name ?? null,
            locality: migrated.locality ?? migrated.locality_name ?? null,
            site_name: migrated.site_name ?? migrated.siteName ?? null,
            cp_name: migrated.cp_name ?? migrated.cpName ?? null,
            visit_type: migrated.visit_type ?? migrated.visitType ?? null,
            visit_date: migrated.visit_date ?? migrated.visitDate ?? null,
            main_activity: migrated.main_activity ?? migrated.mainActivity ?? null,
            activity_at_site: migrated.activity_at_site ?? migrated.siteActivity ?? migrated.activity ?? null,
            monitoring_by: migrated.monitoring_by ?? migrated.monitoringBy ?? null,
            survey_tool: migrated.survey_tool ?? migrated.surveyTool ?? null,
            use_market_diversion: toBool(migrated.use_market_diversion ?? migrated.useMarketDiversion),
            use_warehouse_monitoring: toBool(migrated.use_warehouse_monitoring ?? migrated.useWarehouseMonitoring),
            comments: migrated.comments ?? null,
            cost: toNum(migrated.cost ?? migrated.price),
            enumerator_fee: toNum(migrated.enumerator_fee),
            transport_fee: toNum(migrated.transport_fee),
            verification_notes: migrated.verification_notes ?? migrated.verificationNotes ?? null,
            verified_by: migrated.verified_by ?? migrated.verifiedBy ?? null,
            verified_at: migrated.verified_at ?? migrated.verifiedAt ?? null,
            dispatched_by: migrated.dispatched_by ?? migrated.dispatchedBy ?? null,
            dispatched_at: migrated.dispatched_at ?? migrated.dispatchedAt ?? null,
            additional_data: migrated.additional_data ?? migrated.additionalData ?? {},
            status: migrated.status ?? 'Pending',
          };
        };

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
          const normalized = (syncedRows || []).map((entry: any) => {
            // Migrate data from additional_data to columns
            const migrated = migrateAdditionalDataToColumns(entry);
            
            return {
              id: migrated.id,
              siteCode: migrated.site_code,
              hubOffice: migrated.hub_office,
              state: migrated.state,
              locality: migrated.locality,
              siteName: migrated.site_name,
              cpName: migrated.cp_name,
              visitType: migrated.visit_type,
              visitDate: migrated.visit_date,
              mainActivity: migrated.main_activity,
              siteActivity: migrated.activity_at_site,
              monitoringBy: migrated.monitoring_by,
              surveyTool: migrated.survey_tool,
              useMarketDiversion: migrated.use_market_diversion,
              useWarehouseMonitoring: migrated.use_warehouse_monitoring,
              comments: migrated.comments,
              cost: migrated.cost,
              enumerator_fee: migrated.enumerator_fee,
              transport_fee: migrated.transport_fee,
              verified_by: migrated.verified_by,
              verified_at: migrated.verified_at,
              verification_notes: migrated.verification_notes,
              dispatched_by: migrated.dispatched_by,
              dispatched_at: migrated.dispatched_at,
              additionalData: migrated.additional_data || {},
              status: migrated.status,
            };
          });
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
    ,attachPermitsToMMP,
    refreshMMPFiles
  };
};

export const MMPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mmpContext = useMMPProvider();
  return <MMPContext.Provider value={mmpContext}>{children}</MMPContext.Provider>;
};

export const useMMP = () => useContext(MMPContext);
