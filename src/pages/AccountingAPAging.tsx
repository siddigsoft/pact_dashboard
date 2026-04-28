import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clock, Download, RefreshCw, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend } from 'recharts';

interface Vendor { id: string; vendor_code: string | null; name_en: string; name_ar: string | null; vendor_type: string; currency: string; payment_terms: number }
interface JournalLine { id: string; vendor_id: string; debit_credit: string; functional_amount: number; functional_currency: string; posting_date: string }
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null }

type AgeBucket = 'current' | '1_30' | '31_60' | '61_90' | 'over_90';

interface VendorAgingRow {
  vendor: Vendor;
  current: number;
  b1_30: number;
  b31_60: number;
  b61_90: number;
  over90: number;
  total: number;
  currency: string;
  oldestDays: number;
}

const BUCKET_COLORS: Record<string, string> = {
  current: '#22c55e',
  '1–30d': '#84cc16',
  '31–60d': '#f59e0b',
  '61–90d': '#f97316',
  '90+d': '#ef4444',
};

function ageBucket(postingDate: string, paymentTerms: number): AgeBucket {
  const due = new Date(postingDate);
  due.setDate(due.getDate() + paymentTerms);
  const daysOverdue = differenceInDays(new Date(), due);
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1_30';
  if (daysOverdue <= 60) return '31_60';
  if (daysOverdue <= 90) return '61_90';
  return 'over_90';
}

