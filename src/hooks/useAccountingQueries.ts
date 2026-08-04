import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';

export const JOURNAL_PAGE_SIZE = 50;
const JOURNAL_EXPORT_LIMIT = 2000;
const JOURNAL_ENTRY_SELECT =
  'id, entry_no, period_id, posting_date, description_en, description_ar, source_type, source_id, status, branch_id, idempotency_key, posted_at, posted_by, created_at, created_by, reversed_by_entry_id, country_id';

export type AcctFiscalYear = { id: string; code: string };
export type AcctPeriod = {
  id: string;
  period_no: number;
  start_date: string;
  end_date: string;
  status: string;
  fiscal_year_id: string;
};
export type AcctCountry = {
  id: string;
  code: string;
  name_en: string;
  flag_emoji: string | null;
  currency_code: string;
};
export type AcctJournalEntry = {
  id: string;
  entry_no: number;
  period_id: string;
  posting_date: string;
  description_en: string;
  description_ar: string | null;
  source_type: string;
  source_id: string | null;
  status: 'draft' | 'pending_approval' | 'posted' | 'reversed' | 'rejected';
  branch_id: string | null;
  idempotency_key: string;
  posted_at: string | null;
  posted_by: string | null;
  created_at: string;
  created_by: string;
  reversed_by_entry_id: string | null;
  country_id: string | null;
};
export type AcctAccountRef = {
  code: string;
  name_en: string;
  name_ar: string;
  country_id: string | null;
  is_postable: boolean;
};

export type JournalsMeta = {
  years: AcctFiscalYear[];
  periods: AcctPeriod[];
  countries: AcctCountry[];
  accountsMap: Record<string, AcctAccountRef>;
  fundsMap: Record<string, { code: string; name_en: string }>;
  sources: string[];
};

export type JournalEntryFilters = {
  periodId: string;
  status: string;
  source: string;
  countryId: string;
  search: string;
  page: number;
  pageSize?: number;
};

export type JournalEntriesPage = {
  entries: AcctJournalEntry[];
  total: number;
  counts: { total: number; posted: number; draft: number; reversed: number };
};

function applyJournalFilters(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  filters: Pick<JournalEntryFilters, 'periodId' | 'status' | 'source' | 'countryId' | 'search'>,
  opts?: { skipStatus?: boolean }
) {
  let q = query;
  if (filters.periodId !== 'all') q = q.eq('period_id', filters.periodId);
  if (!opts?.skipStatus && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.source !== 'all') q = q.eq('source_type', filters.source);
  if (filters.countryId !== 'all') q = q.eq('country_id', filters.countryId);
  const search = filters.search.trim().replace(/[%_,]/g, ' ').slice(0, 80);
  if (search) {
    const asNum = Number(search);
    if (Number.isFinite(asNum) && String(asNum) === search) {
      q = q.eq('entry_no', asNum);
    } else {
      const like = `%${search}%`;
      q = q.or(
        `description_en.ilike.${like},description_ar.ilike.${like},idempotency_key.ilike.${like},source_id.ilike.${like}`
      );
    }
  }
  return q;
}

export async function fetchJournalsMeta(): Promise<JournalsMeta> {
  const [yres, pres, ares, fres, cres, sres] = await Promise.all([
    supabase.from('acct_fiscal_years').select('id, code').order('code', { ascending: false }),
    supabase
      .from('acct_fiscal_periods')
      .select('id, period_no, start_date, end_date, status, fiscal_year_id')
      .order('start_date', { ascending: false }),
    supabase
      .from('acct_accounts')
      .select('id, code, name_en, name_ar, country_id, is_postable')
      .order('code'),
    supabase.from('acct_funds').select('id, code, name_en'),
    supabase
      .from('countries')
      .select('id, code, name_en, flag_emoji, currency_code')
      .eq('is_active', true)
      .order('name_en'),
    // ponytail: sample recent source_types for the filter dropdown
    supabase
      .from('acct_journal_entries')
      .select('source_type')
      .order('posting_date', { ascending: false })
      .limit(300),
  ]);

  const firstErr = [yres.error, pres.error, ares.error, fres.error, cres.error, sres.error].find(
    Boolean
  );
  if (firstErr) throw new Error(firstErr.message);

  const accountsMap: JournalsMeta['accountsMap'] = {};
  for (const a of ares.data ?? []) {
    accountsMap[a.id] = {
      code: a.code,
      name_en: a.name_en,
      name_ar: a.name_ar,
      country_id: a.country_id ?? null,
      is_postable: a.is_postable ?? true,
    };
  }

  const fundsMap: JournalsMeta['fundsMap'] = {};
  for (const f of fres.data ?? []) {
    fundsMap[f.id] = { code: f.code, name_en: f.name_en };
  }

  const sources = Array.from(
    new Set((sres.data ?? []).map((r) => r.source_type).filter(Boolean) as string[])
  ).sort();

  return {
    years: (yres.data ?? []) as AcctFiscalYear[],
    periods: (pres.data ?? []) as AcctPeriod[],
    countries: (cres.data ?? []) as AcctCountry[],
    accountsMap,
    fundsMap,
    sources,
  };
}

