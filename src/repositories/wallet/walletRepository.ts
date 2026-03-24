/**
 * Wallet Data Access Layer
 *
 * Single source of truth for all wallet-related database operations.
 * Pure async functions — no React, no hooks, no toast, no notifications.
 * Callers (contexts, hooks) are responsible for side-effects after these return.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  Wallet,
  WalletTransaction,
  WithdrawalRequest,
  SiteVisitCost,
  SupervisedWithdrawalRequest,
  AdminWithdrawalRequest,
} from '@/types/wallet';

// ─── User shape needed for supervised-withdrawal role branching ────────────────

export interface UserForWallet {
  id: string;
  hubId?: string | null;
  secondaryHubId?: string | null;
  stateId?: string | null;
  role?: string | null;
}

// ─── Transforms (authoritative — do not duplicate elsewhere) ──────────────────

export function transformWalletFromDB(data: any): Wallet {
  let balances = data.balances || { SDG: 0 };
  if (typeof balances === 'string') {
    try {
      balances = JSON.parse(balances);
    } catch {
      balances = { SDG: 0 };
    }
  }
  if (balances.SDG !== undefined) {
    balances.SDG = Number(balances.SDG) || 0;
  }
  return {
    id: data.id,
    userId: data.user_id,
    balances,
    totalEarned: parseFloat(data.total_earned || 0),
    totalWithdrawn: parseFloat(data.total_withdrawn || 0),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export function transformTransactionFromDB(data: any): WalletTransaction {
  return {
    id: data.id,
    walletId: data.wallet_id,
    userId: data.user_id,
    type: data.type,
    amount: parseFloat(data.amount),
    currency: data.currency,
    siteVisitId: data.site_visit_id,
    withdrawalRequestId: data.withdrawal_request_id,
    description: data.description,
    metadata: data.metadata,
    balanceBefore: data.balance_before ? parseFloat(data.balance_before) : undefined,
    balanceAfter: data.balance_after ? parseFloat(data.balance_after) : undefined,
    createdBy: data.created_by,
    createdAt: data.created_at,
  };
}

export function transformWithdrawalRequestFromDB(data: any): WithdrawalRequest {
  return {
    id: data.id,
    userId: data.user_id,
    walletId: data.wallet_id,
    amount: parseFloat(data.amount),
    currency: data.currency,
    status: data.status,
    requestReason: data.request_reason,
    supervisorId: data.supervisor_id,
    supervisorNotes: data.supervisor_notes,
    approvedAt: data.approved_at,
    rejectedAt: data.rejected_at,
    adminProcessedBy: data.admin_processed_by,
    adminProcessedAt: data.admin_processed_at,
    adminNotes: data.admin_notes,
    paymentMethod: data.payment_method,
    paymentDetails: data.payment_details,
    fundReceiptConfirmed: data.fund_receipt_confirmed || false,
    fundReceiptConfirmedAt: data.fund_receipt_confirmed_at,
    fundReceiptSignatureUrl: data.fund_receipt_signature_url,
    fundReceiptNotes: data.fund_receipt_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export function transformSiteVisitCostFromDB(data: any): SiteVisitCost {
  return {
    id: data.id,
    siteVisitId: data.site_visit_id,
    transportationCost: parseFloat(data.transportation_cost || 0),
    accommodationCost: parseFloat(data.accommodation_cost || 0),
    mealAllowance: parseFloat(data.meal_allowance || 0),
    otherCosts: parseFloat(data.other_costs || 0),
    totalCost: parseFloat(data.total_cost || 0),
    currency: data.currency,
    assignedBy: data.assigned_by,
    adjustedBy: data.adjusted_by,
    adjustmentReason: data.adjustment_reason,
    costNotes: data.cost_notes,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function fetchWallet(userId: string): Promise<Wallet | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase
    .from('wallets')
    .select('id, user_id, balances, total_earned, total_withdrawn, created_at, updated_at')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ user_id: userId, balances: { SDG: 0 } })
        .select()
        .single();
      if (createError) throw createError;
      return transformWalletFromDB(newWallet);
    }
    throw error;
  }
  return transformWalletFromDB(data);
}

export async function fetchTransactions(userId: string): Promise<WalletTransaction[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, wallet_id, user_id, type, amount, currency, site_visit_id, withdrawal_request_id, description, metadata, balance_before, balance_after, created_by, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []).map(transformTransactionFromDB);
}

export async function fetchWithdrawalRequests(userId: string): Promise<WithdrawalRequest[]> {
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select('id, user_id, wallet_id, amount, currency, status, request_reason, supervisor_id, supervisor_notes, approved_at, rejected_at, admin_processed_by, admin_processed_at, admin_notes, payment_method, payment_details, fund_receipt_confirmed, fund_receipt_confirmed_at, fund_receipt_signature_url, fund_receipt_notes, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map(transformWithdrawalRequestFromDB);
}

export async function fetchDisbursedAdvanceRequestIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('down_payment_requests')
    .select('id')
    .eq('requested_by', userId)
    .in('status', ['approved', 'fully_paid', 'partially_paid']);

  if (error) return [];
  return (data || []).map((r: { id: string }) => r.id);
}

export async function fetchSupervisedWithdrawalRequests(user: UserForWallet): Promise<SupervisedWithdrawalRequest[]> {
  const userRole = user.role?.toLowerCase();
  const isSupervisorRole = userRole === 'supervisor' || userRole === 'hubsupervisor' || userRole === 'fom';
  const isAdmin = userRole === 'admin' || userRole === 'financialadmin';

  if (!isSupervisorRole && !isAdmin) return [];

  const profileSelect = 'profiles:profiles!withdrawal_requests_user_id_fkey(full_name, email, hub_id, state_id, role)';
  const requestSelect = `id, user_id, wallet_id, amount, currency, status, request_reason, supervisor_id, supervisor_notes, approved_at, rejected_at, admin_processed_by, admin_processed_at, admin_notes, payment_method, payment_details, fund_receipt_confirmed, fund_receipt_confirmed_at, fund_receipt_signature_url, fund_receipt_notes, created_at, updated_at, ${profileSelect}`;

  const mapToSupervised = (item: any): SupervisedWithdrawalRequest => ({
    ...transformWithdrawalRequestFromDB(item),
    requesterName: item.profiles?.full_name || 'Unknown User',
    requesterEmail: item.profiles?.email,
    requesterHub: item.profiles?.hub_id,
    requesterState: item.profiles?.state_id,
    requesterRole: item.profiles?.role,
  });

  if (isAdmin) {
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select(requestSelect)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw error;
    return (data || []).map(mapToSupervised);
  }

  const supervisorHubId = user.hubId;
  const supervisorSecondaryHubId = user.secondaryHubId;
  const supervisorStateId = user.stateId;

  if (!supervisorHubId && !supervisorStateId) return [];

  let hubFilter = `hub_id.eq.${supervisorHubId || 'none'},state_id.eq.${supervisorStateId || 'none'}`;
  if (supervisorSecondaryHubId) {
    hubFilter += `,hub_id.eq.${supervisorSecondaryHubId}`;
  }

  const { data: teamMembers, error: teamError } = await supabase
    .from('profiles')
    .select('id, full_name, email, hub_id, state_id, role')
    .or(hubFilter);

  if (teamError) return [];

  const teamMemberIds = (teamMembers || [])
    .map((m: any) => m.id)
    .filter((id: string) => id !== user.id);

  if (teamMemberIds.length === 0) return [];

  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select(requestSelect)
    .in('user_id', teamMemberIds)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data || []).map(mapToSupervised);
}

export async function listWallets(): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data.map(transformWalletFromDB);
}

export async function adminListWithdrawalRequests(): Promise<AdminWithdrawalRequest[]> {
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select(`
      *,
      profiles:profiles!withdrawal_requests_user_id_fkey(full_name, email, hub_id, state_id, role)
    `)
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  return (data || []).map((item: any): AdminWithdrawalRequest => ({
    ...transformWithdrawalRequestFromDB(item),
    requesterName: item.profiles?.full_name || 'Unknown User',
    requesterEmail: item.profiles?.email,
    requesterHub: item.profiles?.hub_id,
    requesterState: item.profiles?.state_id,
    requesterRole: item.profiles?.role,
  }));
}

export async function getSiteVisitCost(siteVisitId: string): Promise<SiteVisitCost | null> {
  const { data, error } = await supabase
    .from('site_visit_costs')
    .select('*')
    .eq('site_visit_id', siteVisitId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return transformSiteVisitCostFromDB(data);
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createWithdrawalRequest(params: {
  userId: string;
  walletId: string;
  amount: number;
  reason: string;
  paymentMethod?: string;
}): Promise<void> {
  const { error } = await supabase.from('withdrawal_requests').insert({
    user_id: params.userId,
    wallet_id: params.walletId,
    amount: params.amount,
    currency: 'SDG',
    request_reason: params.reason,
    payment_method: params.paymentMethod,
    status: 'pending',
  });
  if (error) throw error;
}

export async function cancelWithdrawalRequest(requestId: string): Promise<void> {
  const { error } = await supabase
    .from('withdrawal_requests')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', requestId)
    .eq('status', 'pending');
  if (error) throw error;
}

/** Returns { userId, amount } for downstream notification. */
export async function approveWithdrawalRequest(
  requestId: string,
  supervisorId: string,
  notes?: string,
): Promise<{ userId: string; amount: number }> {
  // Fetch the request from DB
  const { data: requestData, error: fetchError } = await supabase
    .from('withdrawal_requests')
    .select('id, user_id, wallet_id, amount, currency, status')
    .eq('id', requestId)
    .single();

  if (fetchError || !requestData) throw new Error('Request not found');
  if (requestData.status !== 'pending') throw new Error('Only pending requests can be approved by supervisor');

  // Verify wallet balance
  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('id, balances')
    .eq('id', requestData.wallet_id)
    .single();

  if (walletError) throw walletError;

  const currentBalance = Number(wallet.balances?.[requestData.currency] ?? 0);
  if (currentBalance < requestData.amount) throw new Error('Insufficient wallet balance');

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'supervisor_approved',
      supervisor_id: supervisorId,
      supervisor_notes: notes,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw error;
  return { userId: requestData.user_id, amount: parseFloat(requestData.amount) };
}

