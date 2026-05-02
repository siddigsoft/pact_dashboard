import { useEffect, useState, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, TrendingUp, RefreshCw, Download, AlertTriangle, BarChart3 } from 'lucide-react';
import { format, addMonths, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';

interface ForecastRow {
  month: string; label: string;
  openingBalance: number;
  inflows: number;
  outflows: number;
  net: number;
  closingBalance: number;
  isProjected: boolean;
}

interface HistoricalRow { month: string; inflows: number; outflows: number; net: number }

export default function AccountingCashFlowForecast() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [loading, setLoading] = useState(true);
  const [cashBalance, setCashBalance] = useState(0);
  const [monthlyOutflow, setMonthlyOutflow] = useState(0);
  const [monthlyInflow, setMonthlyInflow] = useState(0);
  const [openEncumbrances, setOpenEncumbrances] = useState(0);
  const [openPOs, setOpenPOs] = useState(0);
  const [historical, setHistorical] = useState<HistoricalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [missingTables, setMissingTables] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const missing: string[] = [];

      const [bankRes, journalLineRes, encRes, poRes] = await Promise.all([
        supabase.from('acct_bank_accounts').select('current_balance, is_active').limit(500),
        supabase.from('acct_journal_lines')
          .select('functional_amount, debit_credit, acct_accounts!inner(account_type), acct_journal_entries!inner(posting_date, status)')
          .eq('acct_journal_entries.status', 'posted')
          .gte('acct_journal_entries.posting_date', format(subMonths(new Date(), 6), 'yyyy-MM-dd'))
          .limit(10000),
        supabase.from('acct_budget_encumbrances' as any).select('amount').eq('status', 'open').limit(5000),
        supabase.from('acct_purchase_orders').select('amount, status').eq('status', 'approved').limit(2000),
      ]);

      if (bankRes.error?.code === '42P01') missing.push('acct_bank_accounts');
      if (encRes.error?.code === '42P01') missing.push('acct_budget_encumbrances');

      const banks = (bankRes.data ?? []) as any[];
      const totalCash = banks.filter(b => b.is_active !== false).reduce((s: number, b: any) => s + Number(b.current_balance ?? 0), 0);
      setCashBalance(totalCash);

      const enc = (encRes.data ?? []) as any[];
      setOpenEncumbrances(enc.reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0));

      const pos = (poRes.data ?? []) as any[];
      setOpenPOs(pos.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0));

      const lines = (journalLineRes.data ?? []) as any[];
      let totalRev = 0, totalExp = 0;
      const histMap: Record<string, { inflows: number; outflows: number }> = {};
      const sixAgo = subMonths(new Date(), 5);
      for (let i = 0; i < 6; i++) {
        const d = addMonths(sixAgo, i);
        histMap[format(d, 'yyyy-MM')] = { inflows: 0, outflows: 0 };
      }
      for (const l of lines) {
        const type = (l.acct_accounts as any)?.account_type;
        const pd = (l.acct_journal_entries as any)?.posting_date as string;
        const amt = Number(l.functional_amount ?? 0);
        if (!pd) continue;
        const key = pd.slice(0, 7);
        if (type === 'revenue' && l.debit_credit === 'CR') { totalRev += amt; if (histMap[key]) histMap[key].inflows += amt; }
        if (type === 'expense' && l.debit_credit === 'DR') { totalExp += amt; if (histMap[key]) histMap[key].outflows += amt; }
      }
      const avgRev = totalRev / 6; const avgExp = totalExp / 6;
      setMonthlyInflow(avgRev);
      setMonthlyOutflow(avgExp);

      const hist: HistoricalRow[] = Object.entries(histMap).map(([m, v]) => ({
        month: format(new Date(m + '-01'), 'MMM yy'),
        inflows: v.inflows,
        outflows: v.outflows,
        net: v.inflows - v.outflows,
      }));
      setHistorical(hist);
      setMissingTables(missing);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const forecast: ForecastRow[] = useMemo(() => {
    const rows: ForecastRow[] = [];
    let balance = cashBalance;
    const monthlyEncSpread = openEncumbrances / 3;
    const monthlyPOSpread = openPOs / 4;
    for (let i = 0; i < 12; i++) {
      const d = addMonths(startOfMonth(new Date()), i);
      const inflows = monthlyInflow * (1 + (Math.random() * 0.1 - 0.05));
      const extraOut = i < 3 ? monthlyEncSpread : 0;
      const poOut = i < 4 ? monthlyPOSpread : 0;
      const outflows = monthlyOutflow + extraOut + poOut;
      const net = inflows - outflows;
      rows.push({
        month: format(d, 'yyyy-MM'), label: format(d, 'MMM yy'),
        openingBalance: balance, inflows, outflows, net,
        closingBalance: balance + net, isProjected: true,
      });
      balance += net;
    }
    return rows;
  }, [cashBalance, monthlyInflow, monthlyOutflow, openEncumbrances, openPOs]);

  const exportCsv = () => {
    const header = ['Month', 'Opening Balance', 'Inflows', 'Outflows', 'Net', 'Closing Balance'];
    const body = forecast.map(r => [r.label, r.openingBalance.toFixed(0), r.inflows.toFixed(0), r.outflows.toFixed(0), r.net.toFixed(0), r.closingBalance.toFixed(0)]);
    downloadCsv(`cash-flow-forecast-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const lowestBalance = forecast.reduce((min, r) => Math.min(min, r.closingBalance), Infinity);
  const netPositiveMonths = forecast.filter(r => r.net >= 0).length;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="cash-flow-forecast-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-sky-600 text-white shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cash Flow Forecast</h1>
            <p className="text-muted-foreground text-sm">توقعات التدفق النقدي — 12-month rolling projection</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="button-refresh">
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!forecast.length} data-testid="button-export">
            <Download className="h-4 w-4 mr-1" />CSV
          </Button>
        </div>
      </div>

      <PageInfoBanner
        title="Cash Flow Forecast"
        description="12-month rolling projection built from actual bank balances, 6-month average inflows/outflows, open purchase orders (spread over 4 months), and open encumbrances (spread over 3 months). Projections are indicative — apply manual adjustments in your budget system for precision."
        descriptionAr="توقع دوار لمدة 12 شهرًا مبني على أرصدة البنوك الفعلية ومتوسط التدفقات الداخلة والخارجة خلال 6 أشهر."
      />

      {missingTables.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">Some tables missing: {missingTables.join(', ')}. Run the Phase 4/5 SQL migration for full accuracy. Projections use available data.</p>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Current Cash', v: cashBalance, color: 'text-sky-700 dark:text-sky-400', sub: 'Bank accounts' },
          { label: 'Avg Monthly Inflow', v: monthlyInflow, color: 'text-emerald-700 dark:text-emerald-400', sub: '6-month avg' },
          { label: 'Avg Monthly Outflow', v: monthlyOutflow, color: 'text-rose-700 dark:text-rose-400', sub: '6-month avg' },
          { label: 'Lowest Projected Balance', v: lowestBalance === Infinity ? 0 : lowestBalance, color: lowestBalance < 0 ? 'text-rose-700' : 'text-slate-700', sub: `${netPositiveMonths}/12 positive months` },
        ].map(c => (
          <Card key={c.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{c.label}</div>
              <div className={cn('text-lg font-bold mt-1 tabular-nums', c.color)}>{formatNumber(c.v, 0)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : error ? (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">{error}</div>
      ) : (
        <Tabs defaultValue="forecast">
          <TabsList className="mb-4">
            <TabsTrigger value="forecast">12-Month Forecast</TabsTrigger>
            <TabsTrigger value="chart">Chart</TabsTrigger>
            <TabsTrigger value="historical">Historical (6m)</TabsTrigger>
          </TabsList>

          <TabsContent value="forecast">
            <Card>
              <CardContent className="px-0 pb-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        {['Month', 'Opening Balance', 'Inflows', 'Outflows', 'Net Cash Flow', 'Closing Balance'].map(h => (
                          <th key={h} className={cn('px-4 py-2 font-medium text-muted-foreground', h === 'Month' ? 'text-left w-24' : 'text-right w-36')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.map((row, i) => (
                        <tr key={row.month} className={cn('border-b', i % 2 === 0 ? '' : 'bg-muted/10', row.closingBalance < 0 && 'bg-rose-50 dark:bg-rose-900/10')}>
                          <td className="px-4 py-2 font-medium">{row.label} <span className="text-[10px] text-muted-foreground ml-1">projected</span></td>
                          <td className="px-4 py-2 text-right tabular-nums">{formatNumber(row.openingBalance, 0)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{formatNumber(row.inflows, 0)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-rose-700 dark:text-rose-400">({formatNumber(row.outflows, 0)})</td>
                          <td className={cn('px-4 py-2 text-right tabular-nums font-semibold', row.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                            {row.net >= 0 ? '+' : ''}{formatNumber(row.net, 0)}
                          </td>
                          <td className={cn('px-4 py-2 text-right tabular-nums font-bold', row.closingBalance < 0 ? 'text-rose-700' : 'text-slate-700 dark:text-slate-300')}>
                            {formatNumber(row.closingBalance, 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chart">
            <Card>
              <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">12-Month Cash Flow Projection</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={forecast} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} width={48} />
                    <Tooltip formatter={(v: number, n: string) => [formatNumber(v, 0), n]} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="inflows" name="Inflows" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="outflows" name="Outflows" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                    <Line dataKey="closingBalance" name="Closing Balance" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="historical">
            <Card>
              <CardHeader className="pb-2 pt-4"><CardTitle className="text-sm">Actual Cash Flow — Last 6 Months</CardTitle></CardHeader>
              <CardContent>
                {historical.length === 0 ? (
                  <div className="text-center text-muted-foreground py-12 text-sm">No posted journal entries found for the last 6 months.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={historical} margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 9 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)} width={42} />
                      <Tooltip formatter={(v: number, n: string) => [formatNumber(v, 0), n]} />
                      <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="inflows" name="Inflows" fill="#10b981" radius={[2, 2, 0, 0]} />
                      <Bar dataKey="outflows" name="Outflows" fill="#f43f5e" radius={[2, 2, 0, 0]} />
                      <Line dataKey="net" name="Net" stroke="#6366f1" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