export async function fetchJournalEntriesPage(
  filters: JournalEntryFilters
): Promise<JournalEntriesPage> {
  const pageSize = filters.pageSize ?? JOURNAL_PAGE_SIZE;
  const from = filters.page * pageSize;
  const to = from + pageSize - 1;

  let listQuery = supabase
    .from('acct_journal_entries')
    .select(JOURNAL_ENTRY_SELECT, { count: 'exact' })
    .order('posting_date', { ascending: false })
    .order('entry_no', { ascending: false })
    .range(from, to);
  listQuery = applyJournalFilters(listQuery, filters);

  const baseFilters = {
    periodId: filters.periodId,
    status: 'all' as const,
    source: filters.source,
    countryId: filters.countryId,
    search: filters.search,
  };

  const countFor = async (status: string) => {
    let q = supabase
      .from('acct_journal_entries')
      .select('id', { count: 'exact', head: true });
    q = applyJournalFilters(q, { ...baseFilters, status });
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };

  const [listRes, posted, draft, reversed] = await Promise.all([
    listQuery,
    countFor('posted'),
    countFor('draft'),
    countFor('reversed'),
  ]);

  if (listRes.error) throw new Error(listRes.error.message);

  const matched = listRes.count ?? 0;
  return {
    entries: (listRes.data ?? []) as AcctJournalEntry[],
    total: matched,
    counts: {
      total: filters.status === 'all' ? matched : posted + draft + reversed,
      posted,
      draft,
      reversed,
    },
  };
}

/** Export helper — same filters, hard cap. */
export async function fetchJournalEntriesForExport(
  filters: Omit<JournalEntryFilters, 'page' | 'pageSize'>
): Promise<AcctJournalEntry[]> {
  let q = supabase
    .from('acct_journal_entries')
    .select(JOURNAL_ENTRY_SELECT)
    .order('posting_date', { ascending: false })
    .order('entry_no', { ascending: false })
    .limit(JOURNAL_EXPORT_LIMIT);
  q = applyJournalFilters(q, filters);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AcctJournalEntry[];
}

export function useJournalsMetaQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.accounting.journalsMeta(),
    queryFn: fetchJournalsMeta,
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useJournalEntriesQuery(filters: JournalEntryFilters, enabled = true) {
  return useQuery({
    queryKey: queryKeys.accounting.journalEntries({
      periodId: filters.periodId,
      status: filters.status,
      source: filters.source,
      countryId: filters.countryId,
      search: filters.search,
      page: filters.page,
      pageSize: filters.pageSize ?? JOURNAL_PAGE_SIZE,
    }),
    queryFn: () => fetchJournalEntriesPage(filters),
    enabled,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useInvalidateJournalsBundle() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.accounting.journalsMeta() });
    queryClient.invalidateQueries({ queryKey: [...queryKeys.accounting.all, 'journalEntries'] });
  };
}

export type GlBootstrapAccount = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  account_type: string;
  subtype: string;
  country_id: string | null;
  is_postable: boolean;
};

export type GlBootstrap = {
  accounts: GlBootstrapAccount[];
  years: AcctFiscalYear[];
  periods: AcctPeriod[];
  countries: AcctCountry[];
};

export async function fetchGlBootstrap(): Promise<GlBootstrap> {
  const [acctRes, yrRes, perRes, cRes] = await Promise.all([
    supabase
      .from('acct_accounts')
      .select('id, code, name_en, name_ar, account_type, subtype, country_id, is_postable')
      .eq('is_active', true)
      .eq('is_postable', true)
      .order('code'),
    supabase.from('acct_fiscal_years').select('id, code').order('code', { ascending: false }),
    supabase
      .from('acct_fiscal_periods')
      .select('id, period_no, start_date, end_date, status, fiscal_year_id')
      .order('start_date', { ascending: false }),
    supabase
      .from('countries')
      .select('id, code, name_en, flag_emoji, currency_code')
      .eq('is_active', true)
      .order('name_en'),
  ]);

  const firstErr = [acctRes.error, yrRes.error, perRes.error, cRes.error].find(Boolean);
  if (firstErr) throw new Error(firstErr.message);

  return {
    accounts: (acctRes.data ?? []) as GlBootstrapAccount[],
    years: (yrRes.data ?? []) as AcctFiscalYear[],
    periods: (perRes.data ?? []) as AcctPeriod[],
    countries: (cRes.data ?? []) as AcctCountry[],
  };
}

export function useGlBootstrapQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.accounting.glBootstrap(),
    queryFn: fetchGlBootstrap,
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  });
}

