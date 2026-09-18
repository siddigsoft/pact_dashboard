
export type AppRole = 
  | 'SuperAdmin'
  | 'Admin'
  | 'CountryDirector'
  | 'SeniorManagement'
  | 'ICT'
  | 'Field Operation Manager (FOM)'
  | 'FinancialAdmin'
  | 'ProjectManager'
  | 'SeniorOperationsLead'
  | 'Supervisor'
  | 'Coordinator'
  | 'DataTeam'
  | 'DataCollector'
  | 'Reviewer'
  | 'Auditor';

export interface UserRole {
  id: string;
  user_id: string;
  /** Legacy role name; new assignments use role_id and leave this null. */
  role?: AppRole | null;
  role_id?: string;
  assigned_by?: string;
  assigned_at?: string;
  created_at: string;
}

export interface Role {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  is_system_role: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  permissions?: Permission[];
}

export interface Permission {
  id: string;
  role_id: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
  created_at: string;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface RoleBaselineAccess {
  /** Role-specific tab restrictions; omitted tabs inherit hub access. */
  tab_rules?: Array<{ page_slug: string; is_blocked: boolean }>;
  column_rules?: Array<{ page_slug: string; column_key: string; is_hidden: boolean }>;
  cost_scope?: { mode: 'role_default' | 'none' | 'own' | 'assigned' | 'selected' | 'country' | 'organization'; include_values: Array<{ type: string; value: string; label: string }>; exclude_values: Array<{ type: string; value: string; label: string }> };
}

export interface CreateRoleRequest extends RoleBaselineAccess {
  name: string;
  display_name: string;
  description?: string;
  permissions: Omit<Permission, 'id' | 'role_id' | 'created_at'>[];
  /** Page slugs that should include this role in page_role_configs. */
  page_slugs?: string[];
  /** Users to assign additively via user_roles.role_id. */
  assign_user_ids?: string[];
  /** Legacy compatibility only. New assignments should remain additive by default. */
  set_as_primary?: boolean;
  reason?: string;
  /** When set, upsert_role_access updates this role instead of creating. */
  role_id?: string;
}

export interface UpsertRoleAccessResult {
  role: Role;
  permissions: Array<{ resource: string; action: string }>;
  page_slugs: string[];
  assign_user_ids: string[];
  set_as_primary: boolean;
}

export interface UpdateRoleRequest extends RoleBaselineAccess {
  page_slugs?: string[];
  display_name?: string;
  description?: string;
  is_active?: boolean;
  permissions?: Omit<Permission, 'id' | 'role_id' | 'created_at'>[];
}

export interface AssignRoleRequest {
  user_id: string;
  /** Canonical role definition ID. Do not send a display/name role value. */
  role_id: string;
  /** Updates the profile's primary/display role without removing other assignments. */
  make_primary?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resource and Action types — covers ALL app modules
// ─────────────────────────────────────────────────────────────────────────────
export type ResourceType = 
  // Core administration
  | 'users'
  | 'roles'
  | 'permissions'
  | 'settings'
  | 'system'
  | 'super_admins'
  | 'audit_logs'
  // Programme management
  | 'projects'
  | 'portfolio'
  | 'analytics'
  | 'mmp'
  | 'site_visits'
  | 'hub_operations'
  // Field operations
  | 'safety'
  | 'incidents'
  | 'equipment'
  | 'coverage_map'
  // Finance & accounting
  | 'finances'
  | 'wallets'
  | 'accounting'
  | 'down_payments'
  | 'cost_submissions'
  | 'pre_funding'
  | 'procurement'
  | 'fixed_assets'
  // HR
  | 'hr'
  | 'payroll'
  | 'salary_advances'
  | 'leave'
  | 'benefits'
  | 'succession'
  | 'pulse_surveys'
  | 'hr_analytics'
  // Tools & communication
  | 'surveys'
  | 'tasks'
  | 'notifications'
  | 'broadcast'
  | 'chat'
  | 'whatsapp'
  | 'calendar'
  | 'signatures'
  | 'integrations'
  | 'transactions'
  // CRM & partners
  | 'crm'
  | 'reports';

export type ActionType = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'assign'
  | 'archive'
  | 'close'
  | 'reverse'
  | 'reconcile'
  | 'import'
  | 'publish'
  | 'send'
  | 'recall'
  | 'revert'
  /** Fine-grained cost-submission workflow capabilities. */
  | 'send_to_finance'
  | 'revert_paid'
  | 'revert_tier'
  | 'restore'
  | 'override'
  | 'submit'
  | 'export'
  // MMP reports are independently grantable. These are intentionally
  // separate from the generic export action so one report can be revoked
  // without changing access to the others.
  | 'full_report'
  | 'state_report'
  | 'hub_report'
  // Financial button permissions are separate from page/resource CRUD.
  | 'mark_paid'
  | 'use_for_payment'
  /** Explicit lifecycle/status and configuration mutations. */
  | 'status'
  | 'settings';

export const RESOURCES: ResourceType[] = [
  'users', 'roles', 'permissions', 'settings', 'system', 'super_admins', 'audit_logs',
  'projects', 'portfolio', 'analytics', 'mmp', 'site_visits', 'hub_operations',
  'safety', 'incidents', 'equipment', 'coverage_map',
  'finances', 'wallets', 'accounting', 'down_payments', 'cost_submissions',
  'pre_funding', 'procurement', 'fixed_assets',
  'hr', 'payroll', 'salary_advances', 'leave', 'benefits', 'succession', 'pulse_surveys', 'hr_analytics',
  'surveys', 'tasks', 'notifications', 'broadcast', 'whatsapp', 'calendar',
  'signatures', 'integrations', 'transactions', 'chat',
  'crm', 'reports',
];

export const ACTIONS: ActionType[] = [
  'create', 'read', 'update', 'delete', 'approve', 'reject',
  'assign', 'archive', 'close', 'reverse', 'reconcile', 'import',
  'publish', 'send', 'recall', 'revert', 'send_to_finance', 'revert_paid', 'revert_tier',
  'restore', 'override', 'submit', 'export',
  'full_report', 'state_report', 'hub_report',
  'mark_paid', 'use_for_payment', 'status', 'settings',
];

// ─────────────────────────────────────────────────────────────────────────────
// Human-readable labels for UI rendering
// ─────────────────────────────────────────────────────────────────────────────
export const RESOURCE_LABELS: Record<ResourceType, string> = {
  users: 'Users', roles: 'Roles', permissions: 'Permissions',
  settings: 'Settings', system: 'System', super_admins: 'Super Admins', audit_logs: 'Audit Logs',
  projects: 'Projects', portfolio: 'Portfolio', analytics: 'Analytics',
  mmp: 'MMP', site_visits: 'Site Visits', hub_operations: 'Hub Operations',
  safety: 'Safety Hub', incidents: 'Incident Reports', equipment: 'Equipment', coverage_map: 'Coverage Map',
  finances: 'Finances', wallets: 'Wallets', accounting: 'Accounting',
  down_payments: 'Down Payments', cost_submissions: 'Cost Submissions',
  pre_funding: 'Pre-Funding', procurement: 'Procurement (P2P)', fixed_assets: 'Fixed Assets',
  hr: 'HR Hub', payroll: 'Payroll', salary_advances: 'Salary Advances', leave: 'Leave Management',
  benefits: 'Benefits Enrollment', succession: 'Succession Planning', pulse_surveys: 'Pulse Surveys',
  hr_analytics: 'HR Analytics',
  surveys: 'Surveys', tasks: 'Tasks', notifications: 'Notifications',
  broadcast: 'Broadcast', whatsapp: 'WhatsApp', calendar: 'Calendar',
  signatures: 'Signatures', integrations: 'Integrations', transactions: 'Transactions', chat: 'Chat',
  crm: 'CRM', reports: 'Reports',
};

export const ACTION_LABELS: Record<ActionType, string> = {
  create: 'Create', read: 'Read', update: 'Update', delete: 'Delete',
  approve: 'Approve', reject: 'Reject', assign: 'Assign', archive: 'Archive',
  close: 'Close', reverse: 'Reverse', reconcile: 'Reconcile', import: 'Import',
  publish: 'Publish', send: 'Send', recall: 'Recall', revert: 'Revert',
  send_to_finance: 'Send to Finance', revert_paid: 'Revert Paid', revert_tier: 'Revert Approval Tier',
  restore: 'Restore',
  override: 'Override', submit: 'Submit', export: 'Export',
  full_report: 'Full MMP Report', state_report: 'State MMP Report', hub_report: 'Hub MMP Report',
  mark_paid: 'Mark Cost Submission Paid',
  use_for_payment: 'Use Pre-Fund for Payment',
  status: 'Change Status',
  settings: 'Manage Settings',
};

const allActionsFor = (resource: ResourceType): { resource: ResourceType; action: ActionType }[] =>
  ACTIONS.map(action => ({ resource, action }));

const SUPER_ADMIN_PERMISSIONS: { resource: ResourceType; action: ActionType }[] = 
  RESOURCES.flatMap(resource => allActionsFor(resource));

// ─────────────────────────────────────────────────────────────────────────────
// Default role permissions — covers ALL resources across ALL roles
// ─────────────────────────────────────────────────────────────────────────────
export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, { resource: ResourceType; action: ActionType }[]> = {

  // ── Super Admin ──────────────────────────────────────────────────────────
  SuperAdmin: SUPER_ADMIN_PERMISSIONS,

  // ── Admin ────────────────────────────────────────────────────────────────
  Admin: [
    // Core admin
    { resource: 'users', action: 'create' }, { resource: 'users', action: 'read' },
    { resource: 'users', action: 'update' }, { resource: 'users', action: 'delete' },
    { resource: 'users', action: 'assign' },
    { resource: 'roles', action: 'create' }, { resource: 'roles', action: 'read' },
    { resource: 'roles', action: 'update' }, { resource: 'roles', action: 'delete' },
    { resource: 'roles', action: 'assign' },
    { resource: 'permissions', action: 'create' }, { resource: 'permissions', action: 'read' },
    { resource: 'permissions', action: 'update' }, { resource: 'permissions', action: 'delete' },
    { resource: 'settings', action: 'read' }, { resource: 'settings', action: 'update' },
    { resource: 'audit_logs', action: 'read' }, { resource: 'audit_logs', action: 'export' },
    // Programme
    { resource: 'projects', action: 'create' }, { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' }, { resource: 'projects', action: 'delete' },
    { resource: 'projects', action: 'archive' }, { resource: 'projects', action: 'assign' },
    { resource: 'projects', action: 'approve' }, { resource: 'projects', action: 'export' },
    { resource: 'portfolio', action: 'read' }, { resource: 'portfolio', action: 'export' },
    { resource: 'analytics', action: 'read' }, { resource: 'analytics', action: 'export' },
    { resource: 'mmp', action: 'create' }, { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' }, { resource: 'mmp', action: 'delete' },
    { resource: 'mmp', action: 'approve' }, { resource: 'mmp', action: 'archive' },
    { resource: 'mmp', action: 'assign' }, { resource: 'mmp', action: 'export' },
    { resource: 'site_visits', action: 'create' }, { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' }, { resource: 'site_visits', action: 'delete' },
    { resource: 'site_visits', action: 'assign' }, { resource: 'site_visits', action: 'approve' },
    { resource: 'site_visits', action: 'export' },
    { resource: 'hub_operations', action: 'read' }, { resource: 'hub_operations', action: 'update' },
    // Field ops
    { resource: 'safety', action: 'read' }, { resource: 'safety', action: 'update' },
    { resource: 'incidents', action: 'read' }, { resource: 'incidents', action: 'update' },
    { resource: 'incidents', action: 'delete' },
    { resource: 'equipment', action: 'read' }, { resource: 'equipment', action: 'update' },
    { resource: 'coverage_map', action: 'read' },
    // Finance
    { resource: 'finances', action: 'create' }, { resource: 'finances', action: 'read' },
    { resource: 'finances', action: 'update' }, { resource: 'finances', action: 'delete' },
    { resource: 'finances', action: 'approve' }, { resource: 'finances', action: 'export' },
    { resource: 'wallets', action: 'create' }, { resource: 'wallets', action: 'read' },
    { resource: 'wallets', action: 'update' }, { resource: 'wallets', action: 'approve' },
    { resource: 'wallets', action: 'export' },
    { resource: 'accounting', action: 'read' }, { resource: 'accounting', action: 'export' },
    { resource: 'accounting', action: 'reverse' },
    { resource: 'down_payments', action: 'create' }, { resource: 'down_payments', action: 'read' },
    { resource: 'down_payments', action: 'update' }, { resource: 'down_payments', action: 'approve' },
    { resource: 'down_payments', action: 'mark_paid' },
    { resource: 'down_payments', action: 'reject' }, { resource: 'down_payments', action: 'delete' },
    { resource: 'down_payments', action: 'reconcile' },
    { resource: 'cost_submissions', action: 'create' }, { resource: 'cost_submissions', action: 'read' },
    { resource: 'cost_submissions', action: 'update' }, { resource: 'cost_submissions', action: 'approve' },
    { resource: 'cost_submissions', action: 'mark_paid' },
    { resource: 'cost_submissions', action: 'send_to_finance' },
    { resource: 'cost_submissions', action: 'recall' },
    { resource: 'cost_submissions', action: 'revert_tier' },
    { resource: 'cost_submissions', action: 'reconcile' },
    { resource: 'cost_submissions', action: 'delete' }, { resource: 'cost_submissions', action: 'export' },
    { resource: 'pre_funding', action: 'read' }, { resource: 'pre_funding', action: 'create' },
    { resource: 'pre_funding', action: 'approve' }, { resource: 'pre_funding', action: 'export' },
    { resource: 'pre_funding', action: 'update' }, { resource: 'pre_funding', action: 'close' },
    { resource: 'pre_funding', action: 'reconcile' },
    { resource: 'pre_funding', action: 'use_for_payment' },
    { resource: 'procurement', action: 'read' }, { resource: 'procurement', action: 'approve' },
    { resource: 'procurement', action: 'export' },
    { resource: 'fixed_assets', action: 'read' }, { resource: 'fixed_assets', action: 'export' },
    // HR
    { resource: 'hr', action: 'read' }, { resource: 'hr', action: 'update' },
    { resource: 'hr', action: 'export' },
    { resource: 'hr', action: 'create' }, { resource: 'hr', action: 'delete' },
    { resource: 'hr', action: 'submit' }, { resource: 'hr', action: 'approve' }, { resource: 'hr', action: 'send' },
    { resource: 'payroll', action: 'read' }, { resource: 'payroll', action: 'create' },
    { resource: 'payroll', action: 'update' }, { resource: 'payroll', action: 'approve' },
    { resource: 'payroll', action: 'export' },
    { resource: 'salary_advances', action: 'create' }, { resource: 'salary_advances', action: 'update' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' }, { resource: 'leave', action: 'approve' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'create' },
    { resource: 'benefits', action: 'submit' }, { resource: 'benefits', action: 'update' },
    { resource: 'benefits', action: 'approve' }, { resource: 'benefits', action: 'export' },
    { resource: 'succession', action: 'read' }, { resource: 'succession', action: 'update' },
    { resource: 'succession', action: 'export' },
    { resource: 'pulse_surveys', action: 'read' }, { resource: 'pulse_surveys', action: 'create' },
    { resource: 'pulse_surveys', action: 'update' }, { resource: 'pulse_surveys', action: 'export' },
    { resource: 'hr_analytics', action: 'read' }, { resource: 'hr_analytics', action: 'export' },
    // Tools
    { resource: 'surveys', action: 'create' }, { resource: 'surveys', action: 'read' },
    { resource: 'surveys', action: 'update' }, { resource: 'surveys', action: 'delete' },
    { resource: 'surveys', action: 'status' },
    { resource: 'surveys', action: 'export' },
    { resource: 'tasks', action: 'create' }, { resource: 'tasks', action: 'read' },
    { resource: 'tasks', action: 'update' }, { resource: 'tasks', action: 'delete' },
    { resource: 'tasks', action: 'assign' }, { resource: 'tasks', action: 'export' },
    { resource: 'notifications', action: 'read' }, { resource: 'notifications', action: 'create' },
    { resource: 'broadcast', action: 'create' }, { resource: 'broadcast', action: 'read' },
    { resource: 'calendar', action: 'read' }, { resource: 'calendar', action: 'create' },
    { resource: 'signatures', action: 'read' }, { resource: 'signatures', action: 'create' },
    { resource: 'integrations', action: 'read' }, { resource: 'integrations', action: 'update' },
    { resource: 'transactions', action: 'read' },
    // CRM & reports
    { resource: 'crm', action: 'create' }, { resource: 'crm', action: 'read' },
    { resource: 'crm', action: 'update' }, { resource: 'crm', action: 'delete' },
    { resource: 'crm', action: 'export' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'create' },
    { resource: 'reports', action: 'delete' }, { resource: 'reports', action: 'export' },
  ],

  // ── Senior / Executive Management ────────────────────────────────────────
  // Executive read + high-level approval across all modules.
  // No system settings, role management, or dev/backend access.
  SeniorManagement: [
    // Dashboards & portfolio
    { resource: 'portfolio', action: 'read' }, { resource: 'portfolio', action: 'export' },
    { resource: 'analytics', action: 'read' }, { resource: 'analytics', action: 'export' },
    { resource: 'projects', action: 'read' }, { resource: 'projects', action: 'approve' },
    { resource: 'projects', action: 'export' },
    // Finance — full read + executive approval
    { resource: 'finances', action: 'read' }, { resource: 'finances', action: 'approve' },
    { resource: 'finances', action: 'export' },
    { resource: 'cost_submissions', action: 'read' }, { resource: 'cost_submissions', action: 'approve' },
    { resource: 'cost_submissions', action: 'export' },
    { resource: 'down_payments', action: 'read' }, { resource: 'down_payments', action: 'approve' },
    { resource: 'down_payments', action: 'mark_paid' },
    { resource: 'down_payments', action: 'export' },
    { resource: 'pre_funding', action: 'read' }, { resource: 'pre_funding', action: 'approve' },
    { resource: 'pre_funding', action: 'export' },
    { resource: 'wallets', action: 'read' }, { resource: 'wallets', action: 'approve' },
    { resource: 'wallets', action: 'export' },
    { resource: 'accounting', action: 'read' }, { resource: 'accounting', action: 'export' },
    { resource: 'procurement', action: 'read' }, { resource: 'procurement', action: 'approve' },
    { resource: 'procurement', action: 'export' },
    { resource: 'fixed_assets', action: 'read' }, { resource: 'fixed_assets', action: 'export' },
    { resource: 'transactions', action: 'read' },
    // Operations — read
    { resource: 'mmp', action: 'read' }, { resource: 'mmp', action: 'export' },
    { resource: 'site_visits', action: 'read' }, { resource: 'site_visits', action: 'export' },
    { resource: 'hub_operations', action: 'read' },
    { resource: 'coverage_map', action: 'read' },
    { resource: 'safety', action: 'read' },
    { resource: 'incidents', action: 'read' },
    // HR — read + metrics
    { resource: 'hr', action: 'read' }, { resource: 'hr', action: 'export' },
    { resource: 'hr_analytics', action: 'read' }, { resource: 'hr_analytics', action: 'export' },
    { resource: 'payroll', action: 'read' }, { resource: 'payroll', action: 'export' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' }, { resource: 'leave', action: 'approve' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'submit' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'export' },
    { resource: 'succession', action: 'read' }, { resource: 'succession', action: 'approve' },
    { resource: 'pulse_surveys', action: 'read' },
    // Users — read only (for org chart / directory)
    { resource: 'users', action: 'read' },
    // Reports / CRM / tools
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'create' },
    { resource: 'reports', action: 'export' },
    { resource: 'crm', action: 'read' }, { resource: 'crm', action: 'export' },
    { resource: 'tasks', action: 'read' }, { resource: 'tasks', action: 'create' },
    { resource: 'tasks', action: 'update' }, { resource: 'tasks', action: 'assign' },
    { resource: 'notifications', action: 'read' },
    { resource: 'calendar', action: 'read' }, { resource: 'calendar', action: 'create' },
    { resource: 'signatures', action: 'read' },
    { resource: 'audit_logs', action: 'read' },
  ],

  // ── Country Director ─────────────────────────────────────────────────────
  CountryDirector: [
    { resource: 'mmp', action: 'read' }, { resource: 'mmp', action: 'export' },
    { resource: 'finances', action: 'read' }, { resource: 'finances', action: 'create' },
    { resource: 'finances', action: 'export' },
    { resource: 'cost_submissions', action: 'submit' }, { resource: 'cost_submissions', action: 'read' },
    { resource: 'wallets', action: 'read' }, { resource: 'wallets', action: 'update' },
    { resource: 'down_payments', action: 'read' }, { resource: 'down_payments', action: 'approve' },
    { resource: 'pre_funding', action: 'read' }, { resource: 'pre_funding', action: 'approve' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'export' },
    { resource: 'site_visits', action: 'read' },
    { resource: 'projects', action: 'read' }, { resource: 'portfolio', action: 'read' },
    { resource: 'analytics', action: 'read' },
    { resource: 'crm', action: 'read' },
    { resource: 'coverage_map', action: 'read' },
    { resource: 'notifications', action: 'read' },
    { resource: 'calendar', action: 'read' }, { resource: 'calendar', action: 'create' },
    { resource: 'tasks', action: 'read' }, { resource: 'tasks', action: 'create' },
    { resource: 'hr', action: 'read' },
    { resource: 'hr_analytics', action: 'read' }, { resource: 'hr_analytics', action: 'export' },
    { resource: 'pulse_surveys', action: 'read' },
    { resource: 'succession', action: 'read' }, { resource: 'succession', action: 'approve' },
  ],

  // ── ICT ─────────────────────────────────────────────────────────────────
  ICT: [
    { resource: 'users', action: 'create' }, { resource: 'users', action: 'read' },
    { resource: 'users', action: 'update' },
    { resource: 'roles', action: 'create' }, { resource: 'roles', action: 'read' },
    { resource: 'roles', action: 'update' },
    { resource: 'permissions', action: 'read' }, { resource: 'permissions', action: 'update' },
    { resource: 'settings', action: 'read' }, { resource: 'settings', action: 'update' },
    { resource: 'integrations', action: 'read' }, { resource: 'integrations', action: 'update' },
    { resource: 'projects', action: 'create' }, { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' }, { resource: 'projects', action: 'export' },
    { resource: 'mmp', action: 'create' }, { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' }, { resource: 'mmp', action: 'approve' },
    { resource: 'mmp', action: 'archive' }, { resource: 'mmp', action: 'export' },
    { resource: 'site_visits', action: 'create' }, { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'finances', action: 'read' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'create' },
    { resource: 'reports', action: 'export' },
    { resource: 'surveys', action: 'create' }, { resource: 'surveys', action: 'read' },
    { resource: 'surveys', action: 'update' }, { resource: 'surveys', action: 'delete' },
    { resource: 'crm', action: 'read' },
    { resource: 'audit_logs', action: 'read' },
    { resource: 'notifications', action: 'read' },
    { resource: 'broadcast', action: 'read' },
    { resource: 'whatsapp', action: 'read' }, { resource: 'whatsapp', action: 'update' },
    { resource: 'calendar', action: 'read' },
    { resource: 'tasks', action: 'read' }, { resource: 'tasks', action: 'create' },
    { resource: 'tasks', action: 'update' },
    { resource: 'pulse_surveys', action: 'create' }, { resource: 'pulse_surveys', action: 'read' },
    { resource: 'pulse_surveys', action: 'update' },
  ],

  // ── Field Operation Manager (FOM) ────────────────────────────────────────
  'Field Operation Manager (FOM)': [
    { resource: 'projects', action: 'read' }, { resource: 'projects', action: 'update' },
    { resource: 'projects', action: 'assign' }, { resource: 'projects', action: 'export' },
    { resource: 'portfolio', action: 'read' },
    { resource: 'mmp', action: 'create' }, { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' }, { resource: 'mmp', action: 'approve' },
    { resource: 'mmp', action: 'assign' }, { resource: 'mmp', action: 'export' },
    { resource: 'site_visits', action: 'create' }, { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' }, { resource: 'site_visits', action: 'assign' },
    { resource: 'site_visits', action: 'approve' }, { resource: 'site_visits', action: 'export' },
    { resource: 'hub_operations', action: 'read' }, { resource: 'hub_operations', action: 'update' },
    { resource: 'coverage_map', action: 'read' },
    { resource: 'safety', action: 'read' }, { resource: 'safety', action: 'update' },
    { resource: 'incidents', action: 'read' }, { resource: 'incidents', action: 'update' },
    { resource: 'equipment', action: 'read' }, { resource: 'equipment', action: 'update' },
    { resource: 'finances', action: 'read' }, { resource: 'finances', action: 'create' },
    { resource: 'finances', action: 'approve' }, { resource: 'finances', action: 'export' },
    { resource: 'cost_submissions', action: 'submit' }, { resource: 'cost_submissions', action: 'read' },
    { resource: 'cost_submissions', action: 'approve' }, { resource: 'cost_submissions', action: 'export' },
    { resource: 'down_payments', action: 'create' }, { resource: 'down_payments', action: 'read' },
    { resource: 'down_payments', action: 'submit' },
    { resource: 'wallets', action: 'read' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'export' },
    { resource: 'crm', action: 'create' }, { resource: 'crm', action: 'read' },
    { resource: 'crm', action: 'update' }, { resource: 'crm', action: 'export' },
    { resource: 'surveys', action: 'read' }, { resource: 'surveys', action: 'create' },
    { resource: 'surveys', action: 'status' },
    { resource: 'tasks', action: 'create' }, { resource: 'tasks', action: 'read' },
    { resource: 'tasks', action: 'update' }, { resource: 'tasks', action: 'assign' },
    { resource: 'notifications', action: 'read' },
    { resource: 'calendar', action: 'read' }, { resource: 'calendar', action: 'create' },
    { resource: 'signatures', action: 'read' }, { resource: 'signatures', action: 'create' },
    { resource: 'pulse_surveys', action: 'read' },
    { resource: 'succession', action: 'read' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'submit' },
  ],

  // ── Financial Admin ──────────────────────────────────────────────────────
  FinancialAdmin: [
    { resource: 'site_visits', action: 'read' },
    { resource: 'finances', action: 'read' }, { resource: 'finances', action: 'update' },
    { resource: 'finances', action: 'approve' }, { resource: 'finances', action: 'export' },
    { resource: 'cost_submissions', action: 'read' }, { resource: 'cost_submissions', action: 'approve' },
    { resource: 'cost_submissions', action: 'mark_paid' },
    { resource: 'cost_submissions', action: 'send_to_finance' },
    { resource: 'cost_submissions', action: 'recall' },
    { resource: 'cost_submissions', action: 'revert_tier' },
    { resource: 'cost_submissions', action: 'reconcile' },
    { resource: 'cost_submissions', action: 'export' },
    { resource: 'wallets', action: 'read' }, { resource: 'wallets', action: 'update' },
    { resource: 'wallets', action: 'approve' }, { resource: 'wallets', action: 'export' },
    { resource: 'accounting', action: 'read' }, { resource: 'accounting', action: 'create' },
    { resource: 'accounting', action: 'update' }, { resource: 'accounting', action: 'export' },
    { resource: 'down_payments', action: 'read' }, { resource: 'down_payments', action: 'approve' },
    { resource: 'down_payments', action: 'mark_paid' },
    { resource: 'down_payments', action: 'delete' }, { resource: 'down_payments', action: 'reconcile' },
    { resource: 'down_payments', action: 'export' },
    { resource: 'pre_funding', action: 'read' }, { resource: 'pre_funding', action: 'create' },
    { resource: 'pre_funding', action: 'approve' }, { resource: 'pre_funding', action: 'export' },
    { resource: 'pre_funding', action: 'use_for_payment' },
    { resource: 'procurement', action: 'read' }, { resource: 'procurement', action: 'create' },
    { resource: 'procurement', action: 'update' }, { resource: 'procurement', action: 'approve' },
    { resource: 'procurement', action: 'export' },
    { resource: 'fixed_assets', action: 'read' }, { resource: 'fixed_assets', action: 'create' },
    { resource: 'fixed_assets', action: 'update' }, { resource: 'fixed_assets', action: 'export' },
    { resource: 'mmp', action: 'archive' }, { resource: 'mmp', action: 'read' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'export' },
    { resource: 'crm', action: 'read' },
    { resource: 'audit_logs', action: 'read' },
    { resource: 'transactions', action: 'read' }, { resource: 'transactions', action: 'create' },
    { resource: 'notifications', action: 'read' },
    { resource: 'signatures', action: 'read' }, { resource: 'signatures', action: 'create' },
    { resource: 'payroll', action: 'read' }, { resource: 'payroll', action: 'create' },
    { resource: 'payroll', action: 'update' }, { resource: 'payroll', action: 'approve' }, { resource: 'payroll', action: 'export' },
    { resource: 'salary_advances', action: 'create' }, { resource: 'salary_advances', action: 'update' },
    { resource: 'hr', action: 'read' },
  ],

  // ── Project Manager ──────────────────────────────────────────────────────
  ProjectManager: [
    { resource: 'projects', action: 'create' }, { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' }, { resource: 'projects', action: 'delete' },
    { resource: 'projects', action: 'assign' }, { resource: 'projects', action: 'approve' },
    { resource: 'projects', action: 'archive' }, { resource: 'projects', action: 'export' },
    { resource: 'portfolio', action: 'read' }, { resource: 'analytics', action: 'read' },
    { resource: 'mmp', action: 'create' }, { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' }, { resource: 'mmp', action: 'approve' },
    { resource: 'mmp', action: 'assign' }, { resource: 'mmp', action: 'export' },
    { resource: 'site_visits', action: 'create' }, { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' }, { resource: 'site_visits', action: 'assign' },
    { resource: 'site_visits', action: 'approve' }, { resource: 'site_visits', action: 'export' },
    { resource: 'finances', action: 'read' }, { resource: 'finances', action: 'update' },
    { resource: 'finances', action: 'approve' }, { resource: 'finances', action: 'export' },
    { resource: 'cost_submissions', action: 'read' }, { resource: 'cost_submissions', action: 'export' },
    { resource: 'wallets', action: 'read' }, { resource: 'wallets', action: 'approve' },
    { resource: 'users', action: 'read' }, { resource: 'users', action: 'assign' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'submit' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'create' },
    { resource: 'reports', action: 'export' },
    { resource: 'audit_logs', action: 'read' },
    { resource: 'settings', action: 'read' },
    { resource: 'crm', action: 'create' }, { resource: 'crm', action: 'read' },
    { resource: 'crm', action: 'update' }, { resource: 'crm', action: 'export' },
    { resource: 'surveys', action: 'read' }, { resource: 'surveys', action: 'create' },
    { resource: 'tasks', action: 'create' }, { resource: 'tasks', action: 'read' },
    { resource: 'tasks', action: 'update' }, { resource: 'tasks', action: 'assign' },
    { resource: 'notifications', action: 'read' },
    { resource: 'calendar', action: 'read' }, { resource: 'calendar', action: 'create' },
    { resource: 'signatures', action: 'read' },
  ],

  // ── Senior Operations Lead ───────────────────────────────────────────────
  SeniorOperationsLead: [
    { resource: 'projects', action: 'read' }, { resource: 'projects', action: 'update' },
    { resource: 'projects', action: 'approve' }, { resource: 'projects', action: 'export' },
    { resource: 'portfolio', action: 'read' }, { resource: 'analytics', action: 'read' },
    { resource: 'mmp', action: 'read' }, { resource: 'mmp', action: 'update' },
    { resource: 'mmp', action: 'approve' }, { resource: 'mmp', action: 'export' },
    { resource: 'site_visits', action: 'read' }, { resource: 'site_visits', action: 'update' },
    { resource: 'site_visits', action: 'approve' }, { resource: 'site_visits', action: 'export' },
    { resource: 'finances', action: 'read' }, { resource: 'finances', action: 'update' },
    { resource: 'finances', action: 'approve' }, { resource: 'finances', action: 'override' },
    { resource: 'finances', action: 'export' },
    { resource: 'cost_submissions', action: 'read' }, { resource: 'cost_submissions', action: 'approve' },
    { resource: 'cost_submissions', action: 'export' },
    { resource: 'wallets', action: 'read' }, { resource: 'wallets', action: 'approve' },
    { resource: 'wallets', action: 'override' },
    { resource: 'users', action: 'read' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'create' },
    { resource: 'reports', action: 'export' },
    { resource: 'audit_logs', action: 'read' },
    { resource: 'settings', action: 'read' },
    { resource: 'crm', action: 'read' }, { resource: 'crm', action: 'export' },
    { resource: 'tasks', action: 'read' }, { resource: 'tasks', action: 'create' },
    { resource: 'notifications', action: 'read' },
    { resource: 'calendar', action: 'read' },
    { resource: 'hr', action: 'read' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'submit' },
    { resource: 'pulse_surveys', action: 'read' },
    { resource: 'succession', action: 'read' }, { resource: 'succession', action: 'update' },
    { resource: 'pre_funding', action: 'read' },
    { resource: 'procurement', action: 'read' },
  ],

  // ── Supervisor ───────────────────────────────────────────────────────────
  Supervisor: [
    { resource: 'mmp', action: 'read' }, { resource: 'mmp', action: 'update' },
    { resource: 'mmp', action: 'export' },
    { resource: 'site_visits', action: 'read' }, { resource: 'site_visits', action: 'update' },
    { resource: 'site_visits', action: 'export' },
    { resource: 'safety', action: 'read' },
    { resource: 'incidents', action: 'read' }, { resource: 'incidents', action: 'create' },
    { resource: 'cost_submissions', action: 'submit' }, { resource: 'cost_submissions', action: 'read' },
    { resource: 'cost_submissions', action: 'approve' }, { resource: 'cost_submissions', action: 'export' },
    { resource: 'down_payments', action: 'submit' }, { resource: 'down_payments', action: 'read' },
    { resource: 'down_payments', action: 'approve' },
    { resource: 'wallets', action: 'read' }, { resource: 'wallets', action: 'update' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'export' },
    { resource: 'tasks', action: 'read' }, { resource: 'tasks', action: 'create' },
    { resource: 'tasks', action: 'update' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' }, { resource: 'leave', action: 'approve' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'submit' },
    { resource: 'notifications', action: 'read' },
    { resource: 'calendar', action: 'read' },
    { resource: 'signatures', action: 'read' },
    { resource: 'pulse_surveys', action: 'read' }, { resource: 'pulse_surveys', action: 'submit' },
  ],

  // ── Coordinator ──────────────────────────────────────────────────────────
  Coordinator: [
    { resource: 'site_visits', action: 'read' }, { resource: 'site_visits', action: 'update' },
    { resource: 'site_visits', action: 'export' },
    { resource: 'mmp', action: 'read' }, { resource: 'mmp', action: 'export' },
    { resource: 'safety', action: 'read' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'submit' },
    { resource: 'incidents', action: 'read' }, { resource: 'incidents', action: 'create' },
    { resource: 'cost_submissions', action: 'submit' }, { resource: 'cost_submissions', action: 'read' },
    { resource: 'cost_submissions', action: 'export' },
    { resource: 'down_payments', action: 'submit' }, { resource: 'down_payments', action: 'read' },
    { resource: 'wallets', action: 'read' }, { resource: 'wallets', action: 'update' },
    { resource: 'reports', action: 'read' },
    { resource: 'tasks', action: 'read' }, { resource: 'tasks', action: 'create' },
    { resource: 'tasks', action: 'update' },
    { resource: 'notifications', action: 'read' },
    { resource: 'calendar', action: 'read' },
    { resource: 'signatures', action: 'read' },
    { resource: 'pulse_surveys', action: 'read' }, { resource: 'pulse_surveys', action: 'submit' },
  ],

  // ── Data Team ────────────────────────────────────────────────────────────
  DataTeam: [
    { resource: 'projects', action: 'read' }, { resource: 'analytics', action: 'read' },
    { resource: 'mmp', action: 'read' }, { resource: 'mmp', action: 'export' },
    { resource: 'site_visits', action: 'read' }, { resource: 'site_visits', action: 'export' },
    { resource: 'finances', action: 'read' }, { resource: 'finances', action: 'export' },
    { resource: 'cost_submissions', action: 'submit' }, { resource: 'cost_submissions', action: 'read' },
    { resource: 'cost_submissions', action: 'export' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'create' },
    { resource: 'reports', action: 'export' },
    { resource: 'users', action: 'read' },
    { resource: 'audit_logs', action: 'read' },
    { resource: 'crm', action: 'read' },
    { resource: 'surveys', action: 'create' }, { resource: 'surveys', action: 'read' },
    { resource: 'surveys', action: 'update' }, { resource: 'surveys', action: 'export' },
    { resource: 'tasks', action: 'read' }, { resource: 'tasks', action: 'create' },
    { resource: 'notifications', action: 'read' },
    { resource: 'transactions', action: 'read' }, { resource: 'transactions', action: 'create' },
    { resource: 'pulse_surveys', action: 'read' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'submit' },
  ],

  // ── Data Collector ───────────────────────────────────────────────────────
  DataCollector: [
    { resource: 'site_visits', action: 'read' }, { resource: 'site_visits', action: 'update' },
    { resource: 'site_visits', action: 'submit' },
    { resource: 'mmp', action: 'read' },
    { resource: 'safety', action: 'read' },
    { resource: 'incidents', action: 'create' }, { resource: 'incidents', action: 'read' },
    { resource: 'cost_submissions', action: 'submit' }, { resource: 'cost_submissions', action: 'read' },
    { resource: 'wallets', action: 'read' },
    { resource: 'tasks', action: 'read' }, { resource: 'tasks', action: 'update' },
    { resource: 'notifications', action: 'read' },
    { resource: 'surveys', action: 'read' }, { resource: 'surveys', action: 'submit' },
    { resource: 'pulse_surveys', action: 'read' }, { resource: 'pulse_surveys', action: 'submit' },
    { resource: 'leave', action: 'read' }, { resource: 'leave', action: 'create' },
    { resource: 'benefits', action: 'read' }, { resource: 'benefits', action: 'submit' },
  ],

  // ── Reviewer ─────────────────────────────────────────────────────────────
  Reviewer: [
    { resource: 'site_visits', action: 'read' },
    { resource: 'mmp', action: 'read' },
    { resource: 'reports', action: 'read' },
    { resource: 'surveys', action: 'read' },
    { resource: 'notifications', action: 'read' },
    { resource: 'tasks', action: 'read' },
  ],

  // ── Auditor ──────────────────────────────────────────────────────────────
  Auditor: [
    { resource: 'finances', action: 'read' }, { resource: 'finances', action: 'export' },
    { resource: 'cost_submissions', action: 'read' }, { resource: 'cost_submissions', action: 'export' },
    { resource: 'accounting', action: 'read' }, { resource: 'accounting', action: 'export' },
    { resource: 'wallets', action: 'read' }, { resource: 'wallets', action: 'export' },
    { resource: 'down_payments', action: 'read' }, { resource: 'down_payments', action: 'export' },
    { resource: 'pre_funding', action: 'read' }, { resource: 'pre_funding', action: 'export' },
    { resource: 'procurement', action: 'read' }, { resource: 'procurement', action: 'export' },
    { resource: 'fixed_assets', action: 'read' }, { resource: 'fixed_assets', action: 'export' },
    { resource: 'reports', action: 'read' }, { resource: 'reports', action: 'export' },
    { resource: 'audit_logs', action: 'read' }, { resource: 'audit_logs', action: 'export' },
    { resource: 'projects', action: 'read' },
    { resource: 'users', action: 'read' },
    { resource: 'settings', action: 'read' },
    { resource: 'crm', action: 'read' },
    { resource: 'hr', action: 'read' }, { resource: 'payroll', action: 'read' },
    { resource: 'benefits', action: 'read' },
    { resource: 'notifications', action: 'read' },
    { resource: 'transactions', action: 'read' },
    { resource: 'signatures', action: 'read' },
  ],
};

// Keep the historical default MMP report access for roles that had the
// generic MMP export permission, while storing each report as its own
// permission so administrators can revoke them independently.
for (const permissions of Object.values(DEFAULT_ROLE_PERMISSIONS)) {
  if (!permissions.some(p => p.resource === 'mmp' && p.action === 'export')) continue;
  for (const action of ['full_report', 'state_report', 'hub_report'] as const) {
    if (!permissions.some(p => p.resource === 'mmp' && p.action === action)) {
      permissions.push({ resource: 'mmp', action });
    }
  }
}
