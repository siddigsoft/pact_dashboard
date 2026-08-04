import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLoader } from '@/components/ui/page-loader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, RefreshCw, FileText, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface TaxSummaryRow { tax_name: string; tax_rate: number; taxable_base: number; output_tax: number; input_tax: number; net_tax: number; }

const fmt = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(n ?? 0);

export default function AccountingTaxReturn() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(String(currentYear));
  const [quarter, setQuarter] = useState(`Q${Math.ceil(currentMonth / 3)}`);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<TaxSummaryRow[]>([]);
  const [whtRows, setWhtRows] = useState<any[]>([]);

  const run = async () => {
    setLoading(true);
    const yearNum = parseInt(year);
    const qNum = parseInt(quarter.replace('Q', ''));
    const startM = (qNum - 1) * 3 + 1;
    const endM = qNum * 3;
    const dateFrom = `${yearNum}-${String(startM).padStart(2, '0')}-01`;
    const dateTo = `${yearNum}-${String(endM).padStart(2, '0')}-31`;

    const [taxCodesRes, whtRes] = await Promise.all([
      supabase.from('acct_tax_codes' as any).select('*').eq('is_active', true),
      supabase.from('acct_withholding_tax_entries' as any).select('*, acct_withholding_tax_rates(name_en, rate_pct)').gte('entry_date', dateFrom).lte('entry_date', dateTo),
    ]);

    // Build tax summary from customer invoices and AP invoices
    const [arRes, apRes] = await Promise.all([
      supabase.from('acct_customer_invoices' as any).select('tax_amount, total_amount').gte('invoice_date', dateFrom).lte('invoice_date', dateTo).not('status', 'in', '(draft,cancelled,void)'),
      supabase.from('acct_ap_invoices' as any).select('tax_amount, total_amount').gte('invoice_date', dateFrom).lte('invoice_date', dateTo).not('status', 'in', '(draft,cancelled,void)'),
    ]);

    const totalOutputTax = (arRes.data ?? []).reduce((s: number, r: any) => s + (r.tax_amount ?? 0), 0);
    const totalInputTax = (apRes.data ?? []).reduce((s: number, r: any) => s + (r.tax_amount ?? 0), 0);
    const totalARBase = (arRes.data ?? []).reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0);
    const totalAPBase = (apRes.data ?? []).reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0);

    const summary: TaxSummaryRow[] = [
      { tax_name: 'VAT / Sales Tax (Output)', tax_rate: totalARBase > 0 ? (totalOutputTax / totalARBase) * 100 : 0, taxable_base: totalARBase, output_tax: totalOutputTax, input_tax: 0, net_tax: totalOutputTax },
      { tax_name: 'VAT / Purchase Tax (Input)', tax_rate: totalAPBase > 0 ? (totalInputTax / totalAPBase) * 100 : 0, taxable_base: totalAPBase, output_tax: 0, input_tax: totalInputTax, net_tax: -totalInputTax },
    ];
    setRows(summary);
    setWhtRows((whtRes.data ?? []) as any[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void run(); }, [allowed, year, quarter]);

  const totals = useMemo(() => ({
    output: rows.reduce((s, r) => s + r.output_tax, 0),
    input: rows.reduce((s, r) => s + r.input_tax, 0),
    net: rows.reduce((s, r) => s + r.net_tax, 0),
    wht: whtRows.reduce((s: number, r: any) => s + (r.wht_amount ?? 0), 0),
  }), [rows, whtRows]);

  const exportData = [...rows.map(r => ({ ...r, type: 'VAT/Tax' })), ...whtRows.map(r => ({ tax_name: (r.acct_withholding_tax_rates as any)?.name_en, wht_amount: r.wht_amount, gross: r.gross_amount, type: 'WHT' }))];

  if (!authReady || !isAuthenticated) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6 text-orange-600" /> Tax Return Summary</h1>
          <p className="text-sm text-muted-foreground mt-1">VAT input/output summary and WHT remittance for filing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void run()} disabled={loading}><RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(exportData, `tax-return-${year}-${quarter}`)} disabled={!rows.length && !whtRows.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="flex gap-2">
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>{[currentYear, currentYear - 1, currentYear - 2].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={quarter} onValueChange={setQuarter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="Q1">Q1 (Jan–Mar)</SelectItem><SelectItem value="Q2">Q2 (Apr–Jun)</SelectItem><SelectItem value="Q3">Q3 (Jul–Sep)</SelectItem><SelectItem value="Q4">Q4 (Oct–Dec)</SelectItem></SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Output Tax (Sales)', value: fmt(totals.output), icon: TrendingUp, color: 'text-rose-700' },
          { label: 'Input Tax (Purchases)', value: fmt(totals.input), icon: TrendingDown, color: 'text-emerald-700' },
          { label: 'Net VAT Due / Refund', value: fmt(totals.net), icon: DollarSign, color: totals.net >= 0 ? 'text-rose-700' : 'text-emerald-700' },
          { label: 'WHT Deducted', value: fmt(totals.wht), icon: FileText, color: 'text-amber-700' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4 flex items-center gap-3"><k.icon className={cn('w-7 h-7', k.color)} /><div><div className="text-xs text-muted-foreground">{k.label}</div><div className={cn('text-xl font-bold', k.color)}>{k.value}</div></div></CardContent></Card>
        ))}
      </div>

      {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Calculating…</div>
      : (
        <>
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">VAT / Sales Tax Summary — {year} {quarter}</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Tax Type</th><th className="px-3 py-2 text-right">Taxable Base</th>
                  <th className="px-3 py-2 text-right">Output Tax</th><th className="px-3 py-2 text-right">Input Tax</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.tax_name} className="border-b hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{r.tax_name}</td>
                      <td className="px-3 py-2 text-right">{fmt(r.taxable_base)}</td>
                      <td className="px-3 py-2 text-right text-rose-700">{r.output_tax > 0 ? fmt(r.output_tax) : '—'}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{r.input_tax > 0 ? fmt(r.input_tax) : '—'}</td>
                      <td className={cn('px-3 py-2 text-right font-bold', r.net_tax >= 0 ? 'text-rose-700' : 'text-emerald-700')}>{fmt(r.net_tax)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t bg-muted/50 font-bold">
                  <td className="px-3 py-2">NET VAT {totals.net >= 0 ? 'DUE' : 'REFUND'}</td>
                  <td colSpan={3} />
                  <td className={cn('px-3 py-2 text-right text-lg', totals.net >= 0 ? 'text-rose-700' : 'text-emerald-700')}>{fmt(Math.abs(totals.net))}</td>
                </tr></tfoot>
              </table>
            </CardContent>
          </Card>

          {whtRows.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Withholding Tax Entries — {year} {quarter}</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead><tr className="border-b bg-muted/40 text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Vendor</th>
                    <th className="px-3 py-2 text-left">Rate</th><th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">WHT</th><th className="px-3 py-2 text-center">Remitted</th>
                  </tr></thead>
                  <tbody>
                    {whtRows.map((r: any) => (
                      <tr key={r.id} className="border-b hover:bg-muted/30">
                        <td className="px-3 py-2 text-muted-foreground">{r.entry_date}</td>
                        <td className="px-3 py-2">{r.vendor_name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{(r.acct_withholding_tax_rates as any)?.name_en} ({(r.acct_withholding_tax_rates as any)?.rate_pct}%)</td>
                        <td className="px-3 py-2 text-right">{fmt(r.gross_amount)}</td>
                        <td className="px-3 py-2 text-right text-rose-700 font-medium">{fmt(r.wht_amount)}</td>
                        <td className="px-3 py-2 text-center">{r.remitted ? '✅' : '⏳'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr className="border-t bg-muted/50 font-bold"><td colSpan={4} className="px-3 py-2 text-right">Total WHT</td><td className="px-3 py-2 text-right text-rose-700">{fmt(totals.wht)}</td><td /></tr></tfoot>
                </table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
