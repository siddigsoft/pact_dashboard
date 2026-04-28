import { useEffect, useMemo, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAccountingCountry } from '@/hooks/use-accounting-country';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Activity, Download, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatNumber, downloadCsv } from '@/lib/accountingFormat';
import { cn } from '@/lib/utils';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Legend } from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Account { id: string; code: string; name_en: string; account_type: string; subtype: string | null }
interface FiscalYear { id: string; code: string }
interface Period { id: string; period_no: number; start_date: string; end_date: string; status: string; fiscal_year_id: string }
interface Country { id: string; code: string; name_en: string; flag_emoji: string | null; currency_code: string }
interface JLRow { account_id: string; debit_credit: string; functional_amount: number; posting_date: string }

type CFCategory = 'operating' | 'investing' | 'financing';

const CF_CATEGORY: Record<string, CFCategory> = {
  revenue: 'operating', expense: 'operating',
  asset: 'investing',
  liability: 'financing', equity: 'financing',
};

function classifyCF(accountType: string, subtype: string | null): CFCategory {
  const sub = (subtype ?? '').toLowerCase();
  if (sub.includes('cash') || sub.includes('bank')) return 'operating';
  return CF_CATEGORY[accountType] ?? 'operating';
}

interface CfSection { label: string; labelAr: string; items: { account_id: string; code: string; name: string; inflow: number; outflow: number; net: number }[]; totalInflow: number; totalOutflow: number; total: number }

