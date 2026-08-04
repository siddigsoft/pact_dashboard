import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Download, RefreshCw, Heart, FileText, DollarSign, Search } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface StmtRow { date: string; type: string; ref: string; description: string; debit: number; credit: number; balance: number; }

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingDonorStatement() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [donor, setDonor] = useState('');
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StmtRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!donor.trim()) return;
    setLoading(true); setError(null); setSearched(true);

    // Gather from customer invoices + customer payments
    const [invRes, payRes] = await Promise.all([
      supabase.from('acct_customer_invoices' as any).select('*')
        .ilike('customer_name', `%${donor.trim()}%`)
        .gte('invoice_date', dateFrom).lte('invoice_date', dateTo),
      supabase.from('acct_customer_payments' as any).select('*')
        .ilike('customer_name', `%${donor.trim()}%`)
        .gte('payment_date', dateFrom).lte('payment_date', dateTo),
    ]);

    const stmt: StmtRow[] = [];
    for (const inv of (invRes.data ?? []) as any[]) {
      stmt.push({ date: inv.invoice_date, type: 'Invoice', ref: inv.invoice_number, description: `Invoice to ${inv.customer_name}`, debit: inv.total_amount, credit: 0, balance: 0 });
    }
    for (const pay of (payRes.data ?? []) as any[]) {
      stmt.push({ date: pay.payment_date, type: 'Payment', ref: pay.reference ?? '—', description: `Payment received — ${pay.payment_method}`, debit: 0, credit: pay.amount, balance: 0 });
    }
    stmt.sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    for (const r of stmt) { running += r.debit - r.credit; r.balance = running; }
    setRows(stmt);
    setLoading(false);
  };

  const totals = useMemo(() => ({
    invoiced: rows.reduce((s, r) => s + r.debit, 0),
    paid: rows.reduce((s, r) => s + r.credit, 0),
    balance: rows.length > 0 ? rows[rows.length - 1].balance : 0,
  }), [rows]);

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Heart className="w-6 h-6 text-rose-600" /> Donor Statement</h1>
          <p className="text-sm text-muted-foreground mt-1">Full transaction history for a specific donor or partner over a date range</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => exportToExcel(rows, `donor-statement-${donor}`)} disabled={!rows.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Search Parameters</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-48"><Label>Donor / Customer Name</Label><Input value={donor} onChange={e => setDonor(e.target.value)} placeholder="UNHCR, WFP, USAID…" onKeyDown={e => e.key === 'Enter' && void run()} /></div>
            <div className="space-y-1"><Label>From</Label><Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" /></div>
            <div className="space-y-1"><Label>To</Label><Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" /></div>
            <Button onClick={() => void run()} disabled={loading || !donor.trim()}>{loading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generating…</> : <><Search className="w-4 h-4 mr-1" /> Generate Statement</>}</Button>
          </div>
        </CardContent>
      </Card>

      {searched && !loading && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Invoiced', value: fmt(totals.invoiced), color: 'text-blue-700', icon: FileText },
              { label: 'Total Received', value: fmt(totals.paid), color: 'text-emerald-700', icon: DollarSign },
              { label: 'Outstanding Balance', value: fmt(totals.balance), color: totals.balance > 0 ? 'text-amber-700' : 'text-emerald-700', icon: Heart },
            ].map(k => (
              <Card key={k.label}><CardContent className="p-4 flex items-center gap-3"><k.icon className={cn('w-7 h-7', k.color)} /><div><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-xl font-bold', k.color)}>{k.value}</div></div></CardContent></Card>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Statement of Account — <span className="text-primary">{donor}</span>
                <span className="text-sm font-normal text-muted-foreground ml-2">({dateFrom} to {dateTo})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No transactions found for "{donor}" in this date range.</div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Ref</th><th className="px-3 py-2 text-left">Description</th>
                      <th className="px-3 py-2 text-right">Invoiced</th><th className="px-3 py-2 text-right">Received</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                    </tr></thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2 text-muted-foreground">{r.date}</td>
                          <td className="px-3 py-2"><span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', r.type === 'Invoice' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700')}>{r.type}</span></td>
                          <td className="px-3 py-2 font-mono text-xs">{r.ref}</td>
                          <td className="px-3 py-2 text-muted-foreground">{r.description}</td>
                          <td className="px-3 py-2 text-right">{r.debit > 0 ? fmt(r.debit) : '—'}</td>
                          <td className="px-3 py-2 text-right text-emerald-700">{r.credit > 0 ? fmt(r.credit) : '—'}</td>
                          <td className={cn('px-3 py-2 text-right font-medium', r.balance > 0 ? 'text-amber-700' : r.balance < 0 ? 'text-emerald-700' : 'text-muted-foreground')}>{fmt(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot><tr className="border-t bg-muted/50 font-bold">
                      <td colSpan={4} className="px-3 py-2 text-right">CLOSING BALANCE</td>
                      <td className="px-3 py-2 text-right">{fmt(totals.invoiced)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(totals.paid)}</td>
                      <td className={cn('px-3 py-2 text-right', totals.balance > 0 ? 'text-amber-700' : 'text-emerald-700')}>{fmt(totals.balance)}</td>
                    </tr></tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
