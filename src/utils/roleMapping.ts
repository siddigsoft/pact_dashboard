/**
 * Role Mapping Utility
 * 
 * Provides bidirectional mapping between database role codes (camelCase)
 * and TypeScript AppRole labels (PascalCase) for type safety and consistency.
 */

// Database role codes (matches Supabase app_role enum)
export type RoleCode = 
  | 'admin'
  | 'ict'
  | 'fom'
  | 'financialAdmin'
  | 'supervisor'
  | 'coordinator'
  | 'dataCollector'
  | 'reviewer';

// UI display labels
export type RoleLabel =
  | 'Admin'
  | 'ICT'
  | 'Field Operation Manager (FOM)'
  | 'FinancialAdmin'
  | 'Supervisor'
  | 'Coordinator'
  | 'DataCollector'
  | 'Reviewer';

// Comprehensive role mapping
export const ROLE_MAP: Record<RoleCode, { code: RoleCode; label: RoleLabel; legacy: string[] }> = {
  admin: {
    code: 'admin',
    label: 'Admin',
    legacy: ['Admin', 'admin']
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
    label: 'FinancialAdmin',
    legacy: ['FinancialAdmin', 'financialAdmin', 'financial_admin']
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
  dataCollector: {
    code: 'dataCollector',
    label: 'DataCollector',
    legacy: ['DataCollector', 'dataCollector', 'data_collector']
  },
  reviewer: {
    code: 'reviewer',
    label: 'Reviewer',
    legacy: ['Reviewer', 'reviewer']
  }
};

// All canonical role codes
export const ALL_ROLE_CODES: RoleCode[] = Object.keys(ROLE_MAP) as RoleCode[];

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
