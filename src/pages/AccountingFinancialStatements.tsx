import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, FileText, Download, RefreshCw, TrendingUp, Scale } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv, ACCT_FUNCTIONAL_CCY } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';

interface TbRow {
  account_id: string; account_code: string; account_name_en: string; account_name_ar: string;
  debit_total: number; credit_total: number; net_balance: number;
}
interface AccountMeta { id: string; account_type: string; subtype: string; country_id: string | null }
interface FiscalYear { id: string; code: string }
interface Period { id: string; period_no: number; start_date: string; end_date: string; status: string; fiscal_year_id: string }
interface Fund { id: string; code: string; name_en: string; name_ar: string }
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null; currency_code: string }

// Sign convention:
//   asset/expense → debit-normal → positive net = debit > credit
//   liability/equity/revenue → credit-normal → positive net = credit > debit
function netBalance(row: TbRow, type: string): number {
  const dr = Number(row.debit_total) || 0;
  const cr = Number(row.credit_total) || 0;
  if (type === 'asset' || type === 'expense') return dr - cr;
  return cr - dr;
}

export default function AccountingFinancialStatements() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const { countryId: defaultCountryId, loading: acctLoading } = useAccountingCountry();

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [accountsMeta, setAccountsMeta] = useState<Record<string, AccountMeta>>({});
  const [periodId, setPeriodId] = useState('');
  const [fundId, setFundId] = useState('all');
  const [countryFilter, setCountryFilter] = useState('all');
  const [countryInit, setCountryInit] = useState(false);
  const [tb, setTb] = useState<TbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!acctLoading && !countryInit) {
      setCountryFilter(defaultCountryId ?? 'all');
      setCountryInit(true);
    }
  }, [acctLoading, defaultCountryId, countryInit]);

  useEffect(() => {
    (async () => {
      const [yRes, pRes, fRes, aRes, cRes] = await Promise.all([
        supabase.from('acct_fiscal_years').select('id, code').order('code', { ascending: false }),
        supabase.from('acct_fiscal_periods').select('id, period_no, start_date, end_date, status, fiscal_year_id').order('start_date', { ascending: false }),
        supabase.from('acct_funds').select('id, code, name_en, name_ar').eq('is_active', true).order('code'),
        supabase.from('acct_accounts').select('id, account_type, subtype, country_id'),
        supabase.from('countries').select('id, code, name_en, flag_emoji, currency_code').eq('is_active', true).order('name_en'),
      ]);
      setYears((yRes.data ?? []) as FiscalYear[]);
      setPeriods((pRes.data ?? []) as Period[]);
      setFunds((fRes.data ?? []) as Fund[]);
      setCountries((cRes.data ?? []) as Country[]);
      const am: Record<string, AccountMeta> = {};
      for (const a of (aRes.data ?? [])) am[a.id] = a as AccountMeta;
      setAccountsMeta(am);
      const firstOpen = (pRes.data ?? []).find((p: any) => p.status === 'open' || p.status === 'soft_closed');
      if (firstOpen) setPeriodId(firstOpen.id);
      setBootstrap(false);
    })();
  }, []);

  const runReport = useCallback(async () => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('acct_trial_balance' as any, {
      p_period_id: periodId,
      p_branch_id: null,
      p_fund_id: fundId === 'all' ? null : fundId,
    } as any);
    if (err) setError(err.message);
    setTb((data ?? []) as TbRow[]);
    setLoading(false);
  }, [periodId, fundId]);

  useEffect(() => { if (!bootstrap && periodId) void runReport(); }, [periodId, fundId, bootstrap]);

  const selectedPeriod = useMemo(() => periods.find(p => p.id === periodId), [periods, periodId]);

  const periodLabel = (id: string) => {
    const p = periods.find(x => x.id === id);
    if (!p) return '—';
    const y = years.find(yy => yy.id === p.fiscal_year_id);
    return `${y?.code ?? '?'} P${String(p.period_no).padStart(2, '0')} · ${format(parseISO(p.start_date), 'MMM d')} – ${format(parseISO(p.end_date), 'MMM d, yyyy')}`;
  };

  const filteredTb = useMemo(() => {
    if (countryFilter === 'all') return tb;
    return tb.filter(r => {
      const meta = accountsMeta[r.account_id];
      return meta?.country_id === countryFilter;
    });
  }, [tb, countryFilter, accountsMeta]);

  // Income Statement data
  const incomeData = useMemo(() => {
    const revenue: TbRow[] = [];
    const expenses: TbRow[] = [];
    for (const r of filteredTb) {
      const meta = accountsMeta[r.account_id];
      if (!meta) continue;
      if (meta.account_type === 'revenue') revenue.push(r);
      else if (meta.account_type === 'expense') expenses.push(r);
    }
    const totalRevenue = revenue.reduce((s, r) => s + netBalance(r, 'revenue'), 0);
    const totalExpenses = expenses.reduce((s, r) => s + netBalance(r, 'expense'), 0);
    const netSurplus = totalRevenue - totalExpenses;
    return { revenue, expenses, totalRevenue, totalExpenses, netSurplus };
  }, [filteredTb, accountsMeta]);

  // Balance Sheet data
  const bsData = useMemo(() => {
    const assets: TbRow[] = [];
    const liabilities: TbRow[] = [];
    const equity: TbRow[] = [];
    for (const r of filteredTb) {
      const meta = accountsMeta[r.account_id];
      if (!meta) continue;
      if (meta.account_type === 'asset') assets.push(r);
      else if (meta.account_type === 'liability') liabilities.push(r);
      else if (meta.account_type === 'equity') equity.push(r);
    }
    const totalAssets = assets.reduce((s, r) => s + netBalance(r, 'asset'), 0);
    const totalLiabilities = liabilities.reduce((s, r) => s + netBalance(r, 'liability'), 0);
    const totalEquity = equity.reduce((s, r) => s + netBalance(r, 'equity'), 0);
    const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity + incomeData.netSurplus)) < 0.01;
    return { assets, liabilities, equity, totalAssets, totalLiabilities, totalEquity, isBalanced };
  }, [filteredTb, accountsMeta, incomeData.netSurplus]);

  const selectedCurrency = useMemo(() => {
    if (countryFilter === 'all') return ACCT_FUNCTIONAL_CCY;
    const c = countries.find(x => x.id === countryFilter);
    return c?.currency_code ?? ACCT_FUNCTIONAL_CCY;
  }, [countryFilter, countries]);

  const exportIncomeStatementCsv = () => {
    const header = ['Account Code', 'Name (EN)', 'Name (AR)', 'Amount'];
    const rows: (string | number)[][] = [
      ['', '=== REVENUE ===', 'الإيرادات ===', ''],
      ...incomeData.revenue.map(r => [r.account_code, r.account_name_en, r.account_name_ar, formatNumber(netBalance(r, 'revenue'))]),
      ['', 'Total Revenue', 'إجمالي الإيرادات', formatNumber(incomeData.totalRevenue)],
      ['', '', '', ''],
      ['', '=== EXPENSES ===', 'المصروفات ===', ''],
      ...incomeData.expenses.map(r => [r.account_code, r.account_name_en, r.account_name_ar, formatNumber(netBalance(r, 'expense'))]),
      ['', 'Total Expenses', 'إجمالي المصروفات', formatNumber(incomeData.totalExpenses)],
      ['', '', '', ''],
      ['', 'NET SURPLUS / DEFICIT', 'صافي الفائض / العجز', formatNumber(incomeData.netSurplus)],
    ];
    downloadCsv(`income-statement-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const exportBalanceSheetCsv = () => {
    const header = ['Account Code', 'Name (EN)', 'Name (AR)', 'Amount'];
    const rows: (string | number)[][] = [
      ['', '=== ASSETS ===', 'الأصول ===', ''],
      ...bsData.assets.map(r => [r.account_code, r.account_name_en, r.account_name_ar, formatNumber(netBalance(r, 'asset'))]),
      ['', 'Total Assets', 'إجمالي الأصول', formatNumber(bsData.totalAssets)],
      ['', '', '', ''],
      ['', '=== LIABILITIES ===', 'الالتزامات ===', ''],
      ...bsData.liabilities.map(r => [r.account_code, r.account_name_en, r.account_name_ar, formatNumber(netBalance(r, 'liability'))]),
      ['', 'Total Liabilities', 'إجمالي الالتزامات', formatNumber(bsData.totalLiabilities)],
      ['', '', '', ''],
      ['', '=== NET ASSETS / EQUITY ===', 'صافي الأصول / حقوق الملكية ===', ''],
      ...bsData.equity.map(r => [r.account_code, r.account_name_en, r.account_name_ar, formatNumber(netBalance(r, 'equity'))]),
      ['', 'Period Surplus/(Deficit)', 'فائض/(عجز) الفترة', formatNumber(incomeData.netSurplus)],
      ['', 'Total Net Assets', 'إجمالي صافي الأصول', formatNumber(bsData.totalEquity + incomeData.netSurplus)],
    ];
    downloadCsv(`balance-sheet-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  const exportPdf = async (type: 'income' | 'balance') => {
    setPdfBusy(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      const title = type === 'income' ? 'Income Statement' : 'Balance Sheet';
      const titleAr = type === 'income' ? 'قائمة الدخل' : 'الميزانية العمومية';
      doc.setFontSize(14);
      doc.text(title, 14, 16);
      doc.setFontSize(9);
      doc.text(`${titleAr} · Period: ${periodLabel(periodId)}`, 14, 22);
      doc.text(`Currency: ${selectedCurrency} · Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 27);

      if (type === 'income') {
        autoTable(doc, {
          startY: 33,
          head: [['Code', 'Account', 'Amount']],
          body: [
            [{ content: 'REVENUE · الإيرادات', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [239, 246, 255] } }],
            ...incomeData.revenue.map(r => [r.account_code, r.account_name_en, formatNumber(netBalance(r, 'revenue'))]),
            ['', 'Total Revenue', formatNumber(incomeData.totalRevenue)],
            [{ content: 'EXPENSES · المصروفات', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [255, 247, 237] } }],
            ...incomeData.expenses.map(r => [r.account_code, r.account_name_en, formatNumber(netBalance(r, 'expense'))]),
            ['', 'Total Expenses', formatNumber(incomeData.totalExpenses)],
            [{ content: `NET SURPLUS / (DEFICIT): ${formatNumber(incomeData.netSurplus)} ${selectedCurrency}`, colSpan: 3, styles: { fontStyle: 'bold', fillColor: incomeData.netSurplus >= 0 ? [240, 253, 244] : [255, 241, 242] } }],
          ],
          styles: { fontSize: 8 },
          headStyles: { fillColor: [79, 70, 229] },
          columnStyles: { 2: { halign: 'right' } },
        });
      } else {
        autoTable(doc, {
          startY: 33,
          head: [['Code', 'Account', 'Amount']],
          body: [
            [{ content: 'ASSETS · الأصول', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [240, 253, 244] } }],
            ...bsData.assets.map(r => [r.account_code, r.account_name_en, formatNumber(netBalance(r, 'asset'))]),
            ['', 'Total Assets', formatNumber(bsData.totalAssets)],
            [{ content: 'LIABILITIES · الالتزامات', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [255, 241, 242] } }],
            ...bsData.liabilities.map(r => [r.account_code, r.account_name_en, formatNumber(netBalance(r, 'liability'))]),
            ['', 'Total Liabilities', formatNumber(bsData.totalLiabilities)],
            [{ content: 'NET ASSETS / EQUITY · صافي الأصول', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [245, 243, 255] } }],
            ...bsData.equity.map(r => [r.account_code, r.account_name_en, formatNumber(netBalance(r, 'equity'))]),
            ['', 'Period Surplus/(Deficit)', formatNumber(incomeData.netSurplus)],
            ['', 'Total Net Assets', formatNumber(bsData.totalEquity + incomeData.netSurplus)],
          ],
          styles: { fontSize: 8 },
          headStyles: { fillColor: [79, 70, 229] },
          columnStyles: { 2: { halign: 'right' } },
        });
      }
      doc.save(`${type === 'income' ? 'income-statement' : 'balance-sheet'}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const StatementSection = ({ rows, type, title, titleAr, totalLabel, totalLabelAr, total, accentClass }: {
    rows: TbRow[]; type: string; title: string; titleAr: string;
    totalLabel: string; totalLabelAr: string; total: number; accentClass: string;
  }) => (
    <div className="mb-4">
      <div className={cn('px-3 py-2 rounded-t-md font-semibold text-sm flex items-center justify-between', accentClass)}>
        <span>{title}</span>
        <span className="text-xs font-normal" dir="rtl">{titleAr}</span>
      </div>
      {rows.length === 0 ? (
        <div className="border border-t-0 rounded-b-md px-3 py-3 text-sm text-muted-foreground">No accounts with activity in this period.</div>
      ) : (
        <table className="w-full text-xs border border-t-0 rounded-b-md overflow-hidden">
          <tbody>
            {rows.map(r => {
              const nb = netBalance(r, type);
              return (
                <tr key={r.account_id} className="border-b last:border-b-0 hover:bg-muted/20">
                  <td className="px-3 py-1.5 font-mono text-muted-foreground w-24">{r.account_code}</td>
                  <td className="px-3 py-1.5">
                    <div>{r.account_name_en}</div>
                    {r.account_name_ar && <div className="text-[10px] text-muted-foreground" dir="rtl">{r.account_name_ar}</div>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatNumber(nb)}</td>
                </tr>
              );
            })}
            <tr className="bg-muted/40 font-semibold">
              <td colSpan={2} className="px-3 py-2 text-sm">
                {totalLabel} · <span className="text-muted-foreground font-normal text-xs" dir="rtl">{totalLabelAr}</span>
              </td>
              <td className="px-3 py-2 text-right text-sm tabular-nums">{formatNumber(total)} <span className="text-xs text-muted-foreground font-normal">{selectedCurrency}</span></td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="financial-statements-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-violet-600 text-white shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Financial Statements</h1>
            <p className="text-muted-foreground text-sm">القوائم المالية — Income Statement & Balance Sheet</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={runReport} disabled={loading || !periodId} data-testid="button-refresh">
          <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      <PageInfoBanner
        title="Financial Statements"
        description="Generates the Income Statement (Revenue - Expenses = Net Surplus/Deficit) and Balance Sheet (Assets = Liabilities + Net Assets) for a selected fiscal period and fund scope. Both statements can be exported as PDF or CSV for donor and audit reports."
        descriptionAr="يولّد قائمة الدخل (الإيرادات - المصروفات = صافي الفائض/العجز) والميزانية العمومية (الأصول = الالتزامات + صافي الأصول) للفترة المالية ونطاق الصندوق المحددين. يمكن تصدير كلتا القائمتين كـ PDF أو CSV لتقارير المانحين والمراجعة."
      />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Country Scope</label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger data-testid="select-country"><SelectValue placeholder="All countries" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en} ({c.currency_code})</SelectItem>)}
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
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fund</label>
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger data-testid="select-fund"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Funds</SelectItem>
                  {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.code} — {f.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !periodId ? (
        <div className="text-center text-muted-foreground py-16 text-sm">Select a fiscal period to generate financial statements</div>
      ) : (
        <Tabs defaultValue="income">
          <TabsList className="mb-4">
            <TabsTrigger value="income" data-testid="tab-income"><TrendingUp className="h-3.5 w-3.5 mr-1.5" />Income Statement · قائمة الدخل</TabsTrigger>
            <TabsTrigger value="balance" data-testid="tab-balance"><Scale className="h-3.5 w-3.5 mr-1.5" />Balance Sheet · الميزانية العمومية</TabsTrigger>
          </TabsList>

          {/* Income Statement */}
          <TabsContent value="income">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">Income Statement · قائمة الدخل</h2>
                <p className="text-xs text-muted-foreground">{periodLabel(periodId)} · {selectedCurrency}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportIncomeStatementCsv} disabled={!tb.length} data-testid="button-export-is-csv">
                  <Download className="h-3.5 w-3.5 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportPdf('income')} disabled={!tb.length || pdfBusy} data-testid="button-export-is-pdf">
                  {pdfBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />} PDF
                </Button>
              </div>
            </div>

            <StatementSection
              rows={incomeData.revenue} type="revenue"
              title="Revenue" titleAr="الإيرادات"
              totalLabel="Total Revenue" totalLabelAr="إجمالي الإيرادات"
              total={incomeData.totalRevenue} accentClass="bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"
            />
            <StatementSection
              rows={incomeData.expenses} type="expense"
              title="Expenses" titleAr="المصروفات"
              totalLabel="Total Expenses" totalLabelAr="إجمالي المصروفات"
              total={incomeData.totalExpenses} accentClass="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
            />

            {/* Net surplus */}
            <div className={cn(
              'rounded-md p-4 flex items-center justify-between',
              incomeData.netSurplus >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800' : 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800'
            )}>
              <div>
                <div className="font-bold text-sm">Net Surplus / (Deficit)</div>
                <div className="text-xs text-muted-foreground" dir="rtl">صافي الفائض / (العجز)</div>
              </div>
              <div className={cn('text-2xl font-bold', incomeData.netSurplus >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                {incomeData.netSurplus < 0 && '('}
                {formatNumber(Math.abs(incomeData.netSurplus))}
                {incomeData.netSurplus < 0 && ')'}
                <span className="text-sm font-normal ml-1 text-muted-foreground">{selectedCurrency}</span>
              </div>
            </div>
          </TabsContent>

          {/* Balance Sheet */}
          <TabsContent value="balance">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-lg font-semibold">Balance Sheet · الميزانية العمومية</h2>
                <p className="text-xs text-muted-foreground">{selectedPeriod ? `As of ${format(parseISO(selectedPeriod.end_date), 'MMMM d, yyyy')}` : ''} · {selectedCurrency}</p>
              </div>
              <div className="flex items-center gap-2">
                {tb.length > 0 && (
                  <Badge variant={bsData.isBalanced ? 'default' : 'destructive'} className={bsData.isBalanced ? 'bg-emerald-600' : ''}>
                    {bsData.isBalanced ? '✓ Balanced' : '⚠ Imbalanced'}
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={exportBalanceSheetCsv} disabled={!tb.length} data-testid="button-export-bs-csv">
                  <Download className="h-3.5 w-3.5 mr-1" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={() => exportPdf('balance')} disabled={!tb.length || pdfBusy} data-testid="button-export-bs-pdf">
                  {pdfBusy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />} PDF
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Assets */}
              <div>
                <StatementSection
                  rows={bsData.assets} type="asset"
                  title="Assets" titleAr="الأصول"
                  totalLabel="Total Assets" totalLabelAr="إجمالي الأصول"
                  total={bsData.totalAssets} accentClass="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                />
              </div>
              {/* Liabilities + Net Assets */}
              <div>
                <StatementSection
                  rows={bsData.liabilities} type="liability"
                  title="Liabilities" titleAr="الالتزامات"
                  totalLabel="Total Liabilities" totalLabelAr="إجمالي الالتزامات"
                  total={bsData.totalLiabilities} accentClass="bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                />
                <StatementSection
                  rows={bsData.equity} type="equity"
                  title="Net Assets / Equity" titleAr="صافي الأصول / حقوق الملكية"
                  totalLabel="Equity Total" totalLabelAr="إجمالي حقوق الملكية"
                  total={bsData.totalEquity} accentClass="bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300"
                />
                {/* Period net surplus added to equity side */}
                <div className="mb-2 border rounded-md px-3 py-2 flex items-center justify-between bg-muted/30 text-xs">
                  <span className="text-muted-foreground">+ Period Surplus/(Deficit) · فائض/(عجز) الفترة</span>
                  <span className={cn('font-semibold', incomeData.netSurplus >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                    {formatNumber(incomeData.netSurplus)} {selectedCurrency}
                  </span>
                </div>
                {/* Total L + E */}
                <div className="rounded-md bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 px-3 py-2 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm">Total Liabilities + Net Assets</div>
                    <div className="text-xs text-muted-foreground">إجمالي الالتزامات + صافي الأصول</div>
                  </div>
                  <div className="text-lg font-bold text-violet-700 dark:text-violet-400">
                    {formatNumber(bsData.totalLiabilities + bsData.totalEquity + incomeData.netSurplus)} <span className="text-xs font-normal text-muted-foreground">{selectedCurrency}</span>
                  </div>
                </div>
              </div>
            </div>

            {!bsData.isBalanced && tb.length > 0 && (
              <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-800 dark:text-amber-300">
                <strong>Imbalance detected:</strong> Assets ({formatNumber(bsData.totalAssets)}) ≠ Liabilities + Net Assets ({formatNumber(bsData.totalLiabilities + bsData.totalEquity + incomeData.netSurplus)}). This may indicate missing journal entries or un-posted transactions.
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
