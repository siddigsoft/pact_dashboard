import { Suspense, lazy, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Loader2, BookOpen, ShoppingCart, Shield, TrendingUp, LayoutDashboard,
  BarChart3, Receipt, FileText, Landmark, BarChart, Package, Zap, Lock,
  ArrowLeftRight, Wallet, Heart, ShieldAlert, RotateCcw, Building2,
  PiggyBank, Activity, Search, Settings2, Clock, CreditCard, Award,
  CalendarDays, Info, Bell, MapPin, LayoutGrid, Link2, BarChart2, Users, List,
  Send, Percent, Tag, Scale, CheckSquare, LayoutTemplate,
} from 'lucide-react';
import { HubLayout } from '@/components/ui/hub-layout';
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

// ── New panels (2026-07-12 expansion) ─────────────────────────────────────────
const CompaniesPanel            = lazy(() => import('./AccountingCompanies'));
const JournalItemsPanel         = lazy(() => import('./AccountingJournalItems'));
const PartnerLedgerPanel        = lazy(() => import('./AccountingPartnerLedger'));
const AgedReceivablePanel       = lazy(() => import('./AccountingAgedReceivable'));
const UnrealizedGLPanel         = lazy(() => import('./AccountingUnrealizedGL'));
const DeprecSchedulePanel       = lazy(() => import('./AccountingDepreciationSchedule'));
const AnalyticReportPanel       = lazy(() => import('./AccountingAnalyticReport'));
const FiscalPositionsPanel      = lazy(() => import('./AccountingFiscalPositions'));
const AnalyticPlansPanel        = lazy(() => import('./AccountingAnalyticPlans'));
const LockDatesPanel            = lazy(() => import('./AccountingLockDates'));
const LoansPanel                = lazy(() => import('./AccountingLoans'));
const DeferredItemsPanel        = lazy(() => import('./AccountingDeferredItems'));
const PaymentTermsPanel         = lazy(() => import('./AccountingPaymentTerms'));
const FollowUpLevelsPanel       = lazy(() => import('./AccountingFollowUpLevels'));
const ProjectLinksPanel         = lazy(() => import('./AccountingProjectLinks'));

// ── Phase 2 panels (2026-07-12 AR / Expenses / Cash expansion) ───────────────
const CustomerInvoicesPanel     = lazy(() => import('./AccountingCustomerInvoices'));
const CustomerPaymentsPanel     = lazy(() => import('./AccountingCustomerPayments'));
const ExpenseReportsPanel       = lazy(() => import('./AccountingExpenseReports'));
const PettyCashPanel            = lazy(() => import('./AccountingPettyCash'));
const RecurringJournalsPanel    = lazy(() => import('./AccountingRecurringJournals'));
const JournalTemplatesPanel     = lazy(() => import('./AccountingJournalTemplates'));
const WithholdingTaxPanel       = lazy(() => import('./AccountingWithholdingTax'));
const WireTransfersPanel        = lazy(() => import('./AccountingWireTransfers'));
const PerDiemRatesPanel         = lazy(() => import('./AccountingPerDiemRates'));
const ExpenseCategoriesPanel    = lazy(() => import('./AccountingExpenseCategories'));
const PLByDepartmentPanel       = lazy(() => import('./AccountingPLByDepartment'));
const BudgetUtilizationPanel    = lazy(() => import('./AccountingBudgetUtilization'));
const KPIRatiosPanel            = lazy(() => import('./AccountingKPIRatios'));
const DonorStatementPanel       = lazy(() => import('./AccountingDonorStatement'));
const OutstandingChecksPanel    = lazy(() => import('./AccountingOutstandingChecks'));
const TaxReturnPanel            = lazy(() => import('./AccountingTaxReturn'));
const BSComparisonPanel         = lazy(() => import('./AccountingBalanceSheetComparison'));
const AssetRevaluationPanel     = lazy(() => import('./AccountingAssetRevaluation'));
const ARAgingPanel              = lazy(() => import('./AccountingARAgingReport'));

