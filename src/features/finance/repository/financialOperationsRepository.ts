import { supabase } from '@/integrations/supabase/client';

export async function fetchFinancialPeriodCloseRows(): Promise<any[]> {
  const { data, error } = await supabase.from('financial_period_close').select('*');
  if (error) throw error;
  return (data || []) as any[];
}

export async function insertFinancialPeriodCloseRow(params: {
  periodMonth: string;
  status: 'closed' | 'locked';
  closedBy: string;
  closedByName: string;
  closedAt: string;
}): Promise<void> {
  const { error } = await supabase.from('financial_period_close').insert({
    period_month: params.periodMonth,
    status: params.status,
    closed_by: params.closedBy,
    closed_by_name: params.closedByName,
    closed_at: params.closedAt,
  });
  if (error) throw error;
}

export async function deleteFinancialPeriodCloseRowByMonth(periodMonth: string): Promise<void> {
  const { error } = await supabase.from('financial_period_close').delete().eq('period_month', periodMonth);
  if (error) throw error;
}

export async function insertFinancialAuditLog(params: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert(params as any);
  if (error) throw error;
}

export async function fetchWalletTransactionsForPeriodClose(fromDate: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('amount, created_at, type')
    .gte('created_at', fromDate);
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchOperationalCostSubmissionsForPeriodClose(fromDate: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('operational_cost_submissions')
    .select('amount_cents, created_at, status, tier1_status, tier2_status')
    .gte('created_at', fromDate);
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchOperationalCostsLatest(): Promise<any[]> {
  const { data, error } = await supabase
    .from('operational_cost_submissions')
    .select(
      'id, project_id, expense_category, amount_cents, currency, description, submitted_by, submitted_at, status, tier1_status, tier2_status, paid_at, reconciled_at, reconciled_amount_cents, created_at',
    )
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchExchangeRatesLatest(): Promise<any | null> {
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('updated_at, created_at')
    .order('updated_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function fetchOverdueReconciliationItems(sevenDaysAgo: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('operational_cost_submissions')
    .select('id, description, paid_at, created_at')
    .not('paid_at', 'is', null)
    .is('reconciled_at', null)
    .lt('paid_at', sevenDaysAgo);
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchAgingApprovalsItems(threeDaysAgo: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('operational_cost_submissions')
    .select('id, description, created_at, tier2_status')
    .or('tier2_status.is.null,tier2_status.eq.pending')
    .lt('created_at', threeDaysAgo);
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchAdvanceLiquidationItems(sevenDaysAgo: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('down_payment_requests')
    .select('id, created_at, amount, status')
    .eq('status', 'paid')
    .lt('created_at', sevenDaysAgo);
  if (error) throw error;
  return (data || []) as any[];
}

export async function fetchCashFlowTransactionsAndPaidCosts(fromDate: string): Promise<{
  credits: any[];
  debits: any[];
  paidCosts: any[];
}> {
  const [creditsRes, debitsRes, paidCostsRes] = await Promise.all([
    supabase
      .from('wallet_transactions')
      .select('amount, created_at')
      .eq('type', 'credit')
      .gte('created_at', fromDate),
    supabase
      .from('wallet_transactions')
      .select('amount, created_at')
      .eq('type', 'debit')
      .gte('created_at', fromDate),
    supabase
      .from('operational_cost_submissions')
      .select('amount_cents, paid_at')
      .not('paid_at', 'is', null)
      .gte('paid_at', fromDate),
  ]);

  if (creditsRes.error) throw creditsRes.error;
  if (debitsRes.error) throw debitsRes.error;
  if (paidCostsRes.error) throw paidCostsRes.error;

  return {
    credits: (creditsRes.data || []) as any[],
    debits: (debitsRes.data || []) as any[],
    paidCosts: (paidCostsRes.data || []) as any[],
  };
}

