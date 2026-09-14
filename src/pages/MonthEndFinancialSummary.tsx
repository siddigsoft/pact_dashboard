import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  format, startOfMonth, endOfMonth, subMonths, parseISO,
} from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportStandardExcel, type StandardSheetSpec } from '@/utils/standardExcelExport';
import {
  TrendingUp, TrendingDown, DollarSign, ChevronLeft, ChevronRight, Download,
  Loader2, FileSpreadsheet, FileText, BarChart2, CheckCircle2, AlertCircle,
  CreditCard, Users, Banknote, Wallet,
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
import {
  aggregateCurrency,
  aggregatePreFund,
  buildPreFundCurrencySummaryRows,
  calculateOutlookByCurrency,
  MONTH_END_REPORT_BASIS,
  normalizeReportCurrency,
  selectFinalizedPayrollRuns,
} from './monthEndFinancialSummaryHelpers';

// ── Constants ─────────────────────────────────────────────────────────────────
const CURRENCY_SYMBOL: Record<string, string> = { USD: '$', SDG: 'SDG', EUR: '€', GBP: '£' };
const sym = (c: string) => CURRENCY_SYMBOL[c] ?? c;
const fmt = (n: number, c = 'SDG') =>
  `${sym(c)} ${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const excludedBreakdown = (totals: CurrencyTotals) => Object.entries(totals)
  .filter(([currency]) => currency !== 'SDG')
  .map(([currency, amount]) => fmt(amount, currency))
  .join(', ') || 'None';
const reportBasis = MONTH_END_REPORT_BASIS;
type SummaryVariant = 'credit' | 'debit' | 'credit-bold' | 'sub';
interface ReportSummaryRow {
  label: string;
  amount: number | null;
  currency: string | null;
  note: string;
  variant: SummaryVariant;
}
interface ReportDetailSection {
  title: string;
  headers: string[];
  rows: (string | number | null)[][];
}

const CACHE = { staleTime: 5 * 60_000, gcTime: 10 * 60_000, refetchOnWindowFocus: false } as const;

function monthlyEquivalent(amount: number, cycle: string): number {
  return cycle === 'annual' ? amount / 12 : amount;
}

interface PaginatedQuery<T> {
  range(from: number, to: number): PromiseLike<{
    data: T[] | null;
    error: Error | null;
  }>;
}

async function fetchAll<T = unknown>(queryFn: () => PaginatedQuery<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await queryFn().range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

async function fetchAllIn<T = unknown>(
  queryFn: (ids: string[]) => PaginatedQuery<T>,
  ids: string[],
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const pages: T[][] = [];
  for (let i = 0; i < unique.length; i += 100) pages.push(await fetchAll<T>(() => queryFn(unique.slice(i, i + 100))));
  return pages.flat();
}

// ── Raw Supabase row types ─────────────────────────────────────────────────────
interface PayrollRun {
  id: string;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  status: string | null;
  notes: string | null;
  country_id: string | null;
}
interface PayrollRunItem {
  run_id: string;
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
interface PreFundTransaction {
  id: string;
  pre_fund_request_id: string | null;
  transaction_type: string | null;
  amount: number | null;
  signed_paid_amount: number | null;
  currency: string | null;
  transaction_date: string | null;
  description: string | null;
  reversal_of_id?: string | null;
  event_reason?: string | null;
  event_metadata?: Record<string, unknown> | null;
}
interface PreFundLedgerResult {
  periodEvents: PreFundTransaction[];
  reversalContext: PreFundTransaction[];
}
interface UndatedExceptions {
  payroll: number;
  milestones: number;
  retainers: number;
  preFund: number;
  operational: number;
}
interface PreFundSummary {
  id: string;
  name: string;
  available_balance: number | null;
  amount: number | null;
  paid_amount: number | null;
  currency: string | null;
  status: string | null;
}
interface OperationalCostSubmission {
  id: string;
  expense_category: string | null;
  amount_cents: number | null;
  currency: string | null;
  expense_date: string | null;
  status: string | null;
  description: string | null;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function MonthEndFinancialSummary() {
  const { isSuperAdmin, hasAnyRole, checkPermission } = useAuthorization();
  const canExport = checkPermission('finances', 'export');
  const navigate = useNavigate();
  const isAuthorized = isSuperAdmin() || hasAnyRole([
    'admin', 'Admin', 'financialAdmin', 'financial_admin', 'FinancialAdmin',
  ]);

  // Route-level authorization — redirect users without finance/admin/auditor/country-director access
  useEffect(() => {
    if (!isAuthorized) {
      navigate('/unauthorized', { replace: true });
    }
  }, [isAuthorized, navigate]);

  const [monthOffset, setMonthOffset] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const periodStart = startOfMonth(subMonths(new Date(), monthOffset));
  const periodEnd = endOfMonth(subMonths(new Date(), monthOffset));
  const periodLabel = format(periodStart, 'MMMM yyyy');

  // ── 1. Payroll runs ───────────────────────────────────────────────────────
  const { data: payrollRuns = [], isLoading: loadingPayroll, isError: payrollError } = useQuery<PayrollRun[]>({
    queryKey: ['month-end-payroll-runs', periodLabel],
    ...CACHE,
    queryFn: async () => {
      return fetchAll<PayrollRun>(() => supabase
        .from('payroll_runs')
        .select('id, country_id, period_label, period_start, period_end, status, notes')
        .in('status', ['approved', 'locked'])
        .gte('period_end', format(periodStart, 'yyyy-MM-dd'))
        .lte('period_end', format(periodEnd, 'yyyy-MM-dd'))
        .order('id'));
    },
  });

  const selectedPayroll = useMemo(() => selectFinalizedPayrollRuns(payrollRuns, periodStart, periodEnd), [payrollRuns, periodStart, periodEnd]);
  const selectedPayrollRuns = selectedPayroll.runs;
  const payrollRunIds = useMemo(() => selectedPayrollRuns.map(r => r.id), [selectedPayrollRuns]);

  const { data: payrollItems = [], isLoading: loadingPayrollItems, isError: payrollItemsError } = useQuery<PayrollRunItem[]>({
    queryKey: ['month-end-payroll-items', payrollRunIds.join(',')],
    ...CACHE,
    enabled: payrollRunIds.length > 0,
    queryFn: async () => {
      return fetchAllIn<PayrollRunItem>(ids => supabase
        .from('payroll_run_items')
        .select('run_id, net_salary, gross_salary, currency, task_rewards, retainer_amount')
        .in('run_id', ids).order('id'), payrollRunIds);
    },
  });

  const payrollCurrency = useMemo(() => aggregateCurrency(payrollItems,
    i => i.currency, i => Number(i.net_salary) || 0), [payrollItems]);
  const totalPayroll = payrollCurrency.totals.SDG ?? 0;

  const grossPayrollCurrency = useMemo(() => aggregateCurrency(payrollItems,
    i => i.currency, i => Number(i.gross_salary) || 0), [payrollItems]);
  const totalGrossPayroll = grossPayrollCurrency.totals.SDG ?? 0;

  // ── 2. Receivables from project billing milestones and retainer invoices ──
  const { data: milestones = [], isLoading: loadingMilestones, isError: milestonesError } = useQuery<BillingMilestone[]>({
    queryKey: ['month-end-milestones', periodLabel],
    ...CACHE,
    queryFn: async () => {
      return fetchAll<BillingMilestone>(() => supabase
          .from('project_billing_milestones')
          .select('id, title, amount, currency, due_date, status, project_id')
          .or('status.eq.outstanding,status.eq.pending,status.eq.invoiced')
          .gte('due_date', format(periodStart, 'yyyy-MM-dd'))
          .lte('due_date', format(periodEnd, 'yyyy-MM-dd')).order('id'));
    },
  });

  const { data: retainerInvoices = [], isLoading: loadingRetainerInvoices, isError: retainerInvoicesError } = useQuery<RetainerInvoice[]>({
    queryKey: ['month-end-retainer-invoices', periodLabel],
    ...CACHE,
    queryFn: async () => {
      return fetchAll<RetainerInvoice>(() => supabase
          .from('retainer_invoices')
          .select('id, amount, currency, status, due_date, client_name')
          .or('status.eq.outstanding,status.eq.pending,status.eq.sent')
          .gte('due_date', format(periodStart, 'yyyy-MM-dd'))
          .lte('due_date', format(periodEnd, 'yyyy-MM-dd')).order('id'));
    },
  });

  const receivableCurrency = useMemo(() => aggregateCurrency(
    [...milestones, ...retainerInvoices],
    row => row.currency, row => Number(row.amount) || 0,
  ), [milestones, retainerInvoices]);
  const totalReceivables = receivableCurrency.totals.SDG ?? 0;
  const milestoneCurrency = useMemo(() => aggregateCurrency(milestones, m => m.currency, m => Number(m.amount) || 0), [milestones]);
  const retainerCurrency = useMemo(() => aggregateCurrency(retainerInvoices, r => r.currency, r => Number(r.amount) || 0), [retainerInvoices]);

  // ── 3. Subscription costs for the month ───────────────────────────────────
  const { data: subscriptions = [], isLoading: loadingSubs, isError: subscriptionsError } = useQuery<ActiveSubscription[]>({
    queryKey: ['month-end-subscriptions'],
    ...CACHE,
    queryFn: async () => {
      return fetchAll<ActiveSubscription>(() => supabase.from('subscriptions').select('id, name, amount, currency, billing_cycle, is_active').eq('is_active', true).order('id'));
    },
  });

  const subscriptionCurrency = useMemo(() => aggregateCurrency(subscriptions,
    i => i.currency, i => monthlyEquivalent(Number(i.amount) || 0, i.billing_cycle)), [subscriptions]);
  const totalSubscriptions = subscriptionCurrency.totals.SDG ?? 0;

  // ── 4. Pre-Fund Activity for the period ───────────────────────────────────
  const {
    data: preFundLedger = { periodEvents: [], reversalContext: [] },
    isLoading: loadingPFTxns,
    isError: preFundTxnsError,
  } = useQuery<PreFundLedgerResult>({
    queryKey: ['month-end-pf-txns', periodLabel],
    ...CACHE,
    queryFn: async () => {
      try {
        const periodEvents = await fetchAll<PreFundTransaction>(() => supabase
          .from('pre_fund_event_ledger_v')
          .select('id, pre_fund_request_id, transaction_type, amount, signed_paid_amount, currency, transaction_date, description, reversal_of_id, event_reason, event_metadata')
          .eq('source_is_verified', true)
          .gte('transaction_date', format(periodStart, 'yyyy-MM-dd'))
          .lte('transaction_date', format(periodEnd, 'yyyy-MM-dd')).order('id'));
        const originalIds = periodEvents
          .map(event => event.reversal_of_id)
          .filter(Boolean) as string[];
        const reversalContext = await fetchAllIn<PreFundTransaction>(
          ids => supabase
            .from('pre_fund_event_ledger_v')
            .select('id, pre_fund_request_id, transaction_type, amount, signed_paid_amount, currency, transaction_date, description, reversal_of_id, event_reason, event_metadata')
            .in('id', ids).order('id'),
          originalIds,
        );
        return { periodEvents, reversalContext };
      } catch (error) {
        console.error('[MonthEndSummary] Failed to load verified Pre-Fund events', error);
        throw error;
      }
    },
  });
  const preFundTxns = preFundLedger.periodEvents;

  const {
    data: periodFunds = [],
    isLoading: loadingPeriodFunds,
    isError: periodFundsError,
  } = useQuery<PreFundSummary[]>({
    queryKey: [
      'month-end-pf-funds',
      periodLabel,
      [...new Set(preFundTxns.map(t => t.pre_fund_request_id).filter(Boolean))].sort().join(','),
    ],
    ...CACHE,
    enabled: !loadingPFTxns,
    queryFn: async () => {
      try {
        const referencedFundIds = [
          ...new Set(preFundTxns.map(t => t.pre_fund_request_id).filter(Boolean) as string[]),
        ];
        const periodQuery = supabase
          .from('pre_fund_requests')
          .select('id, name, available_balance, amount, paid_amount, currency, status')
          .lte('start_date', format(periodEnd, 'yyyy-MM-dd'))
          .or(`end_date.is.null,end_date.gte.${format(periodStart, 'yyyy-MM-dd')}`).order('id');
        const referencedQuery = referencedFundIds.length > 0
          ? supabase
              .from('pre_fund_requests')
              .select('id, name, available_balance, amount, paid_amount, currency, status')
              .in('id', referencedFundIds).order('id')
          : null;
        const [periodRows, referencedRows] = await Promise.all([
          fetchAll<PreFundSummary>(() => periodQuery),
          referencedQuery ? fetchAll<PreFundSummary>(() => referencedQuery) : Promise.resolve([]),
        ]);
        return [
          ...new Map(
            [...periodRows, ...referencedRows]
              .map((fund: PreFundSummary) => [fund.id, fund]),
          ).values(),
        ] as PreFundSummary[];
      } catch (error) {
        console.error('[MonthEndSummary] Failed to load Pre-Fund balances', error);
        throw error;
      }
    },
  });

  const preFundNames = useMemo(
    () => new Map(periodFunds.map(fund => [fund.id, fund.name])),
    [periodFunds],
  );
  const activeFundCount = useMemo(
    () => periodFunds.filter(fund => fund.status === 'active').length,
    [periodFunds],
  );
  const preFundActivityByCurrency = useMemo(() => {
    const allEvents = [...preFundTxns, ...preFundLedger.reversalContext];
    const includedIds = new Set(preFundTxns.map(event => event.id));
    const currencies = [...new Set(preFundTxns.map(event => event.currency).filter(Boolean) as string[])];
    return Object.fromEntries(currencies.map(currency => [
      currency,
      aggregatePreFund(allEvents, includedIds, currency),
    ]));
  }, [preFundLedger.reversalContext, preFundTxns]);
  const preFundActivity = preFundActivityByCurrency.SDG
    ?? aggregatePreFund(
      [...preFundTxns, ...preFundLedger.reversalContext],
      new Set(preFundTxns.map(event => event.id)),
    );
  const preFundInflowCount = preFundActivity.counts.receipt ?? 0;
  const preFundReceived = preFundActivity.received;
  const preFundPaid = preFundActivity.paid;
  const preFundCommitted = preFundActivity.committed;
  const preFundAvailableAggregate = useMemo(
    () => aggregateCurrency(periodFunds, fund => fund.currency, fund => Number(fund.available_balance) || 0),
    [periodFunds],
  );
  const preFundAvailableByCurrency = preFundAvailableAggregate.totals;
  const preFundAvailable = preFundAvailableByCurrency.SDG ?? 0;
  const preFundNetActivity = preFundReceived - preFundPaid - preFundCommitted;
  const preFundPaidCount = (preFundActivity.counts.payment ?? 0)
    + (preFundActivity.counts.payment_reversal ?? 0)
    + (preFundActivity.counts.return ?? 0)
    + (preFundActivity.counts.return_reversal ?? 0);
  const preFundCommitmentCount = (preFundActivity.counts.commitment ?? 0)
    + (preFundActivity.counts.commitment_reversal ?? 0);
  const nonSdgPreFundRows = [...new Set([
    ...Object.keys(preFundActivityByCurrency),
    ...Object.keys(preFundAvailableByCurrency),
  ])]
    .filter(currency => currency !== 'SDG')
    .map(currency => {
      const activity = preFundActivityByCurrency[currency]
        ?? { received: 0, paid: 0, committed: 0, counts: {}, nullCurrencyCount: 0 };
      return {
      currency,
      ...activity,
      net: activity.received - activity.paid - activity.committed,
      available: preFundAvailableByCurrency[currency] ?? 0,
      };
    });

  // ── 5. Operational expenses (permits, incentives, training, etc.) ─────────
  // Bug fix (Month-End Summary completeness): approved operational cost
  // submissions were never included in this report, so the "Net Position"
  // silently overstated cash on hand by the full amount of any approved
  // operational spend for the month (permits, incentives, training, etc.).
  const { data: operationalCosts = [], isLoading: loadingOpCosts, isError: operationalCostsError } = useQuery<OperationalCostSubmission[]>({
    queryKey: ['month-end-operational-costs', periodLabel],
    ...CACHE,
    queryFn: async () => {
      return fetchAll<OperationalCostSubmission>(() => supabase
          .from('operational_cost_submissions')
          .select('id, expense_category, amount_cents, currency, expense_date, status, description')
          .in('status', ['approved', 'partially_paid', 'paid', 'reconciled'])
          .gte('expense_date', format(periodStart, 'yyyy-MM-dd'))
          .lte('expense_date', format(periodEnd, 'yyyy-MM-dd')).order('id'));
    },
  });

  const {
    data: undatedExceptions = { payroll: 0, milestones: 0, retainers: 0, preFund: 0, operational: 0 },
    isLoading: loadingUndatedExceptions,
    isError: undatedExceptionsError,
  } = useQuery<UndatedExceptions>({
    queryKey: ['month-end-undated-exceptions'],
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from('payroll_runs').select('id', { count: 'exact', head: true })
          .in('status', ['approved', 'locked']).or('period_start.is.null,period_end.is.null'),
        supabase.from('project_billing_milestones').select('id', { count: 'exact', head: true })
          .or('status.eq.outstanding,status.eq.pending,status.eq.invoiced').is('due_date', null),
        supabase.from('retainer_invoices').select('id', { count: 'exact', head: true })
          .or('status.eq.outstanding,status.eq.pending,status.eq.sent').is('due_date', null),
        supabase.from('pre_fund_event_ledger_v').select('id', { count: 'exact', head: true })
          .eq('source_is_verified', true).is('transaction_date', null),
        supabase.from('operational_cost_submissions').select('id', { count: 'exact', head: true })
          .in('status', ['approved', 'partially_paid', 'paid', 'reconciled']).is('expense_date', null),
      ]);
      const failure = results.find(result => result.error)?.error;
      if (failure) throw failure;
      return {
        payroll: results[0].count ?? 0,
        milestones: results[1].count ?? 0,
        retainers: results[2].count ?? 0,
        preFund: results[3].count ?? 0,
        operational: results[4].count ?? 0,
      };
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────────
  const operationalCurrency = useMemo(() => aggregateCurrency(operationalCosts,
    i => i.currency, i => (Number(i.amount_cents) || 0) / 100), [operationalCosts]);
  const totalOperationalExpenses = operationalCurrency.totals.SDG ?? 0;
  const netPosition = totalReceivables - totalPayroll - totalSubscriptions - totalOperationalExpenses;
  const outlookByCurrency = calculateOutlookByCurrency([
    { totals: receivableCurrency.totals, sign: 1 },
    { totals: payrollCurrency.totals, sign: -1 },
    { totals: subscriptionCurrency.totals, sign: -1 },
    { totals: operationalCurrency.totals, sign: -1 },
  ]);
  const undatedReceivables = undatedExceptions.milestones + undatedExceptions.retainers;
  const missingCurrency = payrollCurrency.nullCurrencyCount + receivableCurrency.nullCurrencyCount
    + subscriptionCurrency.nullCurrencyCount + operationalCurrency.nullCurrencyCount
    + preFundActivity.nullCurrencyCount + preFundAvailableAggregate.nullCurrencyCount;
  const isLoading = loadingPayroll || loadingPayrollItems || loadingMilestones || loadingRetainerInvoices || loadingSubs
    || loadingPFTxns || loadingPeriodFunds || loadingOpCosts || loadingUndatedExceptions;
  const reportErrors = [
    payrollError && 'payroll', payrollItemsError && 'payroll items', milestonesError && 'milestones',
    retainerInvoicesError && 'retainer invoices', subscriptionsError && 'subscriptions',
    preFundTxnsError && 'Pre-Fund events', periodFundsError && 'Pre-Fund funds', operationalCostsError && 'operational expenses',
    undatedExceptionsError && 'undated-record validation',
    selectedPayroll.ambiguousDuplicateCount > 0 && `${selectedPayroll.ambiguousDuplicateCount} ambiguous duplicate finalized payroll run(s) within country/period`,
    undatedExceptions.payroll > 0 && `${undatedExceptions.payroll} undated finalized payroll run(s)`,
    undatedReceivables > 0 && `${undatedReceivables} undated receivable(s)`,
    undatedExceptions.preFund > 0 && `${undatedExceptions.preFund} undated verified Pre-Fund event(s)`,
    undatedExceptions.operational > 0 && `${undatedExceptions.operational} undated operational expense(s)`,
    missingCurrency > 0 && `${missingCurrency} row(s) with missing currency`,
  ].filter(Boolean) as string[];
  const reportIncomplete = reportErrors.length > 0;
  const reportSummaryRows: ReportSummaryRow[] = useMemo(() => {
    const rows: ReportSummaryRow[] = [
      { label: 'REPORT BASIS', amount: null, currency: null, note: reportBasis, variant: 'sub' },
      { label: 'Total Payroll Payout (Net)', amount: totalPayroll, currency: 'SDG', note: 'Payable; SDG only', variant: 'debit' },
      { label: 'Total Gross Payroll', amount: totalGrossPayroll, currency: 'SDG', note: 'Gross before deductions; SDG only', variant: 'debit' },
      { label: 'Project Milestones Receivable (SDG)', amount: milestoneCurrency.totals.SDG ?? 0, currency: 'SDG', note: 'Outstanding; SDG only', variant: 'credit' },
      { label: 'Retainer Invoices Receivable (SDG)', amount: retainerCurrency.totals.SDG ?? 0, currency: 'SDG', note: 'Outstanding; SDG only', variant: 'credit' },
      { label: 'Total Receivables (SDG)', amount: totalReceivables, currency: 'SDG', note: 'Milestones + retainer; SDG only', variant: 'credit-bold' },
      { label: 'Subscription Costs (Monthly Est.) (SDG)', amount: totalSubscriptions, currency: 'SDG', note: 'Current active subscriptions; SDG only', variant: 'debit' },
      { label: 'Operational Expenses (SDG)', amount: totalOperationalExpenses, currency: 'SDG', note: 'Approved-or-later expenses; SDG only', variant: 'debit' },
    ];
    if (preFundTxns.length > 0 || periodFunds.length > 0) {
      rows.push(
        { label: 'Pre-Fund Received (SDG)', amount: preFundReceived, currency: 'SDG', note: `${preFundInflowCount} verified inflows`, variant: 'credit' },
        { label: 'Pre-Fund Paid Out (SDG)', amount: preFundPaid, currency: 'SDG', note: `${preFundPaidCount} net payment/return events`, variant: 'debit' },
        { label: 'Pre-Fund Committed (SDG)', amount: preFundCommitted, currency: 'SDG', note: `${preFundActivity.counts.commitment ?? 0} commitments`, variant: 'debit' },
        { label: 'Pre-Fund Available Balance (SDG)', amount: preFundAvailable, currency: 'SDG', note: 'Current balance', variant: 'credit-bold' },
        { label: 'Pre-Fund Net Activity (SDG)', amount: preFundNetActivity, currency: 'SDG', note: 'Period movement; excludes opening balance', variant: 'credit' },
      );
      rows.push(...buildPreFundCurrencySummaryRows(nonSdgPreFundRows).map(row => ({
        ...row,
        variant: 'credit' as SummaryVariant,
      })));
    }
    rows.push(
      { label: 'Net Operating Outlook (SDG)', amount: netPosition, currency: 'SDG', note: 'Due this month − payroll − subscriptions − operating expenses', variant: netPosition >= 0 ? 'credit-bold' : 'debit' },
      ...Object.entries(outlookByCurrency).filter(([currency]) => currency !== 'SDG').map(([currency, amount]) => ({
        label: `Net Operating Outlook (${currency})`, amount, currency, note: 'Per-currency outlook; no FX conversion', variant: 'credit' as SummaryVariant,
      })),
      { label: 'Excluded Non-SDG Activity', amount: null, currency: null, note: `Receivables ${excludedBreakdown(receivableCurrency.totals)}; Payroll ${excludedBreakdown(payrollCurrency.totals)}; Subs ${excludedBreakdown(subscriptionCurrency.totals)}; OpEx ${excludedBreakdown(operationalCurrency.totals)}`, variant: 'sub' },
    );
    return rows;
  }, [netPosition, outlookByCurrency, milestoneCurrency, retainerCurrency, totalReceivables, totalSubscriptions, totalOperationalExpenses, totalPayroll, totalGrossPayroll, preFundTxns.length, periodFunds.length, preFundReceived, preFundPaid, preFundCommitted, preFundAvailable, preFundNetActivity, preFundInflowCount, preFundPaidCount, preFundActivity.counts.commitment, nonSdgPreFundRows, receivableCurrency, payrollCurrency, subscriptionCurrency, operationalCurrency]);
  const reportDetailSections: ReportDetailSection[] = useMemo(() => [
    { title: 'Project Milestones', headers: ['ID', 'Title', 'Amount', 'Currency', 'Due Date', 'Status'], rows: milestones.map(r => [r.id, r.title, r.amount ?? 0, normalizeReportCurrency(r.currency), r.due_date, r.status]) },
    { title: 'Retainer Invoices', headers: ['ID', 'Client', 'Amount', 'Currency', 'Due Date', 'Status'], rows: retainerInvoices.map(r => [r.id, r.client_name, r.amount ?? 0, normalizeReportCurrency(r.currency), r.due_date, r.status]) },
    { title: 'Payroll Runs', headers: ['ID', 'Country', 'Period', 'Period Start', 'Period End', 'Status'], rows: selectedPayrollRuns.map(r => [r.id, r.country_id ?? 'MISSING', r.period_label, r.period_start, r.period_end, r.status]) },
    { title: 'Payroll Items', headers: ['Run ID', 'Net', 'Gross', 'Currency'], rows: payrollItems.map(r => [r.run_id, r.net_salary ?? 0, r.gross_salary ?? 0, normalizeReportCurrency(r.currency)]) },
    { title: 'Subscriptions', headers: ['ID', 'Name', 'Amount', 'Currency', 'Cycle', 'Monthly Est.'], rows: subscriptions.map(r => [r.id, r.name, r.amount, normalizeReportCurrency(r.currency), r.billing_cycle, monthlyEquivalent(Number(r.amount), r.billing_cycle)]) },
    { title: 'Operational Expenses', headers: ['ID', 'Category', 'Amount', 'Currency', 'Date', 'Status'], rows: operationalCosts.map(r => [r.id, r.expense_category, (Number(r.amount_cents) || 0) / 100, normalizeReportCurrency(r.currency), r.expense_date, r.status]) },
    { title: 'Pre-Fund Events', headers: ['ID', 'Fund', 'Type', 'Amount', 'Currency', 'Date', 'Reversal Of', 'Reason', 'Description'], rows: preFundTxns.map(r => [r.id, preFundNames.get(r.pre_fund_request_id ?? '') ?? r.pre_fund_request_id, r.transaction_type, r.amount ?? 0, normalizeReportCurrency(r.currency), r.transaction_date, r.reversal_of_id, r.event_reason, r.description]) },
    { title: 'Pre-Fund Balances', headers: ['ID', 'Name', 'Available', 'Currency', 'Status'], rows: periodFunds.map(r => [r.id, r.name, r.available_balance ?? 0, normalizeReportCurrency(r.currency), r.status]) },
  ].filter(section => section.rows.length > 0), [milestones, retainerInvoices, selectedPayrollRuns, payrollItems, subscriptions, operationalCosts, preFundTxns, preFundNames, periodFunds]);

  // ── Export PDF ─────────────────────────────────────────────────────────────
  function exportPDF() {
    if (!canExport) return;
    if (reportIncomplete) return;
    setExportError(null);
    try {
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

    const summaryRows = reportSummaryRows.map(row => [
      row.label,
      row.amount === null ? '' : fmt(row.amount, row.currency ?? 'SDG'),
      row.note,
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount / Currency', 'Notes']],
      body: summaryRows,
      headStyles: { fillColor: [15, 32, 65], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      bodyStyles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      alternateRowStyles: { fillColor: [248, 250, 255] },
      margin: { left: 14, right: 14 },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

    reportDetailSections.forEach(section => {
      if (y > 255) { doc.addPage(); y = 20; }
      autoTable(doc, {
        startY: y,
        head: [section.headers],
        body: section.rows.map(row => row.map(value => value ?? '—')),
        headStyles: { fillColor: [60, 80, 130], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
        bodyStyles: { fontSize: 8 },
        margin: { left: 14, right: 14 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    });

    doc.setFontSize(7); doc.setTextColor(180, 190, 210);
    doc.text('This is a system-generated report · PACT · Confidential', W / 2, 287, { align: 'center' });

    doc.save(`month-end-summary-${format(periodStart, 'yyyy-MM')}.pdf`);
    } catch (error) {
      console.error('Month-end PDF export failed', error);
      setExportError('PDF export failed. Please try again or contact an administrator if the problem continues.');
    }
  }

  async function exportExcel() {
    if (!canExport) return;
    if (reportIncomplete) return;
    setExportError(null);
    try {
    const summaryRows: (string | number | null)[][] = reportSummaryRows.map(row => [
      row.label, row.amount, row.currency, row.note,
    ]);

    const mainSheet: StandardSheetSpec = {
      sheetName: 'Summary',
      headers: ['ITEM', 'AMOUNT', 'CURRENCY', 'NOTES'],
      rows: summaryRows,
      colWidths: { 0: 40, 1: 18, 2: 12, 3: 42 },
    };

    const breakdownSheets: { title: string; sheetName: string; headers: string[]; rows: (string | number | null)[][]; colWidths?: number[] }[] = [];
    reportDetailSections.forEach((section, index) => breakdownSheets.push({
      title: `${section.title} — ${periodLabel}`,
      sheetName: section.title.slice(0, 28),
      headers: section.headers,
      rows: section.rows,
    }));

    await exportStandardExcel({
      reportTitle: 'PACT Command Center - Month-End Financial Summary',
      subtitleLine: `Period: ${periodLabel}`,
      metaLine: `Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')} | Net Operating Outlook: ${fmt(netPosition)}`,
      mainSheet,
      breakdownSheets,
      filenamePrefix: `month-end-summary-${format(periodStart, 'yyyy-MM')}`,
    });
    } catch (error) {
      console.error('Month-end Excel export failed', error);
      setExportError('Excel export failed. Please try again or contact an administrator if the problem continues.');
    }
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
            {canExport && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 bg-white dark:bg-slate-900" data-testid="button-export" disabled={reportIncomplete || isLoading}>
                  <Download className="h-3.5 w-3.5" />Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportPDF}><FileText className="h-3.5 w-3.5 mr-2" />Export PDF</DropdownMenuItem>
                <DropdownMenuItem onClick={exportExcel}><FileSpreadsheet className="h-3.5 w-3.5 mr-2" />Export Excel</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>}
          </div>
        </div>

        {reportIncomplete && (
          <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            <strong>Report incomplete — exports are disabled.</strong> Required data could not be loaded: {reportErrors.join(', ')}.
          </div>
        )}
        {exportError && (
          <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {exportError}
          </div>
        )}
        <div className={cn('rounded-lg border px-4 py-3 text-xs', monthOffset !== 0 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'bg-white text-muted-foreground')}>
          Report basis: {reportBasis}
        </div>
        <p className="text-xs text-muted-foreground">UI cards preview source rows; PDF and Excel exports contain all rows in every populated detail section.</p>

        {/* KPI Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryCard
            icon={<Users className="h-5 w-5 text-red-500" />}
            label="Total Payroll (Net)"
            value={isLoading ? '…' : fmt(totalPayroll)}
            sub={`${selectedPayrollRuns.length} finalized payroll run${selectedPayrollRuns.length !== 1 ? 's' : ''}${selectedPayroll.duplicateCount ? ` · ${selectedPayroll.duplicateCount} duplicate(s) excluded` : ''}`}
            accent="text-red-600"
          />
          <SummaryCard
            icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
            label="Total Receivables"
            value={isLoading ? '…' : fmt(totalReceivables)}
            sub={`${milestones.filter(row => row.currency === 'SDG').length + retainerInvoices.filter(row => row.currency === 'SDG').length} outstanding SDG items`}
            accent="text-emerald-600"
          />
          <SummaryCard
            icon={<CreditCard className="h-5 w-5 text-indigo-500" />}
            label="Subscription Costs"
            value={isLoading ? '…' : fmt(totalSubscriptions)}
            sub={`${subscriptions.filter(row => row.currency === 'SDG').length} active SDG subscriptions`}
            accent="text-indigo-600"
          />
          <SummaryCard
            icon={<Banknote className="h-5 w-5 text-amber-500" />}
            label="Operational Expenses"
            value={isLoading ? '…' : fmt(totalOperationalExpenses)}
            sub={`${operationalCosts.filter(row => row.currency === 'SDG').length} approved SDG submissions`}
            accent="text-amber-600"
          />
          <SummaryCard
            icon={netPosition >= 0
              ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              : <AlertCircle className="h-5 w-5 text-red-500" />}
            label="Net Operating Outlook"
            value={isLoading ? '…' : fmt(netPosition)}
            sub="Due this month − Payroll − Subs. − Op. Exp."
            accent={netPosition >= 0 ? 'text-emerald-700' : 'text-red-700'}
          />
        </div>

        {/* Net Operating Outlook Banner */}
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
                 Net Operating Outlook for {periodLabel}: {fmt(netPosition)}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                 Currently outstanding items due in this month ({fmt(totalReceivables)}) − Payroll ({fmt(totalPayroll)}) − Subscriptions ({fmt(totalSubscriptions)}) − Operational Expenses ({fmt(totalOperationalExpenses)}). Pre-Fund restricted funds are excluded.
              </p>
              {Object.entries(outlookByCurrency).filter(([currency]) => currency !== 'SDG').map(([currency, amount]) => (
                <p key={currency} className="text-xs text-muted-foreground">Net Operating Outlook ({currency}): {fmt(amount, currency)} (no FX conversion)</p>
              ))}
            </div>
          </div>
        )}
        {!isLoading && (
          <div className="rounded-lg border bg-white px-4 py-3 text-xs text-muted-foreground">
            Headline operating figures are SDG only. Excluded non-SDG operating activity — receivables: {excludedBreakdown(receivableCurrency.totals)}; payroll: {excludedBreakdown(payrollCurrency.totals)}; subscriptions: {excludedBreakdown(subscriptionCurrency.totals)}; operating expenses: {excludedBreakdown(operationalCurrency.totals)}. Pre-Fund remains restricted and separate; current non-SDG available balances: {excludedBreakdown(preFundAvailableByCurrency)}.
          </div>
        )}

        {/* Breakdown Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Pre-Fund Activity */}
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900 md:col-span-3">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="h-4 w-4 text-violet-500" />Pre-Fund Activity
              </CardTitle>
              <CardDescription className="text-xs">
                 Verified ledger events within this period · Current available balance (not historical as-of) · {periodFunds.length} fund{periodFunds.length !== 1 ? 's' : ''} referenced
              </CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {loadingPFTxns || loadingPeriodFunds ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin opacity-30" /></div>
              ) : preFundTxnsError || periodFundsError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  Pre-Fund activity could not be loaded. The report is not showing zero values because of a data-query failure.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 text-center" data-testid="pf-received">
                      <p className="text-xs text-muted-foreground mb-1">Received</p>
                      <p className="text-base font-bold text-emerald-700">{fmt(preFundReceived)}</p>
                    </div>
                    <div className="rounded-lg border bg-red-50 dark:bg-red-950/20 px-4 py-3 text-center" data-testid="pf-paid">
                      <p className="text-xs text-muted-foreground mb-1">Paid Out</p>
                      <p className="text-base font-bold text-red-700">{fmt(preFundPaid)}</p>
                    </div>
                    <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-center" data-testid="pf-committed">
                      <p className="text-xs text-muted-foreground mb-1">Committed</p>
                      <p className="text-base font-bold text-amber-700">{fmt(preFundCommitted)}</p>
                    </div>
                    <div className="rounded-lg border bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-center" data-testid="pf-available">
                      <p className="text-xs text-muted-foreground mb-1">Available Balance</p>
                      <p className="text-base font-bold text-slate-700 dark:text-slate-200">{fmt(preFundAvailable)}</p>
                    </div>
                    <div className={`rounded-lg border px-4 py-3 text-center ${preFundNetActivity >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/20' : 'bg-amber-50 dark:bg-amber-950/20'}`} data-testid="pf-net-activity">
                      <p className="text-xs text-muted-foreground mb-1">Net Activity</p>
                      <p className={`text-base font-bold ${preFundNetActivity >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{fmt(preFundNetActivity)}</p>
                      <p className="text-[10px] text-muted-foreground">Period movement · excludes opening balance</p>
                    </div>
                  </div>
                  {nonSdgPreFundRows.length > 0 && (
                    <div className="mt-3 rounded-lg border bg-slate-50 p-3 text-xs dark:bg-slate-900">
                      <p className="mb-1 font-semibold">Other Pre-Fund currencies (not converted to SDG)</p>
                      {nonSdgPreFundRows.map(row => (
                        <p key={row.currency} className="text-muted-foreground">
                          {row.currency}: received {fmt(row.received, row.currency)} · paid {fmt(row.paid, row.currency)} · committed {fmt(row.committed, row.currency)} · net activity {fmt(row.net, row.currency)} · current available {fmt(row.available, row.currency)}
                        </p>
                      ))}
                    </div>
                  )}
                  {(preFundActivity.nullCurrencyCount > 0 || preFundAvailableAggregate.nullCurrencyCount > 0 || receivableCurrency.nullCurrencyCount > 0
                    || payrollCurrency.nullCurrencyCount > 0 || subscriptionCurrency.nullCurrencyCount > 0
                    || operationalCurrency.nullCurrencyCount > 0) && (
                    <p className="mt-2 text-xs text-amber-700">
                      Data-quality exception: rows with missing currency were excluded from totals.
                    </p>
                  )}
                </>
              )}
              {preFundTxns.length > 0 && (
                <div className="mt-3 space-y-1 max-h-32 overflow-y-auto">
                  {preFundTxns.slice(0, 6).map(t => (
                    <div key={t.id} className="flex items-center justify-between text-xs border rounded px-3 py-1.5" data-testid={`row-pf-txn-${t.id}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Badge variant="outline" className={`text-[10px] capitalize shrink-0 ${t.transaction_type === 'receipt' ? 'text-emerald-700 border-emerald-300' : t.transaction_type === 'payment' ? 'text-red-700 border-red-300' : 'text-amber-700 border-amber-300'}`}>
                          {t.transaction_type ?? '—'}
                        </Badge>
                        <span className="truncate text-muted-foreground">{preFundNames.get(t.pre_fund_request_id ?? '') ?? t.description ?? '—'}</span>
                      </div>
                      <span className="ml-2 font-semibold shrink-0">
                        {t.currency ? fmt(Number(t.amount) || 0, t.currency) : `${Number(t.amount) || 0} (currency missing)`}
                      </span>
                    </div>
                  ))}
                  {preFundTxns.length > 6 && <p className="text-xs text-muted-foreground text-center">+{preFundTxns.length - 6} more transactions</p>}
                </div>
              )}
            </CardContent>
          </Card>

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
              ) : selectedPayrollRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-4">No payroll runs for this period</p>
              ) : (
                <div className="space-y-2">
                  {selectedPayrollRuns.map((run) => (
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
              <CardDescription className="text-xs">
                Currently outstanding items due in the selected month
                {monthOffset !== 0 && ' · Current status may differ from month-end state; settlement history is not available'}
              </CardDescription>
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
                          <span className="ml-2 font-semibold text-emerald-700">{m.currency ? fmt(Number(m.amount) || 0, m.currency) : '(currency missing)'}</span>
                        </div>
                      ))}
                      {milestones.length > 3 && (
                        <p className="text-xs text-muted-foreground text-center">+{milestones.length - 3} more milestones</p>
                      )}
                      {retainerInvoices.slice(0, 2).map((r) => (
                        <div key={r.id} className="flex items-center justify-between text-xs border rounded-lg px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20" data-testid={`row-retainer-invoice-${r.id}`}>
                          <span className="truncate font-medium">{r.client_name ?? 'Retainer'}</span>
                          <span className="ml-2 font-semibold text-emerald-700">{r.currency ? fmt(Number(r.amount) || 0, r.currency) : '(currency missing)'}</span>
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

          {/* Operational Expenses */}
          <Card className="shadow-sm border-0 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Banknote className="h-4 w-4 text-amber-500" />Operational Expenses
              </CardTitle>
              <CardDescription className="text-xs">Approved cost submissions for {periodLabel}</CardDescription>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              {loadingOpCosts ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin opacity-30" /></div>
              ) : operationalCosts.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-4">No approved operational expenses</p>
              ) : (
                <div className="space-y-1.5">
                  {operationalCosts.slice(0, 5).map((c) => (
                    <div key={c.id} className="flex items-center justify-between text-xs border rounded-lg px-3 py-2" data-testid={`row-opcost-${c.id}`}>
                      <span className="truncate font-medium capitalize">{c.expense_category ?? c.description ?? 'Expense'}</span>
                      <span className="ml-2 text-amber-700 font-semibold">
                        {c.currency ? fmt((Number(c.amount_cents) || 0) / 100, c.currency) : `${(Number(c.amount_cents) || 0) / 100} (currency missing)`}
                      </span>
                    </div>
                  ))}
                  {operationalCosts.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">+{operationalCosts.length - 5} more</p>
                  )}
                  <div className="pt-2 border-t flex justify-between text-sm font-bold">
                    <span className="text-muted-foreground">Total Approved</span>
                    <span className="text-amber-700">{fmt(totalOperationalExpenses)}</span>
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
                {reportSummaryRows.map(row => (
                  <SummaryRow key={row.label} label={row.label} value={row.amount === null ? '—' : fmt(row.amount, row.currency ?? 'SDG')} note={row.note} variant={row.variant} />
                ))}
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
