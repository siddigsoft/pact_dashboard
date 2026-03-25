/**
 * MMP Data Access Layer
 *
 * Single source of truth for all MMP-related database operations.
 * Pure async functions — no React, no hooks, no toast.
 * Callers (contexts, hooks) handle session checks, local state, and side-effects.
 */
import { supabase } from '@/integrations/supabase/client';
import { transformDBToMMPFile, migrateAdditionalDataToColumns } from '@/features/mmp/context/mmpTransform';
import type { MMPFile } from '@/types';
import type { SiteEntryCounts } from '@/features/mmp/context/types';

// ─── Re-export shape used by query hooks ──────────────────────────────────────

export interface CoordinatorSiteEntryRow {
  id: string;
  mmp_file_id: string;
  mmp_name: string;
  site_code: string;
  hub_office: string;
  state: string;
  locality: string;
  site_name: string;
  cp_name: string | null;
  visit_type: string | null;
  visit_date: string | null;
  main_activity: string | null;
  activity_at_site: string | null;
  monitoring_by: string | null;
  survey_tool: string | null;
  use_market_diversion: boolean | null;
  use_warehouse_monitoring: boolean | null;
  comments: string | null;
  additional_data: Record<string, unknown> | null;
  status: string;
  verified_at: string | null;
  verified_by: string | null;
  verification_notes: string | null;
  cost: number | null;
  enumerator_fee: number | null;
  transport_fee: number | null;
  accepted_by: string | null;
  accepted_at: string | null;
  forwarded_to_user_id: string | null;
  created_at: string;
}

export interface NormalizedSiteEntry {
  id: string;
  siteCode: string | null;
  hubOffice: string | null;
  state: string | null;
  locality: string | null;
  siteName: string | null;
  cpName: string | null;
  visitType: string | null;
  visitDate: string | null;
  mainActivity: string | null;
  siteActivity: string | null;
  monitoringBy: string | null;
  surveyTool: string | null;
  useMarketDiversion: boolean | null;
  useWarehouseMonitoring: boolean | null;
  comments: string | null;
  cost: number | null;
  enumerator_fee: number | null;
  transport_fee: number | null;
  verified_by: string | null;
  verified_at: string | null;
  verification_notes: string | null;
  dispatched_by: string | null;
  dispatched_at: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  claimed_by: string | null;
  claimed_at: string | null;
  cost_acknowledged: boolean | null;
  additionalData: Record<string, unknown>;
  status: string;
  forwardedToUserId: string | null;
  mmp_file_id: string;
}

// ─── Shared normalizer (authoritative — do not duplicate in context) ──────────

