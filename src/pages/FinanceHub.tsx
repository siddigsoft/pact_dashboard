import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, TrendingUp, FileText, Info,
  DollarSign, CreditCard, BarChart3, ArrowLeftRight,
  RefreshCw, Layers, ClipboardList, CalendarCheck,
  Activity, Users,
} from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
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
    <div className="min-h-screen bg-[#f5f7fa] dark:bg-[#0d1117]">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-30"
        style={{ background: 'linear-gradient(135deg, #0a1628 0%, #111827 60%, #0f2240 100%)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">

          <div className="pt-3 pb-1 opacity-90">
            <ConnectedPagesBar exclude="finance-hub" />
          </div>

          {/* Title + section pills */}
          <div className="flex items-center justify-between pt-3 pb-2 gap-4 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: accent + '22' }}>
                <activeTabDef.icon className="h-5 w-5" style={{ color: accent }} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white leading-tight tracking-tight">
                  Finance Hub
                </h1>
                <p className="text-xs font-medium" style={{ color: accent }}>
                  {currentSection.label} · {activeTabDef.label}
                </p>
              </div>
            </div>

            {/* Section pills */}
            <div className="flex items-center gap-1 flex-wrap">
              {SECTIONS.map(s => {
                const SIcon = s.icon;
                const isActive = s.id === section;
                return (
                  <button
                    key={s.id}
                    onClick={() => setTab(activeSectionFirstTab(s))}
                    data-testid={`finance-section-${s.id}`}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border',
                      isActive
                        ? 'bg-white text-slate-900 border-white shadow-sm'
                        : 'text-blue-200/80 border-blue-200/20 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <SIcon className="h-3 w-3 shrink-0" />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-tab strip */}
          <div className="flex gap-0 overflow-x-auto scrollbar-hide -mb-px">
            {currentSection.tabs.map(t => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  data-testid={`finance-tab-${t.id}`}
                  className={cn(
                    'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap shrink-0',
                    isActive
                      ? 'border-white text-white'
                      : 'border-transparent text-blue-200/50 hover:text-blue-100 hover:border-blue-200/30'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Description banner ──────────────────────────────────── */}
      <div className="border-b" style={{ background: accent + '0d', borderColor: accent + '25' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-start gap-2.5">
          <Info className="h-4 w-4 mt-0.5 shrink-0 opacity-60" style={{ color: accent }} />
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
            {activeTabDef.description}
          </p>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="min-h-[calc(100vh-160px)]">

        {/* Operations */}
        {tab === 'budget'        && <Suspense fallback={<PanelLoader />}><BudgetPanel /></Suspense>}
        {tab === 'financial-ops' && <Suspense fallback={<PanelLoader />}><FinancialOpsPanel /></Suspense>}
        {tab === 'admin-wallets' && <Suspense fallback={<PanelLoader />}><WalletsAdminPanel /></Suspense>}
        {tab === 'reconciliation'&& <Suspense fallback={<PanelLoader />}><ReconciliationPanel /></Suspense>}
        {tab === 'subscriptions' && <Suspense fallback={<PanelLoader />}><SubscriptionsPanel /></Suspense>}

        {/* Reports */}
        {tab === 'wallet-reports'   && <Suspense fallback={<PanelLoader />}><WalletReportsPanel /></Suspense>}
        {tab === 'advance-report'   && <Suspense fallback={<PanelLoader />}><AdvanceReportPanel /></Suspense>}
        {tab === 'cost-predictions' && <Suspense fallback={<PanelLoader />}><CostPredictionsPanel /></Suspense>}
        {tab === 'exchange-rates'   && <Suspense fallback={<PanelLoader />}><ExchangeRatesPanel /></Suspense>}
        {tab === 'salary-retainer'  && <Suspense fallback={<PanelLoader />}><SalaryRetainerPanel /></Suspense>}
        {tab === 'month-end'        && <Suspense fallback={<PanelLoader />}><MonthEndPanel /></Suspense>}
      </div>
    </div>
  );
}
