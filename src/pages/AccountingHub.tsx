import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, BookOpen, ShoppingCart, Shield, TrendingUp, LayoutDashboard, BarChart3, Receipt, FileText, Landmark, BarChart, Package, Zap, Lock, ArrowLeftRight, Wallet, Heart, ShieldAlert, RotateCcw, Building2, PiggyBank, Activity, Search, Settings2, Clock, CreditCard, Award, CalendarDays } from 'lucide-react';
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
type AcctSection = 'core' | 'operations' | 'controls' | 'advanced';
type AcctTab =
  | 'finance-dashboard' | 'coa' | 'journals' | 'trial-balance' | 'ledger' | 'reports' | 'fiscal-years' | 'search'
  | 'bank-recon' | 'budget-variance' | 'cash-flow' | 'vendors' | 'purchase-requisitions' | 'purchase-orders' | 'grn' | 'ap-invoices' | 'cheque-register' | 'ap-aging' | 'fixed-assets' | 'gl-bridge' | 'budget-planning'
  | 'period-close' | 'tax' | 'multi-currency' | 'budget-encumbrance' | 'donor-reports' | 'sod' | 'aml' | 'intercompany' | 'funds'
  | 'cash-flow-forecast' | 'grants' | 'cost-allocation' | 'depreciation-run' | 'consolidation' | 'gl-audit' | 'finance-audit-trail' | 'settings';

interface TabDef { id: AcctTab; label: string; icon: React.ElementType }
interface SectionDef { id: AcctSection; label: string; icon: React.ElementType; color: string; tabs: TabDef[] }

const SECTIONS: SectionDef[] = [
  {
    id: 'core', label: 'Core Ledger', icon: BookOpen, color: '#6366f1',
    tabs: [
      { id: 'finance-dashboard',    label: 'Finance Dashboard',    icon: LayoutDashboard },
      { id: 'coa',                  label: 'Chart of Accounts',    icon: BarChart3       },
      { id: 'journals',             label: 'Journal Entries',      icon: Receipt         },
      { id: 'trial-balance',        label: 'Trial Balance',        icon: TrendingUp      },
      { id: 'ledger',               label: 'General Ledger',       icon: BookOpen        },
      { id: 'reports',              label: 'Financial Statements', icon: FileText        },
      { id: 'fiscal-years',         label: 'Fiscal Years',         icon: CalendarDays    },
      { id: 'search',               label: 'Accounting Search',    icon: Search          },
    ],
  },
  {
    id: 'operations', label: 'Operations & P2P', icon: ShoppingCart, color: '#0284c7',
    tabs: [
      { id: 'bank-recon',           label: 'Bank Reconciliation',  icon: Landmark        },
      { id: 'budget-variance',      label: 'Budget vs Actual',     icon: BarChart        },
      { id: 'cash-flow',            label: 'Cash Flow',            icon: Activity        },
      { id: 'vendors',              label: 'Vendor Registry',      icon: Building2       },
      { id: 'purchase-requisitions',label: 'Purchase Requisitions',icon: Receipt         },
      { id: 'purchase-orders',      label: 'Purchase Orders',      icon: ShoppingCart    },
      { id: 'grn',                  label: 'Goods Receipt Notes',  icon: Package         },
      { id: 'ap-invoices',          label: 'AP Invoices',          icon: FileText        },
      { id: 'cheque-register',      label: 'Cheque Register',      icon: CreditCard      },
      { id: 'ap-aging',             label: 'AP Aging',             icon: Clock           },
      { id: 'fixed-assets',         label: 'Fixed Assets',         icon: Package         },
      { id: 'gl-bridge',            label: 'GL Bridge Engine',     icon: Zap             },
      { id: 'budget-planning',      label: 'Budget Planning',      icon: PiggyBank       },
    ],
  },
  {
    id: 'controls', label: 'Controls & Compliance', icon: Shield, color: '#dc2626',
    tabs: [
      { id: 'period-close',         label: 'Period Close',         icon: Lock            },
      { id: 'tax',                  label: 'Tax Management',       icon: Receipt         },
      { id: 'multi-currency',       label: 'Multi-Currency',       icon: ArrowLeftRight  },
      { id: 'budget-encumbrance',   label: 'Budget Encumbrance',   icon: Wallet          },
      { id: 'donor-reports',        label: 'Donor Fund Reports',   icon: Heart           },
      { id: 'sod',                  label: 'Segregation of Duties',icon: ShieldAlert     },
      { id: 'aml',                  label: 'AML & Compliance',     icon: Shield          },
      { id: 'intercompany',         label: 'Intercompany',         icon: ArrowLeftRight  },
      { id: 'funds',                label: 'Funds',                icon: Landmark        },
    ],
  },
  {
    id: 'advanced', label: 'Advanced & Reporting', icon: TrendingUp, color: '#059669',
    tabs: [
      { id: 'cash-flow-forecast',   label: 'Cash Flow Forecast',   icon: TrendingUp      },
      { id: 'grants',               label: 'Grant Tracking',       icon: Award           },
      { id: 'cost-allocation',      label: 'Cost Allocation',      icon: Zap             },
      { id: 'depreciation-run',     label: 'Depreciation Run',     icon: RotateCcw       },
      { id: 'consolidation',        label: 'Consolidation',        icon: Building2       },
      { id: 'gl-audit',             label: 'GL Bridge Audit',      icon: Activity        },
      { id: 'finance-audit-trail',  label: 'Finance Audit Trail',  icon: FileText        },
      { id: 'settings',             label: 'Accounting Settings',  icon: Settings2       },
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
  const tab: AcctTab = tabDef ? (rawTab as AcctTab) : 'finance-dashboard';

  const setTab = (t: AcctTab) => setParams({ tab: t }, { replace: true });

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

      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="min-h-[calc(100vh-140px)]">

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
