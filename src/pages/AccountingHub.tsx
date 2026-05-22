import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, BookOpen, ShoppingCart, Shield, TrendingUp, LayoutDashboard,
  BarChart3, Receipt, FileText, Landmark, BarChart, Package, Zap, Lock,
  ArrowLeftRight, Wallet, Heart, ShieldAlert, RotateCcw, Building2,
  PiggyBank, Activity, Search, Settings2, Clock, CreditCard, Award,
  CalendarDays, Info,
} from 'lucide-react';
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { cn } from '@/lib/utils';

// ── Lazy panels ───────────────────────────────────────────────────────────────
const FinanceDashboard        = lazy(() => import('./AccountingFinanceDashboard'));
const COAPanel                = lazy(() => import('./AccountingCOA'));
const JournalsPanel           = lazy(() => import('./AccountingJournals'));
const TrialBalancePanel       = lazy(() => import('./AccountingTrialBalance'));
const LedgerPanel             = lazy(() => import('./AccountingGeneralLedger'));
const FinStatementsPanel      = lazy(() => import('./AccountingFinancialStatements'));
const FiscalYearsPanel        = lazy(() => import('./AccountingFiscalYears'));
const SearchPanel             = lazy(() => import('./AccountingSearch'));
const BankReconPanel          = lazy(() => import('./AccountingBankRecon'));
const BudgetVsActualPanel     = lazy(() => import('./AccountingBudgetVsActual'));
const CashFlowPanel           = lazy(() => import('./AccountingCashFlow'));
const VendorsPanel            = lazy(() => import('./AccountingVendors'));
const PRPanel                 = lazy(() => import('./AccountingPurchaseRequisitions'));
const POPanel                 = lazy(() => import('./AccountingPurchaseOrders'));
const GRNPanel                = lazy(() => import('./AccountingGRN'));
const APInvoicesPanel         = lazy(() => import('./AccountingAPInvoices'));
const ChequeRegisterPanel     = lazy(() => import('./AccountingChequeRegister'));
const APAgingPanel            = lazy(() => import('./AccountingAPAging'));
const FixedAssetsPanel        = lazy(() => import('./AccountingFixedAssets'));
const GLBridgePanel           = lazy(() => import('./AccountingGLBridge'));
const BudgetPlanningPanel     = lazy(() => import('./AccountingBudgetPlanning'));
const PeriodClosePanel        = lazy(() => import('./AccountingPeriodClose'));
const TaxPanel                = lazy(() => import('./AccountingTaxManagement'));
const MultiCurrencyPanel      = lazy(() => import('./AccountingMultiCurrency'));
const BudgetEncumbrancePanel  = lazy(() => import('./AccountingBudgetEncumbrance'));
const DonorReportsPanel       = lazy(() => import('./AccountingDonorReports'));
const SODPanel                = lazy(() => import('./AccountingSOD'));
const AMLPanel                = lazy(() => import('./AccountingAMLCompliance'));
const IntercompanyPanel       = lazy(() => import('./AccountingIntercompany'));
const FundsPanel              = lazy(() => import('./AccountingFunds'));
const CashFlowForecastPanel   = lazy(() => import('./AccountingCashFlowForecast'));
const GrantsPanel             = lazy(() => import('./AccountingGrants'));
const CostAllocationPanel     = lazy(() => import('./AccountingCostAllocation'));
const DepreciationRunPanel    = lazy(() => import('./AccountingDepreciationRun'));
const ConsolidationPanel      = lazy(() => import('./AccountingConsolidation'));
const GLAuditPanel            = lazy(() => import('./AccountingGLAudit'));
const FinanceAuditTrailPanel  = lazy(() => import('./FinanceAuditTrail'));
const AccountingSettingsPanel = lazy(() => import('./AccountingSettings'));

