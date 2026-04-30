/**
 * React Query keys and hooks for Down Payment data.
 * Provides cached, deduplicated fetches for down payment requests.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/utils/promise-with-timeout';
import type { DownPaymentRequest } from '@/types/down-payment';
import { sudanStates } from '@/data/sudanStates';

/** Minimal user shape needed for role-based filtering */
export interface UserForDownPayment {
  id: string;
  hubId?: string | null;
  secondaryHubId?: string | null;
  role?: string | null;
}

export const downPaymentQueryKeys = {
  all: ['down-payment'] as const,
  requests: (userId?: string | null, hubId?: string | null, secondaryHubId?: string | null, role?: string | null) =>
    [...downPaymentQueryKeys.all, 'requests', userId ?? '', hubId ?? '', secondaryHubId ?? '', role ?? ''] as const,
};

/** Strip surrounding single/double quotes and trim whitespace — some rows in
 *  the DB were inserted with literal quote chars around geographic names. */
const cleanStr = (val: string | null | undefined): string | undefined => {
  if (!val) return undefined;
  const s = String(val).trim().replace(/^["']+|["']+$/g, '').trim();
  return s || undefined;
};

function transformFromDB(data: any): DownPaymentRequest {
  const mmpEntry = data.mmp_site_entries;
  const stateName = cleanStr(mmpEntry?.state || data.metadata?.state_name);

  return {
    id: data.id,
    siteVisitId: data.site_visit_id,
    mmpSiteEntryId: data.mmp_site_entry_id,
    siteName: cleanStr(data.site_name) ?? data.site_name,
    mmpName: cleanStr(mmpEntry?.mmp_files?.name || data.metadata?.mmp_name),
    stateName,
    localityName: cleanStr(mmpEntry?.locality || data.metadata?.locality_name),
    projectName: cleanStr(mmpEntry?.cp_name || mmpEntry?.mmp_files?.projects?.name || data.metadata?.project_name) || 'WFP TPM',
    wfpProjectName: cleanStr(mmpEntry?.mmp_files?.projects?.name || data.metadata?.project_name),
    activityType: data.metadata?.activity_type || undefined,
    requestedBy: data.requested_by,
    requestedByName: data.metadata?.requested_by_name || undefined,
    requestedAt: data.requested_at,
    requesterRole: data.requester_role,
    hubId: data.hub_id,
    hubName: cleanStr(data.hub_name) ?? data.hub_name,
    totalTransportationBudget: parseFloat(data.total_transportation_budget),
    requestedAmount: parseFloat(data.requested_amount),
    approvedAmount: data.metadata?.approved_amount ? parseFloat(data.metadata.approved_amount) : undefined,
    approvalType: data.metadata?.approval_type,
    approvalPercentage: data.metadata?.approval_percentage,
    paymentType: data.payment_type,
    installmentPlan: data.installment_plan || [],
    paidInstallments: data.paid_installments || [],
    justification: data.justification,
    supportingDocuments: data.supporting_documents || [],
    supervisorId: data.supervisor_id,
    supervisorStatus: data.supervisor_status,
    supervisorApprovedBy: data.supervisor_approved_by,
    supervisorApprovedByName: data.metadata?.supervisor_approved_by_name || undefined,
    supervisorApprovedAt: data.supervisor_approved_at,
    supervisorNotes: data.supervisor_notes,
    supervisorRejectionReason: data.supervisor_rejection_reason,
    supervisorApprovedAmount: data.metadata?.supervisor_approved_amount ? parseFloat(data.metadata.supervisor_approved_amount) : undefined,
    adminStatus: data.admin_status,
    adminProcessedBy: data.admin_processed_by,
    adminProcessedByName: data.metadata?.admin_processed_by_name || undefined,
    adminProcessedAt: data.admin_processed_at,
    adminNotes: data.admin_notes,
    adminRejectionReason: data.admin_rejection_reason,
    adminApprovedAmount: data.metadata?.admin_approved_amount ? parseFloat(data.metadata.admin_approved_amount) : undefined,
    status: data.status,
    totalPaidAmount: parseFloat(data.total_paid_amount || 0),
    remainingAmount: parseFloat(data.remaining_amount || 0),
    walletTransactionIds: data.wallet_transaction_ids || [],
    auditLog: data.metadata?.audit_log || [],
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    metadata: data.metadata || {},
    paymentProofUrl: data.payment_proof_url || null,
    paymentProofNotes: data.payment_proof_notes || null,
    paymentProofUploadedAt: data.payment_proof_uploaded_at || null,
  };
}

async function fetchDownPaymentRequests(user: UserForDownPayment): Promise<DownPaymentRequest[]> {
  const userRole = user.role?.toLowerCase();

  const DP_SELECT_JOIN = `
    id, site_visit_id, mmp_site_entry_id, site_name, metadata, requested_by, requested_at, requester_role, hub_id, hub_name, total_transportation_budget, requested_amount, payment_type, installment_plan, paid_installments, justification, supporting_documents, supervisor_id, supervisor_status, supervisor_approved_by, supervisor_approved_at, supervisor_notes, supervisor_rejection_reason, admin_status, admin_processed_by, admin_processed_at, admin_notes, admin_rejection_reason, status, total_paid_amount, remaining_amount, wallet_transaction_ids, created_at, updated_at, payment_proof_url, payment_proof_notes, payment_proof_uploaded_at,
    mmp_site_entries!left (
      state,
      locality,
      cp_name,
      mmp_file_id
    )
  `;
  const DP_SELECT_PLAIN = 'id, site_visit_id, mmp_site_entry_id, site_name, metadata, requested_by, requested_at, requester_role, hub_id, hub_name, total_transportation_budget, requested_amount, payment_type, installment_plan, paid_installments, justification, supporting_documents, supervisor_id, supervisor_status, supervisor_approved_by, supervisor_approved_at, supervisor_notes, supervisor_rejection_reason, admin_status, admin_processed_by, admin_processed_at, admin_notes, admin_rejection_reason, status, total_paid_amount, remaining_amount, wallet_transaction_ids, created_at, updated_at, payment_proof_url, payment_proof_notes, payment_proof_uploaded_at';

  const applyRoleFilter = (q: any) => {
    if (userRole === 'datacollector' || userRole === 'coordinator') {
      return q.eq('requested_by', user.id);
    }
    if (userRole === 'supervisor' || userRole === 'hubsupervisor') {
      if (user.hubId) {
        let hubFilter = `requested_by.eq.${user.id},hub_id.eq.${user.hubId}`;
        if (user.secondaryHubId) hubFilter += `,hub_id.eq.${user.secondaryHubId}`;
        return q.or(hubFilter);
      }
      return q.eq('requested_by', user.id);
    }
    const isAdmin = [
      'admin', 'financialadmin', 'superadmin', 'super_admin',
      'ict', 'fom', 'field operation manager',
      'countrydirector', 'country_director', 'datateam', 'data_team',
    ].includes(userRole || '');
    if (!isAdmin) return q.eq('requested_by', user.id);
    return q;
  };

  // Always fetch without a join so RLS on mmp_site_entries never silently
  // drops down_payment_requests rows.  Geographic fields (state/locality/mmpName)
  // are populated from metadata first, then filled in by the enrichment RPC below.
  // Try the SECURITY DEFINER RPC first (bypasses RLS, applies role filter in SQL).
  // Falls back to a direct query if the migration hasn't been applied yet.
  let allData: any[] = [];
  let error: any = null;
  let useRpc = true;

  for (let _dpf = 0; ; _dpf += 1000) {
    let _dpp: any[] | null = null;
    let _dpe: any = null;

    if (useRpc) {
      const res = await (supabase as any)
        .rpc('get_dp_requests_for_user', {
          p_user_id: user.id,
          p_role: userRole || '',
          p_hub_id: user.hubId ?? null,
          p_secondary_hub_id: user.secondaryHubId ?? null,
        })
        .range(_dpf, _dpf + 999);
      _dpp = res.data;
      _dpe = res.error;
      // If RPC doesn't exist yet, fall back to direct query for this and all remaining pages
      if (_dpe?.code === 'PGRST202' || _dpe?.message?.includes('Could not find')) {
        console.warn('[DownPayment] RPC not available, falling back to direct query');
        useRpc = false;
        _dpe = null;
      }
    }

    if (!useRpc) {
      const res = await applyRoleFilter(
        supabase.from('down_payment_requests').select(DP_SELECT_PLAIN)
      ).order('created_at', { ascending: false }).range(_dpf, _dpf + 999);
      _dpp = res.data;
      _dpe = res.error;
    }

    if (_dpe) { error = _dpe; break; }
    if (!_dpp) break;
    allData = [...allData, ..._dpp];
    if (_dpp.length < 1000) break;
  }
  let data: any[] | null = allData.length > 0 ? allData : null;

  if (error) {
    const isPermErr = error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS');
    if (isPermErr) return [];
    throw error;
  }

  const rawMapped = (data || []).map(transformFromDB);
  const deletedCount = rawMapped.filter(r => r.status === 'deleted' || (r.status === 'cancelled' && r.metadata?.deleted)).length;
  console.log('[DownPayment] raw from DB:', rawMapped.length, '| filtered-out (deleted/cancelled+deleted):', deletedCount);
  const transformed = rawMapped.filter(r => {
    if (r.status === 'deleted') return false;
    if (r.status === 'cancelled' && r.metadata?.deleted) return false;
    return true;
  });

  // Run geographic enrichment and hub-name normalisation IN PARALLEL to
  // minimise total wait time.  Both are non-critical — failures are logged
  // but do not prevent the page from loading.
  const entryIds = [
    ...new Set(transformed.map(r => r.mmpSiteEntryId).filter(Boolean)),
  ] as string[];
  const hubIds = [
    ...new Set(transformed.map(r => r.hubId).filter(Boolean)),
  ] as string[];

  const [enrichResult, hubResult] = await Promise.allSettled([
    entryIds.length > 0
      ? (supabase as any).rpc('get_entry_enrichment', { entry_ids: entryIds })
      : Promise.resolve({ data: [] }),
    hubIds.length > 0
      ? supabase.from('hubs').select('id, name, states').in('id', hubIds)
      : Promise.resolve({ data: [] }),
  ]);

  if (enrichResult.status === 'fulfilled' && enrichResult.value?.data?.length > 0) {
    const entryMap = new Map<string, { state: string; locality: string; mmp_name: string }>(
      (enrichResult.value.data as any[]).map((e: any) => [e.id, e])
    );
    transformed.forEach(r => {
      if (r.mmpSiteEntryId && entryMap.has(r.mmpSiteEntryId)) {
        const e = entryMap.get(r.mmpSiteEntryId)!;
        if (e.state) r.stateName = cleanStr(e.state) ?? e.state;
        if (e.locality) r.localityName = cleanStr(e.locality) ?? e.locality;
        if (e.mmp_name) r.mmpName = cleanStr(e.mmp_name) ?? e.mmp_name;
      }
    });
  } else if (enrichResult.status === 'rejected') {
    console.warn('[DownPayment] Enrichment failed (non-critical):', enrichResult.reason);
  }

  if (hubResult.status === 'fulfilled' && hubResult.value?.data?.length > 0) {
    // Build hub → name map AND hub → first-state-name map for records
    // that have no mmpSiteEntryId (and therefore no enrichment state).
    const hubNameMap = new Map<string, string>();
    const hubStateMap = new Map<string, string>();
    (hubResult.value.data as any[]).forEach((h: any) => {
      hubNameMap.set(h.id, h.name);
      if (Array.isArray(h.states) && h.states.length > 0) {
        const stateObj = sudanStates.find(s => s.id === h.states[0]);
        if (stateObj) hubStateMap.set(h.id, stateObj.name);
      }
    });
    transformed.forEach(r => {
      if (r.hubId && hubNameMap.has(r.hubId)) r.hubName = hubNameMap.get(r.hubId) as string;
      // Backfill stateName from the hub's primary state for records without one
      if (!r.stateName && r.hubId && hubStateMap.has(r.hubId)) {
        r.stateName = hubStateMap.get(r.hubId);
      }
    });
  } else if (hubResult.status === 'rejected') {
    console.warn('[DownPayment] Hub name enrichment failed (non-critical):', hubResult.reason);
  }

  return transformed;
}

// 90-second cache — balances avoiding unnecessary re-fetches on rapid
// navigation with picking up newly-created records promptly.
const STALE_MS = 90 * 1000;

/**
 * Fetches down payment requests for the current user with role-based filtering.
 * Cached and deduplicated by React Query.
 */
export function useDownPaymentRequestsQuery(user: UserForDownPayment | null) {
  const enabled = !!user?.id;

  return useQuery({
    queryKey: downPaymentQueryKeys.requests(user?.id, user?.hubId, user?.secondaryHubId, user?.role),
    queryFn: () =>
      withTimeout(
        fetchDownPaymentRequests(user!),
        30000,
        'Failed to load requests. Please refresh the page.'
      ),
    staleTime: STALE_MS,
    gcTime: 10 * 60 * 1000,
    placeholderData: (previousData) => previousData,
    enabled,
  });
}

/**
 * Invalidate down payment requests (e.g. after mutations or realtime). Use from context or components.
 */
export function useInvalidateDownPaymentQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: downPaymentQueryKeys.all });
  };
}
