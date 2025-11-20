
export type AppRole = 
  | 'Admin'
  | 'ICT'
  | 'Field Operation Manager (FOM)'
  | 'FinancialAdmin'
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
  | 'settings';

export type ActionType = 
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'assign'
  | 'archive';

export const RESOURCES: ResourceType[] = [
  'users',
  'roles',
  'permissions',
  'projects',
  'mmp',
  'site_visits',
  'finances',
  'reports',
  'settings'
];

export const ACTIONS: ActionType[] = [
  'create',
  'read',
  'update',
  'delete',
  'approve',
  'assign',
  'archive'
];

// Default role permissions mapping
export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, { resource: ResourceType; action: ActionType }[]> = {
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