// ── Types ─────────────────────────────────────────────────────────────────────
type AcctSection = 'core' | 'fin-ops' | 'p2p' | 'controls' | 'advanced';
type AcctTab =
  | 'finance-dashboard' | 'coa' | 'journals' | 'trial-balance' | 'ledger' | 'reports' | 'fiscal-years' | 'search'
  | 'bank-recon' | 'budget-variance' | 'cash-flow' | 'fixed-assets' | 'gl-bridge' | 'budget-planning'
  | 'vendors' | 'purchase-requisitions' | 'purchase-orders' | 'grn' | 'ap-invoices' | 'cheque-register' | 'ap-aging'
  | 'period-close' | 'tax' | 'multi-currency' | 'budget-encumbrance' | 'donor-reports' | 'sod' | 'aml' | 'intercompany' | 'funds'
  | 'cash-flow-forecast' | 'grants' | 'cost-allocation' | 'depreciation-run' | 'consolidation' | 'gl-audit' | 'finance-audit-trail' | 'settings';

interface TabDef { id: AcctTab; label: string; icon: React.ElementType; description: string }
interface SectionDef { id: AcctSection; label: string; icon: React.ElementType; color: string; description: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'core', label: 'Core Ledger', icon: BookOpen, color: '#6366f1',
    description: 'Foundational accounting records — accounts, entries, balances, and official financial reports.',
    tabs: [
      {
        id: 'finance-dashboard', label: 'Finance Dashboard', icon: LayoutDashboard,
        description: 'Real-time overview of key financial KPIs: income vs. expenses, fund balances, budget utilization, and recent transaction activity across all cost centers.',
      },
      {
        id: 'coa', label: 'Chart of Accounts', icon: BarChart3,
        description: 'Define and manage the full chart of accounts — account codes, types (asset, liability, equity, income, expense), hierarchies, and active status.',
      },
      {
        id: 'journals', label: 'Journal Entries', icon: Receipt,
        description: 'Create, review, and post manual journal entries with debit/credit lines, narrative descriptions, and supporting document attachments.',
      },
      {
        id: 'trial-balance', label: 'Trial Balance', icon: TrendingUp,
        description: 'View all account balances as of any date to verify that total debits equal total credits before period-end closing.',
      },
      {
        id: 'ledger', label: 'General Ledger', icon: BookOpen,
        description: 'Drill into every posted transaction for any account over a selected date range, with full source references and running balance.',
      },
      {
        id: 'reports', label: 'Financial Statements', icon: FileText,
        description: 'Generate standard financial statements — income statement, balance sheet, and statement of cash flows — for any fiscal period or custom date range.',
      },
      {
        id: 'fiscal-years', label: 'Fiscal Years', icon: CalendarDays,
        description: 'Configure fiscal years and accounting periods, control which periods are open or closed for posting, and view period-end status.',
      },
      {
        id: 'search', label: 'Accounting Search', icon: Search,
        description: 'Search across all transactions, journal entries, and accounts simultaneously by keyword, amount, date, or reference number.',
      },
    ],
  },
  {
    id: 'fin-ops', label: 'Financial Operations', icon: Activity, color: '#0284c7',
    description: 'Day-to-day financial management — bank reconciliation, cash flow, budget planning, fixed assets, and GL automation.',
    tabs: [
      {
        id: 'bank-recon', label: 'Bank Reconciliation', icon: Landmark,
        description: 'Match bank statement lines against GL entries, clear outstanding items, and identify unreconciled differences for each bank account.',
      },
      {
        id: 'budget-planning', label: 'Budget Planning', icon: PiggyBank,
        description: 'Build and submit annual or project budgets, route them through multi-level approval workflows, track revisions, and maintain a full audit log.',
      },
      {
        id: 'budget-variance', label: 'Budget vs Actual', icon: BarChart,
        description: 'Compare actual spending to approved budgets by project, department, or cost center — with variance amounts and percentage deviation.',
      },
      {
        id: 'cash-flow', label: 'Cash Flow', icon: Activity,
        description: 'Track money in and out across all accounts in real time to monitor liquidity, identify cash gaps, and manage operating reserves.',
      },
      {
        id: 'fixed-assets', label: 'Fixed Assets', icon: Package,
        description: 'Manage the full asset lifecycle — acquisition, depreciation schedule, revaluation, disposal, and write-off — with an asset register.',
      },
      {
        id: 'gl-bridge', label: 'GL Bridge Engine', icon: Zap,
        description: 'Automatically generate and post journal entries from operational modules (payroll, advances, P2P) into the General Ledger without manual re-entry.',
      },
    ],
  },
  {
    id: 'p2p', label: 'Procurement & P2P', icon: ShoppingCart, color: '#7c3aed',
    description: 'Full procure-to-pay cycle — vendor registry, requisitions, purchase orders, goods receipt, AP invoices, and payment tracking.',
    tabs: [
      {
        id: 'vendors', label: 'Vendor Registry', icon: Building2,
        description: 'Maintain the vendor master record — contact details, bank account info, payment terms, tax identifiers, and compliance/blacklist status.',
      },
      {
        id: 'purchase-requisitions', label: 'Purchase Requisitions', icon: Receipt,
        description: 'Initiate and route internal requests to purchase goods or services through the configured approval workflow before a PO is issued.',
      },
      {
        id: 'purchase-orders', label: 'Purchase Orders', icon: ShoppingCart,
        description: 'Issue formal purchase orders to approved vendors after requisition sign-off, with line-item details, delivery terms, and budget encumbrance.',
      },
      {
        id: 'grn', label: 'Goods Receipt Notes', icon: Package,
        description: 'Record the physical delivery of goods against an open purchase order, confirm quantities received, and trigger the three-way AP invoice match.',
      },
      {
        id: 'ap-invoices', label: 'AP Invoices', icon: FileText,
        description: 'Capture, match to PO/GRN, and approve vendor invoices for payment — with duplicate detection, tax coding, and two-tier sign-off.',
      },
      {
        id: 'cheque-register', label: 'Cheque Register', icon: CreditCard,
        description: 'Log all issued cheques, track their clearing status against bank records, and void or reissue stale or lost cheques.',
      },
      {
        id: 'ap-aging', label: 'AP Aging', icon: Clock,
        description: 'View outstanding payables grouped by due-date buckets (current, 30, 60, 90+ days) to prioritize payments and avoid late penalties.',
      },
    ],
  },
  {
    id: 'controls', label: 'Controls & Compliance', icon: Shield, color: '#dc2626',
    description: 'Financial governance, regulatory compliance, and internal controls to protect organisational funds.',
    tabs: [
      {
        id: 'period-close', label: 'Period Close', icon: Lock,
        description: 'Lock completed accounting periods to prevent further posting, run close checklists, and certify that reconciliations are complete before sign-off.',
      },
      {
        id: 'tax', label: 'Tax Management', icon: Receipt,
        description: 'Configure applicable tax rates and codes, assign them to transaction types, and generate tax liability summaries for filing and compliance.',
      },
      {
        id: 'multi-currency', label: 'Multi-Currency', icon: ArrowLeftRight,
        description: 'Set exchange rates for each currency, revalue foreign-currency balances at period end, and automatically post foreign exchange gain/loss entries.',
      },
      {
        id: 'budget-encumbrance', label: 'Budget Encumbrance', icon: Wallet,
        description: 'Reserve budget funds the moment a purchase order is raised, ensuring available balance is always accurate and preventing over-spending.',
      },
      {
        id: 'donor-reports', label: 'Donor Fund Reports', icon: Heart,
        description: 'Generate fund utilisation reports segmented by donor, grant, or restriction type for external reporting and donor accountability.',
      },
      {
        id: 'sod', label: 'Segregation of Duties', icon: ShieldAlert,
        description: 'Define and enforce SOD rules so no single user can both initiate and approve a transaction — reducing fraud and internal control risk.',
      },
      {
        id: 'aml', label: 'AML & Compliance', icon: Shield,
        description: 'Monitor transactions for anti-money-laundering flags, screen against watchlists, and maintain a full compliance audit trail for regulators.',
      },
      {
        id: 'intercompany', label: 'Intercompany', icon: ArrowLeftRight,
        description: 'Record and eliminate intercompany transactions between legal entities or country offices, ensuring consolidated financials are free from double-counting.',
      },
      {
        id: 'funds', label: 'Funds', icon: Landmark,
        description: 'Define restricted and unrestricted fund accounts, track balances by funding source, and enforce that spending stays within each fund\'s rules.',
      },
    ],
  },
  {
    id: 'advanced', label: 'Advanced & Reporting', icon: TrendingUp, color: '#059669',
    description: 'Forecasting, grant management, cost allocation, consolidation, and full audit trails.',
    tabs: [
      {
        id: 'cash-flow-forecast', label: 'Cash Flow Forecast', icon: TrendingUp,
        description: 'Project future cash positions based on committed expenditures, open purchase orders, approved budgets, and expected incoming receipts.',
      },
      {
        id: 'grants', label: 'Grant Tracking', icon: Award,
        description: 'Track grant budgets line by line, record expenses against each grant, and monitor milestone delivery and burn rate against donor commitments.',
      },
      {
        id: 'cost-allocation', label: 'Cost Allocation', icon: Zap,
        description: 'Distribute shared overhead costs across projects or departments using configurable weight percentages, with automatic GL journal postings to target accounts.',
      },
      {
        id: 'depreciation-run', label: 'Depreciation Run', icon: RotateCcw,
        description: 'Execute monthly or annual depreciation calculations for all fixed assets and automatically post the resulting journal entries to the GL.',
      },
      {
        id: 'consolidation', label: 'Consolidation', icon: Building2,
        description: 'Aggregate and reconcile financial data from multiple country offices or legal entities into a single consolidated financial view for management reporting.',
      },
      {
        id: 'gl-audit', label: 'GL Bridge Audit', icon: Activity,
        description: 'Review every journal entry posted automatically by the GL Bridge Engine, with full source traceability back to the originating operational record.',
      },
      {
        id: 'finance-audit-trail', label: 'Finance Audit Trail', icon: FileText,
        description: 'Immutable log of every change made to any financial record — who changed what, when, from which module, and what the previous value was.',
      },
      {
        id: 'settings', label: 'Accounting Settings', icon: Settings2,
        description: 'Configure accounting defaults including posting rules, default account mappings, approval thresholds, rounding rules, and notification preferences.',
      },
    ],
  },
];

