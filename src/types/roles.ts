
export type AppRole = 
  | 'SuperAdmin'
  | 'Admin'
  | 'ICT'
  | 'Field Operation Manager (FOM)'
  | 'FinancialAdmin'
  | 'ProjectManager'
  | 'Supervisor'
  | 'Coordinator'
  | 'DataCollector'
  | 'Reviewer';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  role_id?: string; // For custom roles
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

export interface CreateRoleRequest {
  name: string;
  display_name: string;
  description?: string;
  permissions: Omit<Permission, 'id' | 'role_id' | 'created_at'>[];
}

export interface UpdateRoleRequest {
  display_name?: string;
  description?: string;
  is_active?: boolean;
  permissions?: Omit<Permission, 'id' | 'role_id' | 'created_at'>[];
}

export interface AssignRoleRequest {
  user_id: string;
  role?: AppRole;
  role_id?: string;
}

// Resource and Action types for type safety
export type ResourceType = 
  | 'users'
  | 'roles'
  | 'permissions'
  | 'projects'
  | 'mmp'
  | 'site_visits'
  | 'finances'
  | 'reports'
  | 'settings'
  | 'super_admins'
  | 'audit_logs'
  | 'wallets'
  | 'system';

export type ActionType = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'assign'
  | 'archive'
  | 'restore'
  | 'override';

export const RESOURCES: ResourceType[] = [
  'users',
  'roles',
  'permissions',
  'projects',
  'mmp',
  'site_visits',
  'finances',
  'reports',
  'settings',
  'super_admins',
  'audit_logs',
  'wallets',
  'system'
];

export const ACTIONS: ActionType[] = [
  'create',
  'read',
  'update',
  'delete',
  'approve',
  'assign',
  'archive',
  'restore',
  'override'
];

