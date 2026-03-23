/**
 * React Query keys and hooks for Down Payment data.
 * Provides cached, deduplicated fetches for down payment requests.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { withTimeout } from '@/utils/promise-with-timeout';
import type { DownPaymentRequest } from '@/types/down-payment';

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

function transformFromDB(data: any): DownPaymentRequest {
  const mmpEntry = data.mmp_site_entries;
  const stateName = mmpEntry?.state || data.metadata?.state_name || undefined;

  return {
    id: data.id,
    siteVisitId: data.site_visit_id,
    mmpSiteEntryId: data.mmp_site_entry_id,
    siteName: data.site_name,
    mmpName: mmpEntry?.mmp_files?.name || data.metadata?.mmp_name || undefined,
    stateName,
    localityName: mmpEntry?.locality || data.metadata?.locality_name || undefined,
    projectName: mmpEntry?.cp_name || mmpEntry?.mmp_files?.projects?.name || data.metadata?.project_name || 'WFP TPM',
    wfpProjectName: mmpEntry?.mmp_files?.projects?.name || data.metadata?.project_name || undefined,
    activityType: data.metadata?.activity_type || undefined,
    requestedBy: data.requested_by,
    requestedByName: data.metadata?.requested_by_name || undefined,
    requestedAt: data.requested_at,
    requesterRole: data.requester_role,
    hubId: data.hub_id,
    hubName: data.hub_name,
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

  let query = supabase.from('down_payment_requests').select(`
    id, site_visit_id, mmp_site_entry_id, site_name, metadata, requested_by, requested_at, requester_role, hub_id, hub_name, total_transportation_budget, requested_amount, payment_type, installment_plan, paid_installments, justification, supporting_documents, supervisor_id, supervisor_status, supervisor_approved_by, supervisor_approved_at, supervisor_notes, supervisor_rejection_reason, admin_status, admin_processed_by, admin_processed_at, admin_notes, admin_rejection_reason, status, total_paid_amount, remaining_amount, wallet_transaction_ids, created_at, updated_at, payment_proof_url, payment_proof_notes, payment_proof_uploaded_at,
    mmp_site_entries (
      state,
      locality,
      cp_name,
      activity_type,
      mmp_file_id
    )
  `);

  const applyRoleFilter = (q: typeof query) => {
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

  let { data, error } = await applyRoleFilter(query)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[DownPayment] Join query failed, retrying without join:', error.message);
    const plain = applyRoleFilter(supabase.from('down_payment_requests').select('id, site_visit_id, mmp_site_entry_id, site_name, metadata, requested_by, requested_at, requester_role, hub_id, hub_name, total_transportation_budget, requested_amount, payment_type, installment_plan, paid_installments, justification, supporting_documents, supervisor_id, supervisor_status, supervisor_approved_by, supervisor_approved_at, supervisor_notes, supervisor_rejection_reason, admin_status, admin_processed_by, admin_processed_at, admin_notes, admin_rejection_reason, status, total_paid_amount, remaining_amount, wallet_transaction_ids, created_at, updated_at, payment_proof_url, payment_proof_notes, payment_proof_uploaded_at'));
    const fallback = await plain
      .order('created_at', { ascending: false })
      .limit(200);
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    const isPermErr = error.code === '42501' || error.message?.includes('permission') || error.message?.includes('RLS');
    if (isPermErr) return [];
    throw error;
  }

  const transformed = (data || []).map(transformFromDB).filter(r => {
    if (r.status === 'deleted') return false;
    if (r.status === 'cancelled' && r.metadata?.deleted) return false;
    return true;
  });

  const needsEnrichment = transformed.filter(r => (!r.stateName || !r.localityName || !r.mmpName) && r.mmpSiteEntryId);
  if (needsEnrichment.length > 0) {
    const entryIds = [...new Set(needsEnrichment.map(r => r.mmpSiteEntryId).filter(Boolean))] as string[];
    try {
      const { data: entries } = await supabase
        .from('mmp_site_entries')
        .select('id, state, locality, mmp_file_id')
        .in('id', entryIds);

      if (entries && entries.length > 0) {
        const entryMap = new Map(entries.map(e => [e.id, e]));
        const mmpFileIds = [...new Set(entries.map(e => (e as any).mmp_file_id).filter(Boolean))] as string[];

        let mmpNameMap = new Map<string, string>();
        if (mmpFileIds.length > 0) {
          const { data: mmpFiles } = await supabase
            .from('mmp_files').select('id, name').in('id', mmpFileIds);
          if (mmpFiles) mmpNameMap = new Map(mmpFiles.map(f => [f.id, f.name]));
        }

        transformed.forEach(r => {
          if (r.mmpSiteEntryId && entryMap.has(r.mmpSiteEntryId)) {
            const e = entryMap.get(r.mmpSiteEntryId)!;
            if (!r.stateName && e.state) r.stateName = e.state;
            if (!r.localityName && e.locality) r.localityName = e.locality;
            if (!r.mmpName && (e as any).mmp_file_id) r.mmpName = mmpNameMap.get((e as any).mmp_file_id);
          }
        });
      }
    } catch (enrichErr) {
      console.warn('[DownPayment] Enrichment failed (non-critical):', enrichErr);
    }
  }

  return transformed;
}

const STALE_MS = 60 * 1000;

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
        20000,
        'Failed to load requests. Please refresh the page.'
      ),
    staleTime: STALE_MS,
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
