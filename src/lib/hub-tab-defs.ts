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
          { tabId: 'permissions', label: 'User Permissions', description: 'Fine-grained permission overrides per user.' },
          { tabId: 'audit-logs',  label: 'Audit Logs',       description: 'Immutable record of all system actions.' },
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
          { tabId: 'budget',         label: 'Budget',                description: 'Budget allocation and tracking.' },
          { tabId: 'financial-ops',  label: 'Financial Operations',  description: 'Core financial operations and approvals.' },
          { tabId: 'admin-wallets',  label: 'Wallets Admin',         description: 'Admin overview of all user wallets.' },
          { tabId: 'reconciliation', label: 'Reconciliation',        description: 'Transaction reconciliation dashboard.' },
          { tabId: 'subscriptions',  label: 'Subscriptions',         description: 'Subscription and recurring payment management.' },
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
];