// Default role permissions mapping
export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, { resource: ResourceType; action: ActionType }[]> = {
  SuperAdmin: [
    { resource: 'users', action: 'create' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'update' },
    { resource: 'users', action: 'delete' },
    { resource: 'users', action: 'assign' },
    { resource: 'roles', action: 'create' },
    { resource: 'roles', action: 'read' },
    { resource: 'roles', action: 'update' },
    { resource: 'roles', action: 'delete' },
    { resource: 'roles', action: 'assign' },
    { resource: 'permissions', action: 'create' },
    { resource: 'permissions', action: 'read' },
    { resource: 'permissions', action: 'update' },
    { resource: 'permissions', action: 'delete' },
    { resource: 'projects', action: 'create' },
    { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' },
    { resource: 'projects', action: 'delete' },
    { resource: 'projects', action: 'archive' },
    { resource: 'mmp', action: 'create' },
    { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' },
    { resource: 'mmp', action: 'delete' },
    { resource: 'mmp', action: 'approve' },
    { resource: 'mmp', action: 'archive' },
    { resource: 'site_visits', action: 'create' },
    { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'site_visits', action: 'delete' },
    { resource: 'site_visits', action: 'assign' },
    { resource: 'finances', action: 'create' },
    { resource: 'finances', action: 'read' },
    { resource: 'finances', action: 'update' },
    { resource: 'finances', action: 'delete' },
    { resource: 'finances', action: 'approve' },
    { resource: 'reports', action: 'read' },
    { resource: 'reports', action: 'create' },
    { resource: 'reports', action: 'delete' },
    { resource: 'settings', action: 'read' },
    { resource: 'settings', action: 'update' },
    { resource: 'super_admins', action: 'create' },
    { resource: 'super_admins', action: 'read' },
    { resource: 'super_admins', action: 'update' },
    { resource: 'super_admins', action: 'delete' },
    { resource: 'audit_logs', action: 'read' },
    { resource: 'audit_logs', action: 'delete' },
    { resource: 'audit_logs', action: 'restore' },
    { resource: 'wallets', action: 'create' },
    { resource: 'wallets', action: 'read' },
    { resource: 'wallets', action: 'update' },
    { resource: 'wallets', action: 'delete' },
    { resource: 'wallets', action: 'approve' },
    { resource: 'system', action: 'read' },
    { resource: 'system', action: 'update' },
    { resource: 'system', action: 'override' },
  ],
  Admin: [
    { resource: 'users', action: 'create' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'update' },
    { resource: 'users', action: 'delete' },
    { resource: 'roles', action: 'create' },
    { resource: 'roles', action: 'read' },
    { resource: 'roles', action: 'update' },
    { resource: 'roles', action: 'delete' },
    { resource: 'permissions', action: 'create' },
    { resource: 'permissions', action: 'read' },
    { resource: 'permissions', action: 'update' },
    { resource: 'permissions', action: 'delete' },
    { resource: 'projects', action: 'create' },
    { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' },
    { resource: 'projects', action: 'delete' },
    { resource: 'mmp', action: 'create' },
    { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' },
    { resource: 'mmp', action: 'delete' },
    { resource: 'mmp', action: 'approve' },
    { resource: 'mmp', action: 'archive' },
    { resource: 'site_visits', action: 'create' },
    { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'site_visits', action: 'delete' },
    { resource: 'finances', action: 'read' },
    { resource: 'finances', action: 'update' },
    { resource: 'finances', action: 'approve' },
    { resource: 'reports', action: 'read' },
    { resource: 'reports', action: 'create' },
    { resource: 'settings', action: 'read' },
    { resource: 'settings', action: 'update' }
  ],
  ICT: [
    { resource: 'users', action: 'create' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'update' },
    { resource: 'roles', action: 'create' },
    { resource: 'roles', action: 'read' },
    { resource: 'roles', action: 'update' },
    { resource: 'permissions', action: 'read' },
    { resource: 'permissions', action: 'update' },
    { resource: 'projects', action: 'create' },
    { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' },
    { resource: 'mmp', action: 'create' },
    { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' },
    { resource: 'mmp', action: 'approve' },
    { resource: 'mmp', action: 'archive' },
    { resource: 'site_visits', action: 'create' },
    { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'finances', action: 'read' },
    { resource: 'reports', action: 'read' },
    { resource: 'reports', action: 'create' },
    { resource: 'settings', action: 'read' },
    { resource: 'settings', action: 'update' }
  ],
  'Field Operation Manager (FOM)': [
    { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' },
    { resource: 'mmp', action: 'create' },
    { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' },
    { resource: 'mmp', action: 'approve' },
    { resource: 'site_visits', action: 'create' },
    { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'finances', action: 'read' },
    { resource: 'reports', action: 'read' }
  ],
  FinancialAdmin: [
    { resource: 'site_visits', action: 'read' },
    { resource: 'finances', action: 'read' },
    { resource: 'finances', action: 'update' },
    { resource: 'finances', action: 'approve' },
    { resource: 'mmp', action: 'archive' },
    { resource: 'reports', action: 'read' }
  ],
  ProjectManager: [
    { resource: 'projects', action: 'create' },
    { resource: 'projects', action: 'read' },
    { resource: 'projects', action: 'update' },
    { resource: 'projects', action: 'delete' },
    { resource: 'projects', action: 'assign' },
    { resource: 'projects', action: 'approve' },
    { resource: 'projects', action: 'archive' },
    { resource: 'mmp', action: 'create' },
    { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' },
    { resource: 'mmp', action: 'approve' },
    { resource: 'mmp', action: 'assign' },
    { resource: 'site_visits', action: 'create' },
    { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'site_visits', action: 'assign' },
    { resource: 'site_visits', action: 'approve' },
    { resource: 'finances', action: 'read' },
    { resource: 'finances', action: 'update' },
    { resource: 'finances', action: 'approve' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'assign' },
    { resource: 'reports', action: 'read' },
    { resource: 'reports', action: 'create' },
    { resource: 'wallets', action: 'read' },
    { resource: 'wallets', action: 'approve' },
    { resource: 'audit_logs', action: 'read' },
    { resource: 'settings', action: 'read' },
  ],
  Supervisor: [
    { resource: 'mmp', action: 'read' },
    { resource: 'mmp', action: 'update' },
    { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'reports', action: 'read' }
  ],
  Coordinator: [
    { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'mmp', action: 'read' },
    { resource: 'reports', action: 'read' }
  ],
  DataCollector: [
    { resource: 'site_visits', action: 'read' },
    { resource: 'site_visits', action: 'update' },
    { resource: 'mmp', action: 'read' }
  ],
  Reviewer: [
    { resource: 'site_visits', action: 'read' },
    { resource: 'mmp', action: 'read' }
  ]
};
