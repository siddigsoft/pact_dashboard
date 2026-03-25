import { supabase } from '@/integrations/supabase/client';

export async function fetchWalletsForConsolidatedStatement(): Promise<any[]> {
  const { data, error } = await supabase.from('wallets').select('balances, total_earned, total_withdrawn, user_id');
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchDownPaymentRequestsReceivableForConsolidatedStatement(): Promise<any[]> {
  const { data, error } = await supabase
    .from('down_payment_requests')
    .select('requested_amount, metadata')
    .in('status', ['approved', 'paid']);
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchWalletTransactionsForConsolidatedStatement(params: { fromDate?: string; toDate?: string }): Promise<any[]> {
  const q = supabase.from('wallet_transactions').select('*');
  const query = params.fromDate ? q.gte('created_at', params.fromDate) : q;
  const query2 = params.toDate ? query.lte('created_at', params.toDate) : query;
  const { data, error } = await query2;
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchOperationalCostSubmissionsForConsolidatedStatement(params: { fromDate?: string; toDate?: string }): Promise<any[]> {
  const q = supabase.from('operational_cost_submissions').select('*');
  const query = params.fromDate ? q.gte('created_at', params.fromDate) : q;
  const query2 = params.toDate ? query.lte('created_at', params.toDate) : query;
  const { data, error } = await query2;
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchDownPaymentRequestsForConsolidatedStatement(params: { fromDate?: string; toDate?: string }): Promise<any[]> {
  const q = supabase.from('down_payment_requests').select('*');
  const query = params.fromDate ? q.gte('created_at', params.fromDate) : q;
  const query2 = params.toDate ? query.lte('created_at', params.toDate) : query;
  const { data, error } = await query2;
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchCostSubmissionsForConsolidatedStatement(params: { fromDate?: string; toDate?: string }): Promise<any[]> {
  const q = supabase.from('cost_submissions').select('*');
  const query = params.fromDate ? q.gte('created_at', params.fromDate) : q;
  const query2 = params.toDate ? query.lte('created_at', params.toDate) : query;
  const { data, error } = await query2;
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchOperationalCostSubmissionsForExpenseCategories(): Promise<any[]> {
  const { data, error } = await supabase
    .from('operational_cost_submissions')
    .select('expense_category, amount_cents, tier1_status, tier2_status, created_at');
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchWalletsForWalletSummary(): Promise<any[]> {
  const { data, error } = await supabase.from('wallets').select('balances, total_earned, total_withdrawn');
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchWalletTransactionsForWalletSummary(params: {
  currentMonthStart: string;
  currentMonthEnd: string;
  prevMonthStart: string;
  prevMonthEnd: string;
}): Promise<{
  curCredits: any[];
  prevCredits: any[];
  curDebits: any[];
  prevDebits: any[];
}> {
  const { currentMonthStart, currentMonthEnd, prevMonthStart, prevMonthEnd } = params;

  const [curTx, prevTx, curWd, prevWd] = await Promise.all([
    supabase
      .from('wallet_transactions')
      .select('amount, type, transaction_type')
      .gte('created_at', currentMonthStart)
      .lte('created_at', currentMonthEnd),
    supabase
      .from('wallet_transactions')
      .select('amount, type, transaction_type')
      .gte('created_at', prevMonthStart)
      .lte('created_at', prevMonthEnd),
    supabase
      .from('wallet_transactions')
      .select('amount, type, transaction_type')
      .gte('created_at', currentMonthStart)
      .lte('created_at', currentMonthEnd)
      .or('type.eq.withdrawal,type.eq.debit,transaction_type.eq.withdrawal,transaction_type.eq.debit'),
    supabase
      .from('wallet_transactions')
      .select('amount, type, transaction_type')
      .gte('created_at', prevMonthStart)
      .lte('created_at', prevMonthEnd)
      .or('type.eq.withdrawal,type.eq.debit,transaction_type.eq.withdrawal,transaction_type.eq.debit'),
  ]);

  if (curTx.error) throw curTx.error;
  if (prevTx.error) throw prevTx.error;
  if (curWd.error) throw curWd.error;
  if (prevWd.error) throw prevWd.error;

  return {
    curCredits: (curTx.data || []) as any[],
    prevCredits: (prevTx.data || []) as any[],
    curDebits: (curWd.data || []) as any[],
    prevDebits: (prevWd.data || []) as any[],
  };
}

export async function fetchAuditLogsForFinanceSummary(params: { monthStart: string; monthEnd: string }): Promise<any[]> {
  const { monthStart, monthEnd } = params;
  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .in('module', ['financial_operations', 'cost_approval', 'down_payment', 'withdrawal', 'wallet', 'retainer'])
    .gte('timestamp', monthStart)
    .lte('timestamp', monthEnd)
    .order('timestamp', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchOperationalCostsPaidForAuditSummary(): Promise<any[]> {
  const { data, error } = await supabase
    .from('operational_cost_submissions')
    .select('created_at, paid_at, tier1_status, tier2_status')
    .not('paid_at', 'is', null);
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchDownPaymentRequestsForAuditSummary(): Promise<any[]> {
  const { data, error } = await supabase
    .from('down_payment_requests')
    .select('created_at, status, updated_at')
    .in('status', ['approved', 'paid', 'rejected', 'completed']);
  if (error) throw error;
  return (data || []) as any[];
}

export async function countPendingOperationalCostSubmissions(): Promise<number> {
  const { count, error } = await supabase
    .from('operational_cost_submissions')
    .select('id', { count: 'exact', head: true })
    .or('tier1_status.eq.pending,tier2_status.eq.pending');
  if (error) throw error;
  return count ?? 0;
}

export async function countPendingDownPaymentRequests(): Promise<number> {
  const { count, error } = await supabase
    .from('down_payment_requests')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pending', 'pending_supervisor', 'pending_admin']);
  if (error) throw error;
  return count ?? 0;
}