export function normalizeSiteEntry(entry: any): NormalizedSiteEntry {
  const m = migrateAdditionalDataToColumns(entry);
  const ad = m.additional_data || {};
  return {
    id: m.id,
    siteCode: m.site_code ?? null,
    hubOffice: m.hub_office ?? null,
    state: m.state ?? null,
    locality: m.locality ?? null,
    siteName: m.site_name ?? null,
    cpName: m.cp_name ?? null,
    visitType: m.visit_type ?? null,
    visitDate: m.visit_date ?? null,
    mainActivity: m.main_activity ?? null,
    siteActivity: m.activity_at_site ?? null,
    monitoringBy: m.monitoring_by ?? null,
    surveyTool: m.survey_tool ?? null,
    useMarketDiversion: m.use_market_diversion ?? null,
    useWarehouseMonitoring: m.use_warehouse_monitoring ?? null,
    comments: m.comments ?? null,
    cost: m.cost ?? null,
    enumerator_fee: m.enumerator_fee ?? null,
    transport_fee: m.transport_fee ?? null,
    verified_by: m.verified_by ?? null,
    verified_at: m.verified_at ?? null,
    verification_notes: m.verification_notes ?? null,
    dispatched_by: m.dispatched_by ?? null,
    dispatched_at: m.dispatched_at ?? null,
    accepted_by: m.accepted_by ?? null,
    accepted_at: m.accepted_at ?? null,
    claimed_by: (ad as any)?.claimed_by ?? null,
    claimed_at: (ad as any)?.claimed_at ?? null,
    cost_acknowledged: m.cost_acknowledged ?? (ad as any)?.cost_acknowledged ?? null,
    additionalData: ad,
    status: m.status ?? 'Pending',
    forwardedToUserId: m.forwarded_to_user_id ?? null,
    mmp_file_id: m.mmp_file_id ?? null,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function fetchMMPFiles(): Promise<MMPFile[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  if (!navigator.onLine) return [];

  const { data: mmpData, error } = await supabase
    .from('mmp_files')
    .select(`*, project:projects(id, name, project_code)`)
    .order('created_at', { ascending: false });

  let rows = mmpData;
  if (error) {
    console.warn('[fetchMMPFiles] Primary query failed, falling back:', error.message);
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('mmp_files')
      .select('*')
      .order('created_at', { ascending: false });
    if (fallbackError) throw fallbackError;
    rows = fallbackData;
  }

  return (rows || []).map((row: any) =>
    transformDBToMMPFile({ ...row, mmp_site_entries: [] })
  );
}

export const defaultSiteEntryCounts: SiteEntryCounts = {
  dispatched: 0,
  accepted: 0,
  smartAssigned: 0,
  ongoing: 0,
  completed: 0,
  rejected: 0,
  approvedCosted: 0,
  total: 0,
};

export async function fetchSiteEntryCounts(): Promise<SiteEntryCounts> {
  if (!navigator.onLine) return defaultSiteEntryCounts;

  const { data: rows, error } = await supabase
    .from('mmp_site_entries')
    .select('status, accepted_by');

  if (error) {
    console.warn('Count query error:', error);
    return defaultSiteEntryCounts;
  }

  let dispatched = 0, accepted = 0, smartAssigned = 0, ongoing = 0;
  let completed = 0, rejected = 0, approvedCosted = 0;
  const total = rows?.length || 0;

  for (const r of (rows || [])) {
    const s = (r.status || '').toLowerCase();
    if (s === 'dispatched' && !r.accepted_by) dispatched++;
    else if (s === 'accepted') accepted++;
    else if (s === 'assigned') smartAssigned++;
    else if (s === 'inprogress' || s === 'in_progress' || s === 'ongoing') ongoing++;
    else if (s === 'completed') completed++;
    else if (s === 'rejected' || s === 'declined') rejected++;
    else if (s === 'approved and costed' || s === 'costed') approvedCosted++;
  }

  return { dispatched, accepted, smartAssigned, ongoing, completed, rejected, approvedCosted, total };
}

export async function fetchCoordinatorSiteEntries(userId: string | null): Promise<CoordinatorSiteEntryRow[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  if (!navigator.onLine) return [];

  const { data, error } = await supabase.rpc('get_coordinator_site_entries', {
    p_user_id: userId,
  });

  if (error) {
    console.warn('[fetchCoordinatorSiteEntries] RPC error:', error.message);
    return [];
  }
  return (data ?? []) as CoordinatorSiteEntryRow[];
}

export async function fetchSupervisorSiteEntries(): Promise<CoordinatorSiteEntryRow[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  if (!navigator.onLine) return [];

  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select(
      'id, mmp_file_id, site_code, hub_office, state, locality, site_name,' +
      'cp_name, visit_type, visit_date, main_activity, activity_at_site,' +
      'monitoring_by, survey_tool, use_market_diversion, use_warehouse_monitoring,' +
      'comments, additional_data, status,' +
      'verified_at, verified_by, verification_notes,' +
      'cost, enumerator_fee, transport_fee,' +
      'accepted_by, accepted_at, forwarded_to_user_id, created_at'
    )
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[fetchSupervisorSiteEntries] query error:', error.message);
    return [];
  }

  return (data || []).map((row: any): CoordinatorSiteEntryRow => ({
    id: row.id,
    mmp_file_id: row.mmp_file_id,
    mmp_name: 'Unknown MMP',
    site_code: row.site_code,
    hub_office: row.hub_office,
    state: row.state,
    locality: row.locality,
    site_name: row.site_name,
    cp_name: row.cp_name ?? null,
    visit_type: row.visit_type ?? null,
    visit_date: row.visit_date ?? null,
    main_activity: row.main_activity ?? null,
    activity_at_site: row.activity_at_site ?? null,
    monitoring_by: row.monitoring_by ?? null,
    survey_tool: row.survey_tool ?? null,
    use_market_diversion: row.use_market_diversion ?? null,
    use_warehouse_monitoring: row.use_warehouse_monitoring ?? null,
    comments: row.comments ?? null,
    additional_data: row.additional_data ?? null,
    status: row.status,
    verified_at: row.verified_at ?? null,
    verified_by: row.verified_by ?? null,
    verification_notes: row.verification_notes ?? null,
    cost: row.cost ?? null,
    enumerator_fee: row.enumerator_fee ?? null,
    transport_fee: row.transport_fee ?? null,
    accepted_by: row.accepted_by ?? null,
    accepted_at: row.accepted_at ?? null,
    forwarded_to_user_id: row.forwarded_to_user_id ?? null,
    created_at: row.created_at,
  }));
}

/** Fetch and normalize site entries for a single MMP. Used for on-demand loading. */
export async function fetchSiteEntriesForMMP(mmpId: string): Promise<NormalizedSiteEntry[]> {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('*')
    .eq('mmp_file_id', mmpId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeSiteEntry);
}

/** Fetch raw site entries for background batch loading (lightweight select). */
export async function fetchSiteEntriesRaw(mmpId: string): Promise<NormalizedSiteEntry[]> {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select(
      'id, site_code, hub_office, state, locality, site_name, cp_name, visit_type, visit_date, ' +
      'main_activity, activity_at_site, monitoring_by, survey_tool, use_market_diversion, ' +
      'use_warehouse_monitoring, comments, cost, enumerator_fee, transport_fee, verified_by, ' +
      'verified_at, verification_notes, dispatched_by, dispatched_at, accepted_by, accepted_at, ' +
      'cost_acknowledged, additional_data, status, forwarded_to_user_id, mmp_file_id, created_at'
    )
    .eq('mmp_file_id', mmpId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data || []).map(normalizeSiteEntry);
}

export async function getPermitsByMmpId(id: string): Promise<any> {
  const { data, error } = await supabase
    .from('mmp_files')
    .select('permits')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data?.permits;
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Update mmp_files row from a pre-mapped DB payload. */
export async function updateMMPFileRecord(id: string, dbPayload: Record<string, any>): Promise<void> {
  const { error } = await supabase.from('mmp_files').update(dbPayload).eq('id', id);
  if (error) throw error;
}

/**
 * Full cascade delete of an MMP and all related records/storage.
 * Returns true on success. Does NOT update local state or fire toasts — callers do that.
 */
export async function deleteMMPFileCascade(
  id: string,
  mmpInfo: { mmpId?: string; filePath?: string },
): Promise<true> {
  // 1. Collect storage paths from document_index
  let storagePaths: string[] = [];
  try {
    const { data: docs } = await supabase
      .from('document_index')
      .select('storage_path, file_url')
      .eq('mmp_id', id);
    if (docs?.length) {
      storagePaths = docs
        .map(d => d.storage_path || (d.file_url ? new URL(d.file_url).pathname.split('/').pop() : null))
        .filter((p): p is string => !!p);
    }
  } catch {}

  // 2. Delete document_index entries
  try {
    const { error: docError } = await supabase.from('document_index').delete().eq('mmp_id', id).select();
    if (docError && mmpInfo.mmpId) {
      await supabase.from('document_index').delete().eq('mmp_name', mmpInfo.mmpId);
    }
  } catch {}

  // 3. Delete storage files
  if (storagePaths.length > 0) {
    try {
      await supabase.storage.from('permits').remove(storagePaths);
      await supabase.storage.from('site-photos').remove(storagePaths);
    } catch {}
  }

  // 4. Delete site photos
  try {
    const { data: sitePhotos } = await supabase
      .from('site_visit_photos')
      .select('id, storage_path')
      .eq('mmp_id', id);
    if (sitePhotos?.length) {
      const photoPaths = sitePhotos.map(p => p.storage_path).filter(Boolean) as string[];
      if (photoPaths.length) await supabase.storage.from('site-photos').remove(photoPaths);
      await supabase.from('site_visit_photos').delete().in('id', sitePhotos.map(p => p.id));
    }
  } catch {}

  // 5. Delete mmp_site_entries
  try {
    await supabase.from('mmp_site_entries').delete().eq('mmp_file_id', id);
  } catch {}

  // 6. Delete MMP file from storage
  if (mmpInfo.filePath) {
    try {
      await supabase.storage.from('mmp-files').remove([mmpInfo.filePath]);
    } catch {}
  }

  // 7. Delete the MMP record (hard delete)
  const { error } = await supabase.from('mmp_files').delete().eq('id', id);
  if (error) throw error;

  return true;
}

/** Verify MMP — builds workflow JSONB and updates status. */
export async function verifyMMPRecord(
  id: string,
  verifiedBy: string,
  verifiedByName: string,
): Promise<void> {
  const timestamp = new Date().toISOString();

  const { data: currentMmp, error: fetchError } = await supabase
    .from('mmp_files')
    .select('workflow')
    .eq('id', id)
    .single();

  if (fetchError) console.error('Error fetching current MMP:', fetchError);

  const existingWorkflow = (currentMmp?.workflow as any) || {};
  const existingVerification = existingWorkflow.comprehensiveVerification || {};
  const existingSystem = existingVerification.systemValidation || {};
  const existingContent = existingVerification.contentVerification || {};
  const existingCp = existingVerification.cpVerification || {};
  const existingPermit = existingVerification.permitVerification || {};

  const comprehensiveVerification = {
    ...existingVerification,
    overallStatus: 'complete',
    canProceedToApproval: true,
    verified_by: verifiedBy,
    verified_by_name: verifiedByName,
    verified_at: timestamp,
    lastUpdated: timestamp,
    updatedBy: verifiedByName,
    systemValidation: {
      ...existingSystem,
      status: 'complete',
      fileIntegrity: existingSystem.fileIntegrity ?? true,
      noDuplicates: existingSystem.noDuplicates ?? true,
      compliantWithRequirements: existingSystem.compliantWithRequirements ?? true,
      entryProcessingComplete: existingSystem.entryProcessingComplete ?? true,
    },
    contentVerification: {
      ...existingContent,
      status: 'complete',
      fileReviewed: existingContent.fileReviewed ?? true,
      contentValidated: existingContent.contentValidated ?? true,
      verifiedBy: existingContent.verifiedBy || verifiedBy,
      verifiedAt: existingContent.verifiedAt || timestamp,
      notes: existingContent.notes || 'Verified during MMP verification',
    },
    cpVerification: {
      ...existingCp,
      verificationStatus: 'complete',
      verifiedBy: existingCp.verifiedBy || verifiedBy,
      verifiedAt: existingCp.verifiedAt || timestamp,
    },
    permitVerification: {
      ...existingPermit,
      status: 'complete',
      verifiedBy: existingPermit.verifiedBy || verifiedBy,
      verifiedAt: existingPermit.verifiedAt || timestamp,
      completionPercentage: 100,
      permits: existingPermit.permits || [],
    },
  };

  const updatedWorkflow = {
    ...existingWorkflow,
    comprehensiveVerification,
    verifiedBy,
    verifiedByName,
    verifiedAt: timestamp,
  };

  const { error: mmpError } = await supabase
    .from('mmp_files')
    .update({ status: 'verified', workflow: updatedWorkflow, updated_at: timestamp })
    .eq('id', id);

  if (mmpError) throw mmpError;

  // Update only pre-verification site entries
  const { error: sitesError } = await supabase
    .from('mmp_site_entries')
    .update({ status: 'verified', verified_by: verifiedBy, verified_at: timestamp, updated_at: timestamp })
    .eq('mmp_file_id', id)
    .or('status.ilike.pending,status.ilike.forwarded,status.ilike.permits_attached,status.ilike.cp_verified,status.ilike.locality_permit_verified');

  if (sitesError) console.error('Error updating site entries to verified:', sitesError);
}

export async function archiveMMPRecord(id: string, archivedBy: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const { error } = await supabase
    .from('mmp_files')
    .update({ status: 'archived', archivedby: archivedBy, archivedat: timestamp, updated_at: timestamp })
    .eq('id', id);
  if (error) throw error;
}

export async function approveMMPRecord(id: string, approvedBy: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const { error } = await supabase
    .from('mmp_files')
    .update({ status: 'approved', approvedby: approvedBy, approvedat: timestamp, updated_at: timestamp })
    .eq('id', id);
  if (error) throw error;
}

export async function rejectMMPRecord(id: string, rejectionReason: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const { error } = await supabase
    .from('mmp_files')
    .update({ status: 'rejected', rejectionreason: rejectionReason, updated_at: timestamp })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Update mmp_files metadata + sync site entries.
 * Returns normalized site entries after sync (empty array if siteEntries was not in updatedMMP).
 */
export async function updateMMPWithEntries(
  id: string,
  dbUpdate: Record<string, any>,
  entries?: any[],
): Promise<{ success: boolean; normalizedEntries?: NormalizedSiteEntry[] }> {
  const { error: mfErr } = await supabase.from('mmp_files').update(dbUpdate).eq('id', id);
  if (mfErr) {
    console.error('Supabase updateMMP error:', mfErr);
    return { success: false };
  }

  if (typeof entries === 'undefined') return { success: true };

  // Sync site entries
  const { data: existingRows, error: selErr } = await supabase
    .from('mmp_site_entries')
    .select('id')
    .eq('mmp_file_id', id);

  if (selErr) {
    console.error('Failed to load existing mmp_site_entries:', selErr);
    return { success: false };
  }

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

  const existingIds = (existingRows || []).map((r: any) => r.id);
  const updatedIds = entries.map((e: any) => e?.id).filter(Boolean);
  const deleteIds = existingIds.filter((x: string) => !updatedIds.includes(x));
  const toUpsert = entries.filter((e: any) => !!e.id).map(mapRow);
  const toInsert = entries.filter((e: any) => !e.id).map(mapRow);

  if (deleteIds.length) {
    const { error: delErr } = await supabase.from('mmp_site_entries').delete().in('id', deleteIds);
    if (delErr) { console.error('mmp_site_entries delete error:', delErr); return { success: false }; }
  }
  if (toUpsert.length) {
    const { error: upErr } = await supabase.from('mmp_site_entries').upsert(toUpsert, { onConflict: 'id' as any });
    if (upErr) { console.error('mmp_site_entries upsert error:', upErr); return { success: false }; }
  }
  if (toInsert.length) {
    const { error: insErr } = await supabase.from('mmp_site_entries').insert(toInsert);
    if (insErr) { console.error('mmp_site_entries insert error:', insErr); return { success: false }; }
  }

  // Re-fetch authoritative rows
  const { data: syncedRows, error: syncErr } = await supabase
    .from('mmp_site_entries')
    .select('*')
    .eq('mmp_file_id', id)
    .order('created_at', { ascending: true });

  if (syncErr) {
    console.error('Failed to re-fetch mmp_site_entries after save:', syncErr);
    return { success: true }; // DB is updated, just no fresh data
  }

  return { success: true, normalizedEntries: (syncedRows || []).map(normalizeSiteEntry) };
}

export async function softDeleteMMPRecord(id: string): Promise<void> {
  const deletedAt = new Date().toISOString();
  const { error } = await supabase
    .from('mmp_files')
    .update({ status: 'deleted', deleted_at: deletedAt })
    .eq('id', id);
  if (error) throw error;
}

/** Soft-delete with wallet reversals for accepted site entries. */
export async function softDeleteMMPWithReversals(id: string): Promise<void> {
  // Reverse wallet transactions for accepted site entries
  const { data: siteEntries } = await supabase
    .from('mmp_site_entries')
    .select('id, accepted_by, cost, enumerator_fee, transport_fee')
    .eq('mmp_file_id', id)
    .not('accepted_by', 'is', null);

  if (siteEntries?.length) {
    for (const site of siteEntries) {
      const totalAmount = (site.cost || 0) + (site.enumerator_fee || 0) + (site.transport_fee || 0);
      if (totalAmount > 0 && site.accepted_by) {
        const { data: wallet } = await supabase
          .from('wallets')
          .select('id')
          .eq('user_id', site.accepted_by)
          .single();
        if (wallet) {
          await supabase.from('wallet_transactions').insert({
            user_id: site.accepted_by,
            wallet_id: wallet.id,
            amount: -totalAmount,
            amount_cents: -totalAmount * 100,
            currency: 'SDG',
            type: 'adjustment_debit',
            status: 'posted',
            memo: `MMP deletion reversal - Site: ${site.id}`,
            related_site_visit_id: site.id,
            posted_at: new Date().toISOString(),
          });
        }
      }
    }
  }

  await softDeleteMMPRecord(id);
}

export async function restoreMMPRecord(id: string): Promise<void> {
  const { error } = await supabase
    .from('mmp_files')
    .update({ status: 'pending', deleted_at: null, deleted_by: null })
    .eq('id', id);
  if (error) throw error;
}

export async function resetMMPRecord(id: string): Promise<void> {
  const { error } = await supabase
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
  if (error) throw error;
}

export async function attachPermitsDB(
  id: string,
  permitsPayload: { federal: boolean; state: boolean; local: boolean; documents: any[] },
): Promise<void> {
  const { error } = await supabase
    .from('mmp_files')
    .update({ permits: permitsPayload })
    .eq('id', id);
  if (error) throw error;
}

export async function updateMMPVersionRecord(
  id: string,
  version: { major: number; minor: number; updatedAt: string },
  modificationHistory: any[],
): Promise<void> {
  const { error } = await supabase
    .from('mmp_files')
    .update({ version, updated_at: new Date().toISOString(), modificationhistory: modificationHistory })
    .eq('id', id);
  if (error) throw error;
}

// ─── Table accessors & RPC (MMP.tsx and related — PostgREST chains) ────────────

export function fromMmpSiteEntries() {
  return supabase.from('mmp_site_entries');
}

export function fromMmpFiles() {
  return supabase.from('mmp_files');
}

export function fromDownPaymentRequests() {
  return supabase.from('down_payment_requests');
}

export function fromSiteLocations() {
  return supabase.from('site_locations');
}

export function fromReports() {
  return supabase.from('reports');
}

export function fromReportPhotos() {
  return supabase.from('report_photos');
}

export function rpcClaimSiteVisit(args: Record<string, unknown>) {
  return supabase.rpc('claim_site_visit', args);
}

export function updateMmpFileDisplayName(id: string, name: string) {
  return supabase.from('mmp_files').update({ name: name.trim() }).eq('id', id);
}

export function updateMmpSiteEntryFields(entryId: string, patch: Record<string, unknown>) {
  return supabase.from('mmp_site_entries').update(patch).eq('id', entryId);
}

export function insertMmpSiteEntryRows(rows: Record[string, unknown][]) {
  return supabase.from('mmp_site_entries').insert(rows);
}