export default function AccountingCashFlow() {
  const { hasAnyRole, loading: authLoading } = useAuthorization();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const { countryId: defaultCountryId, loading: acctLoading } = useAccountingCountry();

  const [years, setYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [periodId, setPeriodId] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');
  const [countryInit, setCountryInit] = useState(false);
  const [jLines, setJLines] = useState<JLRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [bootstrap, setBootstrap] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['operating', 'investing', 'financing']));
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    if (!acctLoading && !countryInit) { setCountryFilter(defaultCountryId ?? 'all'); setCountryInit(true); }
  }, [acctLoading, defaultCountryId, countryInit]);

  useEffect(() => {
    (async () => {
      const [yRes, pRes, aRes, cRes] = await Promise.all([
        supabase.from('acct_fiscal_years').select('id, code').order('code', { ascending: false }),
        supabase.from('acct_fiscal_periods').select('id, period_no, start_date, end_date, status, fiscal_year_id').order('start_date', { ascending: false }),
        supabase.from('acct_accounts').select('id, code, name_en, account_type, subtype').eq('is_active', true).order('code'),
        supabase.from('countries').select('id, code, name_en, flag_emoji, currency_code').eq('is_active', true).order('name_en'),
      ]);
      setYears((yRes.data ?? []) as FiscalYear[]);
      setPeriods((pRes.data ?? []) as Period[]);
      const am: Record<string, Account> = {};
      for (const a of (aRes.data ?? [])) am[a.id] = a as Account;
      setAccounts(am);
      setCountries((cRes.data ?? []) as Country[]);
      const first = (pRes.data ?? []).find((p: any) => p.status === 'open' || p.status === 'soft_closed');
      if (first) setPeriodId(first.id);
      setBootstrap(false);
    })();
  }, []);

  const selectedPeriod = useMemo(() => periods.find(p => p.id === periodId), [periods, periodId]);

  const runReport = useCallback(async () => {
    if (!periodId || !selectedPeriod) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: lErr } = await supabase
        .from('acct_journal_lines')
        .select('account_id, debit_credit, functional_amount, acct_journal_entries!inner(posting_date, status)')
        .eq('acct_journal_entries.status', 'posted')
        .gte('acct_journal_entries.posting_date', selectedPeriod.start_date)
        .lte('acct_journal_entries.posting_date', selectedPeriod.end_date);
      if (lErr) throw new Error(lErr.message);
      setJLines(((data ?? []) as any[]).map(l => ({ account_id: l.account_id, debit_credit: l.debit_credit, functional_amount: l.functional_amount, posting_date: l.acct_journal_entries?.posting_date ?? '' })));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [periodId, selectedPeriod]);

  useEffect(() => { if (!bootstrap && periodId) void runReport(); }, [periodId, bootstrap]);

  const selectedCurrency = useMemo(() => countries.find(x => x.id === countryFilter)?.currency_code ?? 'SDG', [countryFilter, countries]);

  const sections: { operating: CfSection; investing: CfSection; financing: CfSection } = useMemo(() => {
    const cats: Record<CFCategory, Record<string, { code: string; name: string; inflow: number; outflow: number }>> = { operating: {}, investing: {}, financing: {} };
    for (const line of jLines) {
      const acct = accounts[line.account_id]; if (!acct) continue;
      if (countryFilter !== 'all') { /* country filter - no country_id on lines, skip for now */ }
      const cat = classifyCF(acct.account_type, acct.subtype);
      if (!cats[cat][acct.id]) cats[cat][acct.id] = { code: acct.code, name: acct.name_en, inflow: 0, outflow: 0 };
      const amt = Number(line.functional_amount) || 0;
      if (line.debit_credit === 'CR') cats[cat][acct.id].inflow += amt;
      else cats[cat][acct.id].outflow += amt;
    }
    const buildSection = (cat: CFCategory, label: string, labelAr: string): CfSection => {
      const items = Object.entries(cats[cat]).map(([id, d]) => ({ account_id: id, ...d, net: d.inflow - d.outflow })).sort((a, b) => a.code.localeCompare(b.code));
      return { label, labelAr, items, totalInflow: items.reduce((s, i) => s + i.inflow, 0), totalOutflow: items.reduce((s, i) => s + i.outflow, 0), total: items.reduce((s, i) => s + i.net, 0) };
    };
    return {
      operating: buildSection('operating', 'Operating Activities', 'الأنشطة التشغيلية'),
      investing: buildSection('investing', 'Investing Activities', 'أنشطة الاستثمار'),
      financing: buildSection('financing', 'Financing Activities', 'أنشطة التمويل'),
    };
  }, [jLines, accounts, countryFilter]);

  const netChange = sections.operating.total + sections.investing.total + sections.financing.total;

  const toggleSection = (key: string) => setExpandedSections(p => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });

  const periodLabel = (id: string) => {
    const p = periods.find(x => x.id === id); if (!p) return '—';
    const y = years.find(yy => yy.id === p.fiscal_year_id);
    return `${y?.code ?? '?'} P${String(p.period_no).padStart(2, '0')} · ${format(parseISO(p.start_date), 'MMM d')}–${format(parseISO(p.end_date), 'MMM d, yyyy')}`;
  };

  const chartData = [
    { name: 'Operating', value: sections.operating.total, fill: sections.operating.total >= 0 ? '#22c55e' : '#ef4444' },
    { name: 'Investing', value: sections.investing.total, fill: sections.investing.total >= 0 ? '#3b82f6' : '#f97316' },
    { name: 'Financing', value: sections.financing.total, fill: sections.financing.total >= 0 ? '#8b5cf6' : '#ec4899' },
    { name: 'Net Change', value: netChange, fill: netChange >= 0 ? '#0f2041' : '#991b1b' },
  ];

  const exportCsv = () => {
    const rows: (string | number)[][] = [['Cash Flow Statement', '', '', periodLabel(periodId)], [], ['Category', 'Account', 'Inflow', 'Outflow', 'Net']];
    for (const [key, sec] of Object.entries(sections) as [string, CfSection][]) {
      rows.push([sec.label, '', '', '', '']);
      sec.items.forEach(i => rows.push(['', `${i.code} ${i.name}`, i.inflow.toFixed(2), i.outflow.toFixed(2), i.net.toFixed(2)]));
      rows.push(['SUBTOTAL', '', sec.totalInflow.toFixed(2), sec.totalOutflow.toFixed(2), sec.total.toFixed(2)]);
      rows.push([]);
    }
    rows.push(['NET CHANGE IN CASH', '', '', '', netChange.toFixed(2)]);
    downloadCsv(`cash-flow-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  const exportPdf = async () => {
    setPdfBusy(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      doc.setFontSize(14); doc.text('Cash Flow Statement', 14, 16);
      doc.setFontSize(9); doc.text(`Period: ${periodLabel(periodId)} · Currency: ${selectedCurrency} · Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 14, 22);
      let y = 28;
      const SECTION_COLORS: Record<string, [number, number, number]> = { operating: [15, 32, 65], investing: [59, 130, 246], financing: [139, 92, 246] };
      for (const [key, sec] of Object.entries(sections) as [string, CfSection][]) {
        const color = SECTION_COLORS[key] ?? [80, 80, 80];
        autoTable(doc, { startY: y, head: [[sec.label, 'Inflow', 'Outflow', 'Net Cash Flow']], body: [...sec.items.map(i => [`${i.code}  ${i.name}`, formatNumber(i.inflow), formatNumber(i.outflow), formatNumber(i.net)]), [{ content: `Net ${sec.label}`, styles: { fontStyle: 'bold' } }, formatNumber(sec.totalInflow), formatNumber(sec.totalOutflow), { content: formatNumber(sec.total), styles: { fontStyle: 'bold', textColor: sec.total >= 0 ? [21, 100, 50] : [160, 30, 30] } }]], styles: { fontSize: 8 }, headStyles: { fillColor: color }, columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } }, margin: { left: 14, right: 14 } });
        y = (doc as any).lastAutoTable.finalY + 6;
      }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
      doc.text(`NET CHANGE IN CASH: ${selectedCurrency} ${formatNumber(netChange)}`, 14, y + 6);
      doc.save(`cash-flow-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally { setPdfBusy(false); }
  };

  if (authLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const SectionBlock = ({ sectionKey, sec }: { sectionKey: string; sec: CfSection }) => {
    const expanded = expandedSections.has(sectionKey);
    const colors: Record<string, string> = { operating: 'bg-blue-600', investing: 'bg-violet-600', financing: 'bg-indigo-600' };
    const textColors: Record<string, string> = { operating: 'text-blue-700 dark:text-blue-400', investing: 'text-violet-700 dark:text-violet-400', financing: 'text-indigo-700 dark:text-indigo-400' };
    return (
      <Card>
        <CardHeader className="pb-0 pt-3 cursor-pointer" onClick={() => toggleSection(sectionKey)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn('h-3 w-3 rounded-full', colors[sectionKey])} />
              <div>
                <CardTitle className="text-sm">{sec.label}</CardTitle>
                <div className="text-[11px] text-muted-foreground" dir="rtl">{sec.labelAr}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={cn('text-sm font-bold tabular-nums', sec.total >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                {sec.total >= 0 ? '+' : ''}{formatNumber(sec.total)} <span className="text-xs font-normal text-muted-foreground">{selectedCurrency}</span>
              </div>
              {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
        </CardHeader>
        {expanded && sec.items.length > 0 && (
          <CardContent className="px-0 pb-0 pt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-1.5 font-medium text-muted-foreground">Account</th>
                  <th className="text-right px-4 py-1.5 font-medium text-emerald-700 dark:text-emerald-400">Inflows</th>
                  <th className="text-right px-4 py-1.5 font-medium text-rose-700 dark:text-rose-400">Outflows</th>
                  <th className="text-right px-4 py-1.5 font-medium text-muted-foreground">Net</th>
                </tr>
              </thead>
              <tbody>
                {sec.items.map((item, i) => (
                  <tr key={item.account_id} className={cn('border-b last:border-b-0 hover:bg-muted/10', i % 2 === 0 ? '' : 'bg-muted/5')}>
                    <td className="px-4 py-1.5"><span className="font-mono text-muted-foreground mr-2">{item.code}</span>{item.name}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-400">{item.inflow > 0 ? formatNumber(item.inflow) : '—'}</td>
                    <td className="px-4 py-1.5 text-right tabular-nums text-rose-700 dark:text-rose-400">{item.outflow > 0 ? formatNumber(item.outflow) : '—'}</td>
                    <td className={cn('px-4 py-1.5 text-right tabular-nums font-medium', item.net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>{formatNumber(item.net)}</td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/20 font-semibold">
                  <td className="px-4 py-1.5 text-xs">Net {sec.label}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-emerald-700">{formatNumber(sec.totalInflow)}</td>
                  <td className="px-4 py-1.5 text-right tabular-nums text-rose-700">{formatNumber(sec.totalOutflow)}</td>
                  <td className={cn('px-4 py-1.5 text-right tabular-nums font-bold', sec.total >= 0 ? 'text-emerald-700' : 'text-rose-700')}>{sec.total >= 0 ? '+' : ''}{formatNumber(sec.total)}</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        )}
        {expanded && sec.items.length === 0 && (
          <CardContent className="py-4 text-center text-xs text-muted-foreground">No posted entries for this period.</CardContent>
        )}
      </Card>
    );
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl" data-testid="cash-flow-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-violet-600 text-white shrink-0">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cash Flow Statement</h1>
            <p className="text-muted-foreground text-sm">قائمة التدفقات النقدية — Operating · Investing · Financing</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runReport} disabled={loading} data-testid="button-refresh"><RefreshCw className={cn('h-4 w-4 mr-1', loading && 'animate-spin')} />Refresh</Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={loading} data-testid="button-csv"><Download className="h-4 w-4 mr-1" />CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={loading || pdfBusy} data-testid="button-pdf">{pdfBusy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}PDF</Button>
        </div>
      </div>

      <PageInfoBanner
        title="Cash Flow Statement"
        description="Shows cash inflows and outflows for the selected period, classified into Operating (revenue & expense accounts), Investing (asset accounts), and Financing (liability & equity accounts). Based on posted journal entries. Click any section header to expand or collapse."
        descriptionAr="تُظهر التدفقات النقدية الداخلة والخارجة للفترة المحددة مصنفةً إلى: تشغيلية (إيرادات ومصروفات)، واستثمارية (أصول)، وتمويلية (التزامات وحقوق ملكية). مبنية على القيود المحاسبية المرحّلة."
      />

      {error && <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive mb-4">{error}</div>}

      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="pt-4 pb-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Country Scope</label>
              <Select value={countryFilter} onValueChange={setCountryFilter}>
                <SelectTrigger className="h-9" data-testid="select-country"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Countries</SelectItem>
                  {countries.map(c => <SelectItem key={c.id} value={c.id}>{c.flag_emoji ?? ''} {c.name_en}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fiscal Period</label>
              <Select value={periodId} onValueChange={setPeriodId}>
                <SelectTrigger className="h-9" data-testid="select-period"><SelectValue placeholder="Select period" /></SelectTrigger>
                <SelectContent>
                  {periods.map(p => {
                    const y = years.find(yy => yy.id === p.fiscal_year_id);
                    return <SelectItem key={p.id} value={p.id}>{y?.code ?? '?'} P{String(p.period_no).padStart(2, '0')} · {format(parseISO(p.start_date), 'MMM d')}–{format(parseISO(p.end_date), 'MMM d, yyyy')}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              {selectedPeriod && <p className="text-xs text-muted-foreground">{format(parseISO(selectedPeriod.start_date), 'dd MMM')} – {format(parseISO(selectedPeriod.end_date), 'dd MMM yyyy')}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !periodId ? (
        <div className="text-center text-muted-foreground py-16 text-sm">Select a fiscal period to generate the Cash Flow Statement</div>
      ) : (
        <div className="space-y-4">
          {/* Mini chart */}
          {(jLines.length > 0) && (
            <Card>
              <CardContent className="pt-4">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={chartData} margin={{ top: 4, right: 20, left: 20, bottom: 4 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={v => formatNumber(v)} width={70} />
                    <Tooltip formatter={(v: number) => formatNumber(v)} />
                    <ReferenceLine y={0} stroke="#94a3b8" />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {chartData.map((d, i) => <rect key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <SectionBlock sectionKey="operating" sec={sections.operating} />
          <SectionBlock sectionKey="investing" sec={sections.investing} />
          <SectionBlock sectionKey="financing" sec={sections.financing} />

          {/* Net change footer */}
          <Card className={cn('border-2', netChange >= 0 ? 'border-emerald-300 dark:border-emerald-700' : 'border-rose-300 dark:border-rose-700')}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-base">Net Change in Cash</div>
                  <div className="text-xs text-muted-foreground" dir="rtl">صافي التغير في النقد</div>
                </div>
                <div className={cn('text-2xl font-bold tabular-nums', netChange >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400')}>
                  {netChange >= 0 ? '+' : ''}{formatNumber(netChange)}
                  <span className="text-sm font-normal text-muted-foreground ml-1">{selectedCurrency}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