export default function AccountingAPAging() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const { countryId: defaultCountryId, loading: acctLoading } = useAccountingCountry();

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [lines, setLines] = useState<JournalLine[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryFilter, setCountryFilter] = useState('all');
  const [countryInit, setCountryInit] = useState(false);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!acctLoading && !countryInit) { setCountryFilter(defaultCountryId ?? 'all'); setCountryInit(true); }
  }, [acctLoading, defaultCountryId, countryInit]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [vRes, lRes, cRes] = await Promise.all([
        supabase.from('acct_vendors').select('id, vendor_code, name_en, name_ar, vendor_type, currency, payment_terms').eq('is_active', true).order('name_en'),
        supabase.from('acct_journal_lines')
          .select('id, vendor_id, debit_credit, functional_amount, functional_currency, acct_journal_entries!inner(posting_date, status)')
          .not('vendor_id', 'is', null)
          .eq('acct_journal_entries.status', 'posted'),
        supabase.from('countries').select('id, code, name_en, flag_emoji').eq('is_active', true).order('name_en'),
      ]);
      if (vRes.error && vRes.error.code !== '42P01') throw new Error(vRes.error.message);
      if (lRes.error && lRes.error.code !== '42P01') throw new Error(lRes.error.message);
      setVendors((vRes.data ?? []) as Vendor[]);
      setLines(((lRes.data ?? []) as any[]).map(l => ({ id: l.id, vendor_id: l.vendor_id, debit_credit: l.debit_credit, functional_amount: l.functional_amount, functional_currency: l.functional_currency, posting_date: l.acct_journal_entries?.posting_date ?? new Date().toISOString().slice(0, 10) })));
      setCountries((cRes.data ?? []) as Country[]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load aging data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const vendorMap = useMemo(() => { const m: Record<string, Vendor> = {}; for (const v of vendors) m[v.id] = v; return m; }, [vendors]);

  const agingRows: VendorAgingRow[] = useMemo(() => {
    const byVendor: Record<string, { vendor: Vendor; buckets: Record<AgeBucket, number>; currency: string; oldestDays: number }> = {};
    for (const line of lines) {
      const vendor = vendorMap[line.vendor_id]; if (!vendor) continue;
      if (typeFilter !== 'all' && vendor.vendor_type !== typeFilter) continue;
      if (!byVendor[vendor.id]) byVendor[vendor.id] = { vendor, buckets: { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, over_90: 0 }, currency: line.functional_currency, oldestDays: 0 };
      const bucket = ageBucket(line.posting_date, vendor.payment_terms);
      const sign = line.debit_credit === 'CR' ? 1 : -1;
      byVendor[vendor.id].buckets[bucket] += sign * Number(line.functional_amount);
      const days = differenceInDays(new Date(), new Date(line.posting_date));
      if (days > byVendor[vendor.id].oldestDays) byVendor[vendor.id].oldestDays = days;
    }
    return Object.values(byVendor)
      .map(({ vendor, buckets, currency, oldestDays }) => ({
        vendor, currency, oldestDays,
        current: buckets.current, b1_30: buckets['1_30'], b31_60: buckets['31_60'], b61_90: buckets['61_90'], over90: buckets.over_90,
        total: buckets.current + buckets['1_30'] + buckets['31_60'] + buckets['61_90'] + buckets.over_90,
      }))
      .filter(r => {
        if (Math.abs(r.total) < 0.01) return false;
        const q = search.toLowerCase();
        if (q && !r.vendor.name_en.toLowerCase().includes(q) && !(r.vendor.name_ar ?? '').includes(q) && !(r.vendor.vendor_code ?? '').toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.total - a.total);
  }, [lines, vendorMap, typeFilter, search]);

  const totals = useMemo(() => ({ current: agingRows.reduce((s, r) => s + r.current, 0), b1_30: agingRows.reduce((s, r) => s + r.b1_30, 0), b31_60: agingRows.reduce((s, r) => s + r.b31_60, 0), b61_90: agingRows.reduce((s, r) => s + r.b61_90, 0), over90: agingRows.reduce((s, r) => s + r.over90, 0), total: agingRows.reduce((s, r) => s + r.total, 0) }), [agingRows]);

  const chartData = [
    { name: 'Current', value: Math.abs(totals.current), color: BUCKET_COLORS.current },
    { name: '1–30d', value: Math.abs(totals.b1_30), color: BUCKET_COLORS['1–30d'] },
    { name: '31–60d', value: Math.abs(totals.b31_60), color: BUCKET_COLORS['31–60d'] },
    { name: '61–90d', value: Math.abs(totals.b61_90), color: BUCKET_COLORS['61–90d'] },
    { name: '90+d', value: Math.abs(totals.over90), color: BUCKET_COLORS['90+d'] },
  ].filter(d => d.value > 0);

  const exportCsv = () => {
    const header = ['Vendor Code', 'Vendor Name', 'Type', 'Currency', 'Current', '1–30d', '31–60d', '61–90d', '90+d', 'Total', 'Oldest (days)'];
    const rows = agingRows.map(r => [r.vendor.vendor_code ?? '', r.vendor.name_en, r.vendor.vendor_type, r.currency, r.current.toFixed(2), r.b1_30.toFixed(2), r.b31_60.toFixed(2), r.b61_90.toFixed(2), r.over90.toFixed(2), r.total.toFixed(2), String(r.oldestDays)]);
    const footer = ['', 'TOTAL', '', '', totals.current.toFixed(2), totals.b1_30.toFixed(2), totals.b31_60.toFixed(2), totals.b61_90.toFixed(2), totals.over90.toFixed(2), totals.total.toFixed(2), ''];
    downloadCsv(`ap-aging-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows, footer]);
  };

  const VENDOR_TYPES = ['supplier', 'service_provider', 'consultant', 'ngo_partner', 'government', 'utility'];

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const riskBadge = (r: VendorAgingRow) => {
    if (r.over90 > 0 || r.b61_90 > 0) return <Badge className="text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-900/30 border-rose-200">High</Badge>;
    if (r.b31_60 > 0) return <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 border-amber-200">Medium</Badge>;
    if (r.b1_30 > 0) return <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-200">Low</Badge>;
    return <Badge className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-200">Current</Badge>;
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl" data-testid="ap-aging-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-rose-600 text-white shrink-0">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AP Aging Report</h1>
            <p className="text-muted-foreground text-sm">تقرير استحقاقات الدائنين — Accounts payable aging by vendor</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="button-refresh"><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!agingRows.length} data-testid="button-export"><Download className="h-4 w-4 mr-1" />CSV</Button>
        </div>
      </div>

      <PageInfoBanner
        title="AP Aging Report"
        description="Shows outstanding vendor balances grouped by how overdue they are relative to each vendor's payment terms. Red rows have amounts outstanding 90+ days. Requires vendors to be tagged on journal entry lines. Run supabase/vendors_migration.sql if the vendor column is missing."
        descriptionAr="يُظهر أرصدة الموردين المستحقة مصنفةً حسب مدة التأخر عن تواريخ الاستحقاق. الصفوف الحمراء تحتوي على مبالغ متأخرة أكثر من 90 يوماً."
      />

      {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input className="pl-8 h-9 text-sm" placeholder="Search vendor..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44 h-9" data-testid="select-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {VENDOR_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Current', value: totals.current, color: 'text-emerald-700' },
          { label: '1–30 days', value: totals.b1_30, color: 'text-lime-700' },
          { label: '31–60 days', value: totals.b31_60, color: 'text-amber-700' },
          { label: '61–90 days', value: totals.b61_90, color: 'text-orange-700' },
          { label: '90+ days', value: totals.over90, color: 'text-rose-700 font-bold' },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-3">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className={cn('text-sm font-semibold tabular-nums mt-0.5', s.color)}>{formatNumber(Math.abs(s.value))}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2 pt-3">
            <CardTitle className="text-sm">Aging Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 4, right: 20, left: 20, bottom: 4 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatNumber(v)} width={70} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : agingRows.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 text-sm">
          {vendors.length === 0 ? 'No vendors found. Run vendors_migration.sql and add vendors first.' : 'No outstanding vendor balances found. Ensure journal lines are tagged to vendors.'}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">{agingRows.length} vendor{agingRows.length !== 1 ? 's' : ''} with outstanding balances</CardTitle>
              <span className="text-xs text-muted-foreground">As of {format(new Date(), 'dd MMM yyyy')}</span>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vendor</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-emerald-700 dark:text-emerald-400">Current</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-lime-700">1–30d</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-amber-700">31–60d</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-orange-700">61–90d</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-rose-700">90+d</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                    <th className="px-3 py-2 w-20">Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {agingRows.map((row, i) => (
                    <tr key={row.vendor.id} className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{row.vendor.name_en}</div>
                        {row.vendor.name_ar && <div className="text-[10px] text-muted-foreground" dir="rtl">{row.vendor.name_ar}</div>}
                        <div className="text-[10px] text-muted-foreground">{row.vendor.vendor_type.replace('_', ' ')} · Net {row.vendor.payment_terms}d</div>
                      </td>
                      {[row.current, row.b1_30, row.b31_60, row.b61_90, row.over90].map((v, j) => (
                        <td key={j} className={cn('px-3 py-2 text-right tabular-nums', Math.abs(v) > 0 ? [, 'text-lime-700', 'text-amber-700', 'text-orange-700 font-semibold', 'text-rose-700 font-bold'][j] ?? '' : 'text-muted-foreground/30')}>
                          {Math.abs(v) > 0.01 ? formatNumber(v) : '—'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(row.total)} <span className="text-[10px] text-muted-foreground font-normal">{row.currency}</span></td>
                      <td className="px-3 py-2">{riskBadge(row)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 bg-muted/20 font-semibold">
                    <td className="px-4 py-2">TOTAL</td>
                    {[totals.current, totals.b1_30, totals.b31_60, totals.b61_90, totals.over90].map((v, i) => (
                      <td key={i} className={cn('px-3 py-2 text-right tabular-nums', Math.abs(v) > 0 ? [, 'text-lime-700', 'text-amber-700', 'text-orange-700', 'text-rose-700'][i] ?? '' : 'text-muted-foreground/30')}>
                        {Math.abs(v) > 0.01 ? formatNumber(v) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(totals.total)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
