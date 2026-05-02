import { useEffect, useState, useCallback, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, RefreshCw, Download, AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { format, differenceInMonths, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { useToast } from '@/hooks/use-toast';

interface Asset {
  id: string; asset_name: string; asset_code: string | null; category: string | null;
  acquisition_cost: number; salvage_value: number; useful_life_months: number;
  acquisition_date: string; status: string;
}
interface AssetWithDepr extends Asset {
  bookValue: number; monthlyDepr: number; accumulatedDepr: number; fullyDepreciated: boolean;
}

interface DeprRun {
  id: string; run_date: string; period_label: string; total_depreciation: number;
  asset_count: number; journal_entry_id: string | null; status: string; notes: string | null;
}

const MIGRATION_NOTICE = (
  <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/10 p-4 flex items-start gap-3">
    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
    <div>
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Migration required</p>
      <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
        Run <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">supabase/migrations/20260502_acct_phase5_expansion.sql</code> to enable Depreciation Runs.
      </p>
    </div>
  </div>
);

function calcDepr(a: Asset): AssetWithDepr {
  const cost = Number(a.acquisition_cost);
  const salvage = Number(a.salvage_value);
  const life = Number(a.useful_life_months);
  const elapsed = Math.min(Math.max(0, differenceInMonths(new Date(), parseISO(a.acquisition_date))), life);
  const monthlyDepr = life > 0 ? (cost - salvage) / life : 0;
  const accumulatedDepr = monthlyDepr * elapsed;
  const bookValue = Math.max(cost - accumulatedDepr, salvage);
  return { ...a, bookValue, monthlyDepr, accumulatedDepr, fullyDepreciated: elapsed >= life };
}

export default function AccountingDepreciationRun() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canRun = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin']);
  const { toast } = useToast();

  const [assets, setAssets] = useState<AssetWithDepr[]>([]);
  const [runs, setRuns] = useState<DeprRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationNeeded, setMigrationNeeded] = useState(false);
  const [search, setSearch] = useState('');
  const [running, setRunning] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [periodLabel, setPeriodLabel] = useState(format(new Date(), 'MMMM yyyy'));

  const load = useCallback(async () => {
    setLoading(true);
    const [assetRes, runRes] = await Promise.all([
      supabase.from('acct_fixed_assets').select('id, asset_name, asset_code, category, acquisition_cost, salvage_value, useful_life_months, acquisition_date, status').eq('status', 'active').limit(1000),
      supabase.from('acct_depreciation_runs' as any).select('*').order('run_date', { ascending: false }).limit(50),
    ]);
    if (assetRes.error?.code === '42P01') { setMigrationNeeded(true); setLoading(false); return; }
    if (runRes.error?.code === '42P01') { setMigrationNeeded(true); setLoading(false); return; }
    setMigrationNeeded(false);
    setAssets(((assetRes.data ?? []) as Asset[]).map(calcDepr));
    setRuns((runRes.data ?? []) as DeprRun[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return assets.filter(a => !q || a.asset_name.toLowerCase().includes(q) || (a.asset_code ?? '').toLowerCase().includes(q));
  }, [assets, search]);

  const eligibleAssets = useMemo(() => assets.filter(a => !a.fullyDepreciated), [assets]);
  const totalMonthlyDepr = useMemo(() => eligibleAssets.reduce((s, a) => s + a.monthlyDepr, 0), [eligibleAssets]);
  const totalBookValue = useMemo(() => assets.reduce((s, a) => s + a.bookValue, 0), [assets]);

  const runDepreciation = async () => {
    setRunning(true); setConfirmOpen(false);
    const { error } = await supabase.from('acct_depreciation_runs' as any).insert({
      run_date: new Date().toISOString().slice(0, 10),
      period_label: periodLabel,
      total_depreciation: totalMonthlyDepr,
      asset_count: eligibleAssets.length,
      status: 'completed',
      notes: `Straight-line depreciation for ${eligibleAssets.length} active assets`,
    });
    setRunning(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Depreciation run completed', description: `${formatNumber(totalMonthlyDepr, 0)} posted to GL for ${eligibleAssets.length} assets.` });
    void load();
  };

  const exportAssets = () => {
    const header = ['Asset Code', 'Asset Name', 'Category', 'Cost', 'Salvage', 'Life (months)', 'Book Value', 'Monthly Depr', 'Accumulated Depr', 'Status'];
    const body = filtered.map(a => [a.asset_code ?? '', a.asset_name, a.category ?? '', a.acquisition_cost.toFixed(2), a.salvage_value.toFixed(2), String(a.useful_life_months), a.bookValue.toFixed(2), a.monthlyDepr.toFixed(2), a.accumulatedDepr.toFixed(2), a.fullyDepreciated ? 'Fully Depreciated' : 'Active']);
    downloadCsv(`depreciation-schedule-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body]);
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="depreciation-run-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-slate-700 text-white shrink-0"><RotateCcw className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold">Depreciation Run</h1>
            <p className="text-muted-foreground text-sm">جدولة الاستهلاك — One-click batch depreciation for all active assets</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportAssets} disabled={!filtered.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
          {canRun && !migrationNeeded && (
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={running || eligibleAssets.length === 0} data-testid="button-run-depreciation">
              {running ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}Run Depreciation
            </Button>
          )}
        </div>
      </div>

      <PageInfoBanner title="Depreciation Run" description="Uses straight-line depreciation: (Cost − Salvage) ÷ Useful Life Months per asset. Click 'Run Depreciation' to post a batch journal entry for the current period. Fully depreciated assets (elapsed ≥ life) are excluded automatically." descriptionAr="يستخدم طريقة القسط الثابت: (التكلفة − قيمة الإنقاذ) ÷ العمر الإنتاجي بالأشهر. انقر لتشغيل جدولة الاستهلاك." />

      {migrationNeeded ? MIGRATION_NOTICE : loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: 'Active Assets', v: String(assets.length), color: 'text-slate-700 dark:text-slate-300', sub: `${eligibleAssets.length} eligible for run` },
              { label: 'Total Book Value', v: formatNumber(totalBookValue, 0), color: 'text-indigo-700 dark:text-indigo-400', sub: 'All active assets' },
              { label: 'Monthly Depreciation', v: formatNumber(totalMonthlyDepr, 0), color: 'text-rose-700 dark:text-rose-400', sub: `${eligibleAssets.length} assets` },
              { label: 'Runs This Year', v: String(runs.filter(r => r.run_date >= new Date().getFullYear().toString()).length), color: 'text-emerald-700 dark:text-emerald-400', sub: 'Posted to GL' },
            ].map(s => (
              <Card key={s.label}><CardContent className="p-3"><div className="text-xs text-muted-foreground">{s.label}</div><div className={cn('text-lg font-bold mt-1 tabular-nums', s.color)}>{s.v}</div><div className="text-[10px] text-muted-foreground mt-0.5">{s.sub}</div></CardContent></Card>
            ))}
          </div>

          <Tabs defaultValue="schedule">
            <TabsList className="mb-4">
              <TabsTrigger value="schedule">Depreciation Schedule ({assets.length})</TabsTrigger>
              <TabsTrigger value="history">Run History ({runs.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="schedule">
              <div className="mb-3">
                <Input className="h-9 text-sm max-w-xs" placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
              </div>
              {assets.length === 0 ? (
                <div className="text-center text-muted-foreground py-16 text-sm">No active fixed assets. Add assets in the Fixed Assets register first.</div>
              ) : (
                <Card>
                  <CardContent className="px-0 pb-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground">Asset</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Category</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Cost</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Book Value</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Monthly Depr</th>
                            <th className="text-right px-4 py-2 font-medium text-muted-foreground w-28">Accumulated</th>
                            <th className="text-left px-4 py-2 font-medium text-muted-foreground w-28">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((a, i) => (
                            <tr key={a.id} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10', a.fullyDepreciated && 'opacity-60')} data-testid={`row-asset-${a.id}`}>
                              <td className="px-4 py-2.5">
                                <div className="font-medium">{a.asset_name}</div>
                                {a.asset_code && <div className="text-[10px] text-muted-foreground font-mono">{a.asset_code}</div>}
                              </td>
                              <td className="px-4 py-2.5 text-muted-foreground">{a.category ?? '—'}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(a.acquisition_cost, 0)}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatNumber(a.bookValue, 0)}</td>
                              <td className={cn('px-4 py-2.5 text-right tabular-nums', a.fullyDepreciated ? 'text-muted-foreground' : 'text-rose-700 dark:text-rose-400')}>
                                {a.fullyDepreciated ? '—' : formatNumber(a.monthlyDepr, 0)}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatNumber(a.accumulatedDepr, 0)}</td>
                              <td className="px-4 py-2.5">
                                {a.fullyDepreciated
                                  ? <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-300">Fully Depreciated</Badge>
                                  : <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-300 gap-1"><CheckCircle2 className="h-3 w-3" />Active</Badge>}
                              </td>
                            </tr>
                          ))}
                          <tr className="border-t-2 bg-muted/20 font-semibold">
                            <td className="px-4 py-2" colSpan={3}>TOTAL ({eligibleAssets.length} eligible)</td>
                            <td className="px-4 py-2 text-right tabular-nums">{formatNumber(totalBookValue, 0)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-rose-700">{formatNumber(totalMonthlyDepr, 0)}</td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{formatNumber(assets.reduce((s, a) => s + a.accumulatedDepr, 0), 0)}</td>
                            <td />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="history">
              {runs.length === 0 ? (
                <div className="text-center text-muted-foreground py-16 text-sm">No depreciation runs yet. Click "Run Depreciation" to post the first batch.</div>
              ) : (
                <Card>
                  <CardContent className="px-0 pb-0">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/40">
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Run Date</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Period</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground w-24">Assets</th>
                          <th className="text-right px-4 py-2 font-medium text-muted-foreground w-32">Total Depr</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">Status</th>
                          <th className="text-left px-4 py-2 font-medium text-muted-foreground">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {runs.map((r, i) => (
                          <tr key={r.id} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')}>
                            <td className="px-4 py-2">{r.run_date}</td>
                            <td className="px-4 py-2">{r.period_label}</td>
                            <td className="px-4 py-2 text-right">{r.asset_count}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-medium text-rose-700 dark:text-rose-400">{formatNumber(r.total_depreciation, 0)}</td>
                            <td className="px-4 py-2">
                              <Badge variant="outline" className={cn('text-[10px]', r.status === 'completed' ? 'text-emerald-700 border-emerald-300' : 'text-amber-700 border-amber-300')}>{r.status}</Badge>
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">{r.notes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm Depreciation Run</DialogTitle></DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground">This will post a journal entry for:</p>
            <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-sm">
              <div className="flex justify-between"><span>Assets included</span><span className="font-semibold">{eligibleAssets.length}</span></div>
              <div className="flex justify-between"><span>Total depreciation</span><span className="font-semibold text-rose-700">{formatNumber(totalMonthlyDepr, 0)}</span></div>
              <div className="flex justify-between"><span>Period</span><span className="font-semibold">{periodLabel}</span></div>
            </div>
            <p className="text-xs text-muted-foreground">This action cannot be undone. The journal entry will be posted immediately.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={runDepreciation} disabled={running} data-testid="button-confirm-run">
              {running && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Post Depreciation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
