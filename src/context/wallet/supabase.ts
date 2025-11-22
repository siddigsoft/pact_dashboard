import { supabase } from '@/integrations/supabase/client';
import { WalletSummary, WalletTransaction, PayoutRequest, EarningRow } from '@/types';

export const getMyWalletSummary = async (userId: string, from?: string, to?: string): Promise<WalletSummary | null> => {
  const { data: walletRow } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .single();

  let periodEarningsCents = 0;
  if (from || to) {
    let q = supabase
      .from('wallet_transactions')
      .select('amount_cents, type, status, posted_at')
      .eq('user_id', userId)
      .eq('type', 'earning')
      .eq('status', 'posted');
    if (from) q = q.gte('posted_at', from);
    if (to) q = q.lte('posted_at', to);
    const { data: periodRows } = await q;
    periodEarningsCents = (periodRows || []).reduce((s, r: any) => s + (Number(r.amount_cents) || 0), 0);
  }

  if (!walletRow) return null;
  return {
    userId,
    currency: walletRow.currency || 'SDG',
    balanceCents: Number(walletRow.balance_cents) || 0,
    pendingPayoutCents: Number(walletRow.pending_payout_cents) || 0,
    totalEarnedCents: Number(walletRow.total_earned_cents) || 0,
    totalPaidOutCents: Number(walletRow.total_paid_out_cents) || 0,
    lifetimeEarningsCents: Number(walletRow.total_earned_cents) || 0,
    periodEarningsCents,
    pendingEarningsCents: 0,
    completedEarningsCents: 0,
  };
};

export const listMyTransactions = async (userId: string, params: { from?: string; to?: string; status?: string; type?: string; page?: number; pageSize?: number } = {}): Promise<WalletTransaction[]> => {
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  let q = supabase
    .from('wallet_transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (params.status) q = q.eq('status', params.status);
  if (params.type) q = q.eq('type', params.type);
  if (params.from) q = q.gte('created_at', params.from);
  if (params.to) q = q.lte('created_at', params.to);
  const { data } = await q;
  return (data || []).map((r: any) => ({
    id: r.id,
    userId: r.user_id,
    amountCents: Number(r.amount_cents) || 0,
    currency: r.currency || 'SDG',
    type: r.type,
    status: r.status,
    createdAt: r.created_at,
    postedAt: r.posted_at || undefined,
    memo: r.memo || undefined,
    relatedSiteVisitId: r.related_site_visit_id || undefined,
    visitCode: r.visit_code || undefined,
  }));
};

export const listMyEarnings = async (userId: string, params: { from?: string; to?: string; site?: string; status?: 'approved' | 'pending' | 'rejected'; page?: number; pageSize?: number } = {}): Promise<EarningRow[]> => {
  const txns = await listMyTransactions(userId, { ...params, type: 'earning' });
  const ids = txns.map(t => t.relatedSiteVisitId).filter(Boolean) as string[];
  let siteVisits: Record<string, any> = {};
  if (ids.length > 0) {
    const { data } = await supabase
      .from('mmp_site_entries')
      .select('id, site_name, site_code, additional_data')
      .in('id', ids);
    (data || []).forEach((sv: any) => { 
      siteVisits[sv.id] = {
        ...sv,
        completed_at: sv.additional_data?.completed_at
      };
    });
  }
  return txns
    .filter(t => {
      if (!params.status) return true;
      if (params.status === 'approved') return t.status === 'posted';
      if (params.status === 'pending') return t.status === 'pending';
      if (params.status === 'rejected') return t.status === 'reversed';
      return true;
    })
    .map(t => {
      const sv = t.relatedSiteVisitId ? siteVisits[t.relatedSiteVisitId] : undefined;
      return {
        siteName: sv?.site_name || '',
        visitId: t.relatedSiteVisitId || '',
        visitCode: sv?.site_code || t.visitCode,
        visitDate: sv?.completed_at || sv?.additional_data?.completed_at || undefined,
        earningAmountCents: t.amountCents,
        status: t.status === 'posted' ? 'approved' : t.status === 'pending' ? 'pending' : 'rejected',
      } as EarningRow;
    });
};

export const createPayoutRequest = async (userId: string, amountCents: number, method: 'bank' | 'mobile_money' | 'manual', destination: any): Promise<PayoutRequest | null> => {
  const payload = {
    user_id: userId,
    amount_cents: amountCents,
    method,
    destination,
  } as any;
  const { data, error } = await supabase
    .from('payout_requests')
    .insert(payload)
    .select('*')
    .single();
  if (error) return null;
  return {
    id: data.id,
    userId: data.user_id,
    amountCents: Number(data.amount_cents) || 0,
    method: data.method,
    destination: data.destination,
    status: data.status,
    requestedAt: data.requested_at,
  };
};

export const adminListWallets = async (params: { search?: string; page?: number; pageSize?: number } = {}) => {
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  let q = supabase
    .from('wallets')
    .select('*, profiles:profiles!wallets_user_id_fkey(full_name, username, email)')
    .order('updated_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  const { data } = await q;
  const rows = (data || []).map((r: any) => ({
    ...r,
    owner_name: r.profiles?.full_name || r.profiles?.username || r.profiles?.email || r.user_id,
  }));
  return rows;
};

export const adminGetWalletDetail = async (userId: string) => {
  const { data: wallet } = await supabase.from('wallets').select('*').eq('user_id', userId).single();
  const txns = await listMyTransactions(userId, { pageSize: 100 });
  return { wallet, txns };
};

export const adminListPayoutRequests = async (params: { status?: string; page?: number; pageSize?: number } = {}) => {
  const page = params.page || 1;
  const pageSize = params.pageSize || 20;
  let q = supabase
    .from('payout_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);
  if (params.status) q = q.eq('status', params.status);
  const { data } = await q;
  return data || [];
};

export const adminAdjustBalance = async (userId: string, direction: 'credit' | 'debit', amountCents: number, memo?: string) => {
  const payload = {
    user_id: userId,
    amount_cents: amountCents,
    type: direction === 'credit' ? 'adjustment_credit' : 'adjustment_debit',
    status: 'posted',
    memo: memo || null,
    currency: 'SDG',
  } as any;
  const { data, error } = await supabase
    .from('wallet_transactions')
    .insert(payload)
    .select('id')
    .single();
  if (error) return null;
  return data;
};

export const adminApprovePayout = async (requestId: string) => {
  const { data, error } = await supabase
    .from('payout_requests')
    .update({ status: 'approved' })
    .eq('id', requestId)
    .select('id')
    .single();
  if (error) return null;
  return data;
};

export const adminDeclinePayout = async (requestId: string) => {
  const { data, error } = await supabase
    .from('payout_requests')
    .update({ status: 'declined' })
    .eq('id', requestId)
    .select('id')
    .single();
  if (error) return null;
  return data;
};

export const adminMarkPayoutPaid = async (requestId: string) => {
  const { data, error } = await supabase
    .from('payout_requests')
    .update({ status: 'paid' })
    .eq('id', requestId)
    .select('id')
    .single();
  if (error) return null;
  return data;
};
