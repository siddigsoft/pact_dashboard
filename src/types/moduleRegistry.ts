import { ResourceType, ActionType, AppRole, DEFAULT_ROLE_PERMISSIONS } from './roles';

// ─────────────────────────────────────────────────────────────────────────────
// Module Registry — authoritative map of every module → page → button/action
// Used by ModuleControlCenter to show SuperAdmin the full permission landscape.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModuleAction {
  key: string;
  label: string;
  description: string;
  resource: ResourceType;
  action: ActionType;
  isDestructive?: boolean;
  isAdminOnly?: boolean;
  isSuperAdminOnly?: boolean;
}

export interface ModulePage {
  page: string;
  route: string;
  description: string;
  actions: ModuleAction[];
}

export interface ModuleDefinition {
  module: string;
  icon: string;
  color: string;
  description: string;
  pages: ModulePage[];
}

export const MODULE_REGISTRY: ModuleDefinition[] = [
  // ─── Administration ──────────────────────────────────────────────────────
  {
    module: 'Administration',
    icon: 'Shield',
    color: 'blue',
    description: 'User accounts, roles, permissions, system settings, and access control',
    pages: [
      {
        page: 'User Management',
        route: '/admin-hub',
        description: 'Create and manage user accounts, assign roles, deactivate users',
        actions: [
          { key: 'users:read', label: 'View Users', description: 'See the list of all users', resource: 'users', action: 'read' },
          { key: 'users:create', label: 'Create User', description: 'Add a new user account', resource: 'users', action: 'create' },
          { key: 'users:update', label: 'Edit User', description: 'Update user profile and details', resource: 'users', action: 'update' },
          { key: 'users:delete', label: 'Deactivate / Delete User', description: 'Deactivate or remove a user', resource: 'users', action: 'delete', isDestructive: true },
          { key: 'users:assign', label: 'Assign / Change Role', description: 'Change a user\'s role assignment', resource: 'users', action: 'assign' },
          { key: 'users:export', label: 'Export User List', description: 'Export users to Excel/CSV', resource: 'users', action: 'export' },
        ],
      },
      {
        page: 'Role Management',
        route: '/admin-hub?tab=role-management',
        description: 'Create, edit, delete roles and assign granular permissions',
        actions: [
          { key: 'roles:read', label: 'View Roles', description: 'See all roles and their permissions', resource: 'roles', action: 'read' },
          { key: 'roles:create', label: 'Create Role', description: 'Define a new custom role', resource: 'roles', action: 'create', isAdminOnly: true },
          { key: 'roles:update', label: 'Edit Role Permissions', description: 'Modify a role\'s permission set', resource: 'roles', action: 'update', isAdminOnly: true },
          { key: 'roles:delete', label: 'Delete Role', description: 'Remove a custom role', resource: 'roles', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'roles:assign', label: 'Assign Role to User', description: 'Put a user into a role', resource: 'roles', action: 'assign', isAdminOnly: true },
          { key: 'permissions:read', label: 'View Permission Matrix', description: 'See the full Access Map', resource: 'permissions', action: 'read' },
          { key: 'permissions:override', label: 'Override User Permissions', description: 'Grant or block individual permissions per user', resource: 'permissions', action: 'override', isSuperAdminOnly: true },
        ],
      },
      {
        page: 'Hub Management',
        route: '/admin-hub?tab=hubs',
        description: 'Configure hubs, geographic coverage, and hub managers',
        actions: [
          { key: 'hub_operations:read', label: 'View Hubs', description: 'See hub list and details', resource: 'hub_operations', action: 'read' },
          { key: 'hub_operations:update', label: 'Edit Hub Settings', description: 'Update hub coverage and configuration', resource: 'hub_operations', action: 'update', isAdminOnly: true },
          { key: 'hub_operations:create', label: 'Create Hub', description: 'Add a new hub', resource: 'hub_operations', action: 'create', isAdminOnly: true },
        ],
      },
      {
        page: 'Settings',
        route: '/settings',
        description: 'System-wide configuration, integrations, and preferences',
        actions: [
          { key: 'settings:read', label: 'View Settings', description: 'Read system settings', resource: 'settings', action: 'read' },
          { key: 'settings:update', label: 'Edit Settings', description: 'Change system configuration', resource: 'settings', action: 'update', isAdminOnly: true },
          { key: 'integrations:read', label: 'View Integrations', description: 'See connected services (Calendar, WhatsApp, etc.)', resource: 'integrations', action: 'read' },
          { key: 'integrations:update', label: 'Manage Integrations', description: 'Connect or disconnect third-party services', resource: 'integrations', action: 'update', isAdminOnly: true },
        ],
      },
      {
        page: 'Audit & Security',
        route: '/audit',
        description: 'System audit logs, login analytics, hierarchy changes',
        actions: [
          { key: 'audit_logs:read', label: 'View Audit Logs', description: 'Read system audit trail', resource: 'audit_logs', action: 'read' },
          { key: 'audit_logs:export', label: 'Export Audit Logs', description: 'Download audit logs as Excel', resource: 'audit_logs', action: 'export' },
          { key: 'audit_logs:restore', label: 'Restore Deleted Records', description: 'Un-delete soft-deleted data', resource: 'audit_logs', action: 'restore', isSuperAdminOnly: true },
        ],
      },
      {
        page: 'Super Admin Hub',
        route: '/super-admin-hub',
        description: 'System-level controls, super admin management, advanced overrides',
        actions: [
          { key: 'super_admins:read', label: 'View Super Admins', description: 'See list of super admins', resource: 'super_admins', action: 'read', isSuperAdminOnly: true },
          { key: 'super_admins:create', label: 'Promote to Super Admin', description: 'Grant super admin status', resource: 'super_admins', action: 'create', isSuperAdminOnly: true },
          { key: 'super_admins:delete', label: 'Remove Super Admin', description: 'Revoke super admin status', resource: 'super_admins', action: 'delete', isSuperAdminOnly: true, isDestructive: true },
          { key: 'system:override', label: 'System Override', description: 'Force-override system constraints', resource: 'system', action: 'override', isSuperAdminOnly: true },
        ],
      },
    ],
  },

  // ─── Programme Management ─────────────────────────────────────────────────
  {
    module: 'Programme Management',
    icon: 'FolderKanban',
    color: 'indigo',
    description: 'Projects, MMP files, site visits, portfolio dashboard, and analytics',
    pages: [
      {
        page: 'Projects',
        route: '/programme-hub',
        description: 'Full project lifecycle management with stages and team assignments',
        actions: [
          { key: 'projects:read', label: 'View Projects', description: 'Browse all projects', resource: 'projects', action: 'read' },
          { key: 'projects:create', label: 'Create Project', description: 'Start a new project', resource: 'projects', action: 'create' },
          { key: 'projects:update', label: 'Edit Project / Advance Stage', description: 'Update details and move between stages', resource: 'projects', action: 'update' },
          { key: 'projects:delete', label: 'Delete Project', description: 'Permanently remove a project', resource: 'projects', action: 'delete', isDestructive: true },
          { key: 'projects:archive', label: 'Archive Project', description: 'Move project to archived state', resource: 'projects', action: 'archive' },
          { key: 'projects:assign', label: 'Assign Team Members / PM', description: 'Add or remove project team', resource: 'projects', action: 'assign' },
          { key: 'projects:approve', label: 'Approve Project Stage', description: 'Sign off on a stage completion', resource: 'projects', action: 'approve' },
          { key: 'projects:export', label: 'Export Project PDF / Excel', description: 'Download project data', resource: 'projects', action: 'export' },
        ],
      },
      {
        page: 'Portfolio Dashboard',
        route: '/portfolio',
        description: 'Director-level cross-project health matrix and KPIs',
        actions: [
          { key: 'portfolio:read', label: 'View Portfolio', description: 'See the portfolio dashboard', resource: 'portfolio', action: 'read' },
          { key: 'portfolio:export', label: 'Export Portfolio Report', description: 'Download portfolio summary', resource: 'portfolio', action: 'export' },
        ],
      },
      {
        page: 'Project Analytics',
        route: '/analytics',
        description: 'Cross-project analytics, budget utilization, task tracking',
        actions: [
          { key: 'analytics:read', label: 'View Analytics', description: 'Access analytics dashboards', resource: 'analytics', action: 'read' },
          { key: 'analytics:export', label: 'Export Analytics', description: 'Download analytics data', resource: 'analytics', action: 'export' },
        ],
      },
      {
        page: 'MMP Management',
        route: '/mmp',
        description: 'Monthly Monitoring Plans — upload, verify, approve, dispatch, cycle close',
        actions: [
          { key: 'mmp:read', label: 'View MMP Files', description: 'Browse MMP list and details', resource: 'mmp', action: 'read' },
          { key: 'mmp:create', label: 'Upload MMP', description: 'Submit a new MMP file', resource: 'mmp', action: 'create' },
          { key: 'mmp:update', label: 'Edit / Verify MMP', description: 'Update MMP data and verify entries', resource: 'mmp', action: 'update' },
          { key: 'mmp:approve', label: 'Approve MMP / Forward', description: 'Approve or forward to next tier', resource: 'mmp', action: 'approve' },
          { key: 'mmp:assign', label: 'Assign Coordinators', description: 'Assign enumerators to sites', resource: 'mmp', action: 'assign' },
          { key: 'mmp:archive', label: 'Archive / Close Cycle', description: 'Archive MMP or close monitoring cycle', resource: 'mmp', action: 'archive' },
          { key: 'mmp:delete', label: 'Delete MMP', description: 'Remove an MMP file', resource: 'mmp', action: 'delete', isDestructive: true },
          { key: 'mmp:export', label: 'Export MMP Report', description: 'Download MMP data to Excel/PDF', resource: 'mmp', action: 'export' },
        ],
      },
      {
        page: 'Site Visits',
        route: '/site-visits',
        description: 'Field site visit tracking, start / complete / approve visits',
        actions: [
          { key: 'site_visits:read', label: 'View Site Visits', description: 'Browse all site visits', resource: 'site_visits', action: 'read' },
          { key: 'site_visits:create', label: 'Create Site Visit', description: 'Start a new visit record', resource: 'site_visits', action: 'create' },
          { key: 'site_visits:update', label: 'Update / Complete Visit', description: 'Fill in data and mark complete', resource: 'site_visits', action: 'update' },
          { key: 'site_visits:submit', label: 'Submit Visit', description: 'Submit visit for review', resource: 'site_visits', action: 'submit' },
          { key: 'site_visits:approve', label: 'Approve Visit / Rate Quality', description: 'Approve or reject a completed visit', resource: 'site_visits', action: 'approve' },
          { key: 'site_visits:assign', label: 'Assign Enumerators', description: 'Assign staff to visit sites', resource: 'site_visits', action: 'assign' },
          { key: 'site_visits:delete', label: 'Delete Visit Record', description: 'Remove a site visit record', resource: 'site_visits', action: 'delete', isDestructive: true },
          { key: 'site_visits:export', label: 'Export Visit Data', description: 'Download site visit reports', resource: 'site_visits', action: 'export' },
        ],
      },
      {
        page: 'Field Team',
        route: '/field-team',
        description: 'Field team management, assignments, and geographic coverage',
        actions: [
          { key: 'hub_operations:read', label: 'View Field Team', description: 'See field team overview', resource: 'hub_operations', action: 'read' },
          { key: 'hub_operations:update', label: 'Manage Field Team', description: 'Update team assignments and zones', resource: 'hub_operations', action: 'update' },
          { key: 'coverage_map:read', label: 'View Coverage Map', description: 'See Leaflet map of site coverage', resource: 'coverage_map', action: 'read' },
        ],
      },
    ],
  },

  // ─── Finance ──────────────────────────────────────────────────────────────
  {
    module: 'Finance',
    icon: 'DollarSign',
    color: 'green',
    description: 'Budget, wallets, cost submissions, down payments, accounting, procurement, fixed assets',
    pages: [
      {
        page: 'Finance Hub',
        route: '/finance-hub',
        description: 'Budget overview, financial operations, reconciliation',
        actions: [
          { key: 'finances:read', label: 'View Finance Hub', description: 'Access the finance dashboard', resource: 'finances', action: 'read' },
          { key: 'finances:create', label: 'Create Financial Record', description: 'Add budget lines or transactions', resource: 'finances', action: 'create' },
          { key: 'finances:update', label: 'Edit Financial Records', description: 'Modify budget lines and allocations', resource: 'finances', action: 'update' },
          { key: 'finances:approve', label: 'Approve Financial Action', description: 'Approve budgets and fund releases', resource: 'finances', action: 'approve' },
          { key: 'finances:delete', label: 'Delete Financial Record', description: 'Remove a financial record', resource: 'finances', action: 'delete', isDestructive: true },
          { key: 'finances:export', label: 'Export Financial Reports', description: 'Download finance data to Excel/PDF', resource: 'finances', action: 'export' },
          { key: 'finances:override', label: 'Override Financial Limits', description: 'Bypass normal financial constraints', resource: 'finances', action: 'override', isSuperAdminOnly: true },
        ],
      },
      {
        page: 'Cost Submissions',
        route: '/cost-submission',
        description: 'Submit, approve (Tier 1–4), mark paid, export cost requests',
        actions: [
          { key: 'cost_submissions:read', label: 'View Cost Submissions', description: 'Browse all cost requests', resource: 'cost_submissions', action: 'read' },
          { key: 'cost_submissions:submit', label: 'Submit Cost Request', description: 'Create and submit a cost request', resource: 'cost_submissions', action: 'submit' },
          { key: 'cost_submissions:create', label: 'Create on Behalf Of', description: 'Admin creates submission for another user', resource: 'cost_submissions', action: 'create', isAdminOnly: true },
          { key: 'cost_submissions:approve', label: 'Approve / Mark Paid', description: 'Tier-approve or mark a request as paid', resource: 'cost_submissions', action: 'approve' },
          { key: 'cost_submissions:update', label: 'Edit Submission', description: 'Edit a pending submission', resource: 'cost_submissions', action: 'update' },
          { key: 'cost_submissions:delete', label: 'Delete Submission', description: 'Remove a cost submission', resource: 'cost_submissions', action: 'delete', isDestructive: true },
          { key: 'cost_submissions:export', label: 'Export Submissions', description: 'Download cost submissions report', resource: 'cost_submissions', action: 'export' },
        ],
      },
      {
        page: 'Down Payments',
        route: '/finance-hub?tab=down-payments',
        description: 'Field down-payment requests, approvals, batch payment, aging reports',
        actions: [
          { key: 'down_payments:read', label: 'View Down Payments', description: 'Browse down payment requests', resource: 'down_payments', action: 'read' },
          { key: 'down_payments:submit', label: 'Submit Down Payment', description: 'Create a new down payment request', resource: 'down_payments', action: 'submit' },
          { key: 'down_payments:create', label: 'Admin-Create Down Payment', description: 'Create a down payment on behalf of another', resource: 'down_payments', action: 'create', isAdminOnly: true },
          { key: 'down_payments:approve', label: 'Approve / Batch Pay', description: 'Approve or batch-process payments', resource: 'down_payments', action: 'approve' },
          { key: 'down_payments:update', label: 'Edit Down Payment', description: 'Modify a pending request', resource: 'down_payments', action: 'update' },
          { key: 'down_payments:export', label: 'Export Down Payments', description: 'Download aging and payment reports', resource: 'down_payments', action: 'export' },
        ],
      },
      {
        page: 'Wallets',
        route: '/wallet',
        description: 'User and hub wallets — balances, top-ups, disbursements',
        actions: [
          { key: 'wallets:read', label: 'View Wallets', description: 'See wallet balances', resource: 'wallets', action: 'read' },
          { key: 'wallets:create', label: 'Issue Funds / Top-Up', description: 'Add funds to a wallet', resource: 'wallets', action: 'create' },
          { key: 'wallets:update', label: 'Adjust Wallet Balance', description: 'Manual balance adjustment', resource: 'wallets', action: 'update' },
          { key: 'wallets:approve', label: 'Approve Wallet Action', description: 'Approve fund disbursement', resource: 'wallets', action: 'approve' },
          { key: 'wallets:override', label: 'Override Wallet Limit', description: 'Bypass wallet thresholds', resource: 'wallets', action: 'override', isSuperAdminOnly: true },
          { key: 'wallets:export', label: 'Export Wallet Report', description: 'Download wallet history', resource: 'wallets', action: 'export' },
        ],
      },
      {
        page: 'Accounting',
        route: '/accounting',
        description: 'Chart of Accounts, Journals, GL, Bank Reconciliation, Financial Statements',
        actions: [
          { key: 'accounting:read', label: 'View Accounting', description: 'Browse journals, GL, COA', resource: 'accounting', action: 'read' },
          { key: 'accounting:create', label: 'Post Journal Entry', description: 'Create a manual journal entry', resource: 'accounting', action: 'create' },
          { key: 'accounting:update', label: 'Edit / Reverse Journal', description: 'Modify or reverse an entry', resource: 'accounting', action: 'update' },
          { key: 'accounting:delete', label: 'Delete Journal Entry', description: 'Remove a journal entry', resource: 'accounting', action: 'delete', isDestructive: true },
          { key: 'accounting:approve', label: 'Approve / Period Close', description: 'Approve entries or close a period', resource: 'accounting', action: 'approve' },
          { key: 'accounting:export', label: 'Export Financial Statements', description: 'Download balance sheet, P&L, etc.', resource: 'accounting', action: 'export' },
        ],
      },
      {
        page: 'Pre-Funding',
        route: '/pre-funding',
        description: 'Pre-fund requests, fund releases, donor allocation tracking',
        actions: [
          { key: 'pre_funding:read', label: 'View Pre-Funding', description: 'See pre-fund requests and releases', resource: 'pre_funding', action: 'read' },
          { key: 'pre_funding:create', label: 'Create Pre-Fund Request', description: 'Submit a pre-funding request', resource: 'pre_funding', action: 'create' },
          { key: 'pre_funding:approve', label: 'Approve Pre-Fund Release', description: 'Approve a fund release', resource: 'pre_funding', action: 'approve' },
          { key: 'pre_funding:export', label: 'Export Pre-Funding Report', description: 'Download pre-funding data', resource: 'pre_funding', action: 'export' },
        ],
      },
      {
        page: 'Procurement (P2P)',
        route: '/accounting?tab=procurement',
        description: 'Purchase Requests, Purchase Orders, GRN, AP Invoices, Cheque Register',
        actions: [
          { key: 'procurement:read', label: 'View Procurement', description: 'Browse PRs, POs, GRNs, invoices', resource: 'procurement', action: 'read' },
          { key: 'procurement:create', label: 'Create PR / PO / GRN', description: 'Initiate a procurement document', resource: 'procurement', action: 'create' },
          { key: 'procurement:update', label: 'Edit Procurement Document', description: 'Modify a PR or PO', resource: 'procurement', action: 'update' },
          { key: 'procurement:approve', label: 'Approve PR / PO / Invoice', description: 'Approve procurement at any stage', resource: 'procurement', action: 'approve' },
          { key: 'procurement:delete', label: 'Cancel / Delete Procurement', description: 'Remove a procurement record', resource: 'procurement', action: 'delete', isDestructive: true },
          { key: 'procurement:export', label: 'Export Procurement Report', description: 'Download procurement data', resource: 'procurement', action: 'export' },
        ],
      },
      {
        page: 'Fixed Assets',
        route: '/accounting?tab=assets',
        description: 'Asset registry, depreciation runs, disposal, write-off',
        actions: [
          { key: 'fixed_assets:read', label: 'View Fixed Assets', description: 'Browse asset register', resource: 'fixed_assets', action: 'read' },
          { key: 'fixed_assets:create', label: 'Add Asset', description: 'Register a new fixed asset', resource: 'fixed_assets', action: 'create' },
          { key: 'fixed_assets:update', label: 'Edit Asset / Run Depreciation', description: 'Update asset or run depreciation', resource: 'fixed_assets', action: 'update' },
          { key: 'fixed_assets:delete', label: 'Dispose / Write-Off Asset', description: 'Remove or write off an asset', resource: 'fixed_assets', action: 'delete', isDestructive: true },
          { key: 'fixed_assets:export', label: 'Export Asset Register', description: 'Download fixed assets report', resource: 'fixed_assets', action: 'export' },
        ],
      },
      {
        page: 'Transaction Scanner',
        route: '/transactions',
        description: 'AI-powered OCR for transaction screenshots',
        actions: [
          { key: 'transactions:read', label: 'View Transactions', description: 'See scanned transaction records', resource: 'transactions', action: 'read' },
          { key: 'transactions:create', label: 'Scan / Upload Transaction', description: 'Submit a transaction screenshot for OCR', resource: 'transactions', action: 'create' },
          { key: 'transactions:export', label: 'Export Transactions', description: 'Download transaction data', resource: 'transactions', action: 'export' },
        ],
      },
    ],
  },

  // ─── HR & People ──────────────────────────────────────────────────────────
  {
    module: 'HR & People',
    icon: 'Users',
    color: 'purple',
    description: 'Payroll, leave, recruitment, performance, benefits, succession, pulse surveys, HR analytics',
    pages: [
      {
        page: 'HR Hub (Overview)',
        route: '/hr',
        description: 'Central HR dashboard — payroll, leave, performance, org chart',
        actions: [
          { key: 'hr:read', label: 'View HR Hub', description: 'Access the HR dashboard', resource: 'hr', action: 'read' },
          { key: 'hr:update', label: 'Manage HR Records', description: 'Edit staff information and HR data', resource: 'hr', action: 'update', isAdminOnly: true },
          { key: 'hr:export', label: 'Export HR Data', description: 'Download HR reports', resource: 'hr', action: 'export' },
        ],
      },
      {
        page: 'Payroll',
        route: '/hr?tab=payroll',
        description: 'Run payroll, approve variances, generate payslips, export bank files',
        actions: [
          { key: 'payroll:read', label: 'View Payroll', description: 'See payroll records and payslips', resource: 'payroll', action: 'read' },
          { key: 'payroll:create', label: 'Run Payroll', description: 'Generate monthly payroll run', resource: 'payroll', action: 'create', isAdminOnly: true },
          { key: 'payroll:approve', label: 'Approve Payroll Variance', description: 'Sign off on payroll changes', resource: 'payroll', action: 'approve', isAdminOnly: true },
          { key: 'payroll:update', label: 'Edit Salary / Retainer', description: 'Change staff salary or retainer rate', resource: 'payroll', action: 'update', isAdminOnly: true },
          { key: 'payroll:export', label: 'Export Payroll / Bank File', description: 'Download payroll sheet or bank transfer file', resource: 'payroll', action: 'export' },
          { key: 'payroll:delete', label: 'Delete Payroll Run', description: 'Remove a payroll record', resource: 'payroll', action: 'delete', isDestructive: true, isAdminOnly: true },
        ],
      },
      {
        page: 'Leave Management',
        route: '/hr?tab=leave',
        description: 'Leave requests, multi-tier approvals, carry-forward',
        actions: [
          { key: 'leave:read', label: 'View Leave Requests', description: 'See all leave requests', resource: 'leave', action: 'read' },
          { key: 'leave:create', label: 'Apply for Leave', description: 'Submit a leave request', resource: 'leave', action: 'create' },
          { key: 'leave:approve', label: 'Approve / Reject Leave', description: 'Approve or reject leave requests', resource: 'leave', action: 'approve' },
          { key: 'leave:update', label: 'Adjust Leave Balance', description: 'Manually adjust leave balance', resource: 'leave', action: 'update', isAdminOnly: true },
          { key: 'leave:export', label: 'Export Leave Report', description: 'Download leave summary', resource: 'leave', action: 'export' },
        ],
      },
      {
        page: 'Benefits Enrollment',
        route: '/hr?tab=benefits',
        description: 'Staff benefits catalog, employee self-enrollment, admin management',
        actions: [
          { key: 'benefits:read', label: 'View Benefits', description: 'See benefits catalog and enrollments', resource: 'benefits', action: 'read' },
          { key: 'benefits:create', label: 'Add Benefit Plan', description: 'Create a new benefit plan', resource: 'benefits', action: 'create', isAdminOnly: true },
          { key: 'benefits:submit', label: 'Enroll in Benefit', description: 'Self-enroll in an available benefit', resource: 'benefits', action: 'submit' },
          { key: 'benefits:update', label: 'Edit Benefit / Enrollment', description: 'Update a benefit plan or enrollment', resource: 'benefits', action: 'update', isAdminOnly: true },
          { key: 'benefits:approve', label: 'Approve / Reject Enrollment', description: 'Review and decide on benefit enrollments', resource: 'benefits', action: 'approve', isAdminOnly: true },
          { key: 'benefits:delete', label: 'Remove Benefit Plan', description: 'Delete a benefit offering', resource: 'benefits', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'benefits:export', label: 'Export Benefits Report', description: 'Download enrollment data', resource: 'benefits', action: 'export' },
        ],
      },
      {
        page: 'Succession Planning',
        route: '/hr?tab=succession',
        description: 'Position successors, readiness ratings, development plans',
        actions: [
          { key: 'succession:read', label: 'View Succession Plans', description: 'See succession pipeline and nominees', resource: 'succession', action: 'read' },
          { key: 'succession:create', label: 'Create Succession Plan', description: 'Add a new position succession plan', resource: 'succession', action: 'create', isAdminOnly: true },
          { key: 'succession:update', label: 'Update Successor / Readiness', description: 'Edit nominee readiness and development steps', resource: 'succession', action: 'update', isAdminOnly: true },
          { key: 'succession:approve', label: 'Approve Succession Plan', description: 'Sign off on a succession plan', resource: 'succession', action: 'approve' },
          { key: 'succession:delete', label: 'Delete Succession Plan', description: 'Remove a succession record', resource: 'succession', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'succession:export', label: 'Export Succession Report', description: 'Download succession planning data', resource: 'succession', action: 'export' },
        ],
      },
      {
        page: 'Pulse Surveys',
        route: '/hr?tab=pulse-surveys',
        description: 'Engagement pulse surveys — create, distribute, analyze, anonymous responses',
        actions: [
          { key: 'pulse_surveys:read', label: 'View Pulse Surveys', description: 'See all pulse surveys and results', resource: 'pulse_surveys', action: 'read' },
          { key: 'pulse_surveys:create', label: 'Create Pulse Survey', description: 'Launch a new engagement pulse survey', resource: 'pulse_surveys', action: 'create', isAdminOnly: true },
          { key: 'pulse_surveys:submit', label: 'Respond to Pulse Survey', description: 'Submit an anonymous pulse response', resource: 'pulse_surveys', action: 'submit' },
          { key: 'pulse_surveys:update', label: 'Edit Pulse Survey', description: 'Modify a survey before launch', resource: 'pulse_surveys', action: 'update', isAdminOnly: true },
          { key: 'pulse_surveys:delete', label: 'Delete Pulse Survey', description: 'Remove a pulse survey', resource: 'pulse_surveys', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'pulse_surveys:export', label: 'Export Pulse Survey Results', description: 'Download survey analytics', resource: 'pulse_surveys', action: 'export' },
        ],
      },
      {
        page: 'HR Analytics',
        route: '/hr?tab=analytics',
        description: 'Staff turnover, headcount trends, cost projections, performance distribution',
        actions: [
          { key: 'hr_analytics:read', label: 'View HR Analytics', description: 'Access HR analytics dashboards', resource: 'hr_analytics', action: 'read' },
          { key: 'hr_analytics:export', label: 'Export HR Analytics', description: 'Download HR analytics reports', resource: 'hr_analytics', action: 'export' },
        ],
      },
      {
        page: 'Salary Advances',
        route: '/hr?tab=salary-advances',
        description: 'Issue salary advances, recovery schedules, auto-completion tracking',
        actions: [
          { key: 'hr:read', label: 'View Salary Advances', description: 'See advance records', resource: 'hr', action: 'read' },
          { key: 'hr:create', label: 'Issue Salary Advance', description: 'Grant an advance to staff', resource: 'hr', action: 'create', isAdminOnly: true },
          { key: 'hr:update', label: 'Update Recovery Schedule', description: 'Adjust advance recovery plan', resource: 'hr', action: 'update', isAdminOnly: true },
          { key: 'hr:export', label: 'Export Advance Report', description: 'Download advance and recovery data', resource: 'hr', action: 'export' },
        ],
      },
    ],
  },

  // ─── CRM ─────────────────────────────────────────────────────────────────
  {
    module: 'CRM',
    icon: 'Handshake',
    color: 'orange',
    description: 'Partners, contacts, engagements, and opportunities management',
    pages: [
      {
        page: 'CRM Hub',
        route: '/crm',
        description: 'Five-page CRM for partners, engagements, contacts, opportunities',
        actions: [
          { key: 'crm:read', label: 'View CRM', description: 'Access all CRM data', resource: 'crm', action: 'read' },
          { key: 'crm:create', label: 'Create Partner / Contact', description: 'Add new CRM records', resource: 'crm', action: 'create' },
          { key: 'crm:update', label: 'Edit CRM Records', description: 'Update partner and engagement data', resource: 'crm', action: 'update' },
          { key: 'crm:delete', label: 'Delete CRM Record', description: 'Remove a partner or contact', resource: 'crm', action: 'delete', isDestructive: true },
          { key: 'crm:export', label: 'Export CRM Data', description: 'Download partner list and engagement reports', resource: 'crm', action: 'export' },
        ],
      },
    ],
  },

  // ─── Surveys & Tools ──────────────────────────────────────────────────────
  {
    module: 'Surveys & Tools',
    icon: 'ClipboardList',
    color: 'teal',
    description: 'Survey builder, distribution, analytics, tasks, notifications, broadcasts',
    pages: [
      {
        page: 'Surveys',
        route: '/surveys',
        description: 'Survey builder, 19 question types, AI generation, analytics, public forms',
        actions: [
          { key: 'surveys:read', label: 'View Surveys', description: 'Browse all surveys', resource: 'surveys', action: 'read' },
          { key: 'surveys:create', label: 'Create Survey', description: 'Build a new survey', resource: 'surveys', action: 'create' },
          { key: 'surveys:update', label: 'Edit Survey / Settings', description: 'Modify survey questions and settings', resource: 'surveys', action: 'update' },
          { key: 'surveys:delete', label: 'Delete Survey', description: 'Remove a survey and its responses', resource: 'surveys', action: 'delete', isDestructive: true },
          { key: 'surveys:submit', label: 'Submit Survey Response', description: 'Fill and submit a survey form', resource: 'surveys', action: 'submit' },
          { key: 'surveys:approve', label: 'Review Submission', description: 'Approve or reject a survey response', resource: 'surveys', action: 'approve' },
          { key: 'surveys:export', label: 'Export Survey Analytics', description: 'Download survey data', resource: 'surveys', action: 'export' },
        ],
      },
      {
        page: 'Tasks',
        route: '/my-tasks',
        description: 'Personal and team tasks, subtasks, recurring, proof uploads, timesheets',
        actions: [
          { key: 'tasks:read', label: 'View Tasks', description: 'See task list and details', resource: 'tasks', action: 'read' },
          { key: 'tasks:create', label: 'Create Task', description: 'Add a new task', resource: 'tasks', action: 'create' },
          { key: 'tasks:update', label: 'Update Task / Add Output', description: 'Edit task and add accomplishments', resource: 'tasks', action: 'update' },
          { key: 'tasks:assign', label: 'Assign Task to Others', description: 'Delegate tasks to team members', resource: 'tasks', action: 'assign' },
          { key: 'tasks:delete', label: 'Delete Task', description: 'Remove a task', resource: 'tasks', action: 'delete', isDestructive: true },
          { key: 'tasks:export', label: 'Export Task Report', description: 'Download task data', resource: 'tasks', action: 'export' },
        ],
      },
      {
        page: 'Notifications',
        route: '/notifications',
        description: 'In-app notifications, pending actions, inline approvals, analytics',
        actions: [
          { key: 'notifications:read', label: 'View Notifications', description: 'See all notifications', resource: 'notifications', action: 'read' },
          { key: 'notifications:create', label: 'Send Notification', description: 'Manually send a notification', resource: 'notifications', action: 'create', isAdminOnly: true },
          { key: 'notifications:delete', label: 'Delete Notification', description: 'Remove notifications', resource: 'notifications', action: 'delete', isAdminOnly: true },
          { key: 'broadcast:create', label: 'Send Broadcast', description: 'Send a broadcast to all or filtered users', resource: 'broadcast', action: 'create', isAdminOnly: true },
          { key: 'broadcast:read', label: 'View Broadcast Center', description: 'See the broadcast center admin panel', resource: 'broadcast', action: 'read', isAdminOnly: true },
        ],
      },
      {
        page: 'Calendar',
        route: '/calendar',
        description: 'Event management, Outlook Calendar integration',
        actions: [
          { key: 'calendar:read', label: 'View Calendar', description: 'See events on the calendar', resource: 'calendar', action: 'read' },
          { key: 'calendar:create', label: 'Create Calendar Event', description: 'Add a new event', resource: 'calendar', action: 'create' },
          { key: 'calendar:update', label: 'Edit Calendar Event', description: 'Modify an existing event', resource: 'calendar', action: 'update' },
          { key: 'calendar:delete', label: 'Delete Calendar Event', description: 'Remove an event', resource: 'calendar', action: 'delete', isDestructive: true },
        ],
      },
      {
        page: 'WhatsApp',
        route: '/settings?tab=whatsapp',
        description: 'WhatsApp connection, delivery logs, per-user opt-in, admin panel',
        actions: [
          { key: 'whatsapp:read', label: 'View WhatsApp Status', description: 'See connection status and delivery logs', resource: 'whatsapp', action: 'read' },
          { key: 'whatsapp:update', label: 'Manage WhatsApp', description: 'Configure connection and templates', resource: 'whatsapp', action: 'update', isAdminOnly: true },
        ],
      },
      {
        page: 'Signatures',
        route: '/signatures',
        description: 'Digital signature capture and management for documents',
        actions: [
          { key: 'signatures:read', label: 'View Signatures', description: 'See signature records', resource: 'signatures', action: 'read' },
          { key: 'signatures:create', label: 'Add Signature', description: 'Capture or attach a digital signature', resource: 'signatures', action: 'create' },
        ],
      },
    ],
  },

  // ─── Communication ───────────────────────────────────────────────────────
  {
    module: 'Communication',
    icon: 'Handshake',
    color: 'teal',
    description: 'Chat, broadcast center, WhatsApp, signatures, and communication hub',
    pages: [
      {
        page: 'Communication Hub',
        route: '/communication-hub',
        description: 'Unified hub for chat, calls, and WebRTC conferencing',
        actions: [
          { key: 'chat:read',   label: 'View Chat',       description: 'Access chat rooms and message history', resource: 'chat', action: 'read' },
          { key: 'chat:create', label: 'Send Message',     description: 'Send a chat message or start a thread', resource: 'chat', action: 'create' },
          { key: 'chat:delete', label: 'Delete Message',   description: 'Remove a chat message', resource: 'chat', action: 'delete', isDestructive: true, isAdminOnly: true },
        ],
      },
      {
        page: 'Broadcast Center',
        route: '/admin/broadcast',
        description: 'Send mass announcements to all or filtered users via in-app and WhatsApp',
        actions: [
          { key: 'broadcast:read',   label: 'View Broadcasts',  description: 'See broadcast history and delivery stats', resource: 'broadcast', action: 'read', isAdminOnly: true },
          { key: 'broadcast:create', label: 'Send Broadcast',   description: 'Compose and send a broadcast message', resource: 'broadcast', action: 'create', isAdminOnly: true },
          { key: 'broadcast:delete', label: 'Delete Broadcast', description: 'Remove a broadcast record', resource: 'broadcast', action: 'delete', isDestructive: true, isAdminOnly: true },
        ],
      },
      {
        page: 'WhatsApp Admin',
        route: '/admin/whatsapp',
        description: 'WhatsApp Business API settings, message templates, delivery opt-in',
        actions: [
          { key: 'whatsapp:read',     label: 'View WhatsApp Config',  description: 'See WhatsApp connection status and logs', resource: 'whatsapp', action: 'read', isSuperAdminOnly: true },
          { key: 'whatsapp:update',   label: 'Manage WhatsApp',       description: 'Configure WhatsApp API and templates', resource: 'whatsapp', action: 'update', isSuperAdminOnly: true },
        ],
      },
    ],
  },

  // ─── Coordination & Oversight ─────────────────────────────────────────────
  {
    module: 'Coordination & Oversight',
    icon: 'ClipboardList',
    color: 'orange',
    description: 'Site verification, coordinator dashboard, monitoring plan, tracker preparation',
    pages: [
      {
        page: 'Site Verification',
        route: '/coordinator/sites',
        description: 'Coordinator site-visit verification and quality checks',
        actions: [
          { key: 'site_visits:read',    label: 'View Assigned Sites',    description: 'See sites assigned for verification', resource: 'site_visits', action: 'read' },
          { key: 'site_visits:approve', label: 'Verify / Reject Visit',  description: 'Mark a visit as verified or rejected', resource: 'site_visits', action: 'approve' },
          { key: 'site_visits:update',  label: 'Add Verification Notes', description: 'Annotate a site visit with coordinator notes', resource: 'site_visits', action: 'update' },
        ],
      },
      {
        page: 'Supervisor Sites',
        route: '/supervisor/sites',
        description: 'Supervisor-level site status overview and team management',
        actions: [
          { key: 'site_visits:read',   label: 'View Team Sites',      description: 'See all sites under supervised hub', resource: 'site_visits', action: 'read' },
          { key: 'site_visits:assign', label: 'Reassign Enumerator',  description: 'Move a site to a different enumerator', resource: 'site_visits', action: 'assign' },
        ],
      },
      {
        page: 'Coordinator Dashboard',
        route: '/coordinator-dashboard',
        description: 'Personal dashboard for coordinators — pending verifications and cycle progress',
        actions: [
          { key: 'hub_operations:read', label: 'View Coordinator Dashboard', description: 'Access the coordinator overview', resource: 'hub_operations', action: 'read' },
          { key: 'site_visits:export',  label: 'Export Verification Report',  description: 'Download coordinator site report', resource: 'site_visits', action: 'export' },
        ],
      },
      {
        page: 'Monitoring Plan',
        route: '/monitoring-plan',
        description: 'Plan and track monthly monitoring coverage across sites and hubs',
        actions: [
          { key: 'mmp:read',   label: 'View Monitoring Plan',   description: 'Browse the monitoring plan', resource: 'mmp', action: 'read' },
          { key: 'mmp:update', label: 'Update Monitoring Plan', description: 'Modify monitoring plan entries', resource: 'mmp', action: 'update' },
          { key: 'mmp:export', label: 'Export Monitoring Plan', description: 'Download monitoring plan data', resource: 'mmp', action: 'export' },
        ],
      },
      {
        page: 'Tracker Preparation Plan',
        route: '/tracker-preparation-plan',
        description: 'Pre-cycle tracker setup — locality assignments, site inclusion, preparation checklists',
        actions: [
          { key: 'mmp:create', label: 'Create Tracker Entry', description: 'Add a new site to the tracker plan', resource: 'mmp', action: 'create' },
          { key: 'mmp:update', label: 'Edit Tracker Plan',    description: 'Update tracker preparation data', resource: 'mmp', action: 'update' },
          { key: 'mmp:read',   label: 'View Tracker Plan',   description: 'Read tracker preparation plan', resource: 'mmp', action: 'read' },
        ],
      },
    ],
  },

  // ─── Field Operations (Safety / Incidents) ───────────────────────────────
  {
    module: 'Field Operations',
    icon: 'MapPin',
    color: 'red',
    description: 'Safety hub, incident reports, equipment tracking, field team operations',
    pages: [
      {
        page: 'Safety Hub',
        route: '/field-ops',
        description: 'Safety briefings, alerts, field safety status',
        actions: [
          { key: 'safety:read', label: 'View Safety Hub', description: 'Access safety information', resource: 'safety', action: 'read' },
          { key: 'safety:update', label: 'Update Safety Status', description: 'Post safety updates and alerts', resource: 'safety', action: 'update' },
          { key: 'safety:create', label: 'Create Safety Alert', description: 'Issue a new safety alert', resource: 'safety', action: 'create' },
        ],
      },
      {
        page: 'Incident Reports',
        route: '/field-ops?tab=incidents',
        description: 'Field incident logging and management',
        actions: [
          { key: 'incidents:read', label: 'View Incidents', description: 'See all incident reports', resource: 'incidents', action: 'read' },
          { key: 'incidents:create', label: 'Report Incident', description: 'Submit a new incident report', resource: 'incidents', action: 'create' },
          { key: 'incidents:update', label: 'Update Incident', description: 'Modify an existing incident record', resource: 'incidents', action: 'update' },
          { key: 'incidents:delete', label: 'Delete Incident', description: 'Remove an incident report', resource: 'incidents', action: 'delete', isDestructive: true },
          { key: 'incidents:export', label: 'Export Incident Report', description: 'Download incident data', resource: 'incidents', action: 'export' },
        ],
      },
      {
        page: 'Equipment',
        route: '/field-ops?tab=equipment',
        description: 'Equipment registry, assignment, and maintenance tracking',
        actions: [
          { key: 'equipment:read', label: 'View Equipment', description: 'Browse equipment registry', resource: 'equipment', action: 'read' },
          { key: 'equipment:create', label: 'Add Equipment', description: 'Register new equipment', resource: 'equipment', action: 'create' },
          { key: 'equipment:update', label: 'Update Equipment', description: 'Edit equipment records', resource: 'equipment', action: 'update' },
          { key: 'equipment:delete', label: 'Remove Equipment', description: 'Delete an equipment record', resource: 'equipment', action: 'delete', isDestructive: true },
        ],
      },
    ],
  },

  // ─── Reports ─────────────────────────────────────────────────────────────
  {
    module: 'Reports',
    icon: 'BarChart2',
    color: 'slate',
    description: 'System-wide reports, custom report builder, donor reports, grant tracking',
    pages: [
      {
        page: 'Reports Hub',
        route: '/reports',
        description: 'Donor fund reports, cost reports, custom reports',
        actions: [
          { key: 'reports:read', label: 'View Reports', description: 'Access all reports', resource: 'reports', action: 'read' },
          { key: 'reports:create', label: 'Create Report', description: 'Generate a new report', resource: 'reports', action: 'create' },
          { key: 'reports:update', label: 'Edit Report', description: 'Modify a saved report', resource: 'reports', action: 'update' },
          { key: 'reports:delete', label: 'Delete Report', description: 'Remove a saved report', resource: 'reports', action: 'delete', isDestructive: true },
          { key: 'reports:export', label: 'Export Report', description: 'Download report as Excel/PDF', resource: 'reports', action: 'export' },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Utility: get which roles have a specific resource+action permission
// ─────────────────────────────────────────────────────────────────────────────
export function getRolesWithPermission(resource: ResourceType, action: ActionType): AppRole[] {
  return (Object.keys(DEFAULT_ROLE_PERMISSIONS) as AppRole[]).filter(role => {
    if (role === 'SuperAdmin') return true;
    return DEFAULT_ROLE_PERMISSIONS[role].some(
      p => p.resource === resource && p.action === action
    );
  });
}

// Coverage: what % of all non-super-admin roles have a permission
export function getPermissionCoverage(resource: ResourceType, action: ActionType): number {
  const nonSuperRoles = (Object.keys(DEFAULT_ROLE_PERMISSIONS) as AppRole[]).filter(r => r !== 'SuperAdmin');
  const withPerm = nonSuperRoles.filter(role =>
    DEFAULT_ROLE_PERMISSIONS[role].some(p => p.resource === resource && p.action === action)
  );
  return nonSuperRoles.length === 0 ? 0 : Math.round((withPerm.length / nonSuperRoles.length) * 100);
}

// All roles (non-super) sorted by privilege level for display
export const DISPLAY_ROLES: AppRole[] = [
  'Admin',
  'CountryDirector',
  'ICT',
  'Field Operation Manager (FOM)',
  'FinancialAdmin',
  'ProjectManager',
  'SeniorOperationsLead',
  'Supervisor',
  'Coordinator',
  'DataTeam',
  'DataCollector',
  'Reviewer',
  'Auditor',
];

export const ROLE_SHORT_LABELS: Record<AppRole, string> = {
  SuperAdmin: 'SA',
  Admin: 'Admin',
  CountryDirector: 'CD',
  ICT: 'ICT',
  'Field Operation Manager (FOM)': 'FOM',
  FinancialAdmin: 'Fin',
  ProjectManager: 'PM',
  SeniorOperationsLead: 'SOL',
  Supervisor: 'Sup',
  Coordinator: 'Coord',
  DataTeam: 'DT',
  DataCollector: 'DC',
  Reviewer: 'Rev',
  Auditor: 'Aud',
};
