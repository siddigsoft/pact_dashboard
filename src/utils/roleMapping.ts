/**
 * Role Mapping Utility
 * 
 * Provides bidirectional mapping between database role codes (camelCase)
 * and TypeScript AppRole labels (PascalCase) for type safety and consistency.
 */

// Database role codes (matches Supabase app_role enum)
export type RoleCode = 
  | 'superAdmin'
  | 'admin'
  | 'countryDirector'
  | 'ict'
  | 'fom'
  | 'financialAdmin'
  | 'projectManager'
  | 'seniorOperationsLead'
  | 'supervisor'
  | 'coordinator'
  | 'dataTeam'
  | 'dataCollector'
  | 'reviewer'
  | 'auditor'
  | 'employee'
  | 'hr'
  | 'hrManager';

// UI display labels
export type RoleLabel =
  | 'Super Admin'
  | 'Admin'
  | 'Country Director'
  | 'ICT'
  | 'Field Operation Manager (FOM)'
  | 'Financial Admin'
  | 'Project Manager'
  | 'Senior Operations Lead'
  | 'Supervisor'
  | 'Coordinator'
  | 'Data Team'
  | 'Data Collector'
  | 'Reviewer'
  | 'Auditor'
  | 'Employee'
  | 'HR'
  | 'HR Manager';

// Role configuration type
type RoleConfig = {
  code: RoleCode;
  label: RoleLabel;
  legacy: string[];
  hidden?: boolean; // If true, hide from role selection dropdowns
  description: string; // Short explanation shown as a hint in role dropdowns
  affects: string;     // Which areas of the app this role controls
};

