import { supabase } from '@/integrations/supabase/client';

export type FinanceKpisPayload = {
  budget: {
    totalBudget: number;
    totalSpent: number;
    utilizationPct: number;
    activeBudgets: number;
    overBudgetCount: number;
  };
  ap: {
    outstanding: number;
    vendorCount: number;
    current: number;
    d1_30: number;
    d31_60: number;
    d61_90: number;
    over90: number;
  };
  assets: {
    totalBookValue: number;
    totalCost: number;
    activeCount: number;
    depreciatedPct: number;
  };
  journals: {
    draftCount: number;
    pendingCount: number;
    postedCount: number;
    recent: { id: string; date: string; desc: string; amount: number; status: string }[];
  };
  monthlyRevExp: { month: string; revenue: number; expense: number }[];
  pos: {
    pendingCount: number;
    pendingAmount: number;
    draftCount: number;
    approvedCount: number;
  };
  cash: {
    totalCash: number;
    accountCount: number;
    unreconciledCount: number;
  };
  revenue: {
    totalRevenue: number;
    totalExpense: number;
    netIncome: number;
    ytdRevenue: number;
  };
  coa: {
    accountCount: number;
    fundCount: number;
    fiscalPeriodCount: number;
    activePeriod: string | null;
  };
  modules: {
    coa: { active: boolean; count: number };
    journals: { active: boolean; count: number };
    journalLines: { active: boolean; count: number };
    vendors: { active: boolean; count: number };
    assets: { active: boolean; count: number };
    purchaseOrders: { active: boolean; count: number };
    fiscalPeriods: { active: boolean; count: number };
    bankAccounts: { active: boolean; count: number };
    funds: { active: boolean; count: number };
    bankRecon: { active: boolean; count: number };
  };
  phase4: {
    sodViolations: number;
    openEncumbranceTotal: number;
    openEncumbranceCount: number;
    activeTaxCodes: number;
    periodCloseStatus: string | null;
  };
  phase5: {
    activeGrants: number;
    totalGrantAwarded: number;
    lastDeprRunDate: string | null;
    lastDeprRunAmount: number;
    allocationRunsThisMonth: number;
    entityCount: number;
  };
  preFund: {
    activeCount: number;
    totalAvailable: number;
    lowBalanceCount: number;
    pendingApproval: number;
  } | null;
};

export async function fetchAccountingFinanceKpis(): Promise<FinanceKpisPayload> {
  const { data, error } = await supabase.rpc('get_accounting_finance_kpis');
  if (error) throw error;
  return data as FinanceKpisPayload;
}
