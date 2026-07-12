import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, RefreshCw, Scale } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface BSRow { account_type: string; account_name: string; code: string; period1: number; period2: number; change: number; changePct: number; }

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);

async function fetchBalances(year: number): Promise<Record<string, number>> {
  const { data } = await supabase
    .from('acct_journal_items' as any)
    .select('debit, credit, account_id, acct_accounts!inner(code, name, account_type), acct_journal_entries!inner(entry_date, status)')
    .eq('acct_journal_entries.status', 'posted')
    .lte('acct_journal_entries.entry_date', `${year}-12-31`);

  const map: Record<string, number> = {};
  for (const item of (data ?? []) as any[]) {
    const key = `${item.account_id}||${item.acct_accounts?.code}||${item.acct_accounts?.name}||${item.acct_accounts?.account_type}`;
    const type = item.acct_accounts?.account_type ?? '';
    const net = type === 'asset' ? (item.debit - item.credit) : (item.credit - item.debit);
    map[key] = (map[key] ?? 0) + net;
  }
  return map;
}

export default function AccountingBalanceSheetComparison() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const currentYear = new Date().getFullYear();
  const [year1, setYear1] = useState(String(currentYear));
  const [year2, setYear2] = useState(String(currentYear - 1));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<BSRow[]>([]);

  const run = async () => {
    setLoading(true);
    const [b1, b2] = await Promise.all([fetchBalances(parseInt(year1)), fetchBalances(parseInt(year2))]);
    const allKeys = new Set([...Object.keys(b1), ...Object.keys(b2)]);
    const result: BSRow[] = [];
    for (const key of allKeys) {
      const [, code, name, account_type] = key.split('||');
      if (!['asset', 'liability', 'equity'].includes(account_type)) continue;
      const p1 = b1[key] ?? 0;
      const p2 = b2[key] ?? 0;
      const change = p1 - p2;
      const changePct = p2 !== 0 ? (change / Math.abs(p2)) * 100 : 0;
      result.push({ account_type, account_name: name, code, period1: p1, period2: p2, change, changePct });
    }
    result.sort((a, b) => {
      const order = { asset: 1, liability: 2, equity: 3 };
      return (order[a.account_type as keyof typeof order] - order[b.account_type as keyof typeof order]) || a.code.localeCompare(b.code);
    });
    setRows(result);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void run(); }, [allowed, year1, year2]);

  const groups = useMemo(() => {
    const g: Record<string, BSRow[]> = {};
    for (const r of rows) { if (!g[r.account_type]) g[r.account_type] = []; g[r.account_type].push(r); }
    return g;
  }, [rows]);

  const groupTotal = (type: string, field: 'period1' | 'period2' | 'change') =>
    (groups[type] ?? []).reduce((s, r) => s + r[field], 0);

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const TYPE_LABELS: Record<string, string> = { asset: 'Assets', liability: 'Liabilities', equity: 'Equity' };
  const TYPE_COLORS: Record<string, string> = { asset: 'text-blue-700', liability: 'text-rose-700', equity: 'text-emerald-700' };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Scale className="w-6 h-6 text-blue-600" /> Balance Sheet Comparison</h1>
          <p className="text-sm text-muted-foreground mt-1">Side-by-side balance sheet for two periods with variance analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading}><RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(rows, `bs-comparison-${year1}-vs-${year2}`)} disabled={!rows.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-sm font-medium">Period 1:</span>
        <Select value={year1} onValueChange={setYear1}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-sm font-medium">vs Period 2:</span>
        <Select value={year2} onValueChange={setYear2}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Balance Sheet: {year1} vs {year2}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Generating comparison…</div>
          : rows.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No posted entries found. Post journal entries first.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left w-8">Code</th>
                  <th className="px-3 py-2 text-left">Account</th>
                  <th className="px-3 py-2 text-right">{year1}</th>
                  <th className="px-3 py-2 text-right">{year2}</th>
                  <th className="px-3 py-2 text-right">Change</th>
                  <th className="px-3 py-2 text-right">%</th>
                </tr></thead>
                <tbody>
                  {['asset', 'liability', 'equity'].map(type => groups[type] && (
                    <>
                      <tr key={`hdr-${type}`} className="bg-muted/60">
                        <td colSpan={6} className={cn('px-3 py-1.5 font-bold text-xs uppercase tracking-wide', TYPE_COLORS[type])}>{TYPE_LABELS[type]}</td>
                      </tr>
                      {groups[type].map(r => (
                        <tr key={r.code} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.code}</td>
                          <td className="px-3 py-2">{r.account_name}</td>
                          <td className="px-3 py-2 text-right">{fmt(r.period1)}</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">{fmt(r.period2)}</td>
                          <td className={cn('px-3 py-2 text-right', r.change > 0 ? 'text-emerald-700' : r.change < 0 ? 'text-rose-700' : 'text-muted-foreground')}>
                            {r.change > 0 ? '+' : ''}{fmt(r.change)}
                          </td>
                          <td className={cn('px-3 py-2 text-right text-xs', r.changePct > 0 ? 'text-emerald-700' : r.changePct < 0 ? 'text-rose-700' : 'text-muted-foreground')}>
                            {r.period2 !== 0 ? `${r.changePct > 0 ? '+' : ''}${r.changePct.toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr key={`tot-${type}`} className="bg-muted/40 font-bold border-t border-b-2">
                        <td colSpan={2} className="px-3 py-2">Total {TYPE_LABELS[type]}</td>
                        <td className="px-3 py-2 text-right">{fmt(groupTotal(type, 'period1'))}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{fmt(groupTotal(type, 'period2'))}</td>
                        <td className={cn('px-3 py-2 text-right', groupTotal(type, 'change') >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{groupTotal(type, 'change') >= 0 ? '+' : ''}{fmt(groupTotal(type, 'change'))}</td>
                        <td />
                      </tr>
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