function sectionOfTab(tabId: AcctTab): AcctSection {
  for (const s of SECTIONS) {
    if (s.tabs.some(t => t.id === tabId)) return s.id;
  }
  return 'core';
}

function PanelLoader() {
  return (
    <div className="flex flex-col items-center justify-center py-32 gap-3 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin opacity-30" />
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

export default function AccountingHub() {
  const [params, setParams] = useSearchParams();

  const allTabs = SECTIONS.flatMap(s => s.tabs);
  const rawTab = params.get('tab') ?? '';
  const tabDef = allTabs.find(t => t.id === rawTab);
  const _savedAcct = localStorage.getItem('hub_last_tab_accounting') as AcctTab | null;
  const _defaultAcct: AcctTab = (_savedAcct && allTabs.some(t => t.id === _savedAcct)) ? _savedAcct : 'finance-dashboard';
  const tab: AcctTab = tabDef ? (rawTab as AcctTab) : _defaultAcct;

  const setTab = (t: AcctTab) => { localStorage.setItem('hub_last_tab_accounting', t); setParams({ tab: t }, { replace: true }); };

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
            <ConnectedPagesBar exclude="accounting" />
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
                  Accounting
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
                    data-testid={`acct-section-${s.id}`}
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
                  data-testid={`acct-tab-${t.id}`}
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

      {/* ── Page description banner ──────────────────────────────── */}
      <div
        className="border-b"
        style={{
          background: accent + '0d',
          borderColor: accent + '25',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-start gap-2.5">
          <Info className="h-4 w-4 mt-0.5 shrink-0 opacity-60" style={{ color: accent }} />
          <p className="text-sm text-slate-700 dark:text-slate-300 leading-snug">
            {activeTabDef.description}
          </p>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="min-h-[calc(100vh-160px)]">

        {/* Core Ledger */}
        {tab === 'finance-dashboard'    && <Suspense fallback={<PanelLoader />}><FinanceDashboard /></Suspense>}
        {tab === 'coa'                  && <Suspense fallback={<PanelLoader />}><COAPanel /></Suspense>}
        {tab === 'journals'             && <Suspense fallback={<PanelLoader />}><JournalsPanel /></Suspense>}
        {tab === 'trial-balance'        && <Suspense fallback={<PanelLoader />}><TrialBalancePanel /></Suspense>}
        {tab === 'ledger'               && <Suspense fallback={<PanelLoader />}><LedgerPanel /></Suspense>}
        {tab === 'reports'              && <Suspense fallback={<PanelLoader />}><FinStatementsPanel /></Suspense>}
        {tab === 'fiscal-years'         && <Suspense fallback={<PanelLoader />}><FiscalYearsPanel /></Suspense>}
        {tab === 'search'               && <Suspense fallback={<PanelLoader />}><SearchPanel /></Suspense>}

        {/* Operations & P2P */}
        {tab === 'bank-recon'           && <Suspense fallback={<PanelLoader />}><BankReconPanel /></Suspense>}
        {tab === 'budget-variance'      && <Suspense fallback={<PanelLoader />}><BudgetVsActualPanel /></Suspense>}
        {tab === 'cash-flow'            && <Suspense fallback={<PanelLoader />}><CashFlowPanel /></Suspense>}
        {tab === 'vendors'              && <Suspense fallback={<PanelLoader />}><VendorsPanel /></Suspense>}
        {tab === 'purchase-requisitions'&& <Suspense fallback={<PanelLoader />}><PRPanel /></Suspense>}
        {tab === 'purchase-orders'      && <Suspense fallback={<PanelLoader />}><POPanel /></Suspense>}
        {tab === 'grn'                  && <Suspense fallback={<PanelLoader />}><GRNPanel /></Suspense>}
        {tab === 'ap-invoices'          && <Suspense fallback={<PanelLoader />}><APInvoicesPanel /></Suspense>}
        {tab === 'cheque-register'      && <Suspense fallback={<PanelLoader />}><ChequeRegisterPanel /></Suspense>}
        {tab === 'ap-aging'             && <Suspense fallback={<PanelLoader />}><APAgingPanel /></Suspense>}
        {tab === 'fixed-assets'         && <Suspense fallback={<PanelLoader />}><FixedAssetsPanel /></Suspense>}
        {tab === 'gl-bridge'            && <Suspense fallback={<PanelLoader />}><GLBridgePanel /></Suspense>}
        {tab === 'budget-planning'      && <Suspense fallback={<PanelLoader />}><BudgetPlanningPanel /></Suspense>}

        {/* Controls & Compliance */}
        {tab === 'period-close'         && <Suspense fallback={<PanelLoader />}><PeriodClosePanel /></Suspense>}
        {tab === 'tax'                  && <Suspense fallback={<PanelLoader />}><TaxPanel /></Suspense>}
        {tab === 'multi-currency'       && <Suspense fallback={<PanelLoader />}><MultiCurrencyPanel /></Suspense>}
        {tab === 'budget-encumbrance'   && <Suspense fallback={<PanelLoader />}><BudgetEncumbrancePanel /></Suspense>}
        {tab === 'donor-reports'        && <Suspense fallback={<PanelLoader />}><DonorReportsPanel /></Suspense>}
        {tab === 'sod'                  && <Suspense fallback={<PanelLoader />}><SODPanel /></Suspense>}
        {tab === 'aml'                  && <Suspense fallback={<PanelLoader />}><AMLPanel /></Suspense>}
        {tab === 'intercompany'         && <Suspense fallback={<PanelLoader />}><IntercompanyPanel /></Suspense>}
        {tab === 'funds'                && <Suspense fallback={<PanelLoader />}><FundsPanel /></Suspense>}

        {/* Advanced & Reporting */}
        {tab === 'cash-flow-forecast'   && <Suspense fallback={<PanelLoader />}><CashFlowForecastPanel /></Suspense>}
        {tab === 'grants'               && <Suspense fallback={<PanelLoader />}><GrantsPanel /></Suspense>}
        {tab === 'cost-allocation'      && <Suspense fallback={<PanelLoader />}><CostAllocationPanel /></Suspense>}
        {tab === 'depreciation-run'     && <Suspense fallback={<PanelLoader />}><DepreciationRunPanel /></Suspense>}
        {tab === 'consolidation'        && <Suspense fallback={<PanelLoader />}><ConsolidationPanel /></Suspense>}
        {tab === 'gl-audit'             && <Suspense fallback={<PanelLoader />}><GLAuditPanel /></Suspense>}
        {tab === 'finance-audit-trail'  && <Suspense fallback={<PanelLoader />}><FinanceAuditTrailPanel /></Suspense>}
        {tab === 'settings'             && <Suspense fallback={<PanelLoader />}><AccountingSettingsPanel /></Suspense>}
      </div>
    </div>
  );
}
