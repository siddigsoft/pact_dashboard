import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, TrendingUp, FileText, Info,
  DollarSign, CreditCard, BarChart3, ArrowLeftRight,
  RefreshCw, Layers, ClipboardList, CalendarCheck,
  Activity, Users,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
import { cn } from '@/lib/utils';

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

// ── Types ─────────────────────────────────────────────────────────────────────
type FinSection = 'operations' | 'reports';
type FinTab =
  | 'budget' | 'financial-ops' | 'admin-wallets' | 'reconciliation' | 'subscriptions'
  | 'wallet-reports' | 'advance-report' | 'cost-predictions' | 'exchange-rates' | 'salary-retainer' | 'month-end';

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

  const allTabs = SECTIONS.flatMap(s => s.tabs);
  const rawTab = params.get('tab') ?? '';
  const tabDef = allTabs.find(t => t.id === rawTab);
  const _savedFin = localStorage.getItem('hub_last_tab_finance') as FinTab | null;
  const _defaultFin: FinTab = (_savedFin && allTabs.some(t => t.id === _savedFin)) ? _savedFin : 'budget';
  const tab: FinTab = tabDef ? (rawTab as FinTab) : _defaultFin;

  const setTab = (t: FinTab) => { localStorage.setItem('hub_last_tab_finance', t); setParams({ tab: t }, { replace: true }); };

  useEffect(() => {
    if (rawTab && tab !== rawTab) setParams({ tab }, { replace: true });
  }, [rawTab, tab]);

  const section = sectionOfTab(tab);
  const currentSection = SECTIONS.find(s => s.id === section)!;
  const activeTabDef = allTabs.find(t => t.id === tab)!;
  const accent = currentSection.color;

  const activeSectionFirstTab = (s: SectionDef) => s.tabs[0].id;

  return (
    <HubLayout
      title="Finance Hub"
      subtitle="Operations · Reports"
      hubIcon={DollarSign}
      sections={SECTIONS}
      activeSectionId={section}
      activeTabId={tab}
      activeTabDescription={activeTabDef.description}
      quickLinks={['dashboard', 'accounting', 'reports', 'my-tasks']}
      onSectionClick={id => setTab(id as FinTab)}
      onTabClick={id => setTab(id as FinTab)}
    >
      <div className="min-h-[calc(100vh-160px)]">
        {tab === 'budget'           && <Suspense fallback={<PanelLoader />}><BudgetPanel /></Suspense>}
        {tab === 'financial-ops'    && <Suspense fallback={<PanelLoader />}><FinancialOpsPanel /></Suspense>}
        {tab === 'admin-wallets'    && <Suspense fallback={<PanelLoader />}><WalletsAdminPanel /></Suspense>}
        {tab === 'reconciliation'   && <Suspense fallback={<PanelLoader />}><ReconciliationPanel /></Suspense>}
        {tab === 'subscriptions'    && <Suspense fallback={<PanelLoader />}><SubscriptionsPanel /></Suspense>}
        {tab === 'wallet-reports'   && <Suspense fallback={<PanelLoader />}><WalletReportsPanel /></Suspense>}
        {tab === 'advance-report'   && <Suspense fallback={<PanelLoader />}><AdvanceReportPanel /></Suspense>}
        {tab === 'cost-predictions' && <Suspense fallback={<PanelLoader />}><CostPredictionsPanel /></Suspense>}
        {tab === 'exchange-rates'   && <Suspense fallback={<PanelLoader />}><ExchangeRatesPanel /></Suspense>}
        {tab === 'salary-retainer'  && <Suspense fallback={<PanelLoader />}><SalaryRetainerPanel /></Suspense>}
        {tab === 'month-end'        && <Suspense fallback={<PanelLoader />}><MonthEndPanel /></Suspense>}
      </div>
    </HubLayout>
  );
}
