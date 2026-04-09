import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  format, startOfMonth, endOfMonth, subMonths, parseISO, isWithinInterval,
} from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight, Download,
  Loader2, FileSpreadsheet, FileText, BarChart2, CheckCircle2, AlertCircle,
  CreditCard, Users, Banknote,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', SDG: 'SDG', EUR: '€', GBP: '£' };
const sym = (c: string) => CURRENCY_SYMBOL[c] ?? c;
const fmt = (n: number, c = 'SDG') =>
  `${sym(c)} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const CACHE = { staleTime: 5 * 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false } as const;

function monthlyEquivalent(amount: number, cycle: string): number {
  return cycle === 'annual' ? amount / 12 : amount;
}

// ── Raw Supabase row types ─────────────────────────────────────────────────────
interface PayrollRun {
  id: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  notes: string | null;
}
interface PayrollRunItem {
  net_salary: number | null;
  gross_salary: number | null;
  currency: string | null;
  task_rewards: number | null;
  retainer_amount: number | null;
}
interface BillingMilestone {
  id: string;
  title: string | null;
  amount: number | null;
  currency: string | null;
  due_date: string | null;
  status: string | null;
  project_id: string | null;
}
interface RetainerInvoice {
  id: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  due_date: string | null;
  client_name: string | null;
}
interface ActiveSubscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  is_active: boolean;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MonthEndFinancialSummary() {
  const { isSuperAdmin, hasAnyRole } = useAuthorization();
  const navigate = useNavigate();
  const isAuthorized = isSuperAdmin() || hasAnyRole([
    'admin', 'Admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin',
    'countryDirector', 'country_director', 'CountryDirector',
  ]);

  // Route-level authorization — redirect users without finance/admin/auditor/country-director access
  useEffect(() => {
    if (!isAuthorized) {
      navigate('/unauthorized', { replace: true });
    }
  }, [isAuthorized, navigate]);

  const [monthOffset, setMonthOffset] = useState(0);
  const periodStart = startOfMonth(subMonths(new Date(), monthOffset));
  const periodEnd = endOfMonth(subMonths(new Date(), monthOffset));
  const periodLabel = format(periodStart, 'MMMM yyyy');

  const inPeriod = (d: string | null) => {
    if (!d) return false;
    try {
      const dt = parseISO(d);
      return isWithinInterval(dt, { start: periodStart, end: periodEnd });
    } catch { return false; }
  };

  // ── 1. Payroll runs ───────────────────────────────────────────────────────
  const { data: payrollRuns = [], isLoading: loadingPayroll } = useQuery<PayrollRun[]>({
    queryKey: ['month-end-payroll-runs', periodLabel],
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_runs')
        .select('id, period_label, period_start, period_end, status, notes')
        .gte('period_start', periodStart.toISOString())
        .lte('period_end', periodEnd.toISOString());
      return (data ?? []) as PayrollRun[];
    },
  });

  const payrollRunIds = useMemo(() => payrollRuns.map(r => r.id), [payrollRuns]);

  const { data: payrollItems = [], isLoading: loadingPayrollItems } = useQuery<PayrollRunItem[]>({
    queryKey: ['month-end-payroll-items', payrollRunIds.join(',')],
    ...CACHE,
    enabled: payrollRunIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_run_items')
        .select('net_salary, gross_salary, currency, task_rewards, retainer_amount')
        .in('run_id', payrollRunIds);
      return (data ?? []) as PayrollRunItem[];
    },
  });

  const totalPayroll = useMemo(() =>
    payrollItems.reduce((s, i) => s + (Number(i.net_salary) || 0), 0),
    [payrollItems]);

  const totalGrossPayroll = useMemo(() =>
    payrollItems.reduce((s, i) => s + (Number(i.gross_salary) || 0), 0),
    [payrollItems]);

  // ── 2. Receivables from project billing milestones and retainer invoices ──
  const { data: milestones = [], isLoading: loadingMilestones } = useQuery<BillingMilestone[]>({
    queryKey: ['month-end-milestones', periodLabel],
    ...CACHE,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('project_billing_milestones')
          .select('id, title, amount, currency, due_date, status, project_id')
          .or('status.eq.outstanding,status.eq.pending,status.eq.invoiced')
          .gte('due_date', format(periodStart, 'yyyy-MM-dd'))
          .lte('due_date', format(periodEnd, 'yyyy-MM-dd'));
        if (error) return [];
        return (data ?? []) as BillingMilestone[];
      } catch { return []; }
    },
  });

  const { data: retainerInvoices = [], isLoading: loadingRetainerInvoices } = useQuery<RetainerInvoice[]>({
    queryKey: ['month-end-retainer-invoices', periodLabel],
    ...CACHE,
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('retainer_invoices')
          .select('id, amount, currency, status, due_date, client_name')
          .or('status.eq.outstanding,status.eq.pending,status.eq.sent')
          .gte('due_date', format(periodStart, 'yyyy-MM-dd'))
          .lte('due_date', format(periodEnd, 'yyyy-MM-dd'));
        if (error) return [];
        return (data ?? []) as RetainerInvoice[];
      } catch { return []; }
    },
  });

  const totalReceivables = useMemo(() => {
    const mTotal = milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0);
    const rTotal = retainerInvoices.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    return mTotal + rTotal;
  }, [milestones, retainerInvoices]);

  // ── 3. Subscription costs for the month ───────────────────────────────────
  const { data: subscriptions = [], isLoading: loadingSubs } = useQuery<ActiveSubscription[]>({
    queryKey: ['month-end-subscriptions'],
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase.from('subscriptions').select('id, name, amount, currency, billing_cycle, is_active').eq('is_active', true);
      return (data ?? []) as ActiveSubscription[];
    },
  });

  const totalSubscriptions = useMemo(() =>
    subscriptions.reduce((s, sub) => s + monthlyEquivalent(Number(sub.amount) || 0, sub.billing_cycle), 0),
    [subscriptions]);

  // ── Derived ────────────────────────────────────────────────────────────────
  const netPosition = totalReceivables - totalPayroll - totalSubscriptions;
  const isLoading = loadingPayroll || loadingPayrollItems || loadingMilestones || loadingRetainerInvoices || loadingSubs;

  // ── Export PDF ─────────────────────────────────────────────────────────────
  function exportPDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    doc.setFillColor(15, 32, 65);
    doc.rect(0, 0, W, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('Month-End Financial Summary', 14, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.setTextColor(180, 210, 255);
    doc.text(`Period: ${periodLabel}`, 14, 26);
    doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 32);

    let y = 44;

    const summaryRows = [
      ['Total Payroll Payout (Net)', fmt(totalPayroll), 'Payable'],
      ['Total Gross Payroll', fmt(totalGrossPayroll), 'Gross before deductions'],
      ['Project Milestones Receivable', fmt(milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0)), 'Outstanding'],
      ['Retainer Invoices Receivable', fmt(retainerInvoices.reduce((s, r) => s + (Number(r.amount) || 0), 0)), 'Outstanding'],
      ['Total Receivables', fmt(totalReceivables), 'Milestones + Retainer'],
      ['Subscription Costs (Monthly Est.)', fmt(totalSubscriptions), `${subscriptions.length} active subscriptions`],
      ['NET POSITION', fmt(netPosition), `Receivable − Payroll − Subscriptions`],
    ];

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount (SDG)', 'Notes']],
      body: summaryRows.slice(0, -1),
      foot: [[{ content: 'NET POSITION', styles: { fontStyle: 'bold', fillColor: netPosition >= 0 ? [220, 255, 235] : [255, 235, 235], textColor: netPosition >= 0 ? [20, 120, 60] : [160, 30, 30] } }, { content: fmt(netPosition), styles: { fontStyle: 'bold', fillColor: netPosition >= 0 ? [220, 255, 235] : [255, 235, 235], textColor: netPosition >= 0 ? [20, 120, 60] : [160, 30, 30], halign: 'right' } }, { content: 'Receivable − Payroll − Subscriptions', styles: { fillColor: netPosition >= 0 ? [220, 255, 235] : [255, 235, 235] } }]],
      headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      alternateRowStyles: { fillColor: [248, 250, 255] },
      margin: { left: 14, right: 14 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    if (payrollRuns.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Payroll Run', 'Status', 'Period', 'Net Payout']],
        body: payrollRuns.map(r => [
          r.period_label ?? '—',
          r.status ?? '—',
          r.period_start && r.period_end
            ? `${format(parseISO(r.period_start), 'dd MMM')} – ${format(parseISO(r.period_end), 'dd MMM yyyy')}`
            : '—',
          '—',
        ]),
        headStyles: { fillColor: [60, 80, 130], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }

    doc.setFontSize(7); doc.setTextColor(180, 190, 210);
    doc.text('This is a system-generated report · PACT · Confidential', W / 2, 287, { align: 'center' });

    doc.save(`month-end-summary-${format(periodStart, 'yyyy-MM')}.pdf`);
  }

  function exportExcel() {
    const wb = XLSX.utils.book_new();

    const summary = [
      ['MONTH-END FINANCIAL SUMMARY', periodLabel],
      ['Generated', format(new Date(), 'dd MMM yyyy HH:mm')],
      [],
      ['ITEM', 'AMOUNT (SDG)', 'NOTES'],
      ['Total Payroll Payout (Net)', totalPayroll, 'Net payable to employees'],
      ['Total Gross Payroll', totalGrossPayroll, 'Before deductions'],
      ['Project Milestones Receivable', milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0), 'Outstanding'],
      ['Retainer Invoices Receivable', retainerInvoices.reduce((s, r) => s + (Number(r.amount) || 0), 0), 'Outstanding'],
      ['Total Receivables', totalReceivables, 'Milestones + Retainer'],
      ['Subscription Costs (Monthly Est.)', totalSubscriptions, `${subscriptions.length} active subscriptions`],
      [],
      ['NET POSITION', netPosition, 'Receivable − Payroll − Subscriptions'],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summary);
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

    if (milestones.length > 0) {
      const mData = [['Project ID', 'Title', 'Amount', 'Currency', 'Due Date', 'Status'],
        ...milestones.map(m => [m.project_id, m.title, m.amount, m.currency, m.due_date, m.status])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mData), 'Milestones');
    }

    if (subscriptions.length > 0) {
      const sData = [['Name', 'Amount', 'Currency', 'Billing Cycle', 'Monthly Est.'],
        ...subscriptions.map(s => [s.name, s.amount, s.currency, s.billing_cycle, monthlyEquivalent(Number(s.amount), s.billing_cycle)])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sData), 'Subscriptions');
    }

    XLSX.writeFile(wb, `month-end-summary-${format(periodStart, 'yyyy-MM')}.xlsx`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-blue-500" />
              Month-End Financial Summary
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">Consolidated payroll, receivables, and subscriptions for the period</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border rounded-xl px-2 py-1 shadow-sm">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonthOffset(o => o + 1)} data-testid="button-prev-month">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold min-w-[130px] text-center">{periodLabel}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonthOffset(o => o - 1)} disabled={monthOffset <= 0} data-testid="button-next-month">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {monthOffset !== 0 && <Button variant="ghost" size="sm" onClick={() => setMonthOffset(0)}>This month</Button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 bg-white dark:bg-slate-900" data-testid="button-export">
                  <Download className="h-3.5 w-3.5" />Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportPDF}><FileText className="h-3.5 w-3.5 mr-2" />Export PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel}><FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Export Excel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* KPI Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard
            icon={<Users className="h-5 w-5 text-red-500" />}
            label="Total Payroll (Net)"
            value={isLoading ? '…' : fmt(totalPayroll)}
            sub={`${payrollRuns.length} payroll run${payrollRuns.length !== 1 ? 's' : ''}`}
            accent="text-red-600"
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
            label="Total Receivables"
            value={isLoading ? '…' : fmt(totalReceivables)}
            sub={`${milestones.length + retainerInvoices.length} outstanding items`}
            accent="text-emerald-600"
          />
          <SummaryCard
            icon={<CreditCard className="h-5 w-5 text-indigo-500" />}
            label="Subscription Costs"
            value={isLoading ? '…' : fmt(totalSubscriptions)}
            sub={`${subscriptions.length} active subscriptions`}
            accent="text-indigo-600"
          />
          <SummaryCard
            icon={netPosition >= 0
              ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              : <AlertCircle className="h-5 w-5 text-red-500" />}
            label="Net Position"
            value={isLoading ? '…' : fmt(netPosition)}
            sub="Receivable − Payroll − Subscriptions"
            accent={netPosition >= 0 ? 'text-emerald-700' : 'text-red-700'}
          />
        </div>

        {/* Net Position Banner */}
        {!isLoading && (
          <div className={cn(
            'flex items-center gap-4 p-4 rounded-xl border',
            netPosition >= 0
              ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800/40'
              : 'bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800/40'
          )}>
            {netPosition >= 0
              ? <TrendingUp className="h-8 w-8 text-emerald-500 shrink-0" />
              : <TrendingDown className="h-8 w-8 text-red-500 shrink-0" />}
            <div>
              <p className={cn('text-lg font-bold', netPosition >= 0 ? 'text-emerald-800 dark:text-emerald-200' : 'text-red-800 dark:text-red-200')}>
                Net Position for {periodLabel}: {fmt(netPosition)}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                Receivables ({fmt(totalReceivables)}) − Payroll ({fmt(totalPayroll)}) − Subscriptions ({fmt(totalSubscriptions)})
              </p>
            </div>
          </div>
        )}

        {/* Breakdown Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Payroll */}
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Banknote className="h-4 w-4 text-red-500" />Payroll Runs
              </CardTitle>
              <CardDescription className="text-xs">{periodLabel}</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {loadingPayroll || loadingPayrollItems ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin opacity-30" /></div>
              ) : payrollRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-4">No payroll runs for this period</p>
              ) : (
                <div className="space-y-2">
                  {payrollRuns.map((run) => (
                    <div key={run.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2" data-testid={`row-payroll-run-${run.id}`}>
                      <span className="font-medium text-xs">{run.period_label}</span>
                      <Badge variant="outline" className="text-xs capitalize">{run.status}</Badge>
                    </div>
                  ))}
                  <div className="pt-2 border-t flex justify-between text-sm font-bold">
                    <span className="text-muted-foreground">Net Payable</span>
                    <span className="text-red-700">{fmt(totalPayroll)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Gross Payroll</span>
                    <span>{fmt(totalGrossPayroll)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Receivables */}
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-500" />Receivables
              </CardTitle>
              <CardDescription className="text-xs">Project milestones & retainer invoices</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {loadingMilestones || loadingRetainerInvoices ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin opacity-30" /></div>
              ) : (
                <div className="space-y-2">
                  {milestones.length === 0 && retainerInvoices.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic text-center py-4">No outstanding receivables</p>
                  ) : (
                    <>
                      {milestones.slice(0, 3).map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-xs border rounded-lg px-3 py-2" data-testid={`row-milestone-${m.id}`}>
                          <span className="truncate font-medium">{m.title ?? 'Milestone'}</span>
                          <span className="ml-2 font-semibold text-emerald-700">{fmt(Number(m.amount) || 0, m.currency)}</span>
                        </div>
                      ))}
                      {milestones.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center">+{milestones.length - 3} more milestones</p>
                      )}
                      {retainerInvoices.slice(0, 2).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-xs border rounded-lg px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20" data-testid={`row-retainer-invoice-${r.id}`}>
                          <span className="truncate font-medium">{r.client_name ?? 'Retainer'}</span>
                          <span className="ml-2 font-semibold text-emerald-700">{fmt(Number(r.amount) || 0, r.currency)}</span>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="pt-2 border-t flex justify-between text-sm font-bold">
                    <span className="text-muted-foreground">Total Receivable</span>
                    <span className="text-emerald-700">{fmt(totalReceivables)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subscriptions */}
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-indigo-500" />Subscriptions
              </CardTitle>
              <CardDescription className="text-xs">Monthly estimated costs</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {loadingSubs ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin opacity-30" /></div>
              ) : subscriptions.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-4">No active subscriptions</p>
              ) : (
                <div className="space-y-1.5">
                  {subscriptions.slice(0, 5).map((s) => (
                    <div key={s.id} className="flex items-center justify-between text-xs border rounded-lg px-3 py-2" data-testid={`row-sub-${s.id}`}>
                      <span className="truncate font-medium">{s.name}</span>
                      <span className="ml-2 text-indigo-700 font-semibold">{fmt(monthlyEquivalent(Number(s.amount), s.billing_cycle), s.currency)}</span>
                    </div>
                  ))}
                  {subscriptions.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">+{subscriptions.length - 5} more</p>
                  )}
                  <div className="pt-2 border-t flex justify-between text-sm font-bold">
                    <span className="text-muted-foreground">Monthly Total</span>
                    <span className="text-indigo-700">{fmt(totalSubscriptions)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Full summary table */}
        <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Summary Statement — {periodLabel}</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <table className="w-full text-sm">
              <tbody>
                <SummaryRow label="Total Payroll Payout (Net)" value={fmt(totalPayroll)} note="Payable to employees" variant="debit" />
                <SummaryRow label="└ Gross Payroll" value={fmt(totalGrossPayroll)} note="Before deductions" variant="sub" />
                <SummaryRow label="Project Billing Milestones" value={fmt(milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0))} note={`${milestones.length} outstanding`} variant="credit" />
                <SummaryRow label="Retainer Invoices" value={fmt(retainerInvoices.reduce((s, r) => s + (Number(r.amount) || 0), 0))} note={`${retainerInvoices.length} outstanding`} variant="credit" />
                <SummaryRow label="Total Receivables" value={fmt(totalReceivables)} note="Milestones + Retainers" variant="credit-bold" />
                <SummaryRow label="Subscription Costs (Est.)" value={fmt(totalSubscriptions)} note={`${subscriptions.length} active`} variant="debit" />
                <tr className="border-t-2 border-slate-300">
                  <td className="py-3 font-bold text-base">Net Financial Position</td>
                  <td className="py-3 text-right font-bold text-xl" style={{ color: netPosition >= 0 ? '#059669' : '#dc2626' }}>
                    {fmt(netPosition)}
                  </td>
                  <td className="py-3 pl-4 text-xs text-muted-foreground">Receivable − Payroll − Subscriptions</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub: string; accent: string }) {
  return (
    <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
      <CardContent className="pt-4 pb-4 px-5">
        <div className="flex items-center gap-2 mb-1">{icon}<p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p></div>
        <p className={cn('text-2xl font-bold mt-1', accent)}>{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, value, note, variant }: { label: string; value: string; note?: string; variant: 'credit' | 'debit' | 'credit-bold' | 'sub' }) {
  const valueColor = variant === 'credit' || variant === 'credit-bold' ? 'text-emerald-700' : variant === 'debit' ? 'text-red-700' : 'text-muted-foreground';
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className={cn('py-2.5', variant === 'sub' ? 'pl-4 text-muted-foreground text-xs' : 'font-medium')}>{label}</td>
      <td className={cn('py-2.5 text-right font-semibold', valueColor, variant === 'credit-bold' && 'font-bold', variant === 'sub' && 'text-xs')}>{value}</td>
      <td className="py-2.5 pl-4 text-xs text-muted-foreground">{note}</td>
    </tr>
  );
}
