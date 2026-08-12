import { useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, Download, RefreshCw, Search, FileDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber, ACCT_FUNCTIONAL_CCY, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import {
  useGlBootstrapQuery,
  useGlLedgerQuery,
} from '@/hooks/useAccountingQueries';
import { useColumnVisibility } from '@/hooks/useColumnVisibility';

const PAGE_SIZE = 100;

export default function AccountingGeneralLedger() {
  const isColVisible = useColumnVisibility('accounting-general-ledger');
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const { countryId: defaultCountryId, loading: acctLoading } = useAccountingCountry();
  const [searchParams] = useSearchParams();

  const bootstrapQuery = useGlBootstrapQuery(allowed && isAuthenticated);
  const accounts = bootstrapQuery.data?.accounts ?? [];
  const years = bootstrapQuery.data?.years ?? [];
  const periods = bootstrapQuery.data?.periods ?? [];
  const countries = bootstrapQuery.data?.countries ?? [];
  const bootstrap = bootstrapQuery.isLoading;

  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [countryInit, setCountryInit] = useState(false);
  const [accountId, setAccountId] = useState<string>('');
  const [periodId, setPeriodId] = useState<string>('');
  const [accountSearch, setAccountSearch] = useState('');
  const [page, setPage] = useState(0);
  const [periodInit, setPeriodInit] = useState(false);

  useEffect(() => {
    if (!acctLoading && !countryInit) {
      setCountryFilter(defaultCountryId ?? 'all');
      setCountryInit(true);
    }
  }, [acctLoading, defaultCountryId, countryInit]);

  useEffect(() => {
    if (periodInit || !bootstrapQuery.data) return;
    const firstOpen = bootstrapQuery.data.periods.find(
      (p) => p.status === 'open' || p.status === 'soft_closed'
    );
    if (firstOpen) setPeriodId(firstOpen.id);
    const preAcct = searchParams.get('account');
    if (preAcct) setAccountId(preAcct);
    setPeriodInit(true);
  }, [bootstrapQuery.data, periodInit, searchParams]);

  const filteredAccounts = useMemo(() => {
    const q = accountSearch.toLowerCase();
    return accounts.filter(a => {
      if (countryFilter !== 'all' && a.country_id !== countryFilter) return false;
      if (!q) return true;
      return a.code.toLowerCase().includes(q) || a.name_en.toLowerCase().includes(q) || (a.name_ar ?? '').includes(q);
    });
  }, [accounts, countryFilter, accountSearch]);

  const selectedPeriod = useMemo(() => periods.find(p => p.id === periodId), [periods, periodId]);
  const selectedAccount = useMemo(() => accounts.find(a => a.id === accountId), [accounts, accountId]);
  const selectedCurrency = useMemo(() => {
    if (!selectedAccount) return ACCT_FUNCTIONAL_CCY;
    const c = countries.find(x => x.id === selectedAccount.country_id);
    return c?.currency_code ?? ACCT_FUNCTIONAL_CCY;
  }, [selectedAccount, countries]);

  const ledgerQuery = useGlLedgerQuery(
    accountId,
    periodId,
    selectedPeriod?.start_date,
    selectedPeriod?.end_date,
    !bootstrap && !!accountId && !!periodId
  );
  const lines = ledgerQuery.data?.lines ?? [];
  const openingBalance = ledgerQuery.data?.openingBalance ?? 0;
  const loading = ledgerQuery.isFetching;
  const error = ledgerQuery.error
    ? ledgerQuery.error instanceof Error
      ? ledgerQuery.error.message
      : 'Failed to load ledger'
    : null;

  const runLedger = () => {
    void ledgerQuery.refetch();
  };

  useEffect(() => { setPage(0); }, [accountId, periodId]);

  // Running balance computation
  const linesWithBalance = useMemo(() => {
    let running = openingBalance;
    return lines.map(l => {
      if (l.debit_credit === 'DR') running += l.functional_amount;
      else running -= l.functional_amount;
      return { ...l, runningBalance: running };
    });
  }, [lines, openingBalance]);

  const paged = useMemo(() => linesWithBalance.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [linesWithBalance, page]);
  const totalPages = Math.ceil(linesWithBalance.length / PAGE_SIZE);

  const closingBalance = linesWithBalance.length > 0 ? linesWithBalance[linesWithBalance.length - 1].runningBalance : openingBalance;
  const totalDR = lines.reduce((s, l) => s + (l.debit_credit === 'DR' ? l.functional_amount : 0), 0);
  const totalCR = lines.reduce((s, l) => s + (l.debit_credit === 'CR' ? l.functional_amount : 0), 0);

  const periodLabel = (id: string) => {
    const p = periods.find(x => x.id === id);
    if (!p) return '—';
    const y = years.find(yy => yy.id === p.fiscal_year_id);
    return `${y?.code ?? '?'} P${String(p.period_no).padStart(2, '0')} · ${format(parseISO(p.start_date), 'MMM d')} – ${format(parseISO(p.end_date), 'MMM d, yyyy')}`;
  };

  const exportExcel = () => {
    if (!selectedAccount || !selectedPeriod) return;
    const rows = linesWithBalance.map(l => ({
      'Date': l.posting_date,
      'Entry#': `JE-${String(l.entry_no).padStart(4, '0')}`,
      'Description': l.line_description ?? l.description_en,
      'Debit': l.debit_credit === 'DR' ? l.functional_amount : 0,
      'Credit': l.debit_credit === 'CR' ? l.functional_amount : 0,
      'Balance': l.runningBalance,
      'Currency': l.functional_currency,
    }));
    
    // Add opening balance as first row
    rows.unshift({
      'Date': selectedPeriod.start_date,
      'Entry#': '',
      'Description': 'Opening Balance',
      'Debit': 0,
      'Credit': 0,
      'Balance': openingBalance,
      'Currency': selectedCurrency,
    });

    // Add closing balance as last row
    rows.push({
      'Date': '',
      'Entry#': '',
      'Description': 'Closing Balance',
      'Debit': totalDR,
      'Credit': totalCR,
      'Balance': closingBalance,
      'Currency': selectedCurrency,
    });

    exportToExcel(rows, 'General Ledger', `general-ledger-${selectedAccount.code}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const exportCsv = () => {
    if (!selectedAccount || !selectedPeriod) return;
    const header = ['Date', 'Entry#', 'Description', 'DR', 'CR', 'Balance', 'Currency'];
    const opening = [selectedPeriod.start_date, '', 'Opening Balance', '', '', formatNumber(openingBalance), selectedCurrency];
    const body = linesWithBalance.map(l => [
      l.posting_date,
      String(l.entry_no),
      l.line_description ?? l.description_en,
      l.debit_credit === 'DR' ? formatNumber(l.functional_amount) : '',
      l.debit_credit === 'CR' ? formatNumber(l.functional_amount) : '',
      formatNumber(l.runningBalance),
      l.functional_currency,
    ]);
    const closing = ['', '', 'Closing Balance', formatNumber(totalDR), formatNumber(totalCR), formatNumber(closingBalance), selectedCurrency];
    downloadCsv(`general-ledger-${selectedAccount.code}-${new Date().toISOString().slice(0, 10)}.csv`, [header, opening, ...body, closing]);
  };

  if (!isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;
  if (bootstrap) return <PageLoader label="Loading general ledger…" />;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="gl-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-indigo-600 text-white shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">General Ledger</h1>
            <p className="text-muted-foreground text-sm">دفتر الأستاذ العام — Per-account transaction history with running balance</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runLedger} disabled={loading || !accountId} data-testid="button-refresh">
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={!lines.length} data-testid="button-export-gl">
            <Download className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!lines.length} data-testid="button-export-csv">
            <FileDown className="h-4 w-4 mr-1" /> CSV
          </Button>
        </div>
      </div>

      <PageInfoBanner
        title="General Ledger"
        description="Shows every posted transaction for a selected account within a fiscal period, with a running balance column. Select an account and period, then click Run Ledger. Use the CSV export for reconciliation or auditor requests."
        descriptionAr="يعرض كل معاملة مرحّلة لحساب محدد خلال فترة مالية مع عمود الرصيد الجاري. اختر الحساب والفترة ثم انقر 'تشغيل دفتر الأستاذ'. استخدم تصدير CSV للتسوية أو طلبات المراجعين."
      />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Country Scope</label>
              <Select value={countryFilter} onValueChange={v => { setCountryFilter(v); setAccountId(''); }}>
                <SelectTrigger data-testid="select-country"><SelectValue placeholder="All countries" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en} ({c.currency_code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Account</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-7 h-9 text-sm"
                  placeholder="Search account..."
                  value={accountSearch}
                  onChange={e => setAccountSearch(e.target.value)}
                  data-testid="input-account-search"
                />
              </div>
              <Select value={accountId} onValueChange={v => { setAccountId(v); setAccountSearch(''); }}>
                <SelectTrigger className="mt-1" data-testid="select-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {filteredAccounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.name_en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fiscal Period</label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger data-testid="select-period"><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => {
                    const y = years.find(yy => yy.id === p.fiscal_year_id);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {y?.code ?? '?'} P{String(p.period_no).padStart(2, '0')} · {format(parseISO(p.start_date), 'MMM d')}–{format(parseISO(p.end_date), 'MMM d, yyyy')}
                        <Badge variant="outline" className={cn('ml-2 text-[10px]', p.status === 'open' ? 'border-emerald-300 text-emerald-700' : 'border-slate-300 text-slate-600')}>{p.status}</Badge>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={runLedger} disabled={loading || !accountId || !periodId} data-testid="button-run">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BookOpen className="h-4 w-4 mr-2" />}
                Run Ledger
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

      {/* Summary cards */}
      {(lines.length > 0 || loading) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Opening Balance', labelAr: 'الرصيد الافتتاحي', value: openingBalance, color: 'text-slate-700' },
            { label: 'Total Debits', labelAr: 'إجمالي المدين', value: totalDR, color: 'text-rose-700' },
            { label: 'Total Credits', labelAr: 'إجمالي الدائن', value: totalCR, color: 'text-emerald-700' },
            { label: 'Closing Balance', labelAr: 'الرصيد الختامي', value: closingBalance, color: Math.abs(closingBalance) < 0.005 ? 'text-slate-500' : closingBalance >= 0 ? 'text-indigo-700' : 'text-rose-700' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-[10px] text-muted-foreground/70">{s.labelAr}</div>
                <div className={cn('text-lg font-bold mt-1', s.color)} data-testid={`text-${s.label.toLowerCase().replace(/ /g, '-')}`}>
                  {loading ? '...' : formatNumber(s.value)}
                  <span className="text-xs font-normal ml-1 text-muted-foreground">{selectedCurrency}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Ledger table */}
      {loading ? (
        <PageLoader compact />
      ) : !accountId ? (
        <div className="text-center text-muted-foreground py-16 text-sm">Select an account and period, then click Run Ledger</div>
      ) : lines.length === 0 && !loading ? (
        <div className="text-center text-muted-foreground py-16 text-sm">No posted transactions found for this account in the selected period.</div>
      ) : (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">
                {selectedAccount?.code} — {selectedAccount?.name_en}
                {selectedAccount?.name_ar && <span className="text-muted-foreground font-normal ml-2" dir="rtl">{selectedAccount.name_ar}</span>}
              </CardTitle>
              <span className="text-xs text-muted-foreground">{lines.length} transaction{lines.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="text-xs text-muted-foreground">{selectedPeriod ? periodLabel(selectedPeriod.id) : ''}</div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Date</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-20">Entry#</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Description</th>
                    {isColVisible('debit') && <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Debit</th>}
                    {isColVisible('credit') && <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Credit</th>}
                    {isColVisible('balance') && <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Balance</th>}
                  </tr>
                </thead>
                <tbody>
                  {/* Opening balance row */}
                  {page === 0 && (
                    <tr className="bg-slate-50 dark:bg-slate-900/40 border-b">
                      <td className="px-4 py-1.5 text-muted-foreground">{selectedPeriod?.start_date}</td>
                      <td className="px-4 py-1.5" />
                      <td className="px-4 py-1.5 italic text-muted-foreground">Opening Balance · الرصيد الافتتاحي</td>
                      {isColVisible('debit') && <td className="px-4 py-1.5 text-right" />}
                      {isColVisible('credit') && <td className="px-4 py-1.5 text-right" />}
                      {isColVisible('balance') && <td className="px-4 py-1.5 text-right font-medium">{formatNumber(openingBalance)}</td>}
                    </tr>
                  )}
                  {paged.map((l, i) => (
                    <tr key={`${l.entry_id}-${l.line_no}`} className={cn('border-b hover:bg-muted/30', i % 2 === 0 ? '' : 'bg-muted/10')}>
                      <td className="px-4 py-1.5">{format(parseISO(l.posting_date), 'MMM d, yyyy')}</td>
                      <td className="px-4 py-1.5 font-mono text-indigo-700 dark:text-indigo-400">JE-{String(l.entry_no).padStart(4, '0')}</td>
                      <td className="px-4 py-1.5">
                        <div>{l.line_description ?? l.description_en}</div>
                        {l.description_ar && <div className="text-muted-foreground text-[10px]" dir="rtl">{l.description_ar}</div>}
                      </td>
                      {isColVisible('debit') && <td className="px-4 py-1.5 text-right text-rose-700 dark:text-rose-400 tabular-nums">{l.debit_credit === 'DR' ? formatNumber(l.functional_amount) : ''}</td>}
                      {isColVisible('credit') && <td className="px-4 py-1.5 text-right text-emerald-700 dark:text-emerald-400 tabular-nums">{l.debit_credit === 'CR' ? formatNumber(l.functional_amount) : ''}</td>}
                      {isColVisible('balance') && <td className={cn('px-4 py-1.5 text-right font-medium tabular-nums', l.runningBalance < 0 ? 'text-rose-700' : 'text-slate-700 dark:text-slate-300')}>{formatNumber(l.runningBalance)}</td>}
                    </tr>
                  ))}
                  {/* Closing balance row on last page */}
                  {page === totalPages - 1 && (
                    <tr className="bg-indigo-50 dark:bg-indigo-950/30 border-t-2 border-indigo-200 dark:border-indigo-800">
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2 font-semibold text-indigo-700 dark:text-indigo-400">Closing Balance · الرصيد الختامي</td>
                      {isColVisible('debit') && <td className="px-4 py-2 text-right font-semibold text-rose-700 tabular-nums">{formatNumber(totalDR)}</td>}
                      {isColVisible('credit') && <td className="px-4 py-2 text-right font-semibold text-emerald-700 tabular-nums">{formatNumber(totalCR)}</td>}
                      {isColVisible('balance') && <td className="px-4 py-2 text-right font-bold tabular-nums text-indigo-700 dark:text-indigo-400">{formatNumber(closingBalance)}</td>}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t text-xs text-muted-foreground">
                <span>Page {page + 1} of {totalPages} ({lines.length} rows)</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} data-testid="button-prev-page">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} data-testid="button-next-page">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
