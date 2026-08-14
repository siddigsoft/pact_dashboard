/**
 * hub-tab-defs.ts
 * Registry of all hub pages and their internal tabs.
 * Tab access overrides use page_access_overrides with slug = `{hubSlug}:{tabId}`.
 */

export interface HubTabDef {
  tabId: string;
  label: string;
  description?: string;
}

export interface HubSectionDef {
  sectionId: string;
  sectionLabel: string;
  tabs: HubTabDef[];
}

export interface HubDef {
  hubSlug: string;   // matches PAGE_DEFS slug for the hub page
  hubLabel: string;
  sections: HubSectionDef[];
}

/** Returns the page_access_overrides.page_slug for a hub tab override */
export function hubTabSlug(hubSlug: string, tabId: string): string {
  return `${hubSlug}:${tabId}`;
}

/** Returns true if a page_slug represents a hub-tab override (contains ':') */
export function isHubTabSlug(slug: string): boolean {
  return slug.includes(':');
}

export const HUB_TAB_REGISTRY: HubDef[] = [
  // ── Admin Hub ──────────────────────────────────────────────────────────────
  {
    hubSlug: 'admin-hub',
    hubLabel: 'Admin Hub',
    sections: [
      {
        sectionId: 'people',
        sectionLabel: 'People & Access',
        tabs: [
          { tabId: 'users',               label: 'User Management',      description: 'Create and manage user accounts, roles, and profiles.' },
          { tabId: 'role-management',     label: 'Role Management',      description: 'Configure roles, permissions, and per-user access overrides.' },
          { tabId: 'page-access',         label: 'Page Access Control',  description: 'Grant or block page access for individual users.' },
          { tabId: 'departments',         label: 'Departments',          description: 'Manage organisational departments.' },
          { tabId: 'hub-management',      label: 'Hub Management',       description: 'Configure hubs, sub-hubs, and localities.' },
        ],
      },
      {
        sectionId: 'organisation',
        sectionLabel: 'Organisation',
        tabs: [
          { tabId: 'classifications',       label: 'Classifications',       description: 'Define classification levels for data collectors.' },
          { tabId: 'classification-fees',   label: 'Classification Fees',   description: 'Set fee rates per classification level.' },
          { tabId: 'task-admin',            label: 'Task Admin',            description: 'Manage tasks, templates, and recurring rules.' },
          { tabId: 'project-flow-stages',   label: 'Project Flow Stages',   description: 'Configure lifecycle stages for project types.' },
        ],
      },
      {
        sectionId: 'system',
        sectionLabel: 'System',
        tabs: [
          { tabId: 'settings',          label: 'Settings',          description: 'Global platform settings and configuration.' },
          { tabId: 'audit-compliance',  label: 'Audit & Compliance', description: 'Review compliance status and flagged violations.' },
          { tabId: 'system-monitoring', label: 'System Monitoring',  description: 'Live platform health and performance dashboard.' },
        ],
      },
    ],
  },

  // ── Super Admin Hub ────────────────────────────────────────────────────────
  {
    hubSlug: 'super-admin-hub',
    hubLabel: 'Super Admin Hub',
    sections: [
      {
        sectionId: 'monitoring',
        sectionLabel: 'Monitoring & Health',
        tabs: [
          { tabId: 'super-admin',        label: 'Super Admin Console',  description: 'Top-level admin console and global configuration.' },
          { tabId: 'system-monitoring',  label: 'System Monitoring',    description: 'Live infrastructure health dashboard.' },
          { tabId: 'cycle-health',       label: 'Cycle Health',         description: 'MMP cycle health scores across all hubs.' },
          { tabId: 'approval-dashboard', label: 'Approval Dashboard',   description: 'Cross-module pending approvals overview.' },
        ],
      },
      {
        sectionId: 'permissions',
        sectionLabel: 'Permissions & Audit',
        tabs: [
          { tabId: 'roles',           label: 'Roles',            description: 'Manage system and custom roles, assign users, and configure permissions.' },
          { tabId: 'user-access',     label: 'User Access',      description: 'Per-user control of page access, hub tabs, action permissions, and data scope.' },
          { tabId: 'permissions',     label: 'Screen Permissions', description: 'Fine-grained screen-level permission matrix — read/write/open/create/delete per user.' },
          { tabId: 'audit-logs',      label: 'Audit Logs',       description: 'Immutable record of all system actions.' },
          { tabId: 'page-grants',     label: 'Page Grants',      description: 'Grant or restrict access to Super Admin Hub tabs per user.' },
          { tabId: 'button-registry', label: 'Button Registry',  description: 'Full button and permission map across the entire platform.' },
        ],
      },
      {
        sectionId: 'email',
        sectionLabel: 'Email & Comms',
        tabs: [
          { tabId: 'email-tracking',   label: 'Email Tracking',   description: 'Monitor outbound email delivery.' },
          { tabId: 'email-management', label: 'Email Management',  description: 'Manage notification templates.' },
          { tabId: 'email-preview',    label: 'Email Preview',     description: 'Preview rendered email templates.' },
        ],
      },
      {
        sectionId: 'mobile',
        sectionLabel: 'Mobile Config',
        tabs: [
          { tabId: 'mobile-help-articles',    label: 'Help Articles',    description: 'Manage in-app help articles for mobile.' },
          { tabId: 'mobile-signatures',       label: 'Mobile Signatures', description: 'Digital signature configurations.' },
          { tabId: 'mobile-call-scheduling',  label: 'Call Scheduling',   description: 'Configure scheduled call prompts.' },
          { tabId: 'mobile-document-sync',    label: 'Document Sync',     description: 'Document synchronisation settings.' },
        ],
      },
      {
        sectionId: 'data',
        sectionLabel: 'Data & Tools',
        tabs: [
          { tabId: 'transaction-scanner', label: 'Transaction Scanner', description: 'AI-powered transaction anomaly detection.' },
          { tabId: 'data-management',     label: 'Data Management',     description: 'Raw data management — site visits, wallets, MMPs.' },
        ],
      },
    ],
  },

  // ── Finance Hub ────────────────────────────────────────────────────────────
  {
    hubSlug: 'finance-hub',
    hubLabel: 'Finance Hub',
    sections: [
      {
        sectionId: 'operations',
        sectionLabel: 'Operations',
        tabs: [
          { tabId: 'budget',             label: 'Budget',                description: 'Budget allocation and tracking.' },
          { tabId: 'financial-ops',      label: 'Financial Operations',  description: 'Core financial operations and approvals.' },
          { tabId: 'admin-wallets',      label: 'Wallets Admin',         description: 'Admin overview of all user wallets.' },
          { tabId: 'reconciliation',     label: 'Reconciliation',        description: 'Transaction reconciliation dashboard.' },
          { tabId: 'subscriptions',      label: 'Subscriptions',         description: 'Subscription and recurring payment management.' },
          { tabId: 'campaign-advances',  label: 'Campaign Advances',     description: 'Advance requests from Village Campaigns.' },
        ],
      },
      {
        sectionId: 'reports',
        sectionLabel: 'Reports',
        tabs: [
          { tabId: 'wallet-reports',      label: 'Wallet Reports',        description: 'Wallet balance and transaction reports.' },
          { tabId: 'advance-report',      label: 'Transport Advance',     description: 'Transport advance requests report.' },
          { tabId: 'duplicate-payments',  label: 'Duplicate Payments',    description: 'Duplicate payment detection report.' },
          { tabId: 'cost-predictions',    label: 'Cost Predictions',      description: 'Forecasted cost predictions.' },
          { tabId: 'exchange-rates',      label: 'Exchange Rates',        description: 'Currency exchange rate management.' },
          { tabId: 'salary-retainer',     label: 'Salary & Retainer',     description: 'Consolidated salary and retainer report.' },
          { tabId: 'month-end',           label: 'Month-End Summary',     description: 'Monthly financial summary report.' },
          { tabId: 'enumerator-fees',     label: 'Enumerator Fees',       description: 'Enumerator fee payments report.' },
        ],
      },
    ],
  },

  // ── HR Hub ─────────────────────────────────────────────────────────────────
  {
    hubSlug: 'hr-hub',
    hubLabel: 'HR Hub',
    sections: [
      {
        sectionId: 'pay',
        sectionLabel: 'Pay & Compensation',
        tabs: [
          { tabId: 'payroll',             label: 'My Payslip',           description: 'View personal payslip.' },
          { tabId: 'payroll-admin',       label: 'Payroll Admin',        description: 'Run and manage monthly payroll.' },
          { tabId: 'retainer',            label: 'Retainer',             description: 'Retainer contract management.' },
          { tabId: 'eosb',                label: 'EOSB / Gratuity',      description: 'End-of-service benefit calculations.' },
          { tabId: 'salary-advances',     label: 'Salary Advances',      description: 'Issue and track salary advances.' },
          { tabId: 'salary-increments',   label: 'Salary Increments',    description: 'Review and approve salary increments.' },
          { tabId: 'field-wallet',        label: 'Field Wallet',         description: 'Field wallet allocations for operational staff.' },
          { tabId: 'payroll-summary',     label: 'Payroll Report',       description: 'Consolidated payroll summary reports.' },
          { tabId: 'comp-bands',          label: 'Compensation Bands',   description: 'Salary grade bands and compa-ratio.' },
          { tabId: 'compliance-reports',  label: 'Compliance Reports',   description: 'Social insurance and tax reports.' },
        ],
      },
      {
        sectionId: 'time-leave',
        sectionLabel: 'Time & Leave',
        tabs: [
          { tabId: 'timesheet',      label: 'Timesheet',       description: 'Daily work hour logging.' },
          { tabId: 'leave-requests', label: 'Leave Requests',  description: 'Submit and track leave requests.' },
          { tabId: 'leave-calendar', label: 'Leave Calendar',  description: 'Team leave calendar view.' },
        ],
      },
      {
        sectionId: 'talent',
        sectionLabel: 'Talent & Structure',
        tabs: [
          { tabId: 'employees',       label: 'Employees',             description: 'Employee records and profiles.' },
          { tabId: 'positions',       label: 'Positions & Vacancies', description: 'Position register and vacancy tracking.' },
          { tabId: 'onboarding',      label: 'Onboarding',            description: 'New-hire onboarding checklists.' },
          { tabId: 'offboarding',     label: 'Offboarding',           description: 'Staff departure clearance process.' },
          { tabId: 'recruitment',     label: 'Recruitment / ATS',     description: 'Applicant tracking and hiring pipeline.' },
          { tabId: 'disciplinary',    label: 'Disciplinary & Grievance', description: 'Disciplinary cases and grievances.' },
          { tabId: 'org-chart',       label: 'Org Chart',             description: 'Reporting hierarchy visualisation.' },
          { tabId: 'benefits',        label: 'Benefits Administration', description: 'Benefit plan enrollment and management.' },
          { tabId: 'headcount',       label: 'Headcount Planning',    description: 'Budgeted vs current headcount planning.' },
          { tabId: 'equipment',       label: 'Equipment & Assets',    description: 'Organisational asset tracking.' },
          { tabId: 'policy-library',  label: 'Policy Library',        description: 'Organisational policies and acknowledgements.' },
        ],
      },
      {
        sectionId: 'analytics',
        sectionLabel: 'Analytics & Comms',
        tabs: [
          { tabId: 'overview',       label: 'HR Overview',    description: 'Aggregate HR dashboard.' },
          { tabId: 'hr-analytics',   label: 'HR Analytics',   description: 'Workforce trends and analytics.' },
          { tabId: 'pay-equity',     label: 'Pay Equity',     description: 'Compa-ratio analysis across staff.' },
          { tabId: 'wa-broadcast',   label: 'HR Broadcast',   description: 'WhatsApp broadcasts to staff.' },
          { tabId: 'pulse-surveys',  label: 'Pulse Surveys',  description: 'Anonymous engagement surveys.' },
        ],
      },
    ],
  },

  // ── MMP Management ──────────────────────────────────────────────────────────
  {
    hubSlug: 'mmp',
    hubLabel: 'MMP Management',
    sections: [
      {
        sectionId: 'field',
        sectionLabel: 'Field',
        tabs: [
          { tabId: 'enumerator',        label: 'My Assignments',   description: 'Field staff view of assigned sites for the current cycle.' },
        ],
      },
      {
        sectionId: 'management',
        sectionLabel: 'Management',
        tabs: [
          { tabId: 'new',               label: 'New MMPs',          description: 'Newly uploaded MMP files pending processing.' },
          { tabId: 'forwarded',         label: 'Forwarded MMPs',    description: 'MMPs forwarded for verification.' },
          { tabId: 'verified',          label: 'Verified Sites',    description: 'Sites verified by field teams.' },
          { tabId: 'tracker',           label: 'MMP Tracker',       description: 'Dashboard tracker for MMP progress.' },
          { tabId: 'adhoc',             label: 'Ad-hoc Visits',     description: 'Unplanned site visits outside the MMP cycle.' },
          { tabId: 'village-campaigns', label: 'Village Campaigns', description: 'Multi-team village coverage campaigns.' },
        ],
      },
    ],
  },

  // ── Pre-Funding Hub ─────────────────────────────────────────────────────────
  {
    hubSlug: 'pre-funding',
    hubLabel: 'Pre-Funding',
    sections: [
      {
        sectionId: 'main',
        sectionLabel: 'Pre-Funding',
        tabs: [
          { tabId: 'overview',       label: 'Balance Dashboard',     description: 'Multi-currency fund balance dashboard.' },
          { tabId: 'registry',       label: 'Fund Registry',         description: 'Create and manage pre-fund requests.' },
          { tabId: 'approvals',      label: 'Approval Flow Manager', description: 'Build per-fund approval chains.' },
          { tabId: 'reconciliation', label: 'Reconciliation',        description: 'Reconcile transactions against pre-fund periods.' },
          { tabId: 'allocations',    label: 'Allocation Dashboard',  description: 'Per-staff fund allocation tracker.' },
          { tabId: 'settings',       label: 'Settings',              description: 'Configure pre-funding system defaults.' },
          { tabId: 'report',         label: 'Report',                description: 'Comprehensive pre-funding report.' },
          { tabId: 'distribute',     label: 'Distribute Funds',      description: 'Distribute fund portions to selected staff.' },
        ],
      },
    ],
  },

  // ── Accounting Hub ──────────────────────────────────────────────────────────
  {
    hubSlug: 'accounting',
    hubLabel: 'Accounting',
    sections: [
      {
        sectionId: 'core',
        sectionLabel: 'Core Ledger',
        tabs: [
          { tabId: 'finance-dashboard',   label: 'Finance Dashboard',    description: 'Real-time financial KPI overview.' },
          { tabId: 'coa',                 label: 'Chart of Accounts',    description: 'Manage account codes, types, and hierarchies.' },
          { tabId: 'companies',           label: 'Companies',            description: 'Manage company entities and subsidiaries.' },
          { tabId: 'journals',            label: 'Journal Entries',      description: 'Create and review manual journal entries.' },
          { tabId: 'journal-items',       label: 'Journal Items',        description: 'Flat view of all individual journal lines.' },
          { tabId: 'trial-balance',       label: 'Trial Balance',        description: 'Account balances verification.' },
          { tabId: 'ledger',              label: 'General Ledger',       description: 'Posted transactions per account.' },
          { tabId: 'reports',             label: 'Financial Statements', description: 'Income statement, balance sheet, cash flows.' },
          { tabId: 'fiscal-years',        label: 'Fiscal Years',         description: 'Configure fiscal years and accounting periods.' },
          { tabId: 'search',              label: 'Accounting Search',    description: 'Search across all transactions and accounts.' },
          { tabId: 'recurring-journals',  label: 'Recurring Journals',   description: 'Schedule automatically repeating journal entries.' },
          { tabId: 'journal-templates',   label: 'Journal Templates',    description: 'Reusable multi-line journal entry patterns.' },
          { tabId: 'opening-balances',    label: 'Opening Balances',     description: 'Post starting account balances at year start.' },
        ],
      },
      {
        sectionId: 'fin-ops',
        sectionLabel: 'Financial Operations',
        tabs: [
          { tabId: 'bank-recon',            label: 'Bank Reconciliation',    description: 'Match bank statements against GL entries.' },
          { tabId: 'budget-planning',       label: 'Budget Planning',        description: 'Build and approve annual or project budgets.' },
          { tabId: 'budget-variance',       label: 'Budget vs Actual',       description: 'Compare actual spending to approved budgets.' },
          { tabId: 'cash-flow',             label: 'Cash Flow',              description: 'Track money in and out for liquidity.' },
          { tabId: 'fixed-assets',          label: 'Fixed Assets',           description: 'Full asset lifecycle management.' },
          { tabId: 'gl-bridge',             label: 'GL Bridge Engine',       description: 'Auto-generate GL entries from operational modules.' },
          { tabId: 'gl-bridge-settings',    label: 'GL Bridge Settings',     description: 'Map GL bridge events to chart of accounts.' },
          { tabId: 'gl-bridge-prefunding',  label: 'Pre-Funding → GL',       description: 'Post pre-fund transactions to GL.' },
          { tabId: 'gl-bridge-payroll',     label: 'Payroll → GL',           description: 'Post payroll runs to GL.' },
          { tabId: 'annual-budget',         label: 'Annual Budget',          description: 'Organisation-wide annual budget by fiscal year.' },
          { tabId: 'bank-statement-import', label: 'Bank Statement Import',  description: 'Upload and parse bank statement CSV files.' },
          { tabId: 'unified-assets',        label: 'Unified Asset Register', description: 'Single register for all assets and equipment.' },
          { tabId: 'loans',                 label: 'Loans',                  description: 'Track loans with amortization schedules.' },
          { tabId: 'deferred-items',        label: 'Deferred Revenue & Exp', description: 'Spread recognition across periods.' },
          { tabId: 'depreciation-schedule', label: 'Depreciation Schedule',  description: 'Projected monthly depreciation per asset.' },
          { tabId: 'customer-invoices',     label: 'Customer Invoices',      description: 'Issue and track AR invoices.' },
          { tabId: 'customer-payments',     label: 'Customer Payments',      description: 'Record payments from customers.' },
          { tabId: 'wire-transfers',        label: 'Wire / SWIFT Transfers', description: 'Log and track international wire transfers.' },
          { tabId: 'petty-cash',            label: 'Petty Cash',             description: 'Manage per-office cash floats.' },
          { tabId: 'outstanding-checks',    label: 'Outstanding Checks',     description: 'Monitor uncleared cheques.' },
          { tabId: 'ar-aging',              label: 'AR Aging Report',        description: 'Outstanding AR balances by age.' },
          { tabId: 'asset-revaluation',     label: 'Asset Revaluation',      description: 'Adjust fixed asset carrying values.' },
        ],
      },
      {
        sectionId: 'p2p',
        sectionLabel: 'Procurement & P2P',
        tabs: [
          { tabId: 'vendors',                label: 'Vendor Registry',         description: 'Vendor master records and compliance.' },
          { tabId: 'purchase-requisitions',  label: 'Purchase Requisitions',   description: 'Internal purchase requests and approvals.' },
          { tabId: 'purchase-orders',        label: 'Purchase Orders',         description: 'Formal purchase orders to vendors.' },
          { tabId: 'grn',                    label: 'Goods Receipt Notes',     description: 'Record physical delivery of goods.' },
          { tabId: 'ap-invoices',            label: 'AP Invoices',             description: 'Capture and approve vendor invoices.' },
          { tabId: 'cheque-register',        label: 'Cheque Register',         description: 'Log all issued cheques.' },
          { tabId: 'ap-aging',               label: 'AP Aging',                description: 'Outstanding payables by due-date buckets.' },
          { tabId: 'payment-terms',          label: 'Payment Terms',           description: 'Define invoice payment term templates.' },
          { tabId: 'follow-up-levels',       label: 'Follow-up Levels',        description: 'Configure AR dunning escalation levels.' },
          { tabId: 'aged-receivable',        label: 'Aged Receivable',         description: 'Outstanding AP balances by vendor.' },
          { tabId: 'partner-ledger',         label: 'Partner Ledger',          description: 'All transactions by partner.' },
          { tabId: 'expense-reports',        label: 'Expense Reports',         description: 'Submit and approve expense claims.' },
          { tabId: 'expense-categories',     label: 'Expense Categories',      description: 'Configure the expense category tree.' },
          { tabId: 'per-diem-rates',         label: 'Per Diem Rates',          description: 'Daily allowance rates by country and city.' },
        ],
      },
      {
        sectionId: 'controls',
        sectionLabel: 'Controls & Compliance',
        tabs: [
          { tabId: 'period-close',       label: 'Period Close',           description: 'Lock completed accounting periods.' },
          { tabId: 'tax',                label: 'Tax Management',         description: 'Configure tax rates and generate summaries.' },
          { tabId: 'multi-currency',     label: 'Multi-Currency',         description: 'Manage exchange rates and revalue balances.' },
          { tabId: 'budget-encumbrance', label: 'Budget Encumbrance',     description: 'Reserve budget funds on purchase orders.' },
          { tabId: 'donor-reports',      label: 'Donor Fund Reports',     description: 'Fund utilisation reports by donor or grant.' },
          { tabId: 'sod',                label: 'Segregation of Duties',  description: 'Define and enforce SOD rules.' },
          { tabId: 'aml',                label: 'AML & Compliance',       description: 'Monitor transactions for AML flags.' },
          { tabId: 'intercompany',       label: 'Intercompany',           description: 'Record intercompany transactions.' },
          { tabId: 'funds',              label: 'Funds',                  description: 'Define restricted and unrestricted funds.' },
          { tabId: 'fiscal-positions',   label: 'Fiscal Positions',       description: 'Map taxes and accounts per jurisdiction.' },
          { tabId: 'lock-dates',         label: 'Lock Dates',             description: 'Prevent posting before a specific date.' },
          { tabId: 'analytic-plans',     label: 'Analytic Plans',         description: 'Multi-dimensional cost tracking plans.' },
          { tabId: 'withholding-tax',    label: 'Withholding Tax',        description: 'Configure and record WHT deductions.' },
          { tabId: 'tax-return',         label: 'Tax Return Summary',     description: 'Quarterly VAT/sales tax return summaries.' },
        ],
      },
      {
        sectionId: 'advanced',
        sectionLabel: 'Advanced & Reporting',
        tabs: [
          { tabId: 'cash-flow-forecast',  label: 'Cash Flow Forecast',       description: 'Project future cash positions.' },
          { tabId: 'grants',              label: 'Grant Tracking',           description: 'Track grant budgets and milestone delivery.' },
          { tabId: 'cost-allocation',     label: 'Cost Allocation',          description: 'Distribute overhead costs across departments.' },
          { tabId: 'depreciation-run',    label: 'Depreciation Run',         description: 'Execute monthly depreciation calculations.' },
          { tabId: 'consolidation',       label: 'Consolidation',            description: 'Aggregate financials across entities.' },
          { tabId: 'gl-audit',            label: 'GL Bridge Audit',          description: 'Review auto-posted GL Bridge entries.' },
          { tabId: 'finance-audit-trail', label: 'Finance Audit Trail',      description: 'Immutable log of all financial record changes.' },
          { tabId: 'settings',            label: 'Accounting Settings',      description: 'Configure accounting defaults and mappings.' },
          { tabId: 'pl-by-department',    label: 'P&L by Department',        description: 'Segmented income statement by cost center.' },
          { tabId: 'budget-utilization',  label: 'Budget Utilization',       description: 'Traffic-light view of budget consumption.' },
          { tabId: 'kpi-ratios',          label: 'Financial KPI Ratios',     description: 'Auto-calculated financial health ratios.' },
          { tabId: 'donor-statement',     label: 'Donor Statement',          description: 'Full transaction statement for a donor.' },
          { tabId: 'bs-comparison',       label: 'Balance Sheet Comparison', description: 'Side-by-side balance sheets for two years.' },
          { tabId: 'unrealized-gl',       label: 'Unrealized Currency G/L',  description: 'Revalue foreign-currency balances.' },
          { tabId: 'analytic-report',     label: 'Analytic Report',          description: 'Cross-dimensional P&L by fund or project.' },
          { tabId: 'project-links',       label: 'Project ↔ Account Links',  description: 'Link GL accounts to projects.' },
        ],
      },
    ],
  },
];