// Comprehensive role mapping
export const ROLE_MAP: Record<RoleCode, RoleConfig> = {
  superAdmin: {
    code: 'superAdmin',
    label: 'Super Admin',
    legacy: ['SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin'],
    hidden: true,
    description: 'Full platform ownership. Bypasses all permission checks. Can appoint/remove other Super Admins and change any user\'s role including Admin.',
    affects: 'All pages — unrestricted access to every feature, setting, and financial record.',
  },
  admin: {
    code: 'admin',
    label: 'Admin',
    legacy: ['Admin', 'admin'],
    description: 'Senior management role with broad operational and financial access. Cannot change Super Admin accounts or platform settings.',
    affects: 'Admin Hub, User Management, Finance approvals, Down-Payments (Tier 2), HR Hub, MMP Management, Reports.',
  },
  countryDirector: {
    code: 'countryDirector',
    label: 'Country Director',
    legacy: ['CountryDirector', 'countryDirector', 'country_director', 'Country Director'],
    description: 'Senior leadership with full read access across all hubs and high-level approval authority.',
    affects: 'Portfolio Dashboard, Finance approvals, Monitoring, MMP Management, all operational reports.',
  },
  ict: {
    code: 'ict',
    label: 'ICT',
    legacy: ['ICT', 'ict'],
    description: 'IT management role. Manages system settings, integrations, and user technical accounts.',
    affects: 'System settings, Integration configs, User Management, Audit logs.',
  },
  fom: {
    code: 'fom',
    label: 'Field Operation Manager (FOM)',
    legacy: ['Field Operation Manager (FOM)', 'fom', 'fieldOpManager'],
    description: 'Oversees all field operations across hubs. Manages site visits, MMP cycles, and field staff.',
    affects: 'MMP Management, Site Visits, Field Ops Hub, Coordinator management, Down-Payments.',
  },
  financialAdmin: {
    code: 'financialAdmin',
    label: 'Financial Admin',
    legacy: ['FinancialAdmin', 'financialAdmin', 'financial_admin', 'Financial Admin'],
    description: 'Full financial management access. Handles accounting, approvals, and all money-related operations.',
    affects: 'Finance Hub, Cost Submissions, Down-Payments, Wallet, Accounting, Budget, Cash Flow.',
  },
  projectManager: {
    code: 'projectManager',
    label: 'Project Manager',
    legacy: ['ProjectManager', 'projectManager', 'project_manager', 'Project Manager'],
    description: 'Manages project lifecycles, tasks, and milestones. No access to financial approvals or HR.',
    affects: 'Project Flow, Tasks, Gantt, Portfolio Dashboard, Project Analytics.',
  },
  seniorOperationsLead: {
    code: 'seniorOperationsLead',
    label: 'Senior Operations Lead',
    legacy: ['SeniorOperationsLead', 'seniorOperationsLead', 'senior_operations_lead', 'Senior Operations Lead'],
    description: 'Senior oversight of operational activities. Read access to all hub operations and reporting.',
    affects: 'Monitoring Dashboard, MMP overview, Site Visit reports, Operational analytics.',
  },
  supervisor: {
    code: 'supervisor',
    label: 'Supervisor',
    legacy: ['Supervisor', 'supervisor'],
    description: 'Hub-level supervision. Reviews Tier 1 down-payment requests and manages coordinators in their hub.',
    affects: 'Down-Payments (Tier 1 approval), Coordinator oversight, Site Visits, Hub reports.',
  },
  coordinator: {
    code: 'coordinator',
    label: 'Coordinator',
    legacy: ['Coordinator', 'coordinator'],
    description: 'Coordinates and manages site visits and field activities within an assigned hub or locality.',
    affects: 'MMP (assigned sites), Site Visits, Down-Payment requests, Field Ops Hub.',
  },
  dataTeam: {
    code: 'dataTeam',
    label: 'Data Team',
    legacy: ['DataTeam', 'dataTeam', 'data_team', 'Data Team'],
    description: 'Data management and quality control. Can review, edit, and manage site entry data across hubs.',
    affects: 'Data Tools, Site Entry Management, MMP data, Surveys, Reporting.',
  },
  dataCollector: {
    code: 'dataCollector',
    label: 'Data Collector',
    legacy: ['DataCollector', 'dataCollector', 'data_collector', 'Data Collector', 'datacollector'],
    description: 'Field staff with the most restricted access. Can only see their own assigned sites and personal workspace.',
    affects: 'My Sites, My Expenses, My Tasks, My Wallet — personal workspace only. No admin pages.',
  },
  reviewer: {
    code: 'reviewer',
    label: 'Reviewer',
    legacy: ['Reviewer', 'reviewer'],
    description: 'Read-only review access to submissions and reports. Cannot approve, edit, or create records.',
    affects: 'Submission review queue, Reports (read-only). No write access to any operational pages.',
  },
  auditor: {
    code: 'auditor',
    label: 'Auditor',
    legacy: ['Auditor', 'auditor'],
    description: 'Read-only access to all financial, HR, and operational data for audit and compliance purposes. Cannot approve, modify, or delete any data.',
    affects: 'Finance Hub (read+export), Accounting, Wallets, HR payroll/benefits, Audit Logs — no write access anywhere.',
  },
  employee: {
    code: 'employee',
    label: 'Employee',
    legacy: ['Employee', 'employee'],
    description: 'Internal staff member with personal workspace only. Cannot access operational or admin pages.',
    affects: 'My Payslip, My Leave, My Tasks, My Profile — personal HR tools only.',
  },
  // HR roles — used by the new HR Hub pages (LeaveRequests, PerformanceReviews,
  // SalaryIncrements, Positions, TrainingCertifications, HierarchyAuditLog).
  hr: {
    code: 'hr',
    label: 'HR',
    legacy: ['HR', 'hr', 'human_resources', 'humanResources', 'Human Resources'],
    description: 'HR operations staff. Manages employee records, leave requests, and day-to-day HR tasks.',
    affects: 'HR Hub (leave, performance, staff directory), Employee profiles, Training records.',
  },
  hrManager: {
    code: 'hrManager',
    label: 'HR Manager',
    legacy: ['HRManager', 'hrManager', 'hr_manager', 'HR Manager', 'HR_Manager'],
    description: 'Full HR leadership access. Manages payroll, salary increments, hiring, and all HR operations.',
    affects: 'Full HR Hub — Payroll, EOSB, Salary Advances, Positions, Performance, Leave approvals.',
  },
};

