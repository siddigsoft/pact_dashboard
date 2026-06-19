import React, { createContext, useContext, useEffect, useCallback, useRef } from 'react';
import { MMPFile } from '@/types';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { ensureValidSession } from '@/lib/session-health';
import { withTimeout } from '@/utils/promise-with-timeout';
import { MMPContextType } from './types';
import { useMMPOperations } from './hooks/useMMPOperations';
import { useMMPStatusOperations } from './hooks/useMMPStatusOperations';
import { useMMPVersioning } from './hooks/useMMPVersioning';
import { useMMPUpload } from './hooks/useMMPUpload';
import { migrateAdditionalDataToColumns } from './mmpTransform';
import {
  useMMPFilesQuery,
  useMMPSiteEntryCountsQuery,
  mmpQueryKeys,
  defaultSiteEntryCounts,
} from './mmpQueries';
import { useUser } from '@/context/user/UserContext';

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
  const { currentUser } = useUser();

  // Gate queries on authentication so they never run unauthenticated.
  // RLS would silently return 0 rows for unauthenticated requests and
  // that empty result would be cached, showing stale zeros after login.
  const isAuthenticated = !!currentUser?.id;
  const filesQuery = useMMPFilesQuery(isAuthenticated);
  const countsQuery = useMMPSiteEntryCountsQuery(isAuthenticated);

  // When the user's session is first restored (null → id), invalidate
  // MMP caches so they re-fetch with valid credentials.
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentUser?.id && prevUserIdRef.current !== currentUser.id) {
      prevUserIdRef.current = currentUser.id;
      queryClient.invalidateQueries({ queryKey: mmpQueryKeys.all });
    }
    if (!currentUser?.id) {
      prevUserIdRef.current = null;
    }
  }, [currentUser?.id, queryClient]);

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
    [queryClient]
  );

  const {
    currentMMP,
    setCurrentMMP,
    getMmpById,
    addMMPFile,
    updateMMPFile,
    deleteMMPFile,
  } = useMMPOperations(mmpFiles, setMMPFiles);

  const { verifyMMP, archiveMMP, approveMMP, rejectMMP } = useMMPStatusOperations(setMMPFiles);
  const { updateMMPVersion } = useMMPVersioning(setMMPFiles);
  const { uploadMMP } = useMMPUpload(addMMPFile);

  // Attach permits to MMP (federal required, state/local optional)
  const attachPermitsToMMP = async (id: string, permits: { federal: File | null; state?: File | null; local?: File | null }) => {
    const session = await ensureValidSession();
    if (!session.success) {
      throw new Error(session.error || 'Session expired. Please refresh and try again.');
    }

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
    await withTimeout(
      supabase.from('mmp_files').update({
        permits: {
          federal: !!permits.federal,
          state: !!permits.state,
          local: !!permits.local,
          documents: uploadedDocs,
        }
      }).eq('id', id),
      15000,
      'Attach permits timed out'
    );
  };

  const refreshSiteEntryCounts = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: mmpQueryKeys.siteEntryCounts() });
  }, [queryClient]);

  const refreshMMPFiles = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: mmpQueryKeys.files() });
    await queryClient.invalidateQueries({ queryKey: mmpQueryKeys.siteEntryCounts() });
  }, [queryClient]);

  // Load site entries using a single bulk IN query — much faster than one query per MMP
  const loadSiteEntriesInBackground = useCallback(async (mmpIds: string[]) => {
    if (mmpIds.length === 0) return;

    const SELECT_COLS = 'id, site_code, hub_office, state, locality, site_name, cp_name, visit_type, visit_date, main_activity, activity_at_site, monitoring_by, survey_tool, use_market_diversion, use_warehouse_monitoring, comments, cost, enumerator_fee, transport_fee, verified_by, verified_at, verification_notes, dispatched_by, dispatched_at, accepted_by, accepted_at, cost_acknowledged, additional_data, status, forwarded_to_user_id, mmp_file_id, created_at, updated_at';

    // Supabase IN clause works well up to ~500 IDs; chunk at 200 and run ALL chunks in parallel
    const CHUNK = 200;
    const chunks: string[][] = [];
    for (let i = 0; i < mmpIds.length; i += CHUNK) {
      chunks.push(mmpIds.slice(i, i + CHUNK));
    }

    try {
      // All chunks fire simultaneously — no sequential waiting between batches
      const chunkResults = await Promise.all(
        chunks.map(chunk =>
          supabase
            .from('mmp_site_entries')
            .select(SELECT_COLS)
            .in('mmp_file_id', chunk)
            .order('created_at', { ascending: true })
            .limit(20000)
        )
      );

      // Collect and transform all rows
      const allRaw: any[] = chunkResults.flatMap(r => r.data || []);

      // Group by mmp_file_id for efficient state update
      const byMmpId = new Map<string, any[]>();
      for (const entry of allRaw) {
        const migrated = migrateAdditionalDataToColumns(entry);
        const transformed = {
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
          accepted_by: migrated.accepted_by,
          accepted_at: migrated.accepted_at,
          updated_at: migrated.updated_at,
          claimed_by: (migrated.additional_data || {})?.claimed_by || null,
          claimed_at: (migrated.additional_data || {})?.claimed_at || null,
          cost_acknowledged: migrated.cost_acknowledged ?? (migrated.additional_data || {})?.cost_acknowledged,
          additionalData: migrated.additional_data || {},
          status: migrated.status,
          forwardedToUserId: migrated.forwarded_to_user_id,
          mmp_file_id: migrated.mmp_file_id,
        };
        const mid = migrated.mmp_file_id;
        if (!byMmpId.has(mid)) byMmpId.set(mid, []);
        byMmpId.get(mid)!.push(transformed);
      }

      // Single state update for all MMPs at once
      setMMPFiles((prev: MMPFile[]) =>
        prev.map((mmp) => {
          const entries = byMmpId.get(mmp.id);
          if (!entries) return mmp;
          const enriched = entries.map((e: any) => ({
            ...e,
            cpName: e.cpName || mmp.projectName || '',
            cp_name: e.cp_name || mmp.projectName || '',
          }));
          return { ...mmp, siteEntries: enriched };
        })
      );
    } catch (e) {
      console.error('[MMP] Bulk site-entries load failed:', e);
    }
  }, []);

  // PERFORMANCE OPTIMIZATION: Removed automatic background loading of ALL site entries
  // Site entries are now loaded on-demand via fetchSiteEntriesForMMP when viewing a specific MMP
  // This prevents loading megabytes of data on page open and significantly speeds up initial load

  // Automatic background refresh DISABLED to prevent excessive re-renders and UI blinking
  // Data now refreshes only on user actions (button clicks, page loads, saves, etc.)
  // This improves performance significantly by avoiding the "Loading MMP file..." flash
  useEffect(() => {
    let appStateListener: any = null;

    const handleOnline = () => {
      // When coming back online after being offline, refresh once
      refreshMMPFiles();
    };

    // Listen for online status to refresh after reconnecting
    window.addEventListener('online', handleOnline);

    // For native mobile apps (Capacitor), listen to app becoming active after being backgrounded
    const setupAppStateListener = async () => {
      try {
        if (typeof (window as any).Capacitor !== 'undefined') {
          const { App } = await import('@capacitor/app');
          
          appStateListener = await App.addListener('appStateChange', ({ isActive }) => {
            if (isActive && navigator.onLine) {
              // Only refresh when app returns from background (mobile)
              refreshMMPFiles();
            }
          });
        }
      } catch (error) {
        console.debug('Capacitor App plugin not available');
      }
    };

    setupAppStateListener();

    // Cleanup
    return () => {
      if (appStateListener) {
        appStateListener.remove();
      }
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshMMPFiles]);

  // Realtime subscription disabled to prevent unnecessary refreshes
  // Data refreshes happen only when user performs actions (button clicks, saves, etc.)
  // This improves performance and reduces UI flashing
  useEffect(() => {
    // Log that we're using manual refresh mode
    console.log('[MMP] Using manual refresh mode - data updates on user actions only');
  }, []);

  const updateMMP = async (id: string, updatedMMP: Partial<MMPFile>): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      throw new Error(session.error || 'Session expired. Please refresh and try again.');
    }

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
      return await withTimeout(
        (async () => {
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
            forwarded_to_user_id: migrated.forwarded_to_user_id ?? migrated.forwardedToUserId ?? null,
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
              forwardedToUserId: migrated.forwarded_to_user_id,
            };
          });
          setMMPFiles((prev: MMPFile[]) => prev.map(m => (m.id === id ? { ...m, siteEntries: normalized } : m)));
        }
      }
      return true;
        })(),
        15000,
        'Update MMP timed out'
      );
    } catch (e) {
      console.error('Failed to persist MMP update:', e);
      return false;
    }
  };

  const deleteMMP = async (id: string) => {
    const session = await ensureValidSession();
    if (!session.success) {
      throw new Error(session.error || 'Session expired. Please refresh and try again.');
    }

    try {
      return await withTimeout(
        (async () => {
      // First, get all site entries for this MMP that have wallet transactions
      const { data: siteEntries, error: sitesError } = await supabase
        .from('mmp_site_entries')
        .select('id, accepted_by, cost, enumerator_fee, transport_fee')
        .eq('mmp_file_id', id)
        .not('accepted_by', 'is', null);

      if (sitesError) {
        console.error('Error fetching site entries for MMP deletion:', sitesError);
      }

      // Reverse wallet transactions for each site entry
      if (siteEntries && siteEntries.length > 0) {
        for (const site of siteEntries) {
          const totalAmount = (site.cost || 0) + (site.enumerator_fee || 0) + (site.transport_fee || 0);
          if (totalAmount > 0 && site.accepted_by) {
            // Create a reversal transaction
            const { data: wallet } = await supabase
              .from('wallets')
              .select('id')
              .eq('user_id', site.accepted_by)
              .single();

            if (wallet) {
              await supabase
                .from('wallet_transactions')
                .insert({
                  user_id: site.accepted_by,
                  wallet_id: wallet.id,
                  amount: -totalAmount, // Negative amount to reverse
                  amount_cents: -totalAmount * 100,
                  currency: 'SDG',
                  type: 'adjustment_debit', // Reversal type
                  status: 'posted',
                  memo: `MMP deletion reversal - Site: ${site.id}`,
                  related_site_visit_id: site.id,
                  posted_at: new Date().toISOString(),
                });
            }
          }
        }
      }

      // Soft delete the MMP
      const deletedAt = new Date().toISOString();
      setMMPFiles((prev: MMPFile[]) =>
        prev.map((mmp) => (mmp.id === id ? { ...mmp, status: 'deleted', deletedAt } : mmp))
      );

      const { error } = await supabase
        .from('mmp_files')
        .update({ status: 'deleted', deleted_at: deletedAt })
        .eq('id', id);

      if (error) {
        console.error('Supabase delete (soft) error:', error);
        throw error;
      }

      return true;
        })(),
        15000,
        'Delete MMP timed out'
      );
    } catch (e) {
      console.error('Failed to delete MMP:', e);
      return false;
    }
  };

  const restoreMMP = async (id: string) => {
    const session = await ensureValidSession();
    if (!session.success) {
      throw new Error(session.error || 'Session expired. Please refresh and try again.');
    }

    setMMPFiles((prev: MMPFile[]) =>
      prev.map((mmp) => (mmp.id === id && mmp.status === 'deleted' ? { ...mmp, status: 'pending', deletedAt: undefined, deletedBy: undefined } : mmp))
    );
    try {
      const { error } = await withTimeout(
        supabase
          .from('mmp_files')
          .update({ status: 'pending', deleted_at: null, deleted_by: null })
          .eq('id', id),
        15000,
        'Restore MMP timed out'
      );
      if (error) console.error('Supabase restoreMMP error:', error);
    } catch (e) {
      console.error('Failed to persist restoreMMP:', e);
    }
  };

  const resetMMP = async (id?: string): Promise<boolean> => {
    const session = await ensureValidSession();
    if (!session.success) {
      throw new Error(session.error || 'Session expired. Please refresh and try again.');
    }

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
          await withTimeout(
            supabase
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
              .eq('id', id),
            15000,
            'Reset MMP timed out'
          );
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

  // Fetch site entries for a specific MMP on-demand (lazy loading)
  const fetchSiteEntriesForMMP = useCallback(async (mmpId: string): Promise<any[]> => {
    try {
      const { data, error } = await supabase
        .from('mmp_site_entries')
        .select('*')
        .eq('mmp_file_id', mmpId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching site entries for MMP:', error);
        return [];
      }

      const entries = (data || []).map((entry: any) => {
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
          accepted_by: migrated.accepted_by,
          accepted_at: migrated.accepted_at,
          claimed_by: (migrated.additional_data || {})?.claimed_by || null,
          claimed_at: (migrated.additional_data || {})?.claimed_at || null,
          cost_acknowledged: migrated.cost_acknowledged ?? (migrated.additional_data || {})?.cost_acknowledged,
          additionalData: migrated.additional_data || {},
          status: migrated.status,
          forwardedToUserId: migrated.forwarded_to_user_id,
        };
      });

      // Update the local mmpFiles state with the fetched site entries
      setMMPFiles((prev: MMPFile[]) =>
        prev.map((mmp) =>
          mmp.id === mmpId ? { ...mmp, siteEntries: entries } : mmp
        )
      );

      return entries;
    } catch (e) {
      console.error('fetchSiteEntriesForMMP failed:', e);
      return [];
    }
  }, []);

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
    fetchSiteEntriesForMMP,
    loadSiteEntriesForMMPs: loadSiteEntriesInBackground,
    refreshSiteEntryCounts,
  };
};

export const MMPProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const mmpContext = useMMPProvider();
  return <MMPContext.Provider value={mmpContext}>{children}</MMPContext.Provider>;
};

export const useMMP = () => useContext(MMPContext);
