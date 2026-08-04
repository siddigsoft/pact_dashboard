import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Download, RefreshCw, Clock, Search } from 'lucide-react';
import { differenceInDays, parseISO } from 'date-fns';
import { exportToExcel } from '@/utils/report-export';
import { formatNumber } from '@/lib/accountingFormat';

interface APInvoice {
  id: string; invoice_number: string; vendor_name: string; invoice_date: string;
  due_date: string | null; total_amount: number; paid_amount: number; currency: string; status: string;
}

interface AgingRow {
  vendor: string; current: number; days30: number; days60: number; days90: number; over90: number; total: number;
}

const BUCKETS = ['Current (0–30)', '31–60 Days', '61–90 Days', 'Over 90 Days', 'Total'];

export default function AccountingAgedReceivable() {
  const { hasAnyRole } = useAuthorization();
  const allowed = hasAnyRole(['super_admin','admin','finance','financialAdmin','accountant','auditor']);

  const [invoices, setInvoices] = useState<APInvoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [asOf, setAsOf]         = useState(new Date().toISOString().slice(0,10));
  const [search, setSearch]     = useState('');

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('acct_ap_invoices' as any)
      .select('id,invoice_number,vendor_name,invoice_date,due_date,total_amount,paid_amount,currency,status')
      .in('status', ['approved','partially_paid','overdue'])
      .order('due_date', { ascending: true })
      .limit(1000);
    setInvoices((data ?? []) as APInvoice[]);
    setLoading(false);
  };
  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const agingRows = useMemo((): AgingRow[] => {
    const asOfDate = new Date(asOf);
    const map = new Map<string, AgingRow>();

    for (const inv of invoices) {
      const remaining = inv.total_amount - (inv.paid_amount ?? 0);
      if (remaining <= 0) continue;
      const vendor = inv.vendor_name || 'Unknown Vendor';
      if (!map.has(vendor)) map.set(vendor, { vendor, current:0, days30:0, days60:0, days90:0, over90:0, total:0 });
      const row = map.get(vendor)!;
      const due = inv.due_date ? parseISO(inv.due_date) : parseISO(inv.invoice_date);
      const daysOverdue = differenceInDays(asOfDate, due);
      if (daysOverdue <= 30) row.current += remaining;
      else if (daysOverdue <= 60) row.days30 += remaining;
      else if (daysOverdue <= 90) row.days60 += remaining;
      else row.over90 += remaining;
      row.total += remaining;
    }
    return [...map.values()]
      .filter(r => !search || r.vendor.toLowerCase().includes(search.toLowerCase()))
      .sort((a,b) => b.total - a.total);
  }, [invoices, asOf, search]);

  const totals = useMemo(() => agingRows.reduce(
    (acc, r) => ({ current: acc.current+r.current, days30: acc.days30+r.days30, days60: acc.days60+r.days60, days90: acc.days90+0, over90: acc.over90+r.over90, total: acc.total+r.total }),
    { current:0, days30:0, days60:0, days90:0, over90:0, total:0 }
  ), [agingRows]);

  const exportData = () => exportToExcel(
    agingRows.map(r => ({ Vendor:r.vendor, 'Current (0-30)':r.current.toFixed(2), '31-60':r.days30.toFixed(2), '61-90':r.days60.toFixed(2), 'Over 90':r.over90.toFixed(2), Total:r.total.toFixed(2) })),
    'Aged Receivable','aged-receivable.xlsx'
  );

  const pct = (v:number) => totals.total > 0 ? ((v/totals.total)*100).toFixed(0)+'%' : '0%';

  if (!allowed) return null;

  return (
    <div className="space-y-4 p-1">
      <div className="flex flex-wrap items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Aged Receivable</h2>
        <div className="flex-1" />
        <label className="text-sm text-muted-foreground flex items-center gap-1">As of<Input type="date" value={asOf} onChange={e=>setAsOf(e.target.value)} className="w-36 h-8 text-sm ml-1" /></label>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vendor…" className="pl-7 w-48 h-8 text-sm" />
        </div>
        <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={exportData}><Download className="h-4 w-4 mr-1" />Export</Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label:'Current (0–30)', val:totals.current, color:'bg-green-50 border-green-200 text-green-700' },
          { label:'31–60 Days',     val:totals.days30,  color:'bg-amber-50 border-amber-200 text-amber-700' },
          { label:'61–90 Days',     val:totals.days60,  color:'bg-orange-50 border-orange-200 text-orange-700' },
          { label:'Over 90 Days',   val:totals.over90,  color:'bg-red-50 border-red-200 text-red-700' },
          { label:'Total Outstanding',val:totals.total, color:'bg-slate-50 border-slate-200 text-slate-700' },
        ].map(b => (
          <Card key={b.label} className={`border ${b.color}`}>
            <CardContent className="p-3">
              <p className="text-xs opacity-80">{b.label}</p>
              <p className="text-base font-bold mt-0.5">{formatNumber(b.val)}</p>
              {b.label !== 'Total Outstanding' && <p className="text-[10px] opacity-70 mt-0.5">{pct(b.val)} of total</p>}
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <PageLoader compact />
      ) : agingRows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-dashed rounded-lg">
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No outstanding receivables</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead>Vendor / Partner</TableHead>
                  <TableHead className="text-right">Current (0–30)</TableHead>
                  <TableHead className="text-right">31–60 Days</TableHead>
                  <TableHead className="text-right">61–90 Days</TableHead>
                  <TableHead className="text-right">Over 90 Days</TableHead>
                  <TableHead className="text-right font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agingRows.map((r,i) => (
                  <TableRow key={r.vendor} className={i%2!==0?'bg-muted/5':''}>
                    <TableCell className="font-medium">{r.vendor}</TableCell>
                    <TableCell className="text-right tabular-nums text-green-700">{r.current>0?formatNumber(r.current):''}</TableCell>
                    <TableCell className="text-right tabular-nums text-amber-700">{r.days30>0?formatNumber(r.days30):''}</TableCell>
                    <TableCell className="text-right tabular-nums text-orange-700">{r.days60>0?formatNumber(r.days60):''}</TableCell>
                    <TableCell className="text-right tabular-nums text-red-700">{r.over90>0?formatNumber(r.over90):''}</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{formatNumber(r.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-bold border-t-2">
                  <TableCell>TOTAL</TableCell>
                  <TableCell className="text-right tabular-nums text-green-700">{formatNumber(totals.current)}</TableCell>
                  <TableCell className="text-right tabular-nums text-amber-700">{formatNumber(totals.days30)}</TableCell>
                  <TableCell className="text-right tabular-nums text-orange-700">{formatNumber(totals.days60)}</TableCell>
                  <TableCell className="text-right tabular-nums text-red-700">{formatNumber(totals.over90)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(totals.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