// All canonical role codes
export const ALL_ROLE_CODES: RoleCode[] = Object.keys(ROLE_MAP) as RoleCode[];

// Visible role codes (excludes hidden roles like superAdmin)
export const VISIBLE_ROLE_CODES: RoleCode[] = Object.entries(ROLE_MAP)
  .filter(([_, config]) => !config.hidden)
  .map(([code]) => code as RoleCode);

/**
 * Get role options for dropdowns (excludes hidden roles)
 */
export function getVisibleRoleOptions(): { value: RoleCode; label: RoleLabel }[] {
  return VISIBLE_ROLE_CODES.map(code => ({
    value: code,
    label: ROLE_MAP[code].label
  }));
}

/**
 * Normalize any role input to canonical RoleCode
 * Supports backward compatibility with legacy formats
 */
export function normalizeRole(input: string): RoleCode | null {
  if (!input) return null;
  // Direct match
  if (input in ROLE_MAP) {
    return input as RoleCode;
  }

  // Legacy match (exact)
  for (const [code, config] of Object.entries(ROLE_MAP)) {
    if (config.legacy.includes(input)) {
      return code as RoleCode;
    }
  }

  // Case-insensitive match against canonical codes and legacy aliases.
  // Handles tokens stored in mixed case, e.g. 'FOM' vs 'fom', 'ICT' vs 'ict'.
  const lower = input.toLowerCase();
  for (const [code, config] of Object.entries(ROLE_MAP)) {
    if (code.toLowerCase() === lower) return code as RoleCode;
    if (config.legacy.some(l => l.toLowerCase() === lower)) return code as RoleCode;
  }

  return null;
}

/**
 * Convert role input to canonical RoleCode (strict)
 * Throws if role is not recognized
 */
export function toRoleCode(input: string): RoleCode {
  const normalized = normalizeRole(input);
  if (!normalized) {
    throw new Error(`Unknown role: ${input}`);
  }
  return normalized;
}

/**
 * Get UI display label for a role code
 */
export function toRoleLabel(code: RoleCode): RoleLabel {
  return ROLE_MAP[code].label;
}

/**
 * Get the hint (description + affects) for any role string.
 * Returns null if the role is unrecognized.
 */
export function getRoleHint(input: string): { description: string; affects: string } | null {
  const normalized = normalizeRole(input);
  if (!normalized) return null;
  return {
    description: ROLE_MAP[normalized].description,
    affects: ROLE_MAP[normalized].affects,
  };
}

/**
 * Convert any role string (legacy, camelCase, etc.) to a clean display label.
 * Returns the input as-is if no mapping is found.
 */
export function toDisplayLabel(input: string): string {
  const normalized = normalizeRole(input);
  if (normalized) {
    return ROLE_MAP[normalized].label;
  }
  return input;
}

/**
 * Check if a role matches any of the given role codes
 * Supports legacy formats for backward compatibility
 */
export function hasAnyRole(userRole: string | undefined, roles: RoleCode[]): boolean {
  if (!userRole) return false;
  
  const normalized = normalizeRole(userRole);
  if (!normalized) return false;
  
  return roles.includes(normalized);
}

/**
 * Check if roles array includes any of the specified codes
 */
export function rolesInclude(userRoles: string[], roleCodes: RoleCode[]): boolean {
  const normalizedUserRoles = userRoles
    .map(r => normalizeRole(r))
    .filter((r): r is RoleCode => r !== null);
  
  return roleCodes.some(code => normalizedUserRoles.includes(code));
}
