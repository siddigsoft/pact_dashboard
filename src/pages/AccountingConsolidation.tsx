import { useEffect, useState, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, Building2, RefreshCw, Download, AlertTriangle } from 'lucide-react';
import { format, startOfYear, endOfYear, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';

interface JournalLine {
  id: string; functional_amount: number; debit_credit: string; account_type: string;
  posting_date: string; country_id: string | null; country_name: string;
  account_id: string; account_code: string; account_name: string;
}
interface CountryTotals { country: string; revenue: number; expense: number; net: number; assets: number; liabilities: number }
interface ConsolidatedRow { account_type: string; total_debit: number; total_credit: number; net: number; entityCount: number }
interface ElimEntry { desc: string; amount: number; entity_a: string; entity_b: string; account: string }

export default function AccountingConsolidation() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [lines, setLines] = useState<JournalLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const yearStart = `${yearFilter}-01-01`;
      const yearEnd = `${yearFilter}-12-31`;
      const { data, error: err } = await supabase
        .from('acct_journal_lines')
        .select(`functional_amount, debit_credit, acct_accounts!inner(id, code, name_en, account_type, country_id, countries(name_en)), acct_journal_entries!inner(posting_date, status)`)
        .eq('acct_journal_entries.status', 'posted')
        .gte('acct_journal_entries.posting_date', yearStart)
        .lte('acct_journal_entries.posting_date', yearEnd)
        .limit(20000);
      if (err?.code === '42P01') { setError('Run Phase 4 migration to enable consolidation queries.'); setLoading(false); return; }
      if (err) throw err;
      const mapped: JournalLine[] = ((data ?? []) as any[]).map(l => ({
        id: l.id ?? Math.random().toString(),
        functional_amount: Number(l.functional_amount ?? 0),
        debit_credit: l.debit_credit,
        account_type: (l.acct_accounts as any)?.account_type ?? 'unknown',
        posting_date: (l.acct_journal_entries as any)?.posting_date ?? '',
        country_id: (l.acct_accounts as any)?.country_id ?? null,
        country_name: (l.acct_accounts as any)?.countries?.name_en ?? 'Unassigned',
        account_id: (l.acct_accounts as any)?.id ?? '',
        account_code: (l.acct_accounts as any)?.code ?? '',
        account_name: (l.acct_accounts as any)?.name_en ?? '',
      }));
      setLines(mapped);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [yearFilter]);

  useEffect(() => { void load(); }, [load]);

  const byCountry = useMemo<CountryTotals[]>(() => {
    const map: Record<string, CountryTotals> = {};
    for (const l of lines) {
      const c = l.country_name;
      if (!map[c]) map[c] = { country: c, revenue: 0, expense: 0, net: 0, assets: 0, liabilities: 0 };
      const amt = l.functional_amount;
      if (l.account_type === 'revenue' && l.debit_credit === 'CR') map[c].revenue += amt;
      if (l.account_type === 'expense' && l.debit_credit === 'DR') map[c].expense += amt;
      if (l.account_type === 'asset' && l.debit_credit === 'DR') map[c].assets += amt;
      if (l.account_type === 'liability' && l.debit_credit === 'CR') map[c].liabilities += amt;
    }
    return Object.values(map).map(c => ({ ...c, net: c.revenue - c.expense })).sort((a, b) => b.revenue - a.revenue);
  }, [lines]);

  const consolidated = useMemo<ConsolidatedRow[]>(() => {
    const types = ['revenue', 'expense', 'asset', 'liability', 'equity'];
    return types.map(t => {
      const typeLines = lines.filter(l => l.account_type === t);
      const dr = typeLines.filter(l => l.debit_credit === 'DR').reduce((s, l) => s + l.functional_amount, 0);
      const cr = typeLines.filter(l => l.debit_credit === 'CR').reduce((s, l) => s + l.functional_amount, 0);
      const entities = new Set(typeLines.map(l => l.country_name)).size;
      return { account_type: t, total_debit: dr, total_credit: cr, net: cr - dr, entityCount: entities };
    }).filter(r => r.total_debit > 0 || r.total_credit > 0);
  }, [lines]);

  const eliminations = useMemo<ElimEntry[]>(() => {
    const accountMap: Record<string, { countries: Set<string>; amount: number; code: string; name: string }> = {};
    for (const l of lines) {
      if (!accountMap[l.account_id]) accountMap[l.account_id] = { countries: new Set(), amount: 0, code: l.account_code, name: l.account_name };
      accountMap[l.account_id].countries.add(l.country_name);
      accountMap[l.account_id].amount += l.debit_credit === 'DR' ? l.functional_amount : -l.functional_amount;
    }
    return Object.values(accountMap)
      .filter(a => a.countries.size >= 2 && Math.abs(a.amount) > 0)
      .map(a => {
        const countries = Array.from(a.countries);
        return { desc: `Inter-entity: ${a.name}`, amount: Math.abs(a.amount), entity_a: countries[0], entity_b: countries[1] ?? countries[0], account: `${a.code} ${a.name}` };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 20);
  }, [lines]);

  const totalRevenue = byCountry.reduce((s, c) => s + c.revenue, 0);
  const totalExpense = byCountry.reduce((s, c) => s + c.expense, 0);
  const netIncome = totalRevenue - totalExpense;
  const elimTotal = eliminations.reduce((s, e) => s + e.amount, 0);

  const exportConsolidated = () => {
    const header = ['Entity', 'Revenue', 'Expense', 'Net Income', 'Assets', 'Liabilities'];
    const body = byCountry.map(c => [c.country, c.revenue.toFixed(0), c.expense.toFixed(0), c.net.toFixed(0), c.assets.toFixed(0), c.liabilities.toFixed(0)]);
    body.push(['CONSOLIDATED TOTAL', totalRevenue.toFixed(0), totalExpense.toFixed(0), netIncome.toFixed(0), '', '']);
    downloadCsv(`consolidation-${yearFilter}.csv`, [header, ...body]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const years = Array.from({ length: 5 }, (_, i) => String(new Date().getFullYear() - i));

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="consolidation-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-teal-700 text-white shrink-0"><Building2 className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold">Consolidation</h1>
            <p className="text-muted-foreground text-sm">التوحيد المالي — Multi-entity roll-up with inter-entity elimination</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="h-9 w-28" data-testid="select-year"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportConsolidated} disabled={!byCountry.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
        </div>
      </div>

      <PageInfoBanner title="Financial Consolidation" description="Aggregates posted GL entries across all entities (countries/branches). Accounts scoped to a country are grouped as that entity; unscoped accounts appear as 'Unassigned'. Inter-entity Eliminations flags accounts used by 2+ entities — post manual elimination journal entries to remove double-counting." descriptionAr="يجمع قيود دفتر الأستاذ العام عبر جميع الكيانات ويحدد معاملات البنود البينية للإلغاء." />

      {error && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">{error}</p>
        </div>
      )}

      {/* Consolidated KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Consolidated Revenue', v: formatNumber(totalRevenue, 0), color: 'text-emerald-700 dark:text-emerald-400' },
          { label: 'Consolidated Expenses', v: formatNumber(totalExpense, 0), color: 'text-rose-700 dark:text-rose-400' },
          { label: 'Net Income', v: formatNumber(netIncome, 0), color: netIncome >= 0 ? 'text-teal-700' : 'text-rose-700' },
          { label: 'Elimination Adjustments', v: formatNumber(elimTotal, 0), color: eliminations.length > 0 ? 'text-amber-700' : 'text-slate-500', sub: `${eliminations.length} inter-entity account${eliminations.length !== 1 ? 's' : ''}` },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{s.label}</div><div className={cn('text-lg font-bold mt-1 tabular-nums', s.color)}>{s.v}</div>{(s as any).sub && <div className="text-[10px] text-muted-foreground mt-0.5">{(s as any).sub}</div>}</CardContent></Card>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : lines.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 text-sm">No posted journal entries found for {yearFilter}. Post some journal entries first.</div>
      ) : (
        <Tabs defaultValue="pl">
          <TabsList className="mb-4">
            <TabsTrigger value="pl">Consolidated P&L</TabsTrigger>
            <TabsTrigger value="comparison">Entity Comparison</TabsTrigger>
            <TabsTrigger value="eliminations">Eliminations ({eliminations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pl">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Consolidated P&L — {yearFilter}</CardTitle></CardHeader>
                <CardContent className="px-0 pb-0">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Account Type</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Debit</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Credit</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Net</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-20">Entities</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consolidated.map((r, i) => (
                        <tr key={r.account_type} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')}>
                          <td className="px-4 py-2 capitalize font-medium">{r.account_type}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(r.total_debit, 0)}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(r.total_credit, 0)}</td>
                          <td className={cn('px-4 py-2 text-right tabular-nums font-semibold', r.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>{formatNumber(r.net, 0)}</td>
                          <td className="px-4 py-2 text-right text-muted-foreground">{r.entityCount}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 bg-muted/20 font-semibold">
                        <td className="px-4 py-2">Net Income</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(totalExpense, 0)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(totalRevenue, 0)}</td>
                        <td className={cn('px-4 py-2 text-right tabular-nums font-bold', netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{formatNumber(netIncome, 0)}</td>
                        <td className="px-4 py-2 text-right">{byCountry.length}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Revenue vs Expense by Entity</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={byCountry} margin={{ top: 4, right: 8, left: 4, bottom: 24 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="country" tick={{ fontSize: 9 }} angle={-30} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} width={42} />
                      <Tooltip formatter={(v: number, n: string) => [formatNumber(v, 0), n]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="revenue" name="Revenue" fill="#10b981" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="expense" name="Expense" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="comparison">
            <Card>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left px-4 py-2 font-medium text-muted-foreground">Entity</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Revenue</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Expenses</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Net Income</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Assets</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Liabilities</th>
                        <th className="text-right px-4 py-2 font-medium text-muted-foreground w-16">Rev %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byCountry.map((c, i) => {
                        const revPct = totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 100) : 0;
                        return (
                          <tr key={c.country} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')}>
                            <td className="px-4 py-2.5 font-medium">{c.country}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatNumber(c.revenue, 0)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-rose-700 dark:text-rose-400">{formatNumber(c.expense, 0)}</td>
                            <td className={cn('px-4 py-2.5 text-right tabular-nums font-semibold', c.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>{formatNumber(c.net, 0)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.assets, 0)}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.liabilities, 0)}</td>
                            <td className="px-4 py-2.5 text-right"><span className="font-medium">{revPct}%</span><div className="mt-0.5 h-1 w-12 rounded-full bg-muted overflow-hidden inline-block ml-1 align-middle"><div className="h-full rounded-full bg-teal-500" style={{ width: `${revPct}%` }} /></div></td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 bg-muted/20 font-semibold">
                        <td className="px-4 py-2">CONSOLIDATED</td>
                        <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{formatNumber(totalRevenue, 0)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-rose-700">{formatNumber(totalExpense, 0)}</td>
                        <td className={cn('px-4 py-2 text-right tabular-nums font-bold', netIncome >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{formatNumber(netIncome, 0)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(byCountry.reduce((s, c) => s + c.assets, 0), 0)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(byCountry.reduce((s, c) => s + c.liabilities, 0), 0)}</td>
                        <td className="px-4 py-2 text-right">100%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="eliminations">
            {eliminations.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 text-sm">No inter-entity transactions detected. Accounts used across multiple entities will appear here.</div>
            ) : (
              <>
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <strong>{eliminations.length} accounts</strong> are used across multiple entities. Post elimination journal entries to remove double-counting in your consolidated financials. Total elimination amount: <strong>{formatNumber(elimTotal, 0)}</strong>.
                </div>
                <Card>
                  <CardContent className="px-0 pb-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Account</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-32">Entity A</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-32">Entity B</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Net Amount</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Action Required</th>
                        </tr>
                      </thead>
                      <tbody>
                        {eliminations.map((e, i) => (
                          <tr key={i} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')}>
                            <td className="px-4 py-2.5 font-medium">{e.account}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{e.entity_a}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{e.entity_b}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-amber-700 dark:text-amber-400">{formatNumber(e.amount, 0)}</td>
                            <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Post elimination JE</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
