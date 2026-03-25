/**
 * Down Payment Repository — pure async DB access, no React, no toasts.
 * All supabase.from() calls for down_payment_requests and related tables live here.
 * supabase.functions.invoke (FCM push) stays in the context — it is a service call, not a query.
 */
import { supabase } from '@/integrations/supabase/client';
import type { DownPaymentRequest } from '@/types/down-payment';

/** Minimal user shape needed for role-based filtering */
export interface UserForDownPayment {
  id: string;
  hubId?: string | null;
  secondaryHubId?: string | null;
  role?: string | null;
}

// ---------------------------------------------------------------------------
// Transform
// ---------------------------------------------------------------------------

export function transformDownPaymentFromDB(data: any): DownPaymentRequest {
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

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

const SELECT_FIELDS = `
  id, site_visit_id, mmp_site_entry_id, site_name, metadata, requested_by, requested_at, requester_role, hub_id, hub_name, total_transportation_budget, requested_amount, payment_type, installment_plan, paid_installments, justification, supporting_documents, supervisor_id, supervisor_status, supervisor_approved_by, supervisor_approved_at, supervisor_notes, supervisor_rejection_reason, admin_status, admin_processed_by, admin_processed_at, admin_notes, admin_rejection_reason, status, total_paid_amount, remaining_amount, wallet_transaction_ids, created_at, updated_at, payment_proof_url, payment_proof_notes, payment_proof_uploaded_at,
  mmp_site_entries (
    state,
    locality,
    cp_name,
    activity_type,
    mmp_file_id
  )
`;

const SELECT_FIELDS_PLAIN = `id, site_visit_id, mmp_site_entry_id, site_name, metadata, requested_by, requested_at, requester_role, hub_id, hub_name, total_transportation_budget, requested_amount, payment_type, installment_plan, paid_installments, justification, supporting_documents, supervisor_id, supervisor_status, supervisor_approved_by, supervisor_approved_at, supervisor_notes, supervisor_rejection_reason, admin_status, admin_processed_by, admin_processed_at, admin_notes, admin_rejection_reason, status, total_paid_amount, remaining_amount, wallet_transaction_ids, created_at, updated_at, payment_proof_url, payment_proof_notes, payment_proof_uploaded_at`;

function applyRoleFilter<T extends ReturnType<typeof supabase.from>>(
  query: any,
  user: UserForDownPayment,
): any {
  const userRole = user.role?.toLowerCase();
  if (userRole === 'datacollector' || userRole === 'coordinator') {
    return query.eq('requested_by', user.id);
  }
  if (userRole === 'supervisor' || userRole === 'hubsupervisor') {
    if (user.hubId) {
      let hubFilter = `requested_by.eq.${user.id},hub_id.eq.${user.hubId}`;
      if (user.secondaryHubId) hubFilter += `,hub_id.eq.${user.secondaryHubId}`;
      return query.or(hubFilter);
    }
    return query.eq('requested_by', user.id);
  }
  const isAdmin = [
    'admin', 'financialadmin', 'superadmin', 'super_admin',
    'ict', 'fom', 'field operation manager',
    'countrydirector', 'country_director', 'datateam', 'data_team',
  ].includes(userRole || '');
  if (!isAdmin) return query.eq('requested_by', user.id);
  return query;
}

export async function fetchDownPaymentRequests(user: UserForDownPayment): Promise<DownPaymentRequest[]> {
  let { data, error } = await applyRoleFilter(
    supabase.from('down_payment_requests').select(SELECT_FIELDS),
    user,
  )
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    console.warn('[DownPayment] Join query failed, retrying without join:', error.message);
    const fallback = await applyRoleFilter(
      supabase.from('down_payment_requests').select(SELECT_FIELDS_PLAIN),
      user,
    )
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

  const transformed = (data || []).map(transformDownPaymentFromDB).filter(r => {
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

/** Fetch supervisor profile ids for a hub (used to send notifications on request creation). */
export async function fetchHubSupervisors(hubId: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('hub_id', hubId)
    .in('role', ['supervisor', 'Supervisor', 'hubSupervisor', 'hub_supervisor']);
  return (data || []).map((s: any) => s.id).filter(Boolean);
}

/** Fetch FCM tokens for a user (used to send push notifications). */
export async function fetchUserFcmTokens(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('profiles')
    .select('fcm_tokens')
    .eq('id', userId)
    .maybeSingle();
  return (data?.fcm_tokens as string[]) || [];
}

/** Fetch stakeholder profiles for bulk-approve notifications. */
export async function fetchStakeholderProfiles(): Promise<Array<{ id: string; role: string; hub_id: string | null }>> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, hub_id')
    .in('role', ['supervisor', 'hubSupervisor', 'fom', 'coordinator', 'countrydirector']);
  if (error || !data) return [];
  return data as Array<{ id: string; role: string; hub_id: string | null }>;
}

/** Fetch cancelled requests that still have site links (for cleanup). */
export async function fetchCancelledDownPaymentRequests(): Promise<
  Array<{ id: string; metadata: any; site_visit_id: string | null; mmp_site_entry_id: string | null }>
> {
  const { data } = await supabase
    .from('down_payment_requests')
    .select('id, metadata, site_visit_id, mmp_site_entry_id')
    .eq('status', 'cancelled');
  return (data || []) as Array<{ id: string; metadata: any; site_visit_id: string | null; mmp_site_entry_id: string | null }>;
}

// ---------------------------------------------------------------------------
// Mutations — accept pre-computed payloads from context
// ---------------------------------------------------------------------------

/** Insert a new down payment request. Throws on error. */
export async function insertDownPaymentRequest(payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('down_payment_requests').insert(payload);
  if (error) throw error;
}

/**
 * Update a down payment request.
 * Returns the number of rows affected (0 = RLS blocked or not found).
 */
export async function updateDownPaymentRequest(
  id: string,
  payload: Record<string, unknown>,
): Promise<{ rowCount: number }> {
  const { data, error } = await supabase
    .from('down_payment_requests')
    .update(payload)
    .eq('id', id)
    .select('id');
  if (error) throw error;
  return { rowCount: data?.length ?? 0 };
}

/**
 * Update a down payment request without a row-count check.
 * Use for simple mutations where you just need to know if it succeeded.
 */
export async function updateDownPaymentRequestSimple(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('down_payment_requests')
    .update(payload)
    .eq('id', id);
  if (error) throw error;
}

/**
 * Delete a down payment request row.
 * Throws on error; RLS blocks return silently (no throw).
 */
export async function deleteDownPaymentRequestRow(id: string): Promise<{ deleted: boolean }> {
  const { error } = await supabase
    .from('down_payment_requests')
    .delete()
    .eq('id', id)
    .eq('status', 'cancelled');
  if (error) return { deleted: false };
  return { deleted: true };
}

/**
 * Bulk-update multiple down payment requests in parallel.
 * Each row must include an `id` field; the rest is the update payload.
 */
export async function bulkUpdateDownPaymentRequests(
  rows: Array<{ id: string } & Record<string, unknown>>,
): Promise<Array<{ id: string; error: any; rowCount: number }>> {
  return Promise.all(
    rows.map(async ({ id, ...updateData }) => {
      const { data: updated, error } = await supabase
        .from('down_payment_requests')
        .update(updateData)
        .eq('id', id)
        .select('id');
      return { id, error, rowCount: updated?.length ?? 0 };
    }),
  );
}

// ---------------------------------------------------------------------------
// Wallet helpers (used by processPayment)
// ---------------------------------------------------------------------------

/** Fetch existing wallet or create one (balance stays 0 for advances). */
export async function fetchOrCreateWallet(
  userId: string,
): Promise<{ id: string; balances: Record<string, number> }> {
  const { data: existingWallet, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (walletError) throw walletError;

  if (existingWallet) {
    return existingWallet as { id: string; balances: Record<string, number> };
  }

  const { data: newWallet, error: createError } = await supabase
    .from('wallets')
    .insert({ user_id: userId, balances: { SDG: 0 }, total_earned: 0 })
    .select()
    .single();
  if (createError) throw createError;
  return newWallet as { id: string; balances: Record<string, number> };
}

/** Insert a wallet transaction and return its id. */
export async function insertWalletTransaction(payload: Record<string, unknown>): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as { id: string };
}

// ---------------------------------------------------------------------------
// MMP site entry update (used by adminApprove)
// ---------------------------------------------------------------------------

/** Update an mmp_site_entry (e.g. to mark it claimed after advance approval). */
export async function updateMmpSiteEntry(id: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('mmp_site_entries').update(payload).eq('id', id);
  if (error) throw error;
}

/** Fetch additional_data for a single mmp_site_entry. */
export async function fetchMmpSiteEntryAdditionalData(
  id: string,
): Promise<Record<string, unknown>> {
  const { data } = await supabase
    .from('mmp_site_entries')
    .select('additional_data')
    .eq('id', id)
    .single();
  return (data?.additional_data as Record<string, unknown>) || {};
}

// ---------------------------------------------------------------------------
// Storage helpers (mmp-files bucket) + small mutations for UI workflows
// ---------------------------------------------------------------------------

const MMP_FILES_BUCKET = 'mmp-files';

export async function uploadMmpFilesObject(
  objectPath: string,
  file: Blob,
  options?: {
    cacheControl?: string;
    upsert?: boolean;
    contentType?: string;
  },
): Promise<void> {
  const { error } = await supabase.storage.from(MMP_FILES_BUCKET).upload(objectPath, file, {
    cacheControl: options?.cacheControl,
    upsert: options?.upsert ?? false,
    contentType: options?.contentType,
  });
  if (error) throw error;
}

export function getMmpFilesPublicUrl(objectPath: string): string {
  const { data } = supabase.storage.from(MMP_FILES_BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

export async function createMmpFilesSignedUrl(
  objectPath: string,
  expiresInSeconds: number,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(MMP_FILES_BUCKET).createSignedUrl(
    objectPath,
    expiresInSeconds,
  );
  if (error) throw error;
  return data?.signedUrl ?? null;
}

export async function uploadMmpFilesObjectAndGetPublicUrl(
  objectPath: string,
  file: Blob,
  options?: {
    cacheControl?: string;
    upsert?: boolean;
    contentType?: string;
  },
): Promise<string> {
  await uploadMmpFilesObject(objectPath, file, options);
  return getMmpFilesPublicUrl(objectPath);
}

export async function markDownPaymentRequestFullyPaidWithReceipt(params: {
  requestId: string;
  totalPaidAmount: number;
  proofUrl: string;
  proofNotes?: string | null;
  nowIso: string;
}): Promise<void> {
  const { requestId, totalPaidAmount, proofUrl, proofNotes, nowIso } = params;

  const payload: Record<string, unknown> = {
    status: 'fully_paid',
    total_paid_amount: totalPaidAmount,
    remaining_amount: 0,
    updated_at: nowIso,
    payment_proof_url: proofUrl,
    payment_proof_uploaded_at: nowIso,
  };

  const trimmed = (proofNotes || '').trim();
  if (trimmed) payload.payment_proof_notes = trimmed;

  const { error } = await supabase.from('down_payment_requests').update(payload).eq('id', requestId);
  if (error) throw error;
}

export async function fetchDownPaymentRequestMetadata(requestId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('down_payment_requests')
    .select('metadata')
    .eq('id', requestId)
    .maybeSingle();

  if (error) throw error;
  return (data?.metadata as Record<string, unknown>) || {};
}

export async function softCancelDownPaymentRequestWithDeletedMetadata(params: {
  requestId: string;
  meta: Record<string, unknown>;
  nowIso: string;
}): Promise<void> {
  const { requestId, meta, nowIso } = params;

  const payload: Record<string, unknown> = {
    status: 'cancelled',
    site_visit_id: null,
    mmp_site_entry_id: null,
    updated_at: nowIso,
    metadata: { ...meta, deleted: true, deleted_at: nowIso },
  };

  const { error } = await supabase.from('down_payment_requests').update(payload).eq('id', requestId);
  if (error) throw error;
}

export async function fetchDocumentSignatureImageData(signatureId: string): Promise<{
  signature_data: string | null;
  signer_id: string | null;
} | null> {
  const { data, error } = await supabase
    .from('document_signatures')
    .select('signature_data, signer_id')
    .eq('id', signatureId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return {
    signature_data: (data?.signature_data as string | null) || null,
    signer_id: (data?.signer_id as string | null) || null,
  };
}

export async function fetchActiveHandwritingSignatureImageDataByUser(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('handwriting_signatures')
    .select('signature_image')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  const raw = (data || [])[0]?.signature_image;
  if (typeof raw === 'string' && raw.startsWith('data:')) return raw;
  return null;
}

export async function fetchFinanceRecipientProfiles(): Promise<
  Array<{ id: string; email: string | null; full_name: string | null; role: string | null }>
> {
  const roles = [
    'finance_admin',
    'Finance Admin',
    'superAdmin',
    'SuperAdmin',
    'super_admin',
    'admin',
    'Admin',
    'Administrator',
  ];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .in('role', roles)
    .eq('status', 'approved')
    .not('email', 'is', null);

  if (error) throw error;
  return (data || []) as Array<{
    id: string;
    email: string | null;
    full_name: string | null;
    role: string | null;
  }>;
}