/** Returns { userId, amount } for downstream notification. */
export async function rejectWithdrawalRequest(
  requestId: string,
  supervisorId: string,
  notes: string,
): Promise<{ userId: string; amount: number }> {
  // Fetch request for notification data
  const { data: requestData } = await supabase
    .from('withdrawal_requests')
    .select('user_id, amount')
    .eq('id', requestId)
    .single();

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'rejected',
      supervisor_id: supervisorId,
      supervisor_notes: notes,
      rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw error;
  return {
    userId: requestData?.user_id ?? '',
    amount: parseFloat(requestData?.amount ?? 0),
  };
}

/** Deducts balance and creates transaction record. Returns { userId, amount } for notification. */
export async function adminProcessWithdrawal(
  requestId: string,
  adminId: string,
  notes?: string,
): Promise<{ userId: string; amount: number }> {
  // Fetch request with profile join (needed for admin list view)
  const { data: requestData, error: fetchError } = await supabase
    .from('withdrawal_requests')
    .select('id, user_id, wallet_id, amount, currency, status')
    .eq('id', requestId)
    .single();

  if (fetchError || !requestData) throw new Error('Request not found');
  if (requestData.status !== 'supervisor_approved') {
    throw new Error('Only supervisor-approved requests can be processed by Finance');
  }

  const { data: wallet, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('id', requestData.wallet_id)
    .single();

  if (walletError) throw walletError;

  const amount = parseFloat(requestData.amount);
  const currentBalance = Number(wallet.balances?.[requestData.currency] ?? 0);
  if (currentBalance < amount) throw new Error('Insufficient wallet balance');

  const newBalances = {
    ...wallet.balances,
    [requestData.currency]: Number((currentBalance - amount).toFixed(2)),
  };

  const { error: updateWalletError } = await supabase
    .from('wallets')
    .update({
      balances: newBalances,
      total_withdrawn: parseFloat(wallet.total_withdrawn) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestData.wallet_id);

  if (updateWalletError) throw updateWalletError;

  const { error: txError } = await supabase.from('wallet_transactions').insert({
    wallet_id: requestData.wallet_id,
    user_id: requestData.user_id,
    type: 'withdrawal',
    amount: -amount,
    amount_cents: Math.round(amount * 100),
    currency: requestData.currency,
    withdrawal_request_id: requestId,
    description: `Withdrawal processed by Finance: ${notes || 'Payment completed'}`,
    balance_before: currentBalance,
    balance_after: currentBalance - amount,
    created_by: adminId,
  });

  if (txError) throw txError;

  const processedAt = new Date().toISOString();
  const { error: requestError } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'approved',
      admin_processed_by: adminId,
      admin_processed_at: processedAt,
      admin_notes: notes,
      updated_at: processedAt,
    })
    .eq('id', requestId);

  if (requestError) throw requestError;
  return { userId: requestData.user_id, amount };
}

