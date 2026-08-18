import { Suspense, lazy, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, TrendingUp, FileText, Info,
  DollarSign, CreditCard, BarChart3, ArrowLeftRight,
  RefreshCw, Layers, ClipboardList, CalendarCheck,
  Activity, Users, Receipt, Copy, Wallet,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
import { cn } from '@/lib/utils';
import { useCurrentUserAccess } from '@/context/CurrentUserAccessContext';

// ── Lazy panels ───────────────────────────────────────────────────────────────
const BudgetPanel              = lazy(() => import('./Budget'));
const FinancialOpsPanel        = lazy(() => import('./FinancialOperations'));
const WalletsAdminPanel        = lazy(() => import('./AdminWallets'));
const ReconciliationPanel      = lazy(() => import('./ReconciliationDashboard'));
const SubscriptionsPanel       = lazy(() => import('./Subscriptions'));
const WalletReportsPanel       = lazy(() => import('./WalletReports'));
const AdvanceReportPanel       = lazy(() => import('./AdvanceRequestsReport'));
const CostPredictionsPanel     = lazy(() => import('./CostPredictions'));
const ExchangeRatesPanel       = lazy(() => import('./ExchangeRates'));
const SalaryRetainerPanel      = lazy(() => import('./SalaryRetainerReport'));
const MonthEndPanel            = lazy(() => import('./MonthEndFinancialSummary'));
const FieldPaymentsCentrePanel = lazy(() => import('./FieldPaymentsCentre'));
const DuplicatePaymentsPanel   = lazy(() => import('./DuplicatePaymentsReport'));
const CampaignAdvancesPanel    = lazy(() => import('@/components/finance/CampaignAdvancesPanel'));

// ── Types ─────────────────────────────────────────────────────────────────────
type FinSection = 'operations' | 'reports';
type FinTab =
  | 'budget' | 'financial-ops' | 'admin-wallets' | 'reconciliation' | 'subscriptions'
  | 'wallet-reports' | 'advance-report' | 'cost-predictions' | 'exchange-rates'
  | 'salary-retainer' | 'month-end' | 'enumerator-fees' | 'duplicate-payments'
  | 'campaign-advances';

interface TabDef { id: FinTab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: FinSection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'operations', label: 'Operations', icon: Activity, color: '#0284c7',
    description: 'Active financial management — budgets, wallets, reconciliation, and day-to-day operations.',
    tabs: [
      {
        id: 'budget', label: 'Budget', icon: DollarSign,
        description: 'View, manage, and track approved budgets by project or department — monitor allocations, remaining balances, and spending against each budget line.',
      },
      {
        id: 'financial-ops', label: 'Financial Operations', icon: Activity,
        description: 'Monitor and process all operational financial transactions — review pending items, approve movements, and maintain a clear picture of day-to-day financial activity.',
      },
      {
        id: 'admin-wallets', label: 'Wallets Admin', icon: CreditCard,
        description: 'Manage staff field wallets — issue funds, process top-ups, view transaction histories, and reconcile cash balances across all active wallets.',
      },
      {
        id: 'reconciliation', label: 'Reconciliation', icon: RefreshCw,
        description: 'Reconcile transactions across payment methods and accounts — match records, clear differences, and confirm that all financial movements are fully accounted for.',
      },
      {
        id: 'subscriptions', label: 'Subscriptions', icon: Layers,
        description: 'Manage organisation subscription plans — track renewal dates, billing cycles, costs, and ensure subscriptions are reviewed before automatic renewal.',
      },
      {
        id: 'campaign-advances', label: 'Campaign Advances', icon: Wallet,
        description: 'Review and approve advance requests submitted from Village Campaigns — approve, reject, and mark payments as paid so field teams can be disbursed.',
      },
    ],
  },
  {
    id: 'reports', label: 'Reports', icon: FileText, color: '#059669',
    description: 'Financial reporting — wallets, advances, cost forecasting, exchange rates, and period summaries.',
    tabs: [
      {
        id: 'wallet-reports', label: 'Wallet Reports', icon: BarChart3,
        description: 'View detailed wallet transaction histories and balance summaries — filter by staff member, date range, or wallet type to audit field cash usage.',
      },
      {
        id: 'advance-report', label: 'Transport Advance Report', icon: ClipboardList,
        description: 'Track all transportation advance requests — see who received advances, amounts, travel dates, recovery status, and any outstanding balances.',
      },
      {
        id: 'duplicate-payments', label: 'Duplicate Payments Report', icon: Copy,
        description: 'Identify all sites that have more than one active advance request — grouped by site, MMP, and month with full status details and Excel export for finance investigation.',
      },
      {
        id: 'cost-predictions', label: 'Cost Predictions', icon: TrendingUp,
        description: 'AI-assisted cost forecasting based on historical spending patterns — project future expenditure by category, department, or project for planning.',
      },
      {
        id: 'exchange-rates', label: 'Exchange Rates', icon: ArrowLeftRight,
        description: 'Manage the currency exchange rates used across all financial transactions — set rates by date range and maintain a full history of rate changes.',
      },
      {
        id: 'salary-retainer', label: 'Salary & Retainer Report', icon: Users,
        description: 'Consolidated report combining staff salaries and retainer payments — compare costs by period, department, or contract type, with export to Excel.',
      },
      {
        id: 'month-end', label: 'Month-End Summary', icon: CalendarCheck,
        description: 'End-of-month financial summary showing closing balances, reconciliation status, and a snapshot of all financial activity for sign-off and archiving.',
      },
      {
        id: 'enumerator-fees', label: 'Field Payments Centre', icon: Receipt,
        description: 'Unified enumerator fee payments, transport advance tracking, exception recovery, and outstanding balance tracker.',
      },
    ],
  },
];

