import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Download, RefreshCw, Clock, AlertTriangle, CheckCircle2, DollarSign } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface Invoice {
  id: string; invoice_number: string; invoice_date: string; due_date: string | null;
  customer_name: string; currency: string; total_amount: number; amount_paid: number; status: string;
}

interface AgingRow {
  customer: string;
  current: number;    // not yet due
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
}

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);
const daysDiff = (due: string) => Math.floor((Date.now() - new Date(due).getTime()) / 86400000);

export default function AccountingARAgingReport() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [generated, setGenerated] = useState(false);

  const run = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('acct_customer_invoices' as any)
      .select('id, invoice_number, invoice_date, due_date, customer_name, currency, total_amount, amount_paid, status')
      .not('status', 'in', '(cancelled,void,paid)')
      .lte('invoice_date', asOf);

    const map: Record<string, AgingRow> = {};
    for (const inv of (data ?? []) as Invoice[]) {
      const outstanding = inv.total_amount - inv.amount_paid;
      if (outstanding <= 0) continue;
      const key = inv.customer_name;
      if (!map[key]) map[key] = { customer: key, current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };

      if (!inv.due_date) { map[key].current += outstanding; }
      else {
        const days = daysDiff(inv.due_date);
        if (days <= 0) map[key].current += outstanding;
        else if (days <= 30) map[key].d1_30 += outstanding;
        else if (days <= 60) map[key].d31_60 += outstanding;
        else if (days <= 90) map[key].d61_90 += outstanding;
        else map[key].d90plus += outstanding;
      }
      map[key].total += outstanding;
    }
    const result = Object.values(map).sort((a, b) => b.total - a.total);
    setRows(result);
    setGenerated(true);
    setLoading(false);
  };

  const totals = useMemo(() => rows.reduce(
    (s, r) => ({ current: s.current + r.current, d1_30: s.d1_30 + r.d1_30, d31_60: s.d31_60 + r.d31_60, d61_90: s.d61_90 + r.d61_90, d90plus: s.d90plus + r.d90plus, total: s.total + r.total }),
    { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 }
  ), [rows]);

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="w-6 h-6 text-amber-600" /> AR Aging Report</h1>
          <p className="text-sm text-muted-foreground mt-1">Outstanding customer invoice balances by overdue bucket as of a selected date</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToExcel(rows, `ar-aging-${asOf}`)} disabled={!rows.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1"><Label>As of Date</Label><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-44" /></div>
            <Button onClick={() => void run()} disabled={loading}>{loading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generating…</> : <><RefreshCw className="w-4 h-4 mr-1" /> Generate Report</>}</Button>
          </div>
        </CardContent>
      </Card>

      {generated && !loading && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              { label: 'Current (Not Due)', value: fmt(totals.current), color: 'text-emerald-700' },
              { label: '1–30 Days', value: fmt(totals.d1_30), color: 'text-yellow-600' },
              { label: '31–60 Days', value: fmt(totals.d31_60), color: 'text-amber-600' },
              { label: '61–90 Days', value: fmt(totals.d61_90), color: 'text-orange-600' },
              { label: '90+ Days', value: fmt(totals.d90plus), color: 'text-rose-700' },
            ].map(k => (
              <Card key={k.label}><CardContent className="p-3 text-center"><div className="text-[10px] text-muted-foreground mb-1">{k.label}</div><div className={cn('text-base font-bold', k.color)}>{k.value}</div></CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">AR Aging as of {asOf} — {rows.length} customer{rows.length !== 1 ? 's' : ''}</CardTitle>
                <div className="text-sm font-bold text-rose-700">Total Outstanding: {fmt(totals.total)}</div>
              </div>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No outstanding receivables as of {asOf}.</div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-right">Current</th>
                      <th className="px-3 py-2 text-right">1–30d</th>
                      <th className="px-3 py-2 text-right">31–60d</th>
                      <th className="px-3 py-2 text-right">61–90d</th>
                      <th className="px-3 py-2 text-right text-rose-700">90+d</th>
                      <th className="px-3 py-2 text-right font-bold">Total</th>
                    </tr></thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.customer} className="border-b hover:bg-muted/30" data-testid={`row-araging-${r.customer}`}>
                          <td className="px-3 py-2 font-medium">{r.customer}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{r.current > 0 ? fmt(r.current) : '—'}</td>
                          <td className="px-3 py-2 text-right text-yellow-600">{r.d1_30 > 0 ? fmt(r.d1_30) : '—'}</td>
                          <td className="px-3 py-2 text-right text-amber-600">{r.d31_60 > 0 ? fmt(r.d31_60) : '—'}</td>
                          <td className="px-3 py-2 text-right text-orange-600">{r.d61_90 > 0 ? fmt(r.d61_90) : '—'}</td>
                          <td className="px-3 py-2 text-right text-rose-700 font-medium">{r.d90plus > 0 ? fmt(r.d90plus) : '—'}</td>
                          <td className="px-3 py-2 text-right font-bold">{fmt(r.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t bg-muted/50 font-bold text-sm">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(totals.current)}</td>
                      <td className="px-3 py-2 text-right text-yellow-600">{fmt(totals.d1_30)}</td>
                      <td className="px-3 py-2 text-right text-amber-600">{fmt(totals.d31_60)}</td>
                      <td className="px-3 py-2 text-right text-orange-600">{fmt(totals.d61_90)}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{fmt(totals.d90plus)}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{fmt(totals.total)}</td>
                    </tr></tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {totals.d90plus > 0 && (
            <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded text-rose-700 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span><strong>{fmt(totals.d90plus)}</strong> is more than 90 days overdue. Consider escalating collection or writing off uncollectable balances.</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