// ── Types ─────────────────────────────────────────────────────────────────────
type AcctSection = 'core' | 'fin-ops' | 'p2p' | 'controls' | 'advanced';
type AcctTab =
  | 'finance-dashboard' | 'coa' | 'journals' | 'journal-items' | 'trial-balance' | 'ledger' | 'reports' | 'fiscal-years' | 'search'
  | 'bank-recon' | 'budget-variance' | 'cash-flow' | 'fixed-assets' | 'gl-bridge' | 'budget-planning' | 'loans' | 'deferred-items'
  | 'vendors' | 'purchase-requisitions' | 'purchase-orders' | 'grn' | 'ap-invoices' | 'cheque-register' | 'ap-aging' | 'payment-terms' | 'follow-up-levels'
  | 'period-close' | 'tax' | 'multi-currency' | 'budget-encumbrance' | 'donor-reports' | 'sod' | 'aml' | 'intercompany' | 'funds' | 'fiscal-positions' | 'lock-dates' | 'analytic-plans'
  | 'cash-flow-forecast' | 'grants' | 'cost-allocation' | 'depreciation-run' | 'consolidation' | 'gl-audit' | 'finance-audit-trail' | 'settings'
  | 'partner-ledger' | 'aged-receivable' | 'unrealized-gl' | 'depreciation-schedule' | 'analytic-report'
  | 'companies' | 'project-links'
  | 'customer-invoices' | 'customer-payments' | 'wire-transfers' | 'petty-cash' | 'outstanding-checks' | 'ar-aging'
  | 'expense-reports' | 'expense-categories' | 'per-diem-rates'
  | 'recurring-journals' | 'journal-templates'
  | 'withholding-tax' | 'tax-return'
  | 'pl-by-department' | 'budget-utilization' | 'kpi-ratios' | 'donor-statement' | 'bs-comparison'
  | 'asset-revaluation';

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
        id: 'companies', label: 'Companies', icon: Building2,
        description: 'Manage company entities — each company has its own Chart of Accounts, functional currency, and fiscal calendar for consolidated or subsidiary reporting.',
      },
      {
        id: 'journals', label: 'Journal Entries', icon: Receipt,
        description: 'Create, review, and post manual journal entries with debit/credit lines, narrative descriptions, and supporting document attachments.',
      },
      {
        id: 'journal-items', label: 'Journal Items', icon: List,
        description: 'Flat view of every individual journal line across all entries — filter by date, account, DR/CR, source module, and status with paginated results.',
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
      {
        id: 'recurring-journals', label: 'Recurring Journals', icon: RotateCcw,
        description: 'Define and schedule journal entries that repeat automatically — daily, weekly, monthly, or quarterly — for rent, subscriptions, depreciation, and other fixed charges.',
      },
      {
        id: 'journal-templates', label: 'Journal Templates', icon: LayoutTemplate,
        description: 'Save common multi-line journal entry patterns as reusable templates to speed up posting and reduce errors on routine transactions.',
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
      {
        id: 'loans', label: 'Loans', icon: PiggyBank,
        description: 'Track received and given loans with principal, interest rate, payment frequency, amortization schedule, and outstanding balance monitoring.',
      },
      {
        id: 'deferred-items', label: 'Deferred Revenue & Expense', icon: Clock,
        description: 'Spread recognition of prepaid expenses or advance revenue across multiple accounting periods using straight-line or manual recognition schedules.',
      },
      {
        id: 'depreciation-schedule', label: 'Depreciation Schedule', icon: Package,
        description: 'View projected monthly depreciation for each active fixed asset, with opening NBV, monthly charge, and closing NBV for the selected forecast horizon.',
      },
      {
        id: 'customer-invoices', label: 'Customer Invoices', icon: FileText,
        description: 'Issue and track AR invoices to donors, partners, and governments — with due dates, partial payments, and aging status for outstanding balances.',
      },
      {
        id: 'customer-payments', label: 'Customer Payments', icon: CreditCard,
        description: 'Record payments received from customers and donors via bank transfer, cheque, cash, or mobile money and apply them to open invoices.',
      },
      {
        id: 'wire-transfers', label: 'Wire / SWIFT Transfers', icon: Send,
        description: 'Log and track international wire transfers with beneficiary details, SWIFT references, exchange rates, bank charges, and processing status.',
      },
      {
        id: 'petty-cash', label: 'Petty Cash / Cash Boxes', icon: Wallet,
        description: 'Manage per-office cash floats — record payments out and top-ups in, track running balances, and confirm counts via cash count sheets.',
      },
      {
        id: 'outstanding-checks', label: 'Outstanding Checks', icon: CheckSquare,
        description: 'Monitor all issued but uncleared cheques, detect stale items beyond a configurable age threshold, and clear or void them against bank records.',
      },
      {
        id: 'ar-aging', label: 'AR Aging Report', icon: Clock,
        description: 'Outstanding customer invoice balances bucketed by overdue age: current, 1–30, 31–60, 61–90, and 90+ days — generate as of any date with Excel export.',
      },
      {
        id: 'asset-revaluation', label: 'Asset Revaluation', icon: Package,
        description: 'Adjust fixed asset carrying values to fair market value, record revaluation surpluses or impairment losses, and post GL entries to the revaluation reserve.',
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
      {
        id: 'payment-terms', label: 'Payment Terms', icon: CreditCard,
        description: 'Define invoice payment terms (net 30, 2/10 net 30, etc.) with multiple lines for percentage, fixed amount, or balance due on specific day offsets.',
      },
      {
        id: 'follow-up-levels', label: 'Follow-up Levels', icon: Bell,
        description: 'Configure escalating AR dunning levels — when to send reminders, which action to take (email/letter/phone), and what template to use.',
      },
      {
        id: 'aged-receivable', label: 'Aged Receivable', icon: Clock,
        description: 'View outstanding AP invoice balances grouped by vendor and overdue bucket (current, 31–60, 61–90, 90+ days) as of any selected date.',
      },
      {
        id: 'partner-ledger', label: 'Partner Ledger', icon: Users,
        description: 'Drill into all receivable/payable transactions grouped by vendor or partner, with running balance and full source traceability.',
      },
      {
        id: 'expense-reports', label: 'Expense Reports', icon: Receipt,
        description: 'Submit and approve employee expense claims with per-diem support, multi-currency lines, advance deduction, and GL posting on approval.',
      },
      {
        id: 'expense-categories', label: 'Expense Categories', icon: Tag,
        description: 'Configure the expense category tree used in expense reports and petty cash — with receipt requirements, per-category spending limits, and bilingual labels.',
      },
      {
        id: 'per-diem-rates', label: 'Per Diem Rates', icon: MapPin,
        description: 'Set daily subsistence allowance rates by country and city, including accommodation, meals, and transport breakdowns, with effective date ranges.',
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
      {
        id: 'fiscal-positions', label: 'Fiscal Positions', icon: MapPin,
        description: 'Map taxes and accounts per jurisdiction or entity type — auto-applied when a vendor or customer is from a different tax territory.',
      },
      {
        id: 'lock-dates', label: 'Lock Dates', icon: Lock,
        description: 'Prevent posting or editing of entries before a specific date — supports all-users lock, tax lock, and hard lock with explicit unlock flow.',
      },
      {
        id: 'analytic-plans', label: 'Analytic Plans', icon: LayoutGrid,
        description: 'Manage analytic plans and analytic accounts for multi-dimensional cost tracking across projects, departments, and donors.',
      },
      {
        id: 'withholding-tax', label: 'Withholding Tax', icon: Percent,
        description: 'Configure WHT rates by type and jurisdiction, record deductions on vendor payments, and track remittance status to the tax authority.',
      },
      {
        id: 'tax-return', label: 'Tax Return Summary', icon: FileText,
        description: 'Generate quarterly VAT/sales tax return summaries with output/input tax breakdown and a withholding tax schedule ready for filing.',
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
      {
        id: 'pl-by-department', label: 'P&L by Department', icon: BarChart3,
        description: 'Segmented income statement comparing revenue and expenses by analytic account / cost center for any fiscal year and quarter combination.',
      },
      {
        id: 'budget-utilization', label: 'Budget Utilization', icon: PiggyBank,
        description: 'Traffic-light view of budget consumption by account, department, or project — instantly spot over-budget, at-risk, and under-utilized lines.',
      },
      {
        id: 'kpi-ratios', label: 'Financial KPI Ratios', icon: BarChart2,
        description: 'Auto-calculated liquidity, leverage, margin, efficiency, and cash runway ratios drawn from posted GL entries for quick financial health assessment.',
      },
      {
        id: 'donor-statement', label: 'Donor Statement', icon: Heart,
        description: 'Generate a full transaction statement for any donor or partner over a custom date range, showing invoices issued, payments received, and outstanding balance.',
      },
      {
        id: 'bs-comparison', label: 'Balance Sheet Comparison', icon: Scale,
        description: 'Side-by-side balance sheet for two fiscal years with variance amounts and percentage change — assets, liabilities, and equity in one view.',
      },
      {
        id: 'unrealized-gl', label: 'Unrealized Currency G/L', icon: ArrowLeftRight,
        description: 'Revalue foreign-currency balances at current exchange rates and view the unrealized gain or loss on each account as of any selected date.',
      },
      {
        id: 'analytic-report', label: 'Analytic Report', icon: BarChart2,
        description: 'Cross-dimensional P&L grouped by fund, project, or function — filter by period, fund, and project to produce donor-ready variance reports.',
      },
      {
        id: 'project-links', label: 'Project ↔ Account Links', icon: Link2,
        description: 'Link GL accounts to projects for multi-COA dimension tracking — each project can map expense, revenue, asset, and clearing accounts from any company COA.',
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

  return (
    <HubLayout
      title="Accounting"
      subtitle="Core Ledger · Financial Operations · P2P · Controls · Advanced"
      hubIcon={BookOpen}
      sections={SECTIONS}
      activeSectionId={section}
      activeTabId={tab}
      activeTabDescription={activeTabDef.description}
      quickLinks={['dashboard', 'finance', 'reports', 'my-tasks']}
      onSectionClick={id => setTab(id as AcctTab)}
      onTabClick={id => setTab(id as AcctTab)}
    >
      <div className="min-h-[calc(100vh-160px)]">
        {tab === 'finance-dashboard'    && <Suspense fallback={<PanelLoader />}><FinanceDashboard /></Suspense>}
        {tab === 'coa'                  && <Suspense fallback={<PanelLoader />}><COAPanel /></Suspense>}
        {tab === 'journals'             && <Suspense fallback={<PanelLoader />}><JournalsPanel /></Suspense>}
        {tab === 'trial-balance'        && <Suspense fallback={<PanelLoader />}><TrialBalancePanel /></Suspense>}
        {tab === 'ledger'               && <Suspense fallback={<PanelLoader />}><LedgerPanel /></Suspense>}
        {tab === 'reports'              && <Suspense fallback={<PanelLoader />}><FinStatementsPanel /></Suspense>}
        {tab === 'fiscal-years'         && <Suspense fallback={<PanelLoader />}><FiscalYearsPanel /></Suspense>}
        {tab === 'search'               && <Suspense fallback={<PanelLoader />}><SearchPanel /></Suspense>}
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
        {tab === 'period-close'         && <Suspense fallback={<PanelLoader />}><PeriodClosePanel /></Suspense>}
        {tab === 'tax'                  && <Suspense fallback={<PanelLoader />}><TaxPanel /></Suspense>}
        {tab === 'multi-currency'       && <Suspense fallback={<PanelLoader />}><MultiCurrencyPanel /></Suspense>}
        {tab === 'budget-encumbrance'   && <Suspense fallback={<PanelLoader />}><BudgetEncumbrancePanel /></Suspense>}
        {tab === 'donor-reports'        && <Suspense fallback={<PanelLoader />}><DonorReportsPanel /></Suspense>}
        {tab === 'sod'                  && <Suspense fallback={<PanelLoader />}><SODPanel /></Suspense>}
        {tab === 'aml'                  && <Suspense fallback={<PanelLoader />}><AMLPanel /></Suspense>}
        {tab === 'intercompany'         && <Suspense fallback={<PanelLoader />}><IntercompanyPanel /></Suspense>}
        {tab === 'funds'                && <Suspense fallback={<PanelLoader />}><FundsPanel /></Suspense>}
        {tab === 'cash-flow-forecast'   && <Suspense fallback={<PanelLoader />}><CashFlowForecastPanel /></Suspense>}
        {tab === 'grants'               && <Suspense fallback={<PanelLoader />}><GrantsPanel /></Suspense>}
        {tab === 'cost-allocation'      && <Suspense fallback={<PanelLoader />}><CostAllocationPanel /></Suspense>}
        {tab === 'depreciation-run'     && <Suspense fallback={<PanelLoader />}><DepreciationRunPanel /></Suspense>}
        {tab === 'consolidation'        && <Suspense fallback={<PanelLoader />}><ConsolidationPanel /></Suspense>}
        {tab === 'gl-audit'             && <Suspense fallback={<PanelLoader />}><GLAuditPanel /></Suspense>}
        {tab === 'finance-audit-trail'  && <Suspense fallback={<PanelLoader />}><FinanceAuditTrailPanel /></Suspense>}
        {tab === 'settings'             && <Suspense fallback={<PanelLoader />}><AccountingSettingsPanel /></Suspense>}
        {tab === 'companies'            && <Suspense fallback={<PanelLoader />}><CompaniesPanel /></Suspense>}
        {tab === 'journal-items'        && <Suspense fallback={<PanelLoader />}><JournalItemsPanel /></Suspense>}
        {tab === 'partner-ledger'       && <Suspense fallback={<PanelLoader />}><PartnerLedgerPanel /></Suspense>}
        {tab === 'aged-receivable'      && <Suspense fallback={<PanelLoader />}><AgedReceivablePanel /></Suspense>}
        {tab === 'unrealized-gl'        && <Suspense fallback={<PanelLoader />}><UnrealizedGLPanel /></Suspense>}
        {tab === 'depreciation-schedule'&& <Suspense fallback={<PanelLoader />}><DeprecSchedulePanel /></Suspense>}
        {tab === 'analytic-report'      && <Suspense fallback={<PanelLoader />}><AnalyticReportPanel /></Suspense>}
        {tab === 'fiscal-positions'     && <Suspense fallback={<PanelLoader />}><FiscalPositionsPanel /></Suspense>}
        {tab === 'analytic-plans'       && <Suspense fallback={<PanelLoader />}><AnalyticPlansPanel /></Suspense>}
        {tab === 'lock-dates'           && <Suspense fallback={<PanelLoader />}><LockDatesPanel /></Suspense>}
        {tab === 'loans'                && <Suspense fallback={<PanelLoader />}><LoansPanel /></Suspense>}
        {tab === 'deferred-items'       && <Suspense fallback={<PanelLoader />}><DeferredItemsPanel /></Suspense>}
        {tab === 'payment-terms'        && <Suspense fallback={<PanelLoader />}><PaymentTermsPanel /></Suspense>}
        {tab === 'follow-up-levels'     && <Suspense fallback={<PanelLoader />}><FollowUpLevelsPanel /></Suspense>}
        {tab === 'project-links'        && <Suspense fallback={<PanelLoader />}><ProjectLinksPanel /></Suspense>}
        {/* Phase 2 — AR / Expenses / Cash / Templates / WHT / Reports */}
        {tab === 'customer-invoices'    && <Suspense fallback={<PanelLoader />}><CustomerInvoicesPanel /></Suspense>}
        {tab === 'customer-payments'    && <Suspense fallback={<PanelLoader />}><CustomerPaymentsPanel /></Suspense>}
        {tab === 'wire-transfers'       && <Suspense fallback={<PanelLoader />}><WireTransfersPanel /></Suspense>}
        {tab === 'petty-cash'           && <Suspense fallback={<PanelLoader />}><PettyCashPanel /></Suspense>}
        {tab === 'outstanding-checks'   && <Suspense fallback={<PanelLoader />}><OutstandingChecksPanel /></Suspense>}
        {tab === 'asset-revaluation'    && <Suspense fallback={<PanelLoader />}><AssetRevaluationPanel /></Suspense>}
        {tab === 'expense-reports'      && <Suspense fallback={<PanelLoader />}><ExpenseReportsPanel /></Suspense>}
        {tab === 'expense-categories'   && <Suspense fallback={<PanelLoader />}><ExpenseCategoriesPanel /></Suspense>}
        {tab === 'per-diem-rates'       && <Suspense fallback={<PanelLoader />}><PerDiemRatesPanel /></Suspense>}
        {tab === 'recurring-journals'   && <Suspense fallback={<PanelLoader />}><RecurringJournalsPanel /></Suspense>}
        {tab === 'journal-templates'    && <Suspense fallback={<PanelLoader />}><JournalTemplatesPanel /></Suspense>}
        {tab === 'withholding-tax'      && <Suspense fallback={<PanelLoader />}><WithholdingTaxPanel /></Suspense>}
        {tab === 'tax-return'           && <Suspense fallback={<PanelLoader />}><TaxReturnPanel /></Suspense>}
        {tab === 'pl-by-department'     && <Suspense fallback={<PanelLoader />}><PLByDepartmentPanel /></Suspense>}
        {tab === 'budget-utilization'   && <Suspense fallback={<PanelLoader />}><BudgetUtilizationPanel /></Suspense>}
        {tab === 'kpi-ratios'           && <Suspense fallback={<PanelLoader />}><KPIRatiosPanel /></Suspense>}
        {tab === 'donor-statement'      && <Suspense fallback={<PanelLoader />}><DonorStatementPanel /></Suspense>}
        {tab === 'bs-comparison'        && <Suspense fallback={<PanelLoader />}><BSComparisonPanel /></Suspense>}
        {tab === 'ar-aging'             && <Suspense fallback={<PanelLoader />}><ARAgingPanel /></Suspense>}
      </div>
    </HubLayout>
  );
}
