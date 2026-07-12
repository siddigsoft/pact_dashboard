import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, RefreshCw, BarChart3, TrendingUp, TrendingDown } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface JELine { account_code: string; account_name: string; account_type: string; analytic_code: string | null; debit: number; credit: number; }
interface DeptRow { dept: string; revenue: number; expense: number; net: number; }

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n);

export default function AccountingPLByDepartment() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [period, setPeriod] = useState('full');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DeptRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setError(null);
    try {
      let q = supabase.from('acct_journal_items' as any).select('account_id, debit, credit, analytic_account_id, acct_accounts!inner(code, name, account_type), acct_journal_entries!inner(entry_date, status)').eq('acct_journal_entries.status', 'posted');
      const yearNum = parseInt(year);
      if (period === 'full') { q = q.gte('acct_journal_entries.entry_date', `${yearNum}-01-01`).lte('acct_journal_entries.entry_date', `${yearNum}-12-31`); }
      else {
        const qNum = parseInt(period.replace('Q', ''));
        const startM = (qNum - 1) * 3 + 1;
        const endM = qNum * 3;
        q = q.gte('acct_journal_entries.entry_date', `${yearNum}-${String(startM).padStart(2, '0')}-01`).lte('acct_journal_entries.entry_date', `${yearNum}-${String(endM).padStart(2, '0')}-31`);
      }
      const { data, error: err } = await q;
      if (err) { setError(err.message); setRows([]); setLoading(false); return; }

      const map: Record<string, DeptRow> = {};
      for (const item of (data ?? []) as any[]) {
        const dept = item.analytic_account_id ?? 'Unallocated';
        const type = item.acct_accounts?.account_type ?? '';
        if (!map[dept]) map[dept] = { dept, revenue: 0, expense: 0, net: 0 };
        if (type === 'income') map[dept].revenue += (item.credit - item.debit);
        if (type === 'expense') map[dept].expense += (item.debit - item.credit);
      }
      const result = Object.values(map).map(r => ({ ...r, net: r.revenue - r.expense })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
      setRows(result);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (allowed) void run(); }, [allowed, year, period]);

  const totals = useMemo(() => rows.reduce((s, r) => ({ revenue: s.revenue + r.revenue, expense: s.expense + r.expense, net: s.net + r.net }), { revenue: 0, expense: 0, net: 0 }), [rows]);

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="w-6 h-6 text-violet-600" /> P&L by Department</h1>
          <p className="text-sm text-muted-foreground mt-1">Segmented profit and loss by analytic account / cost center</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading}><RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(rows, 'pl-by-department')} disabled={!rows.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[currentYear, currentYear - 1, currentYear - 2].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="full">Full Year</SelectItem><SelectItem value="Q1">Q1 (Jan-Mar)</SelectItem><SelectItem value="Q2">Q2 (Apr-Jun)</SelectItem><SelectItem value="Q3">Q3 (Jul-Sep)</SelectItem><SelectItem value="Q4">Q4 (Oct-Dec)</SelectItem></SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Revenue', value: fmt(totals.revenue), icon: TrendingUp, color: 'text-emerald-700' },
          { label: 'Total Expenses', value: fmt(totals.expense), icon: TrendingDown, color: 'text-rose-700' },
          { label: 'Net Result', value: fmt(totals.net), icon: BarChart3, color: totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4 flex items-center gap-3"><k.icon className={cn('w-7 h-7', k.color)} /><div><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-lg font-bold', k.color)}>{k.value}</div></div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">P&L by Cost Center — {year} {period !== 'full' ? period : ''}</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Generating report…</div>
          : error ? <div className="p-4 bg-rose-50 text-rose-700 rounded text-sm">{error}</div>
          : rows.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No posted journal entries found for this period.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Department / Cost Center</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2 text-right">Expenses</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-right w-32">Margin</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.dept} className="border-b hover:bg-muted/30" data-testid={`row-pldept-${r.dept}`}>
                      <td className="px-3 py-2 font-medium">{r.dept}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(r.revenue)}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{fmt(r.expense)}</td>
                      <td className={cn('px-3 py-2 text-right font-bold', r.net >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{fmt(r.net)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded bg-muted overflow-hidden">
                            <div className={cn('h-full rounded', r.net >= 0 ? 'bg-emerald-500' : 'bg-rose-500')} style={{ width: `${Math.min(100, r.revenue > 0 ? Math.abs(r.net / r.revenue) * 100 : 0)}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">{r.revenue > 0 ? `${((r.net / r.revenue) * 100).toFixed(0)}%` : '—'}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t bg-muted/50 font-bold">
                  <td className="px-3 py-2">TOTAL</td>
                  <td className="px-3 py-2 text-right text-emerald-700">{fmt(totals.revenue)}</td>
                  <td className="px-3 py-2 text-right text-rose-700">{fmt(totals.expense)}</td>
                  <td className={cn('px-3 py-2 text-right', totals.net >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{fmt(totals.net)}</td>
                  <td />
                </tr></tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