export type GlLine = {
  entry_id: string;
  entry_no: number;
  posting_date: string;
  description_en: string;
  description_ar: string | null;
  source_type: string;
  status: string;
  line_no: number;
  debit_credit: 'DR' | 'CR';
  functional_amount: number;
  functional_currency: string;
  original_amount: number;
  original_currency: string;
  line_description: string | null;
};

export type GlLedgerResult = {
  lines: GlLine[];
  openingBalance: number;
};

export async function fetchGlLedger(
  accountId: string,
  startDate: string,
  endDate: string
): Promise<GlLedgerResult> {
  const { data, error } = await supabase.rpc('get_acct_gl_ledger', {
    p_account_id: accountId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw new Error(error.message);

  const payload = (data ?? {}) as {
    openingBalance?: number | string;
    lines?: Array<Record<string, unknown>>;
  };

  const lines: GlLine[] = (payload.lines ?? []).map((l) => ({
    entry_id: String(l.entry_id),
    entry_no: Number(l.entry_no) || 0,
    posting_date: String(l.posting_date),
    description_en: String(l.description_en ?? ''),
    description_ar: (l.description_ar as string | null) ?? null,
    source_type: String(l.source_type ?? ''),
    status: String(l.status ?? ''),
    line_no: Number(l.line_no) || 0,
    debit_credit: (l.debit_credit as 'DR' | 'CR') || 'DR',
    functional_amount: Number(l.functional_amount) || 0,
    functional_currency: String(l.functional_currency ?? ''),
    original_amount: Number(l.original_amount) || 0,
    original_currency: String(l.original_currency ?? ''),
    line_description: (l.line_description as string | null) ?? null,
  }));

  return {
    openingBalance: Number(payload.openingBalance) || 0,
    lines,
  };
}

export function useGlLedgerQuery(
  accountId: string,
  periodId: string,
  startDate: string | undefined,
  endDate: string | undefined,
  enabled = true
) {
  return useQuery({
    queryKey: queryKeys.accounting.glLedger(accountId, periodId),
    queryFn: () => fetchGlLedger(accountId, startDate!, endDate!),
    enabled: enabled && !!accountId && !!periodId && !!startDate && !!endDate,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export type DonorFund = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string | null;
  restriction_type: string;
  donor_partner_id: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

export type FundActivity = {
  fund_id: string;
  total_debit: number;
  total_credit: number;
  line_count: number;
};

export type DonorReportsBundle = {
  funds: DonorFund[];
  activity: FundActivity[];
  partners: { id: string; name: string }[];
  preFundRequests: {
    id: string;
    name: string | null;
    currency: string | null;
    amount: number | null;
    available_balance: number | null;
    paid_amount: number | null;
    status: string | null;
    start_date: string | null;
    end_date: string | null;
    matching_scope: string | null;
  }[];
};

export async function fetchDonorReportsBundle(): Promise<DonorReportsBundle> {
  const [fundsRes, activityRes, partnersRes, preFundRes] = await Promise.all([
    supabase
      .from('acct_funds')
      .select(
        'id, code, name_en, name_ar, restriction_type, donor_partner_id, start_date, end_date, is_active'
      )
      .order('code'),
    supabase.rpc('get_acct_fund_activity'),
    supabase.from('crm_partners').select('id, name').limit(500).then(
      (res) => res,
      () => ({ data: [] as { id: string; name: string }[], error: null })
    ),
    supabase
      .from('pre_fund_requests' as any)
      .select(
        'id, name, currency, amount, available_balance, paid_amount, status, start_date, end_date, matching_scope'
      )
      .in('status', ['active', 'low_balance', 'awaiting_receipt'])
      .order('start_date', { ascending: false })
      .limit(200)
      .then(
        (res: { data: DonorReportsBundle['preFundRequests'] | null }) => res,
        () => ({ data: [] as DonorReportsBundle['preFundRequests'] })
      ),
  ]);

  if (fundsRes.error) throw new Error(fundsRes.error.message);
  if (activityRes.error) throw new Error(activityRes.error.message);

  const rawActivity = activityRes.data;
  const activityList = (Array.isArray(rawActivity) ? rawActivity : []) as FundActivity[];
  const activity = activityList.map((a) => ({
    fund_id: a.fund_id,
    total_debit: Number(a.total_debit) || 0,
    total_credit: Number(a.total_credit) || 0,
    line_count: Number(a.line_count) || 0,
  }));

  return {
    funds: (fundsRes.data ?? []) as DonorFund[],
    activity,
    partners: (partnersRes.data ?? []) as { id: string; name: string }[],
    preFundRequests: (preFundRes.data ?? []) as DonorReportsBundle['preFundRequests'],
  };
}

export function useDonorReportsQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.accounting.donorReports(),
    queryFn: fetchDonorReportsBundle,
    enabled,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}
