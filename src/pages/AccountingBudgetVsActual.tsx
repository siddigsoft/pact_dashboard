import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, BarChart2, Download, RefreshCw, Pencil, Check, X, Plus } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface TbRow { account_id: string; account_code: string; account_name_en: string; account_name_ar: string; debit_total: number; credit_total: number; net_balance: number }
interface AccountMeta { id: string; code: string; name_en: string; name_ar: string; account_type: string; country_id: string | null }
interface FiscalYear { id: string; code: string }
interface Period { id: string; period_no: number; start_date: string; end_date: string; status: string; fiscal_year_id: string }
interface Fund { id: string; code: string; name_en: string }
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null; currency_code: string }
interface BudgetLine { id: string; account_id: string; period_id: string | null; fund_id: string | null; budget_amount: number }

interface BvARow {
  account_id: string; account_code: string; account_name_en: string; account_name_ar: string;
  account_type: string; budget: number; actual: number; encumbrance: number; variance: number; pct: number;
  budgetLineId: string | null;
}

function usageBand(pct: number): 'ok' | 'warn' | 'over' {
  if (pct > 100) return 'over';
  if (pct >= 85) return 'warn';
  return 'ok';
}

export default function AccountingBudgetVsActual() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canEdit = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);
  const { countryId: defaultCountryId, loading: acctLoading } = useAccountingCountry();
  const { toast } = useToast();

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
  const [budgetLines, setBudgetLines] = useState<BudgetLine[]>([]);
  const [encMap, setEncMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'revenue'>('all');
  const [search, setSearch] = useState('');

  // Inline budget edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!acctLoading && !countryInit) { setCountryFilter(defaultCountryId ?? 'all'); setCountryInit(true); }
  }, [acctLoading, defaultCountryId, countryInit]);

  useEffect(() => {
    (async () => {
      const [yRes, pRes, fRes, aRes, cRes] = await Promise.all([
        supabase.from('acct_fiscal_years').select('id, code').order('code', { ascending: false }),
        supabase.from('acct_fiscal_periods').select('id, period_no, start_date, end_date, status, fiscal_year_id').order('start_date', { ascending: false }),
        supabase.from('acct_funds').select('id, code, name_en').eq('is_active', true).order('code'),
        supabase.from('acct_accounts').select('id, code, name_en, name_ar, account_type, country_id').order('code'),
        supabase.from('countries').select('id, code, name_en, flag_emoji, currency_code').eq('is_active', true).order('name_en'),
      ]);
      setYears((yRes.data ?? []) as FiscalYear[]);
      setPeriods((pRes.data ?? []) as Period[]);
      setFunds((fRes.data ?? []) as Fund[]);
      setCountries((cRes.data ?? []) as Country[]);
      const am: Record<string, AccountMeta> = {};
      for (const a of (aRes.data ?? [])) am[a.id] = a as AccountMeta;
      setAccountsMeta(am);
      const first = (pRes.data ?? []).find((p: any) => p.status === 'open' || p.status === 'soft_closed');
      if (first) setPeriodId(first.id);
      setBootstrap(false);
    })();
  }, []);

  const loadBudgetLines = useCallback(async (pid: string, fid: string) => {
    const q = supabase.from('acct_budget_lines').select('id, account_id, period_id, fund_id, budget_amount').eq('period_id', pid);
    if (fid !== 'all') q.eq('fund_id', fid);
    const { data, error: bErr } = await q;
    if (bErr && bErr.code !== '42P01') throw new Error(bErr.message);
    setBudgetLines((data ?? []) as BudgetLine[]);
  }, []);

  const runReport = useCallback(async () => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    try {
      const encQ = supabase.from('acct_budget_encumbrances' as any).select('account_id, amount').eq('status', 'open').limit(5000);
      if (fundId !== 'all') (encQ as any).eq('fund_id', fundId);
      const [tbRes, encRes] = await Promise.all([
        supabase.rpc('acct_trial_balance' as any, { p_period_id: periodId, p_branch_id: null, p_fund_id: fundId === 'all' ? null : fundId } as any),
        encQ,
        loadBudgetLines(periodId, fundId),
      ]);
      if (tbRes.error) { setError(tbRes.error.message); return; }
      setTb((tbRes.data ?? []) as TbRow[]);
      const newEncMap: Record<string, number> = {};
      if (!encRes.error || encRes.error.code === '42P01') {
        for (const e of ((encRes.data ?? []) as any[])) {
          newEncMap[e.account_id] = (newEncMap[e.account_id] ?? 0) + Number(e.amount ?? 0);
        }
      }
      setEncMap(newEncMap);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [periodId, fundId, loadBudgetLines]);

  useEffect(() => { if (!bootstrap && periodId) void runReport(); }, [periodId, fundId, bootstrap]);

  const selectedPeriod = useMemo(() => periods.find(p => p.id === periodId), [periods, periodId]);
  const selectedCurrency = useMemo(() => { const c = countries.find(x => x.id === countryFilter); return c?.currency_code ?? 'SDG'; }, [countryFilter, countries]);

  const periodLabel = (id: string) => {
    const p = periods.find(x => x.id === id); if (!p) return '—';
    const y = years.find(yy => yy.id === p.fiscal_year_id);
    return `${y?.code ?? '?'} P${String(p.period_no).padStart(2, '0')} · ${format(parseISO(p.start_date), 'MMM d')}–${format(parseISO(p.end_date), 'MMM d, yyyy')}`;
  };

  // Net balance sign convention
  const actualBalance = (row: TbRow) => {
    const meta = accountsMeta[row.account_id];
    const t = meta?.account_type ?? '';
    if (t === 'asset' || t === 'expense') return Number(row.debit_total) - Number(row.credit_total);
    return Number(row.credit_total) - Number(row.debit_total);
  };

  const budgetMap = useMemo(() => {
    const m: Record<string, BudgetLine> = {};
    for (const b of budgetLines) m[b.account_id] = b;
    return m;
  }, [budgetLines]);

  const rows: BvARow[] = useMemo(() => {
    const seen = new Set<string>();
    const result: BvARow[] = [];
    const allAccountIds = new Set([...tb.map(r => r.account_id), ...budgetLines.map(b => b.account_id)]);
    for (const aid of allAccountIds) {
      const meta = accountsMeta[aid]; if (!meta) continue;
      if (countryFilter !== 'all' && meta.country_id !== countryFilter) continue;
      if (typeFilter !== 'all' && meta.account_type !== typeFilter) continue;
      const q = search.toLowerCase();
      if (q && !meta.code.toLowerCase().includes(q) && !meta.name_en.toLowerCase().includes(q)) continue;
      if (seen.has(aid)) continue;
      seen.add(aid);
      const tbRow = tb.find(r => r.account_id === aid);
      const actual = tbRow ? actualBalance(tbRow) : 0;
      const bl = budgetMap[aid];
      const budget = bl?.budget_amount ?? 0;
      const encumbrance = encMap[aid] ?? 0;
      const variance = budget - actual - encumbrance;
      const pct = budget > 0 ? Math.round(((actual + encumbrance) / budget) * 100) : actual > 0 ? 999 : 0;
      result.push({ account_id: aid, account_code: meta.code, account_name_en: meta.name_en, account_name_ar: meta.name_ar ?? '', account_type: meta.account_type, budget, actual, encumbrance, variance, pct, budgetLineId: bl?.id ?? null });
    }
    return result.sort((a, b) => a.account_code.localeCompare(b.account_code));
  }, [tb, budgetLines, accountsMeta, countryFilter, typeFilter, search, budgetMap, encMap]);

  const totals = useMemo(() => {
    const b = rows.reduce((s, r) => s + r.budget, 0);
    const a = rows.reduce((s, r) => s + r.actual, 0);
    const e = rows.reduce((s, r) => s + r.encumbrance, 0);
    return { budget: b, actual: a, encumbrance: e, variance: b - a - e, pct: b > 0 ? Math.round(((a + e) / b) * 100) : 0 };
  }, [rows]);

  // Inline budget save
  const startEdit = (row: BvARow) => { if (!canEdit) return; setEditingId(row.account_id); setEditValue(String(row.budget)); };
  const cancelEdit = () => { setEditingId(null); setEditValue(''); };
  const saveBudget = async (row: BvARow) => {
    const amt = parseFloat(editValue);
    if (isNaN(amt) || !periodId) return;
    setSaving(true);
    try {
      if (row.budgetLineId) {
        const { error } = await supabase.from('acct_budget_lines').update({ budget_amount: amt }).eq('id', row.budgetLineId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('acct_budget_lines').insert({ account_id: row.account_id, period_id: periodId, fund_id: fundId === 'all' ? null : fundId, fiscal_year_id: selectedPeriod?.fiscal_year_id ?? null, budget_amount: amt });
        if (error) throw error;
      }
      toast({ title: 'Budget saved' });
      cancelEdit();
      await loadBudgetLines(periodId, fundId);
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const exportCsv = () => {
    const header = ['Code', 'Account', 'Type', 'Budget', 'Actual', 'Encumbered', 'Available', '% Used'];
    const body = rows.map(r => [r.account_code, r.account_name_en, r.account_type, r.budget.toFixed(2), r.actual.toFixed(2), r.encumbrance.toFixed(2), r.variance.toFixed(2), `${r.pct}%`]);
    const footer = ['', 'TOTAL', '', totals.budget.toFixed(2), totals.actual.toFixed(2), totals.encumbrance.toFixed(2), totals.variance.toFixed(2), `${totals.pct}%`];
    downloadCsv(`budget-vs-actual-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body, footer]);
  };

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
      doc.setFontSize(14); doc.text('Budget vs. Actual', 14, 16);
      doc.setFontSize(9); doc.text(`Period: ${periodLabel(periodId)} · Currency: ${selectedCurrency} · Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22);
      autoTable(doc, {
        startY: 28,
        head: [['Code', 'Account', 'Type', 'Budget', 'Actual', 'Encumbered', 'Available', '% Used']],
        body: [
          ...rows.map(r => [r.account_code, r.account_name_en, r.account_type, formatNumber(r.budget), formatNumber(r.actual), formatNumber(r.encumbrance), formatNumber(r.variance), `${r.pct}%`]),
          ['', 'TOTAL', '', formatNumber(totals.budget), formatNumber(totals.actual), formatNumber(totals.encumbrance), formatNumber(totals.variance), `${totals.pct}%`],
        ],
        styles: { fontSize: 7.5 },
        headStyles: { fillColor: [79, 70, 229] },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
        didDrawCell: (data: any) => {
          if (data.column.index === 7 && data.section === 'body') {
            const pct = parseInt(data.cell.text[0] ?? '0');
            if (pct > 100) { data.cell.styles.textColor = [185, 28, 28]; data.cell.styles.fontStyle = 'bold'; }
            else if (pct >= 85) { data.cell.styles.textColor = [180, 83, 9]; }
          }
        },
      });
      doc.save(`budget-vs-actual-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setPdfBusy(false); }
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="bva-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-amber-600 text-white shrink-0">
            <BarChart2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Budget vs. Actual</h1>
            <p className="text-muted-foreground text-sm">الميزانية مقابل الفعلي — Track spend against approved budgets</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runReport} disabled={loading} data-testid="button-refresh">
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={!rows.length || pdfBusy} data-testid="button-export-pdf">
            {pdfBusy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}PDF
          </Button>
        </div>
      </div>

      <PageInfoBanner
        title="Budget vs. Actual"
        description="Compare approved budgets to actual expenditure by account. Click the pencil icon on any row to set or update the budget amount inline. Rows with no budget show actual spend only. Red rows are over budget (>100%). Amber rows are approaching budget (≥85%). Run supabase/budget_lines_migration.sql first if the budget column shows errors."
        descriptionAr="قارن الميزانيات المعتمدة بالإنفاق الفعلي حسب الحساب. انقر على أيقونة القلم في أي صف لتعيين مبلغ الميزانية أو تحديثه. الصفوف الحمراء تجاوزت الميزانية (>100%). الصفوف الكهرمانية تقترب من الميزانية (≥85%)."
      />

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Country Scope</label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger data-testid="select-country"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}
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
                    return <SelectItem key={p.id} value={p.id}>{y?.code ?? '?'} P{String(p.period_no).padStart(2, '0')} · {format(parseISO(p.start_date), 'MMM d')}–{format(parseISO(p.end_date), 'MMM d, yyyy')}</SelectItem>;
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
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Type</label>
              <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
                <SelectTrigger data-testid="select-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="revenue">Revenue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Search</label>
              <Input className="h-9 text-sm" placeholder="Code or name..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: 'Total Budget', v: totals.budget, color: 'text-indigo-700 dark:text-indigo-400' },
            { label: 'Total Actual', v: totals.actual, color: 'text-slate-700 dark:text-slate-300' },
            { label: 'Variance', v: totals.variance, color: totals.variance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400' },
            { label: '% Utilized', v: null, pct: totals.pct, color: totals.pct > 100 ? 'text-rose-700' : totals.pct >= 85 ? 'text-amber-700' : 'text-emerald-700' },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={cn('text-lg font-bold mt-1', s.color)}>
                  {s.v !== null ? formatNumber(s.v) : `${s.pct}%`}
                  {s.v !== null && <span className="text-xs font-normal ml-1 text-muted-foreground">{selectedCurrency}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !periodId ? (
        <div className="text-center text-muted-foreground py-16 text-sm">Select a fiscal period to run the report</div>
      ) : rows.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 text-sm">No accounts with activity or budgets found for this period. Try changing the filters.</div>
      ) : (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{rows.length} account{rows.length !== 1 ? 's' : ''}</CardTitle>
              {canEdit && <span className="text-xs text-muted-foreground flex items-center gap-1"><Pencil className="h-3 w-3" />Click any budget cell to edit</span>}
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Code</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Account</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Type</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Budget</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Actual</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Encumbered</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Available</th>
                    <th className="text-right px-4 py-2 font-medium text-muted-foreground w-24">% Used</th>
                    {canEdit && <th className="px-4 py-2 w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const band = usageBand(row.pct);
                    const isEditing = editingId === row.account_id;
                    return (
                      <tr key={row.account_id} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')}>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{row.account_code}</td>
                        <td className="px-4 py-2">
                          <div>{row.account_name_en}</div>
                          {row.account_name_ar && <div className="text-[10px] text-muted-foreground" dir="rtl">{row.account_name_ar}</div>}
                        </td>
                        <td className="px-4 py-2 capitalize text-muted-foreground">{row.account_type}</td>
                        <td className="px-4 py-2 text-right">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Input autoFocus className="h-7 w-28 text-right text-xs" type="number" value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') saveBudget(row); if (e.key === 'Escape') cancelEdit(); }} data-testid={`input-budget-${row.account_id}`} />
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-emerald-600" onClick={() => saveBudget(row)} disabled={saving}><Check className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground" onClick={cancelEdit}><X className="h-3 w-3" /></Button>
                            </div>
                          ) : (
                            <span className={cn('tabular-nums', row.budget === 0 ? 'text-muted-foreground/50 italic' : 'font-medium')}>
                              {row.budget === 0 ? '—' : formatNumber(row.budget)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(row.actual)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">
                          {row.encumbrance === 0 ? <span className="text-muted-foreground/40">—</span> : formatNumber(row.encumbrance)}
                        </td>
                        <td className={cn('px-4 py-2 text-right tabular-nums font-medium', row.variance >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                          {row.budget === 0 ? '—' : formatNumber(row.variance)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {row.budget === 0 ? (
                            <span className="text-muted-foreground/50">—</span>
                          ) : (
                            <span className={cn('font-semibold', band === 'over' ? 'text-rose-700 dark:text-rose-400' : band === 'warn' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400')}>
                              {row.pct}%
                            </span>
                          )}
                          {row.budget > 0 && (
                            <div className="mt-0.5 h-1 w-16 rounded-full bg-muted overflow-hidden inline-block ml-1 align-middle">
                              <div className={cn('h-full rounded-full', band === 'over' ? 'bg-rose-500' : band === 'warn' ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(row.pct, 100)}%` }} />
                            </div>
                          )}
                        </td>
                        {canEdit && (
                          <td className="px-2 py-2">
                            {!isEditing && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => startEdit(row)} data-testid={`button-edit-budget-${row.account_id}`}>
                                {row.budget === 0 ? <Plus className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {/* Totals */}
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-2" colSpan={3}>TOTAL</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(totals.budget)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatNumber(totals.actual)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400">{totals.encumbrance > 0 ? formatNumber(totals.encumbrance) : '—'}</td>
                    <td className={cn('px-4 py-2 text-right tabular-nums', totals.variance >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{formatNumber(totals.variance)}</td>
                    <td className={cn('px-4 py-2 text-right font-bold', usageBand(totals.pct) === 'over' ? 'text-rose-700' : usageBand(totals.pct) === 'warn' ? 'text-amber-700' : 'text-emerald-700')}>{totals.pct}%</td>
                    {canEdit && <td />}
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