function sectionOfTab(tabId: FinTab): FinSection {
  for (const s of SECTIONS) {
    if (s.tabs.some(t => t.id === tabId)) return s.id;
  }
  return 'operations';
}

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-30" />
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

export default function FinanceHub() {
  const [params, setParams] = useSearchParams();
  const { isTabBlocked } = useCurrentUserAccess();

  // Filter tabs by per-user override (role-based: Finance Hub is already role-gated at the page level)
  const visibleSections = useMemo(() =>
    SECTIONS
      .map(s => ({
        ...s,
        tabs: s.tabs.filter(t => !isTabBlocked(`finance-hub:${t.id}`)),
      }))
      .filter(s => s.tabs.length > 0),
    [isTabBlocked],
  );

  const allVisibleTabs = useMemo(() => visibleSections.flatMap(s => s.tabs), [visibleSections]);
  const rawTab = params.get('tab') ?? '';
  const _savedFin = localStorage.getItem('hub_last_tab_finance') as FinTab | null;
  const _defaultFin: FinTab =
    (_savedFin && allVisibleTabs.some(t => t.id === _savedFin)) ? _savedFin
    : (allVisibleTabs[0]?.id as FinTab ?? 'budget');
  const tab: FinTab = allVisibleTabs.find(t => t.id === rawTab) ? (rawTab as FinTab) : _defaultFin;

  const setTab = (t: FinTab) => { localStorage.setItem('hub_last_tab_finance', t); setParams({ tab: t }, { replace: true }); };

  useEffect(() => {
    if (rawTab && tab !== rawTab) setParams({ tab }, { replace: true });
  }, [rawTab, tab]);

  const section = sectionOfTab(tab);
  const allTabs = SECTIONS.flatMap(s => s.tabs);
  const activeTabDef = allVisibleTabs.find(t => t.id === tab) ?? allTabs.find(t => t.id === tab) ?? allTabs[0];

  const activeSectionFirstTab = (s: SectionDef) => s.tabs[0].id;

  return (
    <HubLayout
      title="Finance Hub"
      subtitle="Operations · Reports"
      hubIcon={DollarSign}
      sections={visibleSections}
      activeSectionId={section}
      activeTabId={tab}
      activeTabDescription={activeTabDef.description}
      quickLinks={['dashboard', 'accounting', 'reports', 'my-tasks']}
      tourSlug="finance-hub"
      onSectionClick={id => setTab(id as FinTab)}
      onTabClick={id => setTab(id as FinTab)}
    >
      <div className="min-h-[calc(100vh-160px)]">
        {tab === 'budget'              && <Suspense fallback={<PanelLoader />}><BudgetPanel /></Suspense>}
        {tab === 'financial-ops'       && <Suspense fallback={<PanelLoader />}><FinancialOpsPanel /></Suspense>}
        {tab === 'admin-wallets'       && <Suspense fallback={<PanelLoader />}><WalletsAdminPanel /></Suspense>}
        {tab === 'reconciliation'      && <Suspense fallback={<PanelLoader />}><ReconciliationPanel /></Suspense>}
        {tab === 'subscriptions'       && <Suspense fallback={<PanelLoader />}><SubscriptionsPanel /></Suspense>}
        {tab === 'wallet-reports'      && <Suspense fallback={<PanelLoader />}><WalletReportsPanel /></Suspense>}
        {tab === 'advance-report'      && <Suspense fallback={<PanelLoader />}><AdvanceReportPanel /></Suspense>}
        {tab === 'duplicate-payments'  && <Suspense fallback={<PanelLoader />}><DuplicatePaymentsPanel /></Suspense>}
        {tab === 'cost-predictions'    && <Suspense fallback={<PanelLoader />}><CostPredictionsPanel /></Suspense>}
        {tab === 'exchange-rates'      && <Suspense fallback={<PanelLoader />}><ExchangeRatesPanel /></Suspense>}
        {tab === 'salary-retainer'     && <Suspense fallback={<PanelLoader />}><SalaryRetainerPanel /></Suspense>}
        {tab === 'month-end'           && <Suspense fallback={<PanelLoader />}><MonthEndPanel /></Suspense>}
        {tab === 'enumerator-fees'     && <Suspense fallback={<PanelLoader />}><FieldPaymentsCentrePanel /></Suspense>}
        {tab === 'campaign-advances'   && <Suspense fallback={<PanelLoader />}><CampaignAdvancesPanel /></Suspense>}
      </div>
    </HubLayout>
  );
}
