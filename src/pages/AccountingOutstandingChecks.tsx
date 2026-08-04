import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, RefreshCw, CheckSquare, Clock, DollarSign, AlertTriangle } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface Cheque {
  id: string; cheque_number: string; cheque_date: string; payee_name: string;
  amount: number; currency: string; bank_account_id: string | null; status: string;
  cleared_date: string | null; void_date: string | null; memo: string | null;
  acct_bank_accounts?: { account_name: string };
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);
const daysDiff = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

export default function AccountingOutstandingChecks() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows] = useState<Cheque[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [staleOnly, setStaleOnly] = useState(false);
  const [staleDays, setStaleDays] = useState('90');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('acct_cheque_register' as any)
      .select('*, acct_bank_accounts(account_name)')
      .in('status', ['issued', 'outstanding'])
      .order('cheque_date', { ascending: true });
    setRows((data ?? []) as Cheque[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      const days = daysDiff(r.cheque_date);
      if (staleOnly && days < parseInt(staleDays)) return false;
      if (q) return r.cheque_number.toLowerCase().includes(q) || r.payee_name.toLowerCase().includes(q) || (r.memo ?? '').toLowerCase().includes(q);
      return true;
    });
  }, [rows, search, staleOnly, staleDays]);

  const totals = useMemo(() => ({
    count: filtered.length,
    amount: filtered.reduce((s, r) => s + r.amount, 0),
    stale: filtered.filter(r => daysDiff(r.cheque_date) >= parseInt(staleDays)).length,
  }), [filtered, staleDays]);

  const markCleared = async (id: string) => {
    await supabase.from('acct_cheque_register' as any).update({ status: 'cleared', cleared_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
    toast_stub(); void load();
  };
  const markVoid = async (id: string) => {
    await supabase.from('acct_cheque_register' as any).update({ status: 'void', void_date: new Date().toISOString().slice(0, 10) }).eq('id', id);
    toast_stub(); void load();
  };
  const toast_stub = () => {};

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CheckSquare className="w-6 h-6 text-amber-600" /> Outstanding Checks</h1>
          <p className="text-sm text-muted-foreground mt-1">Issued checks not yet cleared — stale check detection and management</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(filtered, 'outstanding-checks')} disabled={!filtered.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Outstanding Checks', value: totals.count, icon: CheckSquare, color: 'text-amber-600' },
          { label: 'Total Amount', value: fmt(totals.amount), icon: DollarSign, color: 'text-blue-700' },
          { label: `Stale (>${staleDays} days)`, value: totals.stale, icon: AlertTriangle, color: totals.stale > 0 ? 'text-rose-600' : 'text-muted-foreground' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4 flex items-center gap-3"><k.icon className={cn('w-7 h-7', k.color)} /><div><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-xl font-bold', k.color)}>{k.value}</div></div></CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Outstanding ({filtered.length})</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-48"><Input placeholder="Search payee, cheque #…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="stale" checked={staleOnly} onChange={e => setStaleOnly(e.target.checked)} className="rounded" />
              <Label htmlFor="stale">Stale only (&gt;</Label>
              <Input type="number" value={staleDays} onChange={e => setStaleDays(e.target.value)} className="w-16 h-8 text-sm" />
              <Label>days)</Label>
            </div>
          </div>

          {loading ? <PageLoader compact />
          : filtered.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No outstanding checks found.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Cheque #</th><th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Payee</th><th className="px-3 py-2 text-left">Bank</th>
                  <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-center">Age</th>
                  <th className="px-3 py-2"></th>
                </tr></thead>
                <tbody>
                  {filtered.map(r => {
                    const age = daysDiff(r.cheque_date);
                    const stale = age >= parseInt(staleDays);
                    return (
                      <tr key={r.id} className={cn('border-b hover:bg-muted/30 group', stale ? 'bg-rose-50' : '')} data-testid={`row-check-${r.id}`}>
                        <td className="px-3 py-2 font-mono text-xs font-semibold">{r.cheque_number}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.cheque_date}</td>
                        <td className="px-3 py-2 font-medium">{r.payee_name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{(r.acct_bank_accounts as any)?.account_name ?? '—'}</td>
                        <td className="px-3 py-2 text-right font-bold">{r.currency} {fmt(r.amount)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn('text-xs font-medium', stale ? 'text-rose-700' : age > 60 ? 'text-amber-600' : 'text-muted-foreground')}>
                            {age}d {stale ? '⚠️' : ''}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {canManage && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                              <button onClick={() => void markCleared(r.id)} className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200">Clear</button>
                              <button onClick={() => void markVoid(r.id)} className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-700 hover:bg-rose-200">Void</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr className="border-t bg-muted/50 font-bold">
                  <td colSpan={4} className="px-3 py-2 text-right">Total Outstanding</td>
                  <td className="px-3 py-2 text-right text-amber-700">{fmt(totals.amount)}</td>
                  <td colSpan={2} />
                </tr></tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
