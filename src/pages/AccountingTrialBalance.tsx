import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Download, RefreshCw, Scale, FileDown, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ACCT_TYPE_LABELS, formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { ensureArabicFont, setArabicFont, setLatinFont, ARABIC_FONT_NAME } from '@/lib/jspdfArabic';
import { cn } from '@/lib/utils';

interface Period { id: string; period_no: number; start_date: string; end_date: string; status: string; fiscal_year_id: string }
interface FiscalYear { id: string; code: string }
interface Fund { id: string; code: string; name_en: string; name_ar: string }
interface TbRow {
  account_id: string;
  account_code: string;
  account_name_en: string;
  account_name_ar: string;
  debit_total: number;
  credit_total: number;
  net_balance: number;
}
interface AccountMeta { id: string; account_type: string; subtype: string }

export default function AccountingTrialBalance() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [accountsMeta, setAccountsMeta] = useState<Record<string, AccountMeta>>({});
  const [periodId, setPeriodId] = useState<string>('');
  const [fundId, setFundId] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [tb, setTb] = useState<TbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [yres, pres, fres, ares] = await Promise.all([
        supabase.from('acct_fiscal_years').select('id, code').order('code', { ascending: false }),
        supabase.from('acct_fiscal_periods').select('id, period_no, start_date, end_date, status, fiscal_year_id').order('start_date', { ascending: false }),
        supabase.from('acct_funds').select('id, code, name_en, name_ar').eq('is_active', true).order('code'),
        supabase.from('acct_accounts').select('id, account_type, subtype'),
      ]);
      if (cancel) return;
      const firstErr = [yres.error, pres.error, fres.error, ares.error].find(Boolean);
      if (firstErr) setError(firstErr.message);
      setYears((yres.data ?? []) as FiscalYear[]);
      setPeriods((pres.data ?? []) as Period[]);
      setFunds((fres.data ?? []) as Fund[]);
      const am: Record<string, AccountMeta> = {};
      for (const a of (ares.data ?? [])) am[a.id] = a as AccountMeta;
      setAccountsMeta(am);
      const firstOpen = (pres.data ?? []).find((p: any) => p.status === 'open' || p.status === 'soft_closed');
      if (firstOpen) setPeriodId(firstOpen.id);
      setBootstrap(false);
    })();
    return () => { cancel = true; };
  }, []);

  const runTb = async () => {
    if (!periodId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc('acct_trial_balance' as any, {
      p_period_id: periodId,
      p_branch_id: null,
      p_fund_id: fundId === 'all' ? null : fundId,
    } as any);
    if (err) setError(err.message);
    setTb((data ?? []) as TbRow[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed && periodId) void runTb(); }, [periodId, fundId, allowed]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tb;
    return tb.filter(r =>
      r.account_code.toLowerCase().includes(q)
      || (r.account_name_en ?? '').toLowerCase().includes(q)
      || (r.account_name_ar ?? '').toLowerCase().includes(q)
    );
  }, [tb, search]);

  const totals = useMemo(() => {
    let dr = 0, cr = 0;
    for (const r of filtered) {
      dr += Number(r.debit_total) || 0;
      cr += Number(r.credit_total) || 0;
    }
    return { dr, cr, balanced: Math.abs(dr - cr) < 0.005 };
  }, [filtered]);

  const groupedByType = useMemo(() => {
    const groups: Record<string, TbRow[]> = {};
    for (const r of filtered) {
      const meta = accountsMeta[r.account_id];
      const t = meta?.account_type ?? 'other';
      if (!groups[t]) groups[t] = [];
      groups[t].push(r);
    }
    return groups;
  }, [filtered, accountsMeta]);

  const periodLabel = (id: string) => {
    const p = periods.find(x => x.id === id);
    if (!p) return '—';
    const y = years.find(yy => yy.id === p.fiscal_year_id);
    return `${y?.code ?? '?'} P${String(p.period_no).padStart(2, '0')} · ${format(parseISO(p.start_date), 'MMM d')} – ${format(parseISO(p.end_date), 'MMM d, yyyy')}`;
  };

  const fundLabel = fundId === 'all' ? 'All funds' : (() => { const f = funds.find(x => x.id === fundId); return f ? `${f.code} — ${f.name_en}` : fundId; })();

  const exportCsv = () => {
    const header = ['Account Code', 'Name (EN)', 'Name (AR)', 'Type', 'Debit', 'Credit', 'Net Balance'];
    const body = filtered.map(r => [
      r.account_code, r.account_name_en, r.account_name_ar,
      accountsMeta[r.account_id]?.account_type ?? '',
      Number(r.debit_total).toFixed(2), Number(r.credit_total).toFixed(2), Number(r.net_balance).toFixed(2),
    ]);
    const footer = ['TOTAL', '', '', '', totals.dr.toFixed(2), totals.cr.toFixed(2), (totals.dr - totals.cr).toFixed(2)];
    downloadCsv(`trial-balance-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body, footer]);
  };

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
      const arabicReady = await ensureArabicFont(doc);

      setLatinFont(doc);
      doc.setFontSize(14);
      doc.text('Trial Balance', 14, 16);
      if (arabicReady) {
        setArabicFont(doc);
        doc.text('ميزان المراجعة', 280, 16, { align: 'right' });
      }
      setLatinFont(doc);
      doc.setFontSize(9);
      doc.text(`Period: ${periodLabel(periodId)}`, 14, 22);
      doc.text(`Fund: ${fundLabel}`, 14, 27);
      doc.text(`Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 32);

      const head = [['Code', 'Name (EN)', 'Name (AR)', 'Type', 'Debit', 'Credit', 'Net']];
      const body = filtered.map(r => [
        r.account_code,
        r.account_name_en,
        r.account_name_ar,
        accountsMeta[r.account_id]?.account_type ?? '',
        formatNumber(r.debit_total),
        formatNumber(r.credit_total),
        formatNumber(r.net_balance),
      ]);
      const foot = [['TOTAL', '', '', '', formatNumber(totals.dr), formatNumber(totals.cr), formatNumber(totals.dr - totals.cr)]];

      autoTable(doc, {
        head, body, foot,
        startY: 38,
        styles: { fontSize: 8, cellPadding: 1.5, font: arabicReady ? ARABIC_FONT_NAME : 'helvetica' },
        headStyles: { fillColor: [30, 64, 175], textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [241, 245, 249], textColor: 30, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 18 },
          1: { cellWidth: 65 },
          2: { cellWidth: 55, halign: 'right' },
          3: { cellWidth: 22 },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 30, halign: 'right' },
          6: { cellWidth: 30, halign: 'right' },
        },
      });

      doc.save(`trial-balance-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  if (authLoading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 max-w-[1400px]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="w-6 h-6 text-emerald-600" /> Trial Balance
            <span className="text-sm font-normal text-muted-foreground" dir="rtl" lang="ar">ميزان المراجعة</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fund-aware totals straight from <code className="text-xs bg-muted px-1 rounded">acct_trial_balance</code>. Debits should equal credits in the functional currency.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void runTb()} disabled={!periodId || loading} data-testid="button-refresh">
            <RefreshCw className={cn('w-4 h-4 mr-1', loading && 'animate-spin')} /> Recompute
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length} data-testid="button-export-csv">
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => void exportPdf()} disabled={!filtered.length || pdfBusy} data-testid="button-export-pdf">
            {pdfBusy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />} PDF (EN/AR)
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <Select value={periodId} onValueChange={setPeriodId} disabled={bootstrap}>
              <SelectTrigger data-testid="select-period"><SelectValue placeholder={bootstrap ? 'Loading…' : 'Select period'} /></SelectTrigger>
              <SelectContent>
                {periods.map(p => (
                  <SelectItem key={p.id} value={p.id}>{periodLabel(p.id)} · {p.status}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger data-testid="select-fund"><SelectValue placeholder="Fund" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All funds</SelectItem>
                {funds.map(f => <SelectItem key={f.id} value={f.id}>{f.code} — {f.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative sm:col-span-2">
              <Search className="absolute left-2 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Filter rows by code or name…" value={search} onChange={e => setSearch(e.target.value)} className="pl-8" data-testid="input-search" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Rows</div><div className="text-xl font-bold" data-testid="kpi-rows">{filtered.length}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Total Debit</div><div className="text-xl font-bold text-emerald-700" data-testid="kpi-debit">{formatNumber(totals.dr)}</div></CardContent></Card>
        <Card><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">Total Credit</div><div className="text-xl font-bold text-rose-700" data-testid="kpi-credit">{formatNumber(totals.cr)}</div></CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-[11px] text-muted-foreground">Status</div>
          <div className="text-sm font-bold mt-1" data-testid="kpi-balanced">
            {totals.balanced
              ? <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Balanced</Badge>
              : <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Out of balance · Δ {formatNumber(totals.dr - totals.cr)}</Badge>}
          </div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Trial Balance Detail</CardTitle></CardHeader>
        <CardContent>
          {error && (
            <div className="p-3 mb-3 rounded border border-rose-200 bg-rose-50 text-rose-800 text-sm" data-testid="text-error">
              {error}
              <div className="text-xs mt-1 text-rose-700/80">If this is a missing-relation/function error, Sprint 1.1 SQL has not been pasted into pactdb yet.</div>
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Computing trial balance…</div>
          ) : !periodId ? (
            <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-no-period">Pick a fiscal period to compute the trial balance.</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm" data-testid="text-empty">No activity in this period under the chosen fund filter.</div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2">Code</th>
                    <th className="text-left px-3 py-2">Name (EN)</th>
                    <th className="text-right px-3 py-2">Name (AR)</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-right px-3 py-2">Debit</th>
                    <th className="text-right px-3 py-2">Credit</th>
                    <th className="text-right px-3 py-2">Net</th>
                  </tr>
                </thead>
                {(['asset', 'liability', 'equity', 'revenue', 'expense'] as const).map(t => {
                  const rows = groupedByType[t];
                  if (!rows || !rows.length) return null;
                  return (
                    <tbody key={t}>
                      <tr className="bg-muted/20 border-t">
                        <td colSpan={7} className="px-3 py-1 text-[11px] uppercase font-semibold text-muted-foreground">
                          {ACCT_TYPE_LABELS[t]?.en} <span dir="rtl" lang="ar" className="ml-2">{ACCT_TYPE_LABELS[t]?.ar}</span>
                        </td>
                      </tr>
                      {rows.map(r => (
                        <tr key={r.account_id} className="border-t hover:bg-muted/30" data-testid={`row-tb-${r.account_id}`}>
                          <td className="px-3 py-1.5 font-mono text-xs">{r.account_code}</td>
                          <td className="px-3 py-1.5">{r.account_name_en}</td>
                          <td className="px-3 py-1.5 text-right text-xs text-muted-foreground" dir="rtl" lang="ar">{r.account_name_ar}</td>
                          <td className="px-3 py-1.5 text-xs"><Badge variant="outline" className="text-[10px]">{accountsMeta[r.account_id]?.account_type ?? '?'}</Badge></td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-emerald-700">{Number(r.debit_total) ? formatNumber(r.debit_total) : '—'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-rose-700">{Number(r.credit_total) ? formatNumber(r.credit_total) : '—'}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatNumber(r.net_balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  );
                })}
                <tfoot className="border-t bg-muted/40">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right font-semibold">TOTAL</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-700">{formatNumber(totals.dr)}</td>
                    <td className="px-3 py-2 text-right font-bold text-rose-700">{formatNumber(totals.cr)}</td>
                    <td className="px-3 py-2 text-right font-bold">{formatNumber(totals.dr - totals.cr)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
