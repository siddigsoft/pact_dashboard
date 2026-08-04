import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';
import type { CurrentUserClassificationRow } from '@/types/hr-finance-tables';

export type RetainerTransactionRow = {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  description: string;
  metadata: {
    type: string;
    period: string;
    base_currency?: string | null;
    fx_rate?: number | null;
  } | null;
  balance_before: number;
  balance_after: number;
  created_at: string;
  created_by: string | null;
};

export type RetainerEligibleUser = CurrentUserClassificationRow & {
  retainer_amount_cents: number;
  full_name?: string | null;
  email?: string;
  classification_level?: string;
  retainer_currency?: string | null;
};

export type RetainerBundle = {
  transactions: RetainerTransactionRow[];
  eligibleUsers: RetainerEligibleUser[];
};

const RETAINER_TX_LIMIT = 1000;

export async function fetchRetainerBundle(): Promise<RetainerBundle> {
  const [txResult, classResult] = await Promise.all([
    supabase
      .from('wallet_transactions')
      .select(
        'id, user_id, amount, currency, description, metadata, balance_before, balance_after, created_at, created_by'
      )
      .eq('metadata->>type', 'retainer')
      .order('created_at', { ascending: false })
      .limit(RETAINER_TX_LIMIT),
    supabase
      .from('current_user_classifications' as any)
      .select('*')
      .eq('has_retainer', true)
      .eq('is_active', true) as unknown as Promise<{
      data: CurrentUserClassificationRow[] | null;
      error: unknown;
    }>,
  ]);

  if (txResult.error) throw txResult.error;

  const transactions = (txResult.data || []) as RetainerTransactionRow[];
  const eligibleUsers = ((classResult.data || []) as unknown as RetainerEligibleUser[]).map(
    (u) => ({
      ...u,
      retainer_amount_cents: u.retainer_amount_cents ?? 0,
    })
  );

  return { transactions, eligibleUsers };
}

export function useRetainerBundleQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.hr.retainerBundle(),
    queryFn: fetchRetainerBundle,
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useInvalidateRetainerQueries() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.hr.retainerBundle() });
    queryClient.invalidateQueries({ queryKey: queryKeys.hr.retainerWalletTxs() });
    // Legacy key used by SalaryRetainerReport
    queryClient.invalidateQueries({ queryKey: ['retainer-wallet-txs'] });
  };
}

export type SalaryIncrementRow = {
  id: string;
  user_id: string;
  effective_date: string;
  previous_salary: number | null;
  new_salary: number;
  increment_type: string;
  increment_percent: number | null;
  currency: string;
  reason: string | null;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  user_name?: string;
  approver_name?: string | null;
};

export type SalaryIncrementsBundle = {
  increments: SalaryIncrementRow[];
  profiles: { id: string; full_name: string }[];
};

const INCREMENT_LIMIT = 1000;
const PROFILE_PICKER_LIMIT = 300;

export async function fetchSalaryIncrementsBundle(): Promise<SalaryIncrementsBundle> {
  const [incRes, profRes] = await Promise.all([
    supabase
      .from('salary_increments')
      .select(
        'id, user_id, effective_date, previous_salary, new_salary, increment_type, increment_percent, currency, reason, approved_by, notes, created_at'
      )
      .order('effective_date', { ascending: false })
      .limit(INCREMENT_LIMIT),
    supabase
      .from('profiles')
      .select('id, full_name')
      .order('full_name')
      .limit(PROFILE_PICKER_LIMIT),
  ]);

  if (incRes.error) throw incRes.error;
  if (profRes.error) throw profRes.error;

  const profiles = (profRes.data ?? []) as { id: string; full_name: string }[];
  const pm: Record<string, string> = Object.fromEntries(
    profiles.map((p) => [p.id, p.full_name])
  );

  const increments: SalaryIncrementRow[] = (incRes.data ?? []).map((r: any) => ({
    ...r,
    user_name: pm[r.user_id] ?? 'Unknown',
    approver_name: r.approved_by ? pm[r.approved_by] ?? 'Unknown' : null,
  }));

  return { increments, profiles };
}

export function useSalaryIncrementsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.hr.salaryIncrements(),
    queryFn: fetchSalaryIncrementsBundle,
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useInvalidateSalaryIncrements() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.hr.salaryIncrements() });
}