/** Returns { userId, amount } for downstream notification. */
export async function adminRejectWithdrawal(
  requestId: string,
  adminId: string,
  notes: string,
): Promise<{ userId: string; amount: number }> {
  const { data: requestData, error: fetchError } = await supabase
    .from('withdrawal_requests')
    .select('user_id, amount, status')
    .eq('id', requestId)
    .single();

  if (fetchError || !requestData) throw new Error('Request not found');
  if (requestData.status !== 'supervisor_approved') {
    throw new Error('Only supervisor-approved requests can be rejected by Finance');
  }

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'rejected',
      admin_processed_by: adminId,
      admin_processed_at: new Date().toISOString(),
      admin_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (error) throw error;
  return { userId: requestData.user_id, amount: parseFloat(requestData.amount) };
}

export async function confirmFundReceipt(
  requestId: string,
  userId: string,
  confirmedByName: string,
  signatureData: {
    signatureId: string;
    signatureHash: string;
    signatureMethod: string;
    signedAt: string;
    notes?: string;
  },
): Promise<{ userId: string; amount: number }> {
  const { data: requestData, error: fetchError } = await supabase
    .from('withdrawal_requests')
    .select('user_id, amount, status, fund_receipt_confirmed')
    .eq('id', requestId)
    .single();

  if (fetchError || !requestData) throw new Error('Withdrawal request not found');
  if (requestData.status !== 'approved') throw new Error('Only approved withdrawals can be confirmed');
  if (requestData.fund_receipt_confirmed) throw new Error('Fund receipt already confirmed / تم تأكيد الاستلام مسبقاً');

  const signatureRecord = JSON.stringify({
    signatureId: signatureData.signatureId,
    signatureHash: signatureData.signatureHash,
    signatureMethod: signatureData.signatureMethod,
    signedAt: signatureData.signedAt,
    confirmedBy: userId,
    confirmedByName,
  });

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({
      fund_receipt_confirmed: true,
      fund_receipt_confirmed_at: signatureData.signedAt,
      fund_receipt_signature_url: signatureRecord,
      fund_receipt_notes: signatureData.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('user_id', userId);

  if (error) throw error;
  return { userId: requestData.user_id, amount: parseFloat(requestData.amount) };
}

export async function assignSiteVisitCost(
  siteVisitId: string,
  costs: Partial<SiteVisitCost>,
  assignedBy: string,
): Promise<void> {
  const { error } = await supabase.from('site_visit_costs').insert({
    site_visit_id: siteVisitId,
    transportation_cost: costs.transportationCost || 0,
    accommodation_cost: costs.accommodationCost || 0,
    meal_allowance: costs.mealAllowance || 0,
    other_costs: costs.otherCosts || 0,
    currency: costs.currency || 'SDG',
    cost_notes: costs.costNotes,
    assigned_by: assignedBy,
  });
  if (error) throw error;
}

export async function updateSiteVisitCost(
  costId: string,
  costs: Partial<SiteVisitCost>,
  adjustedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('site_visit_costs')
    .update({
      transportation_cost: costs.transportationCost,
      accommodation_cost: costs.accommodationCost,
      meal_allowance: costs.mealAllowance,
      other_costs: costs.otherCosts,
      cost_notes: costs.costNotes,
      adjustment_reason: costs.adjustmentReason,
      adjusted_by: adjustedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', costId);
  if (error) throw error;
}

export async function addRetainerToWallet(
  userId: string,
  amountCents: number,
  currency: string,
  period: string,
  createdBy?: string,
): Promise<void> {
  const amount = amountCents / 100;

  const { data: targetWallet, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (walletError) {
    if (walletError.code === 'PGRST116') {
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ user_id: userId, balances: { [currency]: amount }, total_earned: amount })
        .select()
        .single();
      if (createError) throw createError;

      const { error: txError } = await supabase.from('wallet_transactions').insert({
        wallet_id: newWallet.id,
        user_id: userId,
        type: 'adjustment',
        amount,
        amount_cents: Math.round(amount * 100),
        currency,
        description: `Monthly retainer - ${period}`,
        balance_before: 0,
        balance_after: amount,
        created_by: createdBy,
        metadata: { type: 'retainer', period },
      });
      if (txError) throw txError;
      return;
    }
    throw walletError;
  }

  const currentBalance = Number(targetWallet.balances?.[currency] ?? 0);
  const newBalance = Number((currentBalance + amount).toFixed(2));
  const newBalances = { ...targetWallet.balances, [currency]: newBalance };

  const { error: updateError } = await supabase
    .from('wallets')
    .update({
      balances: newBalances,
      total_earned: parseFloat(targetWallet.total_earned || 0) + amount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetWallet.id);
  if (updateError) throw updateError;

  const { error: txError } = await supabase.from('wallet_transactions').insert({
    wallet_id: targetWallet.id,
    user_id: userId,
    type: 'adjustment',
    amount,
    amount_cents: Math.round(amount * 100),
    currency,
    description: `Monthly retainer - ${period}`,
    balance_before: currentBalance,
    balance_after: newBalance,
    created_by: createdBy,
    metadata: { type: 'retainer', period },
  });
  if (txError) throw txError;
}

export async function processMonthlyRetainers(): Promise<{ processed: number; failed: number; total: number }> {
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const { data: eligibleUsers, error: fetchError } = await supabase
    .from('current_user_classifications')
    .select('*')
    .eq('has_retainer', true)
    .eq('is_active', true);

  if (fetchError) throw fetchError;
  if (!eligibleUsers || eligibleUsers.length === 0) return { processed: 0, failed: 0, total: 0 };

  let processed = 0;
  let failed = 0;

  for (const user of eligibleUsers) {
    try {
      const { data: existingRetainer, error: checkError } = await supabase
        .from('wallet_transactions')
        .select('id')
        .eq('user_id', user.user_id)
        .eq('type', 'retainer')
        .ilike('description', `%${currentPeriod}%`)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') throw checkError;
      if (existingRetainer) continue;

      await addRetainerToWallet(user.user_id, user.retainer_amount_cents, user.retainer_currency, currentPeriod);
      processed++;
    } catch {
      failed++;
    }
  }

  return { processed, failed, total: eligibleUsers.length };
}

/** Returns { txId } for downstream notification. */
export async function adminAdjustBalance(params: {
  targetUserId: string;
  adminId: string;
  amount: number;
  currency: string;
  reason: string;
  adjustmentType: 'credit' | 'debit';
}): Promise<{ txId: string | undefined }> {
  const { targetUserId, adminId, amount, currency, reason, adjustmentType } = params;

  const { data: targetWallet, error: walletError } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', targetUserId)
    .single();

  if (walletError) {
    if (walletError.code === 'PGRST116') {
      if (adjustmentType === 'debit') {
        throw new Error('Cannot debit from non-existent wallet. Please credit first to create the wallet.');
      }
      const { data: newWallet, error: createError } = await supabase
        .from('wallets')
        .insert({ user_id: targetUserId, balances: { [currency]: amount }, total_earned: amount })
        .select()
        .single();
      if (createError) throw createError;

      const { data: newTx } = await supabase.from('wallet_transactions').insert({
        wallet_id: newWallet.id,
        user_id: targetUserId,
        type: 'adjustment',
        amount,
        currency,
        description: `Admin ${adjustmentType}: ${reason}`,
        balance_before: 0,
        balance_after: amount,
        created_by: adminId,
        metadata: { adjustmentType, adminReason: reason },
      }).select('id').single();

      return { txId: newTx?.id };
    }
    throw walletError;
  }

  const currentBalance = Number(targetWallet.balances?.[currency] ?? 0);
  const adjustmentAmount = adjustmentType === 'credit' ? amount : -amount;
  const newBalance = currentBalance + adjustmentAmount;

  if (newBalance < 0) throw new Error('Adjustment would result in negative balance');

  const newBalances = { ...targetWallet.balances, [currency]: newBalance };

  const { error: updateError } = await supabase
    .from('wallets')
    .update({ balances: newBalances, updated_at: new Date().toISOString() })
    .eq('id', targetWallet.id);
  if (updateError) throw updateError;

  const { data: insertedTx, error: txError } = await supabase.from('wallet_transactions').insert({
    wallet_id: targetWallet.id,
    user_id: targetUserId,
    type: 'adjustment',
    amount: adjustmentAmount,
    currency,
    description: `Admin ${adjustmentType}: ${reason}`,
    balance_before: currentBalance,
    balance_after: newBalance,
    created_by: adminId,
    metadata: { adjustmentType, adminReason: reason },
  }).select('id').single();
  if (txError) throw txError;

  return { txId: insertedTx?.id };
}
