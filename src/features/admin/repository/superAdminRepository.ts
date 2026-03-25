/**
 * Super-admin domain — DB access for SuperAdminContext (CRUD, audit log, notifications).
 * Complex multi-step operations (reset site visit, wallet, reclaim) may still call through here as helpers.
 */
import { supabase } from '@/integrations/supabase/client';

export async function fetchSuperAdminActiveRecord(userId: string) {
  return supabase
    .from('super_admins')
    .select('id, user_id, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
}

export async function fetchProfileIdByEmail(email: string) {
  return supabase.from('profiles').select('id').eq('email', email).single();
}

export async function fetchSuperAdminByProfileUserId(profileId: string) {
  return supabase.from('super_admins').select('*').eq('user_id', profileId).eq('is_active', true).maybeSingle();
}

export async function fetchAllSuperAdmins() {
  return supabase
    .from('super_admins')
    .select(
      'id, user_id, appointed_by, appointed_at, appointment_reason, is_active, deactivated_at, deactivated_by, deactivation_reason, last_activity_at, deletion_count, adjustment_count, total_actions_count, created_at, updated_at, metadata',
    )
    .order('created_at', { ascending: false });
}

export async function fetchDeletionAuditLogs(limit: number) {
  return supabase.from('deletion_audit_log').select('*').order('deleted_at', { ascending: false }).limit(limit);
}

export async function insertSuperAdminRow(params: {
  user_id: string;
  appointed_by: string;
  appointment_reason?: string;
  is_active: boolean;
}) {
  return supabase.from('super_admins').insert(params);
}

export async function updateSuperAdminDeactivate(
  superAdminId: string,
  payload: {
    is_active: boolean;
    deactivated_at: string;
    deactivated_by: string;
    deactivation_reason: string;
    updated_at: string;
  },
) {
  return supabase.from('super_admins').update(payload).eq('id', superAdminId).select();
}

export async function fetchSuperAdminById(superAdminId: string) {
  return supabase.from('super_admins').select('*').eq('id', superAdminId).single();
}

export async function deleteSuperAdminById(superAdminId: string) {
  return supabase.from('super_admins').delete().eq('id', superAdminId);
}

export async function insertDeletionAuditLogRow(payload: Record<string, unknown>) {
  return supabase.from('deletion_audit_log').insert(payload);
}

export async function rpcIncrementSuperAdminDeletionCount(userId: string) {
  return supabase.rpc('increment_super_admin_deletion_count', { p_user_id: userId });
}

export async function insertSuperAdminNotification(payload: Record<string, unknown>) {
  return supabase.from('notifications').insert(payload);
}

// ---------------------------------------------------------------------------
// SuperAdminDataManagement helpers (used by SuperAdminDataManagement.tsx)
// ---------------------------------------------------------------------------

export async function fetchMmpSiteEntriesForSuperAdminSiteVisits() {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('id, site_name, site_code, status, accepted_by, visit_completed_at, visit_completed_by, enumerator_fee, state, locality')
    .in('status', ['completed', 'verified'])
    .order('visit_completed_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function fetchWalletsForSuperAdmin() {
  const { data, error } = await supabase.from('wallets').select('*').order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function fetchWalletTransactionWalletIdsForSuperAdmin() {
  const { data, error } = await supabase.from('wallet_transactions').select('wallet_id');
  if (error) throw error;
  return (data || []) as Array<{ wallet_id: string }>;
}

export async function fetchWalletTransactionsForSuperAdmin(limit = 300) {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function fetchMmpSiteEntriesForTransactionEnrichment(siteVisitIds: string[]) {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('id, state, locality, hub_office, mmp_id')
    .in('id', siteVisitIds);
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function fetchMmpFilesForTransactionEnrichment(mmpIds: string[]) {
  const { data, error } = await supabase.from('mmp_files').select('id, name').in('id', mmpIds);
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function fetchClaimedSitesForSuperAdmin() {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('id, site_name, site_code, state, locality, status, accepted_by, accepted_at, enumerator_fee, transport_fee, main_activity, activity_at_site')
    .not('accepted_by', 'is', null)
    .order('accepted_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function fetchDispatchedSitesForSuperAdmin() {
  const { data, error } = await supabase
    .from('mmp_site_entries')
    .select('id, site_name, site_code, state, locality, status, dispatched_by, dispatched_at, main_activity, activity_at_site, hub_office')
    .in('status', ['Dispatched', 'dispatched'])
    .is('accepted_by', null)
    .order('dispatched_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function fetchMmpFilesForSuperAdmin() {
  const { data, error } = await supabase
    .from('mmp_files')
    .select(`
      id,
      name,
      month,
      year,
      status,
      project_id,
      created_at,
      projects(name)
    `)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}

export async function fetchMmpSiteEntryMmpIdAndStatusForSuperAdmin() {
  const { data, error } = await supabase.from('mmp_site_entries').select('mmp_id, status');
  if (error) throw error;
  return (data || []) as Array<{ mmp_id: string; status: string }>;
}

export async function returnToNewSitesAndInsertAudit(params: {
  siteEntryId: string;
  performedBy: string;
  performedByName: string;
  performedByRole: string;
  reason: string;
  siteName: string;
  siteCode: string;
}) {
  const { error } = await supabase
    .from('mmp_site_entries')
    .update({
      status: 'verified',
      // Clear dispatch fields
      dispatched_by: null,
      dispatched_at: null,
      // Clear cost fields - must go through costing approval again
      cost: null,
      enumerator_fee: null,
      transport_fee: null,
      accepted_by: null,
      accepted_at: null,
      additional_data: null,
    })
    .eq('id', params.siteEntryId);

  if (error) throw error;

  const { error: auditErr } = await supabase.from('super_admin_audit_logs').insert({
    action_type: 'return_to_new_sites',
    entity_type: 'mmp_site_entry',
    entity_id: params.siteEntryId,
    performed_by: params.performedBy,
    performed_by_name: params.performedByName,
    performed_by_role: params.performedByRole,
    reason: params.reason,
    details: {
      site_name: params.siteName,
      site_code: params.siteCode,
      previous_status: 'dispatched',
      new_status: 'verified',
    },
  });

  if (auditErr) throw auditErr;
}

export async function returnToFomAndInsertAudit(params: {
  siteEntryId: string;
  performedBy: string;
  performedByName: string;
  performedByRole: string;
  reason: string;
  siteName: string;
  siteCode: string;
}) {
  const { error } = await supabase
    .from('mmp_site_entries')
    .update({
      status: 'returned_to_fom',
      dispatched_by: null,
      dispatched_at: null,
      cost: null,
      enumerator_fee: null,
      transport_fee: null,
      accepted_by: null,
      accepted_at: null,
    })
    .eq('id', params.siteEntryId);

  if (error) throw error;

  const { error: auditErr } = await supabase.from('super_admin_audit_logs').insert({
    action_type: 'return_to_fom',
    entity_type: 'mmp_site_entry',
    entity_id: params.siteEntryId,
    performed_by: params.performedBy,
    performed_by_name: params.performedByName,
    performed_by_role: params.performedByRole,
    reason: params.reason,
    details: {
      site_name: params.siteName,
      site_code: params.siteCode,
      previous_status: 'dispatched',
      new_status: 'returned_to_fom',
    },
  });

  if (auditErr) throw auditErr;
}

export async function archiveMmpFileById(mmpFileId: string): Promise<void> {
  const { error } = await supabase.from('mmp_files').update({ status: 'archived' }).eq('id', mmpFileId);
  if (error) throw error;
}

export async function reverseEarningAdjustmentAndUpdateWallet(params: {
  walletId: string;
  userId: string;
  currency: string;
  earningAmountAbs: number;
  reversalAmount: number;
  originalTxId: string;
  reason: string;
  nowIso: string;
}) {
  const { error: insertError } = await supabase.from('wallet_transactions').insert({
    wallet_id: params.walletId,
    user_id: params.userId,
    type: 'adjustment',
    amount: params.reversalAmount,
    currency: params.currency,
    description: `Reversal of earning: ${params.reason} (original tx: ${params.originalTxId.slice(0, 8)})`,
    created_at: params.nowIso,
  });

  if (insertError) throw new Error(`Failed to insert reversal: ${insertError.message}`);

  const { data: wallet, error: walletErr } = await supabase
    .from('wallets')
    .select('balances, total_earned')
    .eq('id', params.walletId)
    .single();

  if (walletErr) throw walletErr;
  if (!wallet) throw new Error('Wallet not found');

  const cur = params.currency;
  const newBal = Math.max(0, ((wallet as any).balances?.[cur] || 0) + params.reversalAmount);

  const { error: updateErr } = await supabase.from('wallets').update({
    balances: { ...(wallet as any).balances, [cur]: newBal },
    total_earned: Math.max(0, (parseFloat((wallet as any).total_earned) || 0) - params.earningAmountAbs),
    updated_at: params.nowIso,
  }).eq('id', params.walletId);

  if (updateErr) throw updateErr;
}

export async function fetchDownPaymentRequestsByMmpSiteEntryId(params: { mmpSiteEntryId: string }) {
  const { data, error } = await supabase
    .from('down_payment_requests')
    .select('id, requested_amount, currency, status, created_at')
    .eq('mmp_site_entry_id', params.mmpSiteEntryId);
  if (error) throw error;
  return (data || []) as Array<Record<string, unknown>>;
}
