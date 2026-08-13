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
      {
        page: 'User List',
        route: '/users',
        description: 'Standalone user directory — browse, filter, create, deactivate all accounts',
        actions: [
          { key: 'users:read',   label: 'View Users',        description: 'Browse all user accounts',         resource: 'users', action: 'read' },
          { key: 'users:create', label: 'Create User',       description: 'Add a new user account',           resource: 'users', action: 'create' },
          { key: 'users:update', label: 'Edit User',         description: 'Update user profile and details',  resource: 'users', action: 'update' },
          { key: 'users:delete', label: 'Deactivate User',   description: 'Deactivate or remove a user',      resource: 'users', action: 'delete', isDestructive: true },
          { key: 'users:export', label: 'Export User List',  description: 'Download user data to CSV/Excel',  resource: 'users', action: 'export' },
        ],
      },
      {
        page: 'Staff Directory',
        route: '/admin/staff-profiles',
        description: 'Detailed staff profile directory with contact info, documents, and org chart',
        actions: [
          { key: 'users:read',   label: 'View Staff Profiles', description: 'Browse staff profile cards',              resource: 'users', action: 'read' },
          { key: 'users:update', label: 'Edit Staff Profile',  description: 'Update contact and profile details',       resource: 'users', action: 'update' },
          { key: 'users:export', label: 'Export Staff List',   description: 'Download staff directory to Excel',        resource: 'users', action: 'export' },
        ],
      },
      {
        page: 'Departments',
        route: '/departments',
        description: 'Organisation department structure — create, edit, delete departments',
        actions: [
          { key: 'settings:read',   label: 'View Departments',   description: 'Browse department list',          resource: 'settings', action: 'read' },
          { key: 'settings:create', label: 'Create Department',  description: 'Add a new department',            resource: 'settings', action: 'create', isAdminOnly: true },
          { key: 'settings:update', label: 'Edit Department',    description: 'Rename or update a department',   resource: 'settings', action: 'update', isAdminOnly: true },
          { key: 'settings:delete', label: 'Delete Department',  description: 'Remove a department',             resource: 'settings', action: 'delete', isDestructive: true, isAdminOnly: true },
        ],
      },
      {
        page: 'Role Management',
        route: '/role-management',
        description: 'Standalone role management page — create and configure custom roles',
        actions: [
          { key: 'roles:read',   label: 'View Roles',   description: 'See all roles and their permissions',  resource: 'roles', action: 'read' },
          { key: 'roles:create', label: 'Create Role',  description: 'Define a new custom role',             resource: 'roles', action: 'create', isAdminOnly: true },
          { key: 'roles:update', label: 'Edit Role',    description: 'Modify a role permission set',         resource: 'roles', action: 'update', isAdminOnly: true },
          { key: 'roles:delete', label: 'Delete Role',  description: 'Remove a custom role',                 resource: 'roles', action: 'delete', isDestructive: true, isAdminOnly: true },
        ],
      },
      {
        page: 'Classifications',
        route: '/classifications',
        description: 'Site and CP classification tiers used across MMP and field operations',
        actions: [
          { key: 'settings:read',   label: 'View Classifications',  description: 'Browse classification tiers',       resource: 'settings', action: 'read' },
          { key: 'settings:create', label: 'Add Classification',    description: 'Create a new classification tier',  resource: 'settings', action: 'create', isAdminOnly: true },
          { key: 'settings:update', label: 'Edit Classification',   description: 'Update a tier definition',          resource: 'settings', action: 'update', isAdminOnly: true },
          { key: 'settings:delete', label: 'Delete Classification', description: 'Remove a classification tier',      resource: 'settings', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'settings:export', label: 'Export Classifications', description: 'Download classification data',     resource: 'settings', action: 'export' },
        ],
      },
      {
        page: 'Classification Fees',
        route: '/classification-fees',
        description: 'Per-classification fee schedules — enumerator and transport rates by tier',
        actions: [
          { key: 'settings:read',   label: 'View Fee Schedule',   description: 'Browse fee rates per classification',  resource: 'settings', action: 'read' },
          { key: 'settings:update', label: 'Edit Fee Schedule',   description: 'Update fee amounts per tier',          resource: 'settings', action: 'update', isAdminOnly: true },
          { key: 'settings:export', label: 'Export Fee Schedule', description: 'Download fee schedule data',           resource: 'settings', action: 'export' },
        ],
      },
      {
        page: 'Task Admin',
        route: '/task-admin',
        description: 'Admin-level task management — bulk operations, assignment overrides, archived tasks',
        actions: [
          { key: 'tasks:read',   label: 'View All Tasks',    description: 'Browse all tasks across users and projects', resource: 'tasks', action: 'read' },
          { key: 'tasks:update', label: 'Edit Any Task',     description: 'Modify or reassign any task',               resource: 'tasks', action: 'update', isAdminOnly: true },
          { key: 'tasks:delete', label: 'Delete Any Task',   description: 'Remove any task',                           resource: 'tasks', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'tasks:assign', label: 'Bulk Assign Tasks', description: 'Reassign tasks to different users in bulk', resource: 'tasks', action: 'assign', isAdminOnly: true },
          { key: 'tasks:export', label: 'Export Task Data',  description: 'Download task audit data to Excel',         resource: 'tasks', action: 'export' },
        ],
      },
      {
        page: 'Hub Management',
        route: '/hub-management',
        description: 'Standalone hub management — hub creation, coverage zones, manager assignment',
        actions: [
          { key: 'hub_operations:read',   label: 'View Hubs',   description: 'See hub list and coverage zones',     resource: 'hub_operations', action: 'read' },
          { key: 'hub_operations:create', label: 'Create Hub',  description: 'Add a new hub',                       resource: 'hub_operations', action: 'create', isAdminOnly: true },
          { key: 'hub_operations:update', label: 'Edit Hub',    description: 'Update hub configuration and zones',  resource: 'hub_operations', action: 'update', isAdminOnly: true },
          { key: 'hub_operations:delete', label: 'Delete Hub',  description: 'Remove a hub permanently',            resource: 'hub_operations', action: 'delete', isDestructive: true, isSuperAdminOnly: true },
        ],
      },
      {
        page: 'Integrations',
        route: '/integrations',
        description: 'Third-party integrations — calendar, email, WhatsApp, OCR, external APIs',
        actions: [
          { key: 'integrations:read',   label: 'View Integrations',   description: 'See configured integrations and status', resource: 'integrations', action: 'read' },
          { key: 'integrations:update', label: 'Manage Integrations', description: 'Connect or disconnect third-party services', resource: 'integrations', action: 'update', isAdminOnly: true },
        ],
      },
      {
        page: 'Permissions Management',
        route: '/permissions-management',
        description: 'Granular per-user permission overrides — grant or block individual actions',
        actions: [
          { key: 'permissions:read',     label: 'View Permissions',     description: 'See the full permission matrix',         resource: 'permissions', action: 'read' },
          { key: 'permissions:override', label: 'Override Permissions', description: 'Grant or revoke per-user permissions',   resource: 'permissions', action: 'override', isSuperAdminOnly: true },
        ],
      },
      {
        page: 'Role Perspective',
        route: '/role-perspective',
        description: 'Preview the application UI as any other role — impersonation for QA and support',
        actions: [
          { key: 'roles:read', label: 'View Role Perspective', description: 'Switch the UI to simulate another role', resource: 'roles', action: 'read', isAdminOnly: true },
        ],
      },
      {
        page: 'Page Access Control',
        route: '/page-access',
        description: 'Grant or restrict page-level access for individual users or role groups',
        actions: [
          { key: 'permissions:read',     label: 'View Page Access',   description: 'See per-user page grants',                resource: 'permissions', action: 'read' },
          { key: 'permissions:override', label: 'Manage Page Access', description: 'Grant or block page-level access per user', resource: 'permissions', action: 'override', isSuperAdminOnly: true },
        ],
      },
      {
        page: 'Recycle Bin',
        route: '/recycle-bin',
        description: 'Soft-deleted records — browse, restore, or permanently delete within 28-day window',
        actions: [
          { key: 'audit_logs:read',    label: 'View Recycle Bin',       description: 'Browse soft-deleted records',          resource: 'audit_logs', action: 'read', isSuperAdminOnly: true },
          { key: 'audit_logs:restore', label: 'Restore Deleted Record', description: 'Un-delete a soft-deleted item',        resource: 'audit_logs', action: 'restore', isSuperAdminOnly: true },
          { key: 'audit_logs:delete',  label: 'Permanently Delete',     description: 'Purge a record from the recycle bin',  resource: 'audit_logs', action: 'delete', isDestructive: true, isSuperAdminOnly: true },
        ],
      },
      {
        page: 'Project Flow Stages',
        route: '/admin/project-flow-stages',
        description: 'Configure project workflow stage templates used across all projects',
        actions: [
          { key: 'projects:read',   label: 'View Flow Stages', description: 'See all project workflow templates',  resource: 'projects', action: 'read', isSuperAdminOnly: true },
          { key: 'projects:create', label: 'Add Stage',        description: 'Add a new workflow stage template',   resource: 'projects', action: 'create', isSuperAdminOnly: true },
          { key: 'projects:update', label: 'Edit Stage',       description: 'Rename or reorder a stage template',  resource: 'projects', action: 'update', isSuperAdminOnly: true },
          { key: 'projects:delete', label: 'Delete Stage',     description: 'Remove a workflow stage template',    resource: 'projects', action: 'delete', isDestructive: true, isSuperAdminOnly: true },
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
      {
        page: 'Projects',
        route: '/projects',
        description: 'Standalone project list — browse all projects, filter by status, quick-open details',
        actions: [
          { key: 'projects:read',   label: 'View Projects',   description: 'Browse the full project list',              resource: 'projects', action: 'read' },
          { key: 'projects:create', label: 'Create Project',  description: 'Start a new project from the list page',    resource: 'projects', action: 'create' },
          { key: 'projects:export', label: 'Export Projects', description: 'Download project list to Excel',            resource: 'projects', action: 'export' },
        ],
      },
      {
        page: 'Project Updates',
        route: '/project-updates',
        description: 'Cross-project update feed — progress logs, milestone posts, and status changes',
        actions: [
          { key: 'projects:read',   label: 'View Project Updates', description: 'Browse update feed across all projects', resource: 'projects', action: 'read' },
          { key: 'projects:create', label: 'Post Update',          description: 'Add a progress update to a project',    resource: 'projects', action: 'create' },
          { key: 'projects:export', label: 'Export Updates',       description: 'Download project update log',           resource: 'projects', action: 'export' },
        ],
      },
      {
        page: 'Hub Operations',
        route: '/hub-operations',
        description: 'Operational hub overview — team assignments, site coverage, and hub KPIs',
        actions: [
          { key: 'hub_operations:read',   label: 'View Hub Operations', description: 'See hub operational overview',          resource: 'hub_operations', action: 'read' },
          { key: 'hub_operations:update', label: 'Edit Hub Operations', description: 'Update team assignments and coverage',   resource: 'hub_operations', action: 'update', isAdminOnly: true },
          { key: 'hub_operations:export', label: 'Export Hub Report',   description: 'Download hub operations report',        resource: 'hub_operations', action: 'export' },
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
      {
        page: 'Budget Requests',
        route: '/budget-requests',
        description: 'Project and operational budget requests — submit, review, and approve budgets',
        actions: [
          { key: 'finances:read',   label: 'View Budget Requests',   description: 'Browse all budget request submissions',  resource: 'finances', action: 'read' },
          { key: 'finances:create', label: 'Submit Budget Request',  description: 'Create a new budget request',            resource: 'finances', action: 'create' },
          { key: 'finances:approve', label: 'Approve Budget',        description: 'Approve or reject a budget request',     resource: 'finances', action: 'approve' },
          { key: 'finances:update', label: 'Edit Budget Request',    description: 'Modify a pending budget request',        resource: 'finances', action: 'update' },
          { key: 'finances:export', label: 'Export Budget Requests', description: 'Download budget request data to Excel',  resource: 'finances', action: 'export' },
        ],
      },
      {
        page: 'Tier 1 Approvals',
        route: '/supervisor-approvals',
        description: 'Supervisor-level (Tier 1) cost submission approvals queue',
        actions: [
          { key: 'cost_submissions:read',   label: 'View Tier 1 Queue',    description: 'See submissions awaiting Tier 1 approval',   resource: 'cost_submissions', action: 'read' },
          { key: 'cost_submissions:approve', label: 'Approve / Reject T1', description: 'Give Tier 1 approval or rejection',          resource: 'cost_submissions', action: 'approve' },
          { key: 'cost_submissions:export', label: 'Export T1 Report',     description: 'Download Tier 1 approval log',               resource: 'cost_submissions', action: 'export' },
        ],
      },
      {
        page: 'Tier 2 Approvals',
        route: '/withdrawal-approval',
        description: 'Finance manager (Tier 2) withdrawal approval queue',
        actions: [
          { key: 'cost_submissions:read',   label: 'View Tier 2 Queue',    description: 'See submissions awaiting Tier 2 approval',   resource: 'cost_submissions', action: 'read' },
          { key: 'cost_submissions:approve', label: 'Approve / Reject T2', description: 'Give Tier 2 approval or rejection',          resource: 'cost_submissions', action: 'approve' },
          { key: 'cost_submissions:export', label: 'Export T2 Report',     description: 'Download Tier 2 approval log',               resource: 'cost_submissions', action: 'export' },
        ],
      },
      {
        page: 'Finance Processing',
        route: '/finance-approval',
        description: 'Finance team payment processing — mark approved submissions as paid, issue disbursements',
        actions: [
          { key: 'finances:read',   label: 'View Finance Processing', description: 'See approved submissions ready for payment',  resource: 'finances', action: 'read' },
          { key: 'finances:approve', label: 'Mark as Paid',           description: 'Mark a submission as paid / disbursed',       resource: 'finances', action: 'approve' },
          { key: 'finances:update', label: 'Update Payment Details',  description: 'Add payment reference or adjust amount',      resource: 'finances', action: 'update' },
          { key: 'finances:export', label: 'Export Payment Report',   description: 'Download payment processing data',            resource: 'finances', action: 'export' },
        ],
      },
      {
        page: 'Approvals Hub',
        route: '/approvals',
        description: 'Unified approvals hub — all pending actions across cost, leave, and advance requests',
        actions: [
          { key: 'cost_submissions:read',   label: 'View Approvals Hub',    description: 'See all pending approval actions',           resource: 'cost_submissions', action: 'read' },
          { key: 'cost_submissions:approve', label: 'Approve Any Request',  description: 'Act on any pending approval in the hub',     resource: 'cost_submissions', action: 'approve' },
          { key: 'cost_submissions:export', label: 'Export Approvals Log',  description: 'Download approval hub summary',              resource: 'cost_submissions', action: 'export' },
        ],
      },
      {
        page: 'Approval Dashboard',
        route: '/approval-dashboard',
        description: 'Manager approval dashboard — KPIs, aging, and team approval metrics',
        actions: [
          { key: 'cost_submissions:read',   label: 'View Approval Dashboard', description: 'See approval metrics and aging KPIs',   resource: 'cost_submissions', action: 'read' },
          { key: 'cost_submissions:approve', label: 'Action from Dashboard',  description: 'Approve or reject directly from dashboard', resource: 'cost_submissions', action: 'approve' },
          { key: 'cost_submissions:export', label: 'Export Dashboard Data',   description: 'Download approval dashboard report',      resource: 'cost_submissions', action: 'export' },
        ],
      },
      {
        page: 'Down Payment Approval',
        route: '/down-payment-approval',
        description: 'Down payment (field advance) approval queue — review and approve advance requests',
        actions: [
          { key: 'down_payments:read',   label: 'View Down Payment Queue',   description: 'See pending advance requests',            resource: 'down_payments', action: 'read' },
          { key: 'down_payments:approve', label: 'Approve / Reject Advance', description: 'Approve or decline a down payment',       resource: 'down_payments', action: 'approve' },
          { key: 'down_payments:update', label: 'Edit Advance Amount',       description: 'Adjust the amount before approval',       resource: 'down_payments', action: 'update' },
          { key: 'down_payments:export', label: 'Export Approval Queue',     description: 'Download advance approval data',          resource: 'down_payments', action: 'export' },
        ],
      },
      {
        page: 'Cost Submission Reports',
        route: '/cost-submission/reports',
        description: 'Detailed cost submission analytics — by hub, staff, activity, and period',
        actions: [
          { key: 'cost_submissions:read',   label: 'View Cost Reports',   description: 'Access cost submission analytics',   resource: 'cost_submissions', action: 'read' },
          { key: 'cost_submissions:export', label: 'Export Cost Reports', description: 'Download cost report data to Excel',  resource: 'cost_submissions', action: 'export' },
        ],
      },
      {
        page: 'Wallet Reports',
        route: '/wallet-reports',
        description: 'Wallet transaction history — balances, top-ups, disbursements by user and period',
        actions: [
          { key: 'wallets:read',   label: 'View Wallet Reports',   description: 'Access wallet transaction analytics', resource: 'wallets', action: 'read' },
          { key: 'wallets:export', label: 'Export Wallet Reports', description: 'Download wallet history to Excel',    resource: 'wallets', action: 'export' },
        ],
      },
      {
        page: 'Advance Requests Report',
        route: '/advance-requests-report',
        description: 'Salary and field advance analytics — issued, recovered, outstanding balances',
        actions: [
          { key: 'down_payments:read',   label: 'View Advance Report',   description: 'See advance issuance and recovery data', resource: 'down_payments', action: 'read' },
          { key: 'down_payments:export', label: 'Export Advance Report', description: 'Download advance report to Excel',        resource: 'down_payments', action: 'export' },
        ],
      },
      {
        page: 'Down Payment Report',
        route: '/down-payment-advance-report',
        description: 'Detailed down payment aging — outstanding advances, days overdue, recovery status',
        actions: [
          { key: 'down_payments:read',   label: 'View Down Payment Report',   description: 'See aging and status of all advances',  resource: 'down_payments', action: 'read' },
          { key: 'down_payments:export', label: 'Export Down Payment Report', description: 'Download down payment aging to Excel',   resource: 'down_payments', action: 'export' },
        ],
      },
      {
        page: 'Enumerator Fees Report',
        route: '/enumerator-fees-report',
        description: 'Enumerator and transport fee analytics — totals by hub, classification, and period',
        actions: [
          { key: 'finances:read',   label: 'View Fees Report',   description: 'See enumerator fee totals and breakdowns', resource: 'finances', action: 'read' },
          { key: 'finances:export', label: 'Export Fees Report', description: 'Download enumerator fees to Excel',          resource: 'finances', action: 'export' },
        ],
      },
      {
        page: 'Month-End Summary',
        route: '/month-end-summary',
        description: 'Monthly financial close summary — cost totals, wallet movements, advance status',
        actions: [
          { key: 'finances:read',   label: 'View Month-End Summary',   description: 'Access monthly close summary',    resource: 'finances', action: 'read' },
          { key: 'finances:approve', label: 'Sign Off Month-End',       description: 'Approve the month-end close',    resource: 'finances', action: 'approve', isAdminOnly: true },
          { key: 'finances:export', label: 'Export Month-End Report',   description: 'Download month-end summary',     resource: 'finances', action: 'export' },
        ],
      },
      {
        page: 'Exchange Rates',
        route: '/exchange-rates',
        description: 'Multi-currency exchange rate management — set, update, and track FX rates',
        actions: [
          { key: 'accounting:read',   label: 'View Exchange Rates',   description: 'See current and historical FX rates',    resource: 'accounting', action: 'read' },
          { key: 'accounting:update', label: 'Update Exchange Rate',  description: 'Set a new exchange rate for a currency',  resource: 'accounting', action: 'update', isAdminOnly: true },
          { key: 'accounting:export', label: 'Export FX Rate History', description: 'Download exchange rate history',         resource: 'accounting', action: 'export' },
        ],
      },
      {
        page: 'Cost Predictions',
        route: '/cost-predictions',
        description: 'AI-powered cost forecasting — spending trends, burn rate, budget runway projections',
        actions: [
          { key: 'analytics:read',   label: 'View Cost Predictions', description: 'Access cost forecasting dashboard',  resource: 'analytics', action: 'read' },
          { key: 'analytics:export', label: 'Export Predictions',    description: 'Download forecast data to Excel',    resource: 'analytics', action: 'export' },
        ],
      },
      {
        page: 'Reconciliation Dashboard',
        route: '/reconciliation-dashboard',
        description: 'Bank and wallet reconciliation — match transactions, flag discrepancies',
        actions: [
          { key: 'accounting:read',    label: 'View Reconciliation',  description: 'Access the reconciliation dashboard',         resource: 'accounting', action: 'read' },
          { key: 'accounting:update',  label: 'Match / Clear Items',  description: 'Match transactions and clear reconciled items', resource: 'accounting', action: 'update', isAdminOnly: true },
          { key: 'accounting:approve', label: 'Sign Off Reconciliation', description: 'Approve a completed bank reconciliation',   resource: 'accounting', action: 'approve', isAdminOnly: true },
          { key: 'accounting:export',  label: 'Export Reconciliation', description: 'Download reconciliation report',             resource: 'accounting', action: 'export' },
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
      {
        page: 'Leave Requests',
        route: '/leave',
        description: 'Standalone leave request page — apply, track, and approve leave',
        actions: [
          { key: 'leave:read',   label: 'View Leave Requests', description: 'See all leave requests and balances',   resource: 'leave', action: 'read' },
          { key: 'leave:create', label: 'Apply for Leave',     description: 'Submit a new leave application',        resource: 'leave', action: 'create' },
          { key: 'leave:approve', label: 'Approve / Reject Leave', description: 'Approve or decline leave requests', resource: 'leave', action: 'approve' },
          { key: 'leave:update', label: 'Adjust Leave Balance', description: 'Manually adjust a leave balance',      resource: 'leave', action: 'update', isAdminOnly: true },
          { key: 'leave:export', label: 'Export Leave Report',  description: 'Download leave summary to Excel',      resource: 'leave', action: 'export' },
        ],
      },
      {
        page: 'Daily Work',
        route: '/daily-work',
        description: 'Daily work log — record activities, outputs, and time allocation per day',
        actions: [
          { key: 'tasks:read',   label: 'View Daily Work Log', description: 'Browse daily work entries',           resource: 'tasks', action: 'read' },
          { key: 'tasks:create', label: 'Log Daily Work',      description: 'Add a new daily work entry',          resource: 'tasks', action: 'create' },
          { key: 'tasks:update', label: 'Edit Work Entry',     description: 'Modify a daily work log entry',       resource: 'tasks', action: 'update' },
          { key: 'tasks:export', label: 'Export Work Log',     description: 'Download daily work log to Excel',    resource: 'tasks', action: 'export' },
        ],
      },
      {
        page: 'Team Task Monitor',
        route: '/team-tasks',
        description: 'Supervisor task monitoring — see all team tasks, progress, and blockers',
        actions: [
          { key: 'tasks:read',   label: 'View Team Tasks',     description: 'See all tasks across the supervised team', resource: 'tasks', action: 'read' },
          { key: 'tasks:update', label: 'Update Task Status',  description: 'Move or update a task on behalf of team',  resource: 'tasks', action: 'update' },
          { key: 'tasks:assign', label: 'Reassign Task',       description: 'Move a task to a different team member',   resource: 'tasks', action: 'assign' },
          { key: 'tasks:export', label: 'Export Team Tasks',   description: 'Download team task report',                resource: 'tasks', action: 'export' },
        ],
      },
      {
        page: 'My Team',
        route: '/my-team',
        description: 'Personal team view — direct reports, their status, leave, and tasks',
        actions: [
          { key: 'hr:read',   label: 'View My Team',        description: 'See direct reports and their status',    resource: 'hr', action: 'read' },
          { key: 'hr:export', label: 'Export Team Summary', description: 'Download team overview to Excel',        resource: 'hr', action: 'export' },
        ],
      },
      {
        page: 'My Advances',
        route: '/my-advances',
        description: 'Personal advance history — view issued advances and recovery schedule',
        actions: [
          { key: 'down_payments:read',   label: 'View My Advances',   description: 'See personal advance and recovery details', resource: 'down_payments', action: 'read' },
          { key: 'down_payments:submit', label: 'Request Advance',    description: 'Submit a new advance request',               resource: 'down_payments', action: 'submit' },
          { key: 'down_payments:export', label: 'Export Advance History', description: 'Download personal advance history',     resource: 'down_payments', action: 'export' },
        ],
      },
      {
        page: 'My Expenses',
        route: '/my-expenses',
        description: 'Personal expense tracking — view and manage submitted expense claims',
        actions: [
          { key: 'cost_submissions:read',   label: 'View My Expenses',   description: 'See personal expense submissions',       resource: 'cost_submissions', action: 'read' },
          { key: 'cost_submissions:submit', label: 'Submit Expense',      description: 'Create a new expense claim',             resource: 'cost_submissions', action: 'submit' },
          { key: 'cost_submissions:update', label: 'Edit Expense',        description: 'Modify a pending expense claim',         resource: 'cost_submissions', action: 'update' },
          { key: 'cost_submissions:export', label: 'Export Expenses',     description: 'Download personal expense history',      resource: 'cost_submissions', action: 'export' },
        ],
      },
      {
        page: 'Employees',
        route: '/employees',
        description: 'Employee registry — full staff list with salaries, contracts, and employment details',
        actions: [
          { key: 'hr:read',   label: 'View Employees',    description: 'Browse the full employee registry',      resource: 'hr', action: 'read' },
          { key: 'hr:create', label: 'Add Employee',      description: 'Register a new employee record',         resource: 'hr', action: 'create', isAdminOnly: true },
          { key: 'hr:update', label: 'Edit Employee',     description: 'Update employee details and contracts',  resource: 'hr', action: 'update', isAdminOnly: true },
          { key: 'hr:delete', label: 'Terminate Employee', description: 'Mark an employee as terminated',        resource: 'hr', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'hr:export', label: 'Export Employee List', description: 'Download employee registry to Excel', resource: 'hr', action: 'export' },
        ],
      },
      {
        page: 'Attendance',
        route: '/attendance',
        description: 'Staff attendance tracking — daily check-ins, absences, and attendance reports',
        actions: [
          { key: 'hr:read',   label: 'View Attendance',    description: 'Browse attendance records',              resource: 'hr', action: 'read' },
          { key: 'hr:create', label: 'Log Attendance',     description: 'Record a manual attendance entry',       resource: 'hr', action: 'create' },
          { key: 'hr:update', label: 'Edit Attendance',    description: 'Correct or update an attendance record', resource: 'hr', action: 'update', isAdminOnly: true },
          { key: 'hr:export', label: 'Export Attendance',  description: 'Download attendance report to Excel',    resource: 'hr', action: 'export' },
        ],
      },
      {
        page: 'Offboarding',
        route: '/offboarding',
        description: 'Employee offboarding workflow — checklist, asset return, final settlement',
        actions: [
          { key: 'hr:read',   label: 'View Offboarding',       description: 'See active offboarding cases',             resource: 'hr', action: 'read' },
          { key: 'hr:create', label: 'Start Offboarding',      description: 'Initiate offboarding for an employee',     resource: 'hr', action: 'create', isAdminOnly: true },
          { key: 'hr:update', label: 'Complete Offboarding Step', description: 'Mark a checklist step as done',         resource: 'hr', action: 'update' },
          { key: 'hr:export', label: 'Export Offboarding Summary', description: 'Download offboarding records',         resource: 'hr', action: 'export' },
        ],
      },
      {
        page: 'Staff Onboarding',
        route: '/staff-onboarding',
        description: 'New hire onboarding workflow — checklist, document collection, system setup',
        actions: [
          { key: 'hr:read',   label: 'View Onboarding Cases',  description: 'See active onboarding workflows',          resource: 'hr', action: 'read' },
          { key: 'hr:create', label: 'Start Onboarding',       description: 'Initiate onboarding for a new hire',       resource: 'hr', action: 'create', isAdminOnly: true },
          { key: 'hr:update', label: 'Complete Onboarding Step', description: 'Mark an onboarding checklist step done', resource: 'hr', action: 'update' },
          { key: 'hr:export', label: 'Export Onboarding Summary', description: 'Download onboarding status report',     resource: 'hr', action: 'export' },
        ],
      },
      {
        page: 'Performance Reviews',
        route: '/performance-reviews',
        description: 'Staff performance appraisals — create cycles, rate competencies, track goals',
        actions: [
          { key: 'hr_analytics:read',   label: 'View Performance Reviews', description: 'Browse all appraisal records',          resource: 'hr_analytics', action: 'read' },
          { key: 'hr_analytics:create', label: 'Create Review Cycle',      description: 'Launch a new performance review period', resource: 'hr_analytics', action: 'create', isAdminOnly: true },
          { key: 'hr_analytics:update', label: 'Submit / Rate Review',     description: 'Complete a performance appraisal form',  resource: 'hr_analytics', action: 'update' },
          { key: 'hr_analytics:approve', label: 'Approve Review',          description: 'Sign off on a completed appraisal',      resource: 'hr_analytics', action: 'approve', isAdminOnly: true },
          { key: 'hr_analytics:export', label: 'Export Reviews',           description: 'Download performance review data',       resource: 'hr_analytics', action: 'export' },
        ],
      },
      {
        page: 'Salary Increments',
        route: '/salary-increments',
        description: 'Salary increment proposals — submit, review, approve, and apply pay rises',
        actions: [
          { key: 'payroll:read',   label: 'View Increment Proposals', description: 'See all pending salary increments',   resource: 'payroll', action: 'read' },
          { key: 'payroll:create', label: 'Propose Increment',        description: 'Submit a salary increment proposal',  resource: 'payroll', action: 'create', isAdminOnly: true },
          { key: 'payroll:approve', label: 'Approve Increment',       description: 'Approve or reject an increment',      resource: 'payroll', action: 'approve', isAdminOnly: true },
          { key: 'payroll:update', label: 'Edit Increment',           description: 'Modify a proposed increment',         resource: 'payroll', action: 'update', isAdminOnly: true },
          { key: 'payroll:export', label: 'Export Increment Report',  description: 'Download salary increment data',      resource: 'payroll', action: 'export' },
        ],
      },
      {
        page: 'Training & Certifications',
        route: '/training-certifications',
        description: 'Staff training records, certification tracking, skill development plans',
        actions: [
          { key: 'hr:read',   label: 'View Training Records',  description: 'Browse training and certification history',   resource: 'hr', action: 'read' },
          { key: 'hr:create', label: 'Add Training Record',    description: 'Log a training session or certification',     resource: 'hr', action: 'create' },
          { key: 'hr:update', label: 'Edit Training Record',   description: 'Update training completion or certification',  resource: 'hr', action: 'update' },
          { key: 'hr:export', label: 'Export Training Report', description: 'Download training and certification data',     resource: 'hr', action: 'export' },
        ],
      },
      {
        page: 'Retainer Management',
        route: '/retainer-management',
        description: 'Retainer contracts for consultants and field staff — rates, terms, renewals',
        actions: [
          { key: 'payroll:read',   label: 'View Retainers',     description: 'Browse retainer contracts',              resource: 'payroll', action: 'read' },
          { key: 'payroll:create', label: 'Create Retainer',    description: 'Set up a new retainer contract',         resource: 'payroll', action: 'create', isAdminOnly: true },
          { key: 'payroll:update', label: 'Edit Retainer',      description: 'Update retainer terms or rate',          resource: 'payroll', action: 'update', isAdminOnly: true },
          { key: 'payroll:delete', label: 'Terminate Retainer', description: 'End a retainer contract',                resource: 'payroll', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'payroll:export', label: 'Export Retainers',   description: 'Download retainer contract data',        resource: 'payroll', action: 'export' },
        ],
      },
      {
        page: 'Payroll',
        route: '/payroll',
        description: 'Standalone payroll management — run payroll, approve variances, generate payslips',
        actions: [
          { key: 'payroll:read',   label: 'View Payroll',            description: 'Browse payroll runs and payslips',         resource: 'payroll', action: 'read' },
          { key: 'payroll:create', label: 'Run Payroll',             description: 'Generate a new monthly payroll run',       resource: 'payroll', action: 'create', isAdminOnly: true },
          { key: 'payroll:approve', label: 'Approve Payroll',        description: 'Sign off on a payroll run',                resource: 'payroll', action: 'approve', isAdminOnly: true },
          { key: 'payroll:update', label: 'Edit Salary / Override',  description: 'Adjust salary or override for a run',      resource: 'payroll', action: 'update', isAdminOnly: true },
          { key: 'payroll:delete', label: 'Delete Payroll Run',      description: 'Remove a payroll run record',              resource: 'payroll', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'payroll:export', label: 'Export Payroll / Bank File', description: 'Download payslips or bank transfer file', resource: 'payroll', action: 'export' },
        ],
      },
      {
        page: 'Positions',
        route: '/positions',
        description: 'Positions and vacancies registry — job grades, headcount, open roles',
        actions: [
          { key: 'hr:read',   label: 'View Positions',    description: 'Browse the positions and vacancies registry', resource: 'hr', action: 'read' },
          { key: 'hr:create', label: 'Create Position',   description: 'Add a new position to the registry',          resource: 'hr', action: 'create', isAdminOnly: true },
          { key: 'hr:update', label: 'Edit Position',     description: 'Update position details or grade band',        resource: 'hr', action: 'update', isAdminOnly: true },
          { key: 'hr:delete', label: 'Delete Position',   description: 'Remove a position from the registry',         resource: 'hr', action: 'delete', isDestructive: true, isSuperAdminOnly: true },
          { key: 'hr:export', label: 'Export Positions',  description: 'Download positions and vacancies to Excel',    resource: 'hr', action: 'export' },
        ],
      },
      {
        page: 'Salary & Retainer Report',
        route: '/salary-retainer-report',
        description: 'Compensation analytics — salary and retainer breakdowns by hub, grade, and period',
        actions: [
          { key: 'payroll:read',   label: 'View Salary Report',   description: 'Access salary and retainer analytics',   resource: 'payroll', action: 'read' },
          { key: 'payroll:export', label: 'Export Salary Report', description: 'Download compensation data to Excel',     resource: 'payroll', action: 'export' },
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
      {
        page: 'Data Quality Control',
        route: '/data-quality',
        description: 'Survey response quality checks — completeness scores, outlier flagging, validation rules',
        actions: [
          { key: 'surveys:read',   label: 'View Data Quality',    description: 'Access quality control dashboards',       resource: 'surveys', action: 'read' },
          { key: 'surveys:update', label: 'Flag / Clear Issues',  description: 'Flag data quality issues or clear flags', resource: 'surveys', action: 'update', isAdminOnly: true },
          { key: 'surveys:export', label: 'Export Quality Report', description: 'Download DQC report to Excel',           resource: 'surveys', action: 'export' },
        ],
      },
      {
        page: 'Questionnaire Analytics',
        route: '/questionnaire-analytics',
        description: 'Cross-survey analytics — response trends, completion rates, question-level analysis',
        actions: [
          { key: 'surveys:read',   label: 'View Questionnaire Analytics', description: 'Access cross-survey analytics',    resource: 'surveys', action: 'read' },
          { key: 'surveys:export', label: 'Export Analytics',             description: 'Download questionnaire analytics', resource: 'surveys', action: 'export' },
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
      {
        page: 'Call Analytics',
        route: '/call-analytics',
        description: 'Call duration, quality metrics, per-user call logs, and WebRTC analytics',
        actions: [
          { key: 'analytics:read',   label: 'View Call Analytics', description: 'Access call metrics and logs dashboard', resource: 'analytics', action: 'read' },
          { key: 'analytics:export', label: 'Export Call Data',    description: 'Download call analytics to Excel',       resource: 'analytics', action: 'export' },
        ],
      },
      {
        page: 'Chat',
        route: '/chat',
        description: 'Direct messaging, group channels, file sharing, and in-app chat notifications',
        actions: [
          { key: 'notifications:read',   label: 'View Chat',       description: 'Read chat messages and channel history', resource: 'notifications', action: 'read' },
          { key: 'notifications:create', label: 'Send Message',    description: 'Post a message to a chat channel',       resource: 'notifications', action: 'create' },
          { key: 'notifications:delete', label: 'Delete Message',  description: 'Remove a chat message (admin only)',     resource: 'notifications', action: 'delete', isDestructive: true, isAdminOnly: true },
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
      {
        page: 'Sites for Verification',
        route: '/coordinator/sites-for-verification',
        description: 'Queue of site visits awaiting coordinator quality verification',
        actions: [
          { key: 'site_visits:read',    label: 'View Pending Verifications', description: 'See sites queued for verification',      resource: 'site_visits', action: 'read' },
          { key: 'site_visits:approve', label: 'Verify / Reject Visit',      description: 'Mark a site as verified or rejected',    resource: 'site_visits', action: 'approve' },
          { key: 'site_visits:update',  label: 'Add Verification Notes',     description: 'Annotate a visit with quality feedback',  resource: 'site_visits', action: 'update' },
          { key: 'site_visits:export',  label: 'Export Verification Report', description: 'Download pending verification summary',   resource: 'site_visits', action: 'export' },
        ],
      },
      {
        page: 'MMP Management Admin',
        route: '/mmp-management',
        description: 'Admin-level MMP file management — cycle configuration, bulk operations',
        actions: [
          { key: 'mmp:read',    label: 'View MMP Management',  description: 'Browse MMP admin panel',                  resource: 'mmp', action: 'read' },
          { key: 'mmp:create',  label: 'Create MMP Config',    description: 'Set up a new MMP cycle configuration',    resource: 'mmp', action: 'create', isAdminOnly: true },
          { key: 'mmp:update',  label: 'Edit MMP Config',      description: 'Modify MMP settings and parameters',      resource: 'mmp', action: 'update', isAdminOnly: true },
          { key: 'mmp:delete',  label: 'Delete MMP Config',    description: 'Remove an MMP configuration',             resource: 'mmp', action: 'delete', isDestructive: true, isAdminOnly: true },
          { key: 'mmp:archive', label: 'Archive MMP Cycle',    description: 'Close and archive a completed MMP cycle', resource: 'mmp', action: 'archive', isAdminOnly: true },
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
      {
        page: 'Monitoring Form',
        route: '/monitoring-form',
        description: 'Digital field monitoring form — complete and submit site monitoring checklists',
        actions: [
          { key: 'site_visits:read',   label: 'View Monitoring Form', description: 'Access the monitoring form interface',     resource: 'site_visits', action: 'read' },
          { key: 'site_visits:create', label: 'Submit Monitoring Form', description: 'Fill in and submit a monitoring form',   resource: 'site_visits', action: 'create' },
          { key: 'site_visits:update', label: 'Edit Draft Form',       description: 'Update a saved draft monitoring form',    resource: 'site_visits', action: 'update' },
        ],
      },
      {
        page: 'Safety Hub',
        route: '/safety-hub',
        description: 'Standalone safety hub — safety briefings, SOP repository, safety status board',
        actions: [
          { key: 'safety:read',   label: 'View Safety Hub',     description: 'Access safety information and SOPs',  resource: 'safety', action: 'read' },
          { key: 'safety:create', label: 'Create Safety Alert', description: 'Issue a new safety alert',            resource: 'safety', action: 'create', isAdminOnly: true },
          { key: 'safety:update', label: 'Update Safety Status', description: 'Post safety updates and briefings',  resource: 'safety', action: 'update', isAdminOnly: true },
          { key: 'safety:export', label: 'Export Safety Report', description: 'Download safety status report',      resource: 'safety', action: 'export' },
        ],
      },
      {
        page: 'Incident Reports',
        route: '/incident-reports',
        description: 'Standalone incident report list — log, track, and resolve field incidents',
        actions: [
          { key: 'incidents:read',   label: 'View Incidents',        description: 'See all incident reports',               resource: 'incidents', action: 'read' },
          { key: 'incidents:create', label: 'Report Incident',       description: 'Submit a new incident report',           resource: 'incidents', action: 'create' },
          { key: 'incidents:update', label: 'Update Incident',       description: 'Modify or resolve an incident record',   resource: 'incidents', action: 'update' },
          { key: 'incidents:delete', label: 'Delete Incident',       description: 'Remove an incident report',              resource: 'incidents', action: 'delete', isDestructive: true },
          { key: 'incidents:export', label: 'Export Incident Report', description: 'Download incident data to Excel',        resource: 'incidents', action: 'export' },
        ],
      },
      {
        page: 'Equipment',
        route: '/equipment',
        description: 'Standalone equipment registry — asset tracking, assignment, maintenance',
        actions: [
          { key: 'equipment:read',   label: 'View Equipment',    description: 'Browse the equipment registry',        resource: 'equipment', action: 'read' },
          { key: 'equipment:create', label: 'Add Equipment',     description: 'Register new equipment or assets',     resource: 'equipment', action: 'create' },
          { key: 'equipment:update', label: 'Update Equipment',  description: 'Edit equipment records and status',    resource: 'equipment', action: 'update' },
          { key: 'equipment:assign', label: 'Assign Equipment',  description: 'Assign equipment to a staff member',   resource: 'equipment', action: 'assign' },
          { key: 'equipment:delete', label: 'Remove Equipment',  description: 'Delete an equipment record',           resource: 'equipment', action: 'delete', isDestructive: true },
          { key: 'equipment:export', label: 'Export Equipment',  description: 'Download equipment registry to Excel', resource: 'equipment', action: 'export' },
        ],
      },
      {
        page: 'Field Operation Manager',
        route: '/field-operation-manager',
        description: 'FOM dashboard — hub overviews, team performance, and operational metrics',
        actions: [
          { key: 'hub_operations:read',   label: 'View FOM Dashboard',   description: 'Access the field operations manager view', resource: 'hub_operations', action: 'read' },
          { key: 'hub_operations:update', label: 'Manage Field Ops',     description: 'Update operational assignments and plans',  resource: 'hub_operations', action: 'update' },
          { key: 'hub_operations:export', label: 'Export FOM Report',    description: 'Download field operations summary',         resource: 'hub_operations', action: 'export' },
        ],
      },
      {
        page: 'Coverage Map',
        route: '/coverage-map',
        description: 'Interactive Leaflet map — geographic site coverage, hub zones, enumerator positions',
        actions: [
          { key: 'coverage_map:read',   label: 'View Coverage Map',   description: 'See geographic site and hub coverage',   resource: 'coverage_map', action: 'read' },
          { key: 'coverage_map:update', label: 'Update Coverage Zone', description: 'Adjust hub coverage zone boundaries',    resource: 'coverage_map', action: 'update', isAdminOnly: true },
          { key: 'coverage_map:export', label: 'Export Coverage Data', description: 'Download coverage map data',             resource: 'coverage_map', action: 'export' },
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

  // ─── My Workspace ────────────────────────────────────────────────────────
  {
    module: 'My Workspace',
    icon: 'LayoutDashboard',
    color: 'sky',
    description: 'Personal dashboard, project list, and user workspace',
    pages: [
      {
        page: 'Dashboard',
        route: '/dashboard',
        description: 'Personal operational dashboard — KPI cards, pending actions, quick-access widgets',
        actions: [
          { key: 'analytics:read',   label: 'View Dashboard',       description: 'Access the main dashboard',             resource: 'analytics', action: 'read' },
          { key: 'analytics:export', label: 'Export Dashboard Data', description: 'Download dashboard snapshot to Excel', resource: 'analytics', action: 'export' },
        ],
      },
      {
        page: 'My Projects',
        route: '/my-projects',
        description: 'Personal project list — projects where the user is a team member or PM',
        actions: [
          { key: 'projects:read',   label: 'View My Projects',   description: 'Browse personally assigned projects',    resource: 'projects', action: 'read' },
          { key: 'projects:update', label: 'Update Project',     description: 'Log progress or update a project detail', resource: 'projects', action: 'update' },
          { key: 'projects:export', label: 'Export My Projects', description: 'Download personal project list',          resource: 'projects', action: 'export' },
        ],
      },
    ],
  },

  // ─── Analytics & Reports ─────────────────────────────────────────────────
  {
    module: 'Analytics & Reports',
    icon: 'BarChart2',
    color: 'violet',
    description: 'Notification analytics, data exports, documents, field data, and executive dashboards',
    pages: [
      {
        page: 'Notification Analytics',
        route: '/notification-analytics',
        description: 'In-app and WhatsApp notification delivery metrics — open rates, failures, trends',
        actions: [
          { key: 'notifications:read',   label: 'View Notification Analytics', description: 'Access delivery analytics dashboard', resource: 'notifications', action: 'read' },
          { key: 'notifications:export', label: 'Export Analytics',            description: 'Download notification analytics',     resource: 'notifications', action: 'export' },
        ],
      },
      {
        page: 'Data Export Center',
        route: '/data-export-center',
        description: 'Bulk data export hub — structured Excel/CSV exports across all modules',
        actions: [
          { key: 'reports:read',   label: 'View Export Center',  description: 'Access the data export interface',     resource: 'reports', action: 'read' },
          { key: 'reports:create', label: 'Generate Export',     description: 'Initiate a data export job',           resource: 'reports', action: 'create' },
          { key: 'reports:export', label: 'Download Export',     description: 'Download a completed export file',     resource: 'reports', action: 'export' },
        ],
      },
      {
        page: 'Data Visibility',
        route: '/data-visibility',
        description: 'Column-level data visibility rules — control which fields each role can see',
        actions: [
          { key: 'analytics:read',     label: 'View Visibility Rules',   description: 'See data visibility configuration',      resource: 'analytics', action: 'read' },
          { key: 'analytics:update',   label: 'Edit Visibility Rules',   description: 'Modify column-level visibility per role', resource: 'analytics', action: 'update', isAdminOnly: true },
        ],
      },
      {
        page: 'Documents',
        route: '/documents',
        description: 'Document library — upload, organise, and share project and HR documents',
        actions: [
          { key: 'reports:read',   label: 'View Documents',    description: 'Browse the document library',          resource: 'reports', action: 'read' },
          { key: 'reports:create', label: 'Upload Document',   description: 'Add a new document to the library',    resource: 'reports', action: 'create' },
          { key: 'reports:update', label: 'Edit Document',     description: 'Rename or update document metadata',   resource: 'reports', action: 'update' },
          { key: 'reports:delete', label: 'Delete Document',   description: 'Remove a document from the library',   resource: 'reports', action: 'delete', isDestructive: true },
          { key: 'reports:export', label: 'Download Document', description: 'Download or export a document',        resource: 'reports', action: 'export' },
        ],
      },
      {
        page: 'Archive',
        route: '/archive',
        description: 'Archived records — read-only historical data across all modules',
        actions: [
          { key: 'reports:read',    label: 'View Archive',    description: 'Browse archived records',              resource: 'reports', action: 'read' },
          { key: 'reports:restore', label: 'Restore Record',  description: 'Move a record out of the archive',     resource: 'reports', action: 'restore', isAdminOnly: true },
          { key: 'reports:export',  label: 'Export Archive',  description: 'Download archived data to Excel',      resource: 'reports', action: 'export' },
        ],
      },
      {
        page: 'DCT PDM Dashboard',
        route: '/dct-pdm',
        description: 'Data Collector / PDM performance dashboard — output metrics and submission quality',
        actions: [
          { key: 'analytics:read',   label: 'View DCT/PDM Dashboard', description: 'Access DC performance analytics', resource: 'analytics', action: 'read' },
          { key: 'analytics:export', label: 'Export DCT/PDM Report',  description: 'Download performance metrics',    resource: 'analytics', action: 'export' },
        ],
      },
      {
        page: 'Field Data Hub',
        route: '/field-data',
        description: 'Centralised field data management — raw collection data, quality flags, exports',
        actions: [
          { key: 'analytics:read',   label: 'View Field Data',    description: 'Access raw field data records',       resource: 'analytics', action: 'read' },
          { key: 'analytics:update', label: 'Clean / Flag Data',  description: 'Apply corrections or quality flags',  resource: 'analytics', action: 'update', isAdminOnly: true },
          { key: 'analytics:export', label: 'Export Field Data',  description: 'Download field data to Excel/CSV',    resource: 'analytics', action: 'export' },
        ],
      },
      {
        page: 'Executive Dashboard',
        route: '/executive',
        description: 'Country Director / CD-level executive overview — programme health and financial KPIs',
        actions: [
          { key: 'analytics:read',   label: 'View Executive Dashboard', description: 'Access executive-level KPI summary', resource: 'analytics', action: 'read' },
          { key: 'analytics:export', label: 'Export Executive Report',  description: 'Download executive summary to PDF',  resource: 'analytics', action: 'export' },
        ],
      },
    ],
  },

  // ─── Audit & Security ─────────────────────────────────────────────────────
  {
    module: 'Audit & Security',
    icon: 'Shield',
    color: 'red',
    description: 'System audit trails, compliance monitoring, login analytics, and hierarchy audits',
    pages: [
      {
        page: 'Hierarchy Audit',
        route: '/hierarchy-audit',
        description: 'Organisational hierarchy change log — role changes, reporting line updates',
        actions: [
          { key: 'audit_logs:read',   label: 'View Hierarchy Audit', description: 'Browse hierarchy change audit trail', resource: 'audit_logs', action: 'read' },
          { key: 'audit_logs:export', label: 'Export Hierarchy Audit', description: 'Download hierarchy audit log',       resource: 'audit_logs', action: 'export' },
        ],
      },
      {
        page: 'Audit & Compliance',
        route: '/audit-compliance',
        description: 'Compliance dashboard — control checklist, policy adherence, audit findings',
        actions: [
          { key: 'audit_logs:read',   label: 'View Compliance Dashboard', description: 'Access audit and compliance status',     resource: 'audit_logs', action: 'read' },
          { key: 'audit_logs:update', label: 'Update Compliance Record',  description: 'Mark compliance items as complete',      resource: 'audit_logs', action: 'update', isAdminOnly: true },
          { key: 'audit_logs:export', label: 'Export Compliance Report',  description: 'Download compliance report to Excel',    resource: 'audit_logs', action: 'export' },
        ],
      },
      {
        page: 'System Audit Logs',
        route: '/audit-logs',
        description: 'Standalone full-system audit log — all user actions with timestamps and context',
        actions: [
          { key: 'audit_logs:read',    label: 'View Audit Logs',    description: 'Browse system-wide audit trail',           resource: 'audit_logs', action: 'read' },
          { key: 'audit_logs:export',  label: 'Export Audit Logs',  description: 'Download audit log data to Excel',         resource: 'audit_logs', action: 'export' },
          { key: 'audit_logs:restore', label: 'Restore from Audit', description: 'Use audit trail to restore a past value',  resource: 'audit_logs', action: 'restore', isSuperAdminOnly: true },
        ],
      },
      {
        page: 'Login Analytics',
        route: '/login-analytics',
        description: 'User session and login analytics — active users, session duration, failed logins',
        actions: [
          { key: 'audit_logs:read',   label: 'View Login Analytics', description: 'Access login and session metrics',    resource: 'audit_logs', action: 'read' },
          { key: 'audit_logs:export', label: 'Export Login Report',  description: 'Download login analytics to Excel',   resource: 'audit_logs', action: 'export' },
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
