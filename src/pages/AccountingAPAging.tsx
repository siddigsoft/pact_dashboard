import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Clock, Download, RefreshCw, Search } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { PageLoader } from '@/components/ui/page-loader';
import { useApAgingQuery } from '@/hooks/useAccountingQueries';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, Legend } from 'recharts';

type Vendor = NonNullable<ReturnType<typeof useApAgingQuery>['data']>['vendors'][number];

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
  const { hasAnyRole } = useAuthorization();
  const { authReady } = useAppContext();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);

  const query = useApAgingQuery(allowed && authReady);
  const vendors = query.data?.vendors ?? [];
  const lines = query.data?.lines ?? [];
  const loading = query.isLoading;
  const error = query.error instanceof Error ? query.error.message : query.error ? String(query.error) : null;
  const load = () => void query.refetch();

  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const vendorMap = useMemo(() => {
    const m: Record<string, Vendor> = {};
    for (const v of vendors) m[v.id] = v;
    return m;
  }, [vendors]);

  const agingRows: VendorAgingRow[] = useMemo(() => {
    const byVendor: Record<
      string,
      { vendor: Vendor; buckets: Record<AgeBucket, number>; currency: string; oldestDays: number }
    > = {};
    for (const line of lines) {
      const vendor = vendorMap[line.vendor_id];
      if (!vendor) continue;
      if (typeFilter !== 'all' && vendor.vendor_type !== typeFilter) continue;
      if (!byVendor[vendor.id]) {
        byVendor[vendor.id] = {
          vendor,
          buckets: { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, over_90: 0 },
          currency: line.functional_currency,
          oldestDays: 0,
        };
      }
      const bucket = ageBucket(line.posting_date, vendor.payment_terms);
      const sign = line.debit_credit === 'CR' ? 1 : -1;
      byVendor[vendor.id].buckets[bucket] += sign * Number(line.functional_amount);
      const days = differenceInDays(new Date(), new Date(line.posting_date));
      if (days > byVendor[vendor.id].oldestDays) byVendor[vendor.id].oldestDays = days;
    }
    return Object.values(byVendor)
      .map(({ vendor, buckets, currency, oldestDays }) => ({
        vendor,
        currency,
        oldestDays,
        current: buckets.current,
        b1_30: buckets['1_30'],
        b31_60: buckets['31_60'],
        b61_90: buckets['61_90'],
        over90: buckets.over_90,
        total:
          buckets.current +
          buckets['1_30'] +
          buckets['31_60'] +
          buckets['61_90'] +
          buckets.over_90,
      }))
      .filter((r) => {
        if (Math.abs(r.total) < 0.01) return false;
        const q = search.toLowerCase();
        if (
          q &&
          !r.vendor.name_en.toLowerCase().includes(q) &&
          !(r.vendor.name_ar ?? '').includes(q) &&
          !(r.vendor.vendor_code ?? '').toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.total - a.total);
  }, [lines, vendorMap, typeFilter, search]);

  const totals = useMemo(
    () => ({
      current: agingRows.reduce((s, r) => s + r.current, 0),
      b1_30: agingRows.reduce((s, r) => s + r.b1_30, 0),
      b31_60: agingRows.reduce((s, r) => s + r.b31_60, 0),
      b61_90: agingRows.reduce((s, r) => s + r.b61_90, 0),
      over90: agingRows.reduce((s, r) => s + r.over90, 0),
      total: agingRows.reduce((s, r) => s + r.total, 0),
    }),
    [agingRows]
  );

  const chartData = [
    { name: 'Current', value: Math.abs(totals.current), color: BUCKET_COLORS.current },
    { name: '1–30d', value: Math.abs(totals.b1_30), color: BUCKET_COLORS['1–30d'] },
    { name: '31–60d', value: Math.abs(totals.b31_60), color: BUCKET_COLORS['31–60d'] },
    { name: '61–90d', value: Math.abs(totals.b61_90), color: BUCKET_COLORS['61–90d'] },
    { name: '90+d', value: Math.abs(totals.over90), color: BUCKET_COLORS['90+d'] },
  ].filter((d) => d.value > 0);

  const exportCsv = () => {
    const header = [
      'Vendor Code',
      'Vendor Name',
      'Type',
      'Currency',
      'Current',
      '1–30d',
      '31–60d',
      '61–90d',
      '90+d',
      'Total',
      'Oldest (days)',
    ];
    const rows = agingRows.map((r) => [
      r.vendor.vendor_code ?? '',
      r.vendor.name_en,
      r.vendor.vendor_type,
      r.currency,
      r.current.toFixed(2),
      r.b1_30.toFixed(2),
      r.b31_60.toFixed(2),
      r.b61_90.toFixed(2),
      r.over90.toFixed(2),
      r.total.toFixed(2),
      String(r.oldestDays),
    ]);
    const footer = [
      '',
      'TOTAL',
      '',
      '',
      totals.current.toFixed(2),
      totals.b1_30.toFixed(2),
      totals.b31_60.toFixed(2),
      totals.b61_90.toFixed(2),
      totals.over90.toFixed(2),
      totals.total.toFixed(2),
      '',
    ];
    downloadCsv(`ap-aging-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows, footer]);
  };

  const exportExcel = () => {
    const rows = agingRows.map((r) => ({
      'Vendor Code': r.vendor.vendor_code ?? '',
      'Vendor Name': r.vendor.name_en,
      Type: r.vendor.vendor_type,
      Currency: r.currency,
      Current: r.current,
      '1–30d': r.b1_30,
      '31–60d': r.b31_60,
      '61–90d': r.b61_90,
      '90+d': r.over90,
      Total: r.total,
      'Oldest (days)': r.oldestDays,
    }));

    rows.push({
      'Vendor Code': '',
      'Vendor Name': 'TOTAL',
      Type: '',
      Currency: '',
      Current: totals.current,
      '1–30d': totals.b1_30,
      '31–60d': totals.b31_60,
      '61–90d': totals.b61_90,
      '90+d': totals.over90,
      Total: totals.total,
      'Oldest (days)': 0,
    });

    exportToExcel(rows, 'AP Aging', `ap-aging-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const VENDOR_TYPES = ['supplier', 'service_provider', 'consultant', 'ngo_partner', 'government', 'utility'];

  if (!authReady) return <PageLoader label="Checking session…" />;
  if (!allowed) return <Navigate to="/" replace />;
  if (loading && !query.data) return <PageLoader label="Loading AP aging…" />;

  const riskBadge = (r: VendorAgingRow) => {
    if (r.over90 > 0 || r.b61_90 > 0)
      return (
        <Badge className="text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-900/30 border-rose-200">High</Badge>
      );
    if (r.b31_60 > 0)
      return (
        <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/30 border-amber-200">
          Medium
        </Badge>
      );
    if (r.b1_30 > 0)
      return <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-200">Low</Badge>;
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
            <p className="text-muted-foreground text-sm">
              تقرير استحقاقات الدائنين — Accounts payable aging by vendor
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            data-testid="button-refresh"
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            disabled={!agingRows.length}
            data-testid="button-export-ap-aging"
          >
            <Download className="h-4 w-4 mr-1" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={!agingRows.length}
            data-testid="button-export"
          >
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
        </div>
      </div>

      <PageInfoBanner
        title="AP Aging Report"
        description="Shows outstanding vendor balances grouped by how overdue they are relative to each vendor's payment terms. Red rows have amounts outstanding 90+ days. Requires vendors to be tagged on journal entry lines. Run supabase/vendors_migration.sql if the vendor column is missing."
        descriptionAr="يُظهر أرصدة الموردين المستحقة مصنفةً حسب مدة التأخر عن تواريخ الاستحقاق. الصفوف الحمراء تحتوي على مبالغ متأخرة أكثر من 90 يوماً."
      />

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">
          {error}
        </div>
      )}

      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Search vendor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44 h-9" data-testid="select-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {VENDOR_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {agingRows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {[
            { label: 'Current', value: totals.current, color: 'text-emerald-700' },
            { label: '1–30 days', value: totals.b1_30, color: 'text-lime-700' },
            { label: '31–60 days', value: totals.b31_60, color: 'text-amber-700' },
            { label: '61–90 days', value: totals.b61_90, color: 'text-orange-700' },
            { label: '90+ days', value: totals.over90, color: 'text-rose-700' },
            { label: 'Total AP', value: totals.total, color: 'text-foreground font-bold' },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{s.label}</p>
                <p className={cn('text-sm font-semibold mt-0.5 tabular-nums', s.color)}>
                  {formatNumber(s.value)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {chartData.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-0 pt-3 px-4">
            <CardTitle className="text-sm">Aging Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-48 pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatNumber(v)} />
                <Legend />
                <Bar dataKey="value" name="Amount" radius={[4, 4, 0, 0]}>
                  {chartData.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {agingRows.length === 0 ? (
        <div className="text-center text-muted-foreground py-16 text-sm">
          {vendors.length === 0
            ? 'No vendors found. Run vendors_migration.sql and add vendors first.'
            : 'No outstanding vendor balances found. Ensure journal lines are tagged to vendors.'}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                {agingRows.length} vendor{agingRows.length !== 1 ? 's' : ''} with outstanding balances
              </CardTitle>
              <span className="text-xs text-muted-foreground">As of {format(new Date(), 'dd MMM yyyy')}</span>
            </div>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Vendor</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground text-emerald-700 dark:text-emerald-400">
                      Current
                    </th>
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
                    <tr
                      key={row.vendor.id}
                      className={cn('border-b hover:bg-muted/20', i % 2 === 0 ? '' : 'bg-muted/10')}
                    >
                      <td className="px-4 py-2">
                        <div className="font-medium">{row.vendor.name_en}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {row.vendor.vendor_code} · {row.vendor.vendor_type.replace('_', ' ')}
                        </div>
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums">{formatNumber(row.current)}</td>
                      <td className="text-right px-3 py-2 tabular-nums">{formatNumber(row.b1_30)}</td>
                      <td className="text-right px-3 py-2 tabular-nums">{formatNumber(row.b31_60)}</td>
                      <td className="text-right px-3 py-2 tabular-nums">{formatNumber(row.b61_90)}</td>
                      <td className="text-right px-3 py-2 tabular-nums font-medium text-rose-700">
                        {formatNumber(row.over90)}
                      </td>
                      <td className="text-right px-3 py-2 tabular-nums font-semibold">{formatNumber(row.total)}</td>
                      <td className="px-3 py-2">{riskBadge(row)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-semibold">
                    <td className="px-4 py-2">Total</td>
                    <td className="text-right px-3 py-2 tabular-nums">{formatNumber(totals.current)}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{formatNumber(totals.b1_30)}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{formatNumber(totals.b31_60)}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{formatNumber(totals.b61_90)}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{formatNumber(totals.over90)}</td>
                    <td className="text-right px-3 py-2 tabular-nums">{formatNumber(totals.total)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
