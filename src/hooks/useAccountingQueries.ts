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

async function sumAccountPriorBalance(accountId: string, beforeDate: string): Promise<number> {
  const { data: prevEntries, error: pErr } = await supabase
    .from('acct_journal_entries')
    .select('id')
    .eq('status', 'posted')
    .lt('posting_date', beforeDate);
  if (pErr) throw new Error(pErr.message);

  let openBal = 0;
  const prevIds = (prevEntries ?? []).map((e) => e.id);
  const PAGE = 1000;
  for (let from = 0; from < prevIds.length; from += PAGE) {
    const batch = prevIds.slice(from, from + PAGE);
    const { data: prevLines } = await supabase
      .from('acct_journal_lines')
      .select('debit_credit, functional_amount')
      .eq('account_id', accountId)
      .in('entry_id', batch);
    for (const l of prevLines ?? []) {
      const amt = Number(l.functional_amount) || 0;
      openBal += l.debit_credit === 'DR' ? amt : -amt;
    }
  }
  return openBal;
}

export async function fetchGlLedger(
  accountId: string,
  startDate: string,
  endDate: string
): Promise<GlLedgerResult> {
  const { data: entriesInPeriod, error: eErr } = await supabase
    .from('acct_journal_entries')
    .select('id, entry_no, posting_date, description_en, description_ar, source_type, status')
    .eq('status', 'posted')
    .gte('posting_date', startDate)
    .lte('posting_date', endDate)
    .order('posting_date')
    .order('entry_no');
  if (eErr) throw new Error(eErr.message);

  const openingBalance = await sumAccountPriorBalance(accountId, startDate);

  const periodEntries = entriesInPeriod ?? [];
  const entryIds = periodEntries.map((e) => e.id);
  const entryMap = Object.fromEntries(periodEntries.map((e) => [e.id, e]));

  const allLines: GlLine[] = [];
  if (entryIds.length > 0) {
    const PAGE = 1000;
    for (let from = 0; from < entryIds.length; from += PAGE) {
      const batch = entryIds.slice(from, from + PAGE);
      const { data: linesData, error: lErr } = await supabase
        .from('acct_journal_lines')
        .select(
          'id, line_no, debit_credit, functional_amount, functional_currency, original_amount, original_currency, description, entry_id'
        )
        .eq('account_id', accountId)
        .in('entry_id', batch)
        .order('entry_id')
        .order('line_no');
      if (lErr) throw new Error(lErr.message);
      for (const l of linesData ?? []) {
        const e = entryMap[l.entry_id];
        if (!e) continue;
        allLines.push({
          entry_id: l.entry_id,
          entry_no: e.entry_no,
          posting_date: e.posting_date,
          description_en: e.description_en,
          description_ar: e.description_ar,
          source_type: e.source_type,
          status: e.status,
          line_no: l.line_no,
          debit_credit: l.debit_credit as 'DR' | 'CR',
          functional_amount: Number(l.functional_amount) || 0,
          functional_currency: l.functional_currency,
          original_amount: Number(l.original_amount) || 0,
          original_currency: l.original_currency,
          line_description: l.description,
        });
      }
    }
  }

  allLines.sort((a, b) => {
    if (a.posting_date !== b.posting_date) return a.posting_date < b.posting_date ? -1 : 1;
    if (a.entry_no !== b.entry_no) return a.entry_no - b.entry_no;
    return a.line_no - b.line_no;
  });

  return { lines: allLines, openingBalance };
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
