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
  | 'reviewer';

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
  | 'Reviewer';

// Role configuration type
type RoleConfig = {
  code: RoleCode;
  label: RoleLabel;
  legacy: string[];
  hidden?: boolean; // If true, hide from role selection dropdowns
};

// Comprehensive role mapping
export const ROLE_MAP: Record<RoleCode, RoleConfig> = {
  superAdmin: {
    code: 'superAdmin',
    label: 'Admin', // Display as "Admin" in UI for security
    legacy: ['SuperAdmin', 'superAdmin', 'super_admin', 'Super Admin'],
    hidden: true // Hide from role selection dropdowns
  },
  admin: {
    code: 'admin',
    label: 'Admin',
    legacy: ['Admin', 'admin']
  },
  countryDirector: {
    code: 'countryDirector',
    label: 'Country Director',
    legacy: ['CountryDirector', 'countryDirector', 'country_director', 'Country Director']
  },
  ict: {
    code: 'ict',
    label: 'ICT',
    legacy: ['ICT', 'ict']
  },
  fom: {
    code: 'fom',
    label: 'Field Operation Manager (FOM)',
    legacy: ['Field Operation Manager (FOM)', 'fom', 'fieldOpManager']
  },
  financialAdmin: {
    code: 'financialAdmin',
    label: 'Financial Admin',
    legacy: ['FinancialAdmin', 'financialAdmin', 'financial_admin', 'Financial Admin']
  },
  projectManager: {
    code: 'projectManager',
    label: 'Project Manager',
    legacy: ['ProjectManager', 'projectManager', 'project_manager', 'Project Manager']
  },
  seniorOperationsLead: {
    code: 'seniorOperationsLead',
    label: 'Senior Operations Lead',
    legacy: ['SeniorOperationsLead', 'seniorOperationsLead', 'senior_operations_lead', 'Senior Operations Lead']
  },
  supervisor: {
    code: 'supervisor',
    label: 'Supervisor',
    legacy: ['Supervisor', 'supervisor']
  },
  coordinator: {
    code: 'coordinator',
    label: 'Coordinator',
    legacy: ['Coordinator', 'coordinator']
  },
  dataTeam: {
    code: 'dataTeam',
    label: 'Data Team',
    legacy: ['DataTeam', 'dataTeam', 'data_team', 'Data Team']
  },
  dataCollector: {
    code: 'dataCollector',
    label: 'Data Collector',
    legacy: ['DataCollector', 'dataCollector', 'data_collector', 'Data Collector', 'datacollector']
  },
  reviewer: {
    code: 'reviewer',
    label: 'Reviewer',
    legacy: ['Reviewer', 'reviewer']
  }
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
  // Direct match
  if (input in ROLE_MAP) {
    return input as RoleCode;
  }
  
  // Legacy match
  for (const [code, config] of Object.entries(ROLE_MAP)) {
    if (config.legacy.includes(input)) {
      return code as RoleCode;
    }
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
