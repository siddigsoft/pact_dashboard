import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, RefreshCw, PiggyBank, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface BudgetLine {
  id: string; account_id: string | null; description: string; budget_amount: number;
  actual_amount: number; fiscal_year_id: string | null; fiscal_period_id: string | null;
  department: string | null; project_id: string | null;
  acct_accounts?: { name: string; code: string };
}

interface UtilRow { label: string; budget: number; actual: number; remaining: number; pct: number; status: string; }

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);

function trafficLight(pct: number): string {
  if (pct >= 100) return 'text-rose-700';
  if (pct >= 85) return 'text-amber-600';
  return 'text-emerald-700';
}
function statusLabel(pct: number): string {
  if (pct >= 100) return 'Over Budget';
  if (pct >= 85) return 'At Risk';
  if (pct >= 50) return 'On Track';
  return 'Under-utilized';
}

export default function AccountingBudgetUtilization() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [groupBy, setGroupBy] = useState<'account' | 'department' | 'project'>('account');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<UtilRow[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');

  const run = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('acct_budget_lines' as any)
      .select('*, acct_accounts(name, code), acct_fiscal_years!inner(year_start)')
      .gte('acct_fiscal_years.year_start', `${parseInt(year) - 1}-07-01`)
      .lte('acct_fiscal_years.year_start', `${year}-06-30`);

    if (!data || !Array.isArray(data)) {
      setRows([]);
      setLoading(false);
      return;
    }

    const map: Record<string, UtilRow> = {};
    for (const b of data as any[]) {
      let key = '';
      if (groupBy === 'account') key = b.acct_accounts?.name ?? b.description ?? 'Unknown Account';
      else if (groupBy === 'department') key = b.department ?? 'Unassigned';
      else key = b.project_id ?? 'No Project';

      if (!map[key]) map[key] = { label: key, budget: 0, actual: 0, remaining: 0, pct: 0, status: '' };
      map[key].budget += (b.budget_amount ?? 0);
      map[key].actual += (b.actual_amount ?? 0);
    }
    const result = Object.values(map).map(r => {
      const pct = r.budget > 0 ? (r.actual / r.budget) * 100 : 0;
      return { ...r, remaining: r.budget - r.actual, pct, status: statusLabel(pct) };
    }).sort((a, b) => b.pct - a.pct);
    setRows(result);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void run(); }, [allowed, year, groupBy]);

  const filtered = useMemo(() => statusFilter === 'all' ? rows : rows.filter(r => r.status === statusFilter), [rows, statusFilter]);
  const totals = useMemo(() => filtered.reduce((s, r) => ({ budget: s.budget + r.budget, actual: s.actual + r.actual }), { budget: 0, actual: 0 }), [filtered]);
  const overCount = rows.filter(r => r.pct >= 100).length;
  const atRiskCount = rows.filter(r => r.pct >= 85 && r.pct < 100).length;

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><PiggyBank className="w-6 h-6 text-teal-600" /> Budget Utilization</h1>
          <p className="text-sm text-muted-foreground mt-1">Traffic-light budget consumption — by account, department, or project</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading}><RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'budget-utilization')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[currentYear, currentYear - 1, currentYear - 2].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={groupBy} onValueChange={v => setGroupBy(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="account">By Account</SelectItem><SelectItem value="department">By Department</SelectItem><SelectItem value="project">By Project</SelectItem></SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="Over Budget">Over Budget</SelectItem><SelectItem value="At Risk">At Risk</SelectItem><SelectItem value="On Track">On Track</SelectItem><SelectItem value="Under-utilized">Under-utilized</SelectItem></SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Budget', value: fmt(totals.budget), icon: PiggyBank, color: 'text-teal-600' },
          { label: 'Total Spent', value: fmt(totals.actual), icon: Clock, color: 'text-blue-600' },
          { label: 'Over Budget', value: overCount, icon: AlertTriangle, color: 'text-rose-600' },
          { label: 'At Risk', value: atRiskCount, icon: CheckCircle2, color: 'text-amber-600' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4 flex items-center gap-3"><k.icon className={cn('w-7 h-7', k.color)} /><div><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-lg font-bold', k.color)}>{k.value}</div></div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Utilization ({filtered.length} lines)</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Generating…</div>
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No budget lines found. Ensure budget lines are entered for this year.</div>
          : (
            <div className="space-y-2">
              {filtered.map(r => (
                <div key={r.label} className="p-3 border rounded-lg" data-testid={`row-budget-util-${r.label}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{r.label}</span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', r.pct >= 100 ? 'bg-rose-100 text-rose-700' : r.pct >= 85 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>{r.status}</span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>Budget: {fmt(r.budget)}</span>
                        <span>Spent: <span className={trafficLight(r.pct)}>{fmt(r.actual)}</span></span>
                        <span>Remaining: <span className={r.remaining < 0 ? 'text-rose-700' : 'text-emerald-700'}>{fmt(r.remaining)}</span></span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn('text-xl font-bold', trafficLight(r.pct))}>{r.pct.toFixed(0)}%</div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded bg-muted overflow-hidden">
                    <div className={cn('h-full rounded transition-all', r.pct >= 100 ? 'bg-rose-500' : r.pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500')} style={{ width: `${Math.min(100, r.pct)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
