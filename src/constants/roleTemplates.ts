import { ResourceType, ActionType } from '@/types/roles';

export interface RoleTemplate {
  id: string;
  name: string;
  displayName: string;
  description: string;
  category: 'field' | 'administrative' | 'financial' | 'technical';
  icon: string;
  permissions: { resource: ResourceType; action: ActionType }[];
  recommended: boolean;
}

export const roleTemplates: RoleTemplate[] = [
  {
    id: 'project_manager',
    name: 'Project Manager',
    displayName: 'Project Manager',
    description: 'Full project oversight with budget approval, deadline management, team coordination, and critical decision approval. Has complete visibility and control over assigned projects.',
    category: 'administrative',
    icon: 'Briefcase',
    recommended: true,
    permissions: [
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
  },
  {
    id: 'field_supervisor',
    name: 'Field Supervisor',
    displayName: 'Field Supervisor',
    description: 'Supervises field operations, manages site visits, and coordinates with data collectors. Can assign work and review submissions.',
    category: 'field',
    icon: 'MapPin',
    recommended: true,
    permissions: [
      { resource: 'site_visits', action: 'read' },
      { resource: 'site_visits', action: 'update' },
      { resource: 'site_visits', action: 'assign' },
      { resource: 'mmp', action: 'read' },
      { resource: 'mmp', action: 'update' },
      { resource: 'users', action: 'read' },
      { resource: 'reports', action: 'read' },
    ],
  },
  {
    id: 'finance_officer',
    name: 'Finance Officer',
    displayName: 'Finance Officer',
    description: 'Manages financial operations, approves expenses, and processes payments. Can view and update financial records and approve down-payments.',
    category: 'financial',
    icon: 'Wallet',
    recommended: true,
    permissions: [
      { resource: 'finances', action: 'read' },
      { resource: 'finances', action: 'update' },
      { resource: 'finances', action: 'approve' },
      { resource: 'site_visits', action: 'read' },
      { resource: 'reports', action: 'read' },
      { resource: 'reports', action: 'create' },
      { resource: 'mmp', action: 'read' },
    ],
  },
  {
    id: 'data_analyst',
    name: 'Data Analyst',
    displayName: 'Data Analyst',
    description: 'Analyzes data, generates reports, and provides insights. Can view all data but has limited editing permissions.',
    category: 'technical',
    icon: 'BarChart3',
    recommended: false,
    permissions: [
      { resource: 'projects', action: 'read' },
      { resource: 'mmp', action: 'read' },
      { resource: 'site_visits', action: 'read' },
      { resource: 'finances', action: 'read' },
      { resource: 'reports', action: 'read' },
      { resource: 'reports', action: 'create' },
      { resource: 'users', action: 'read' },
    ],
  },
  {
    id: 'regional_coordinator',
    name: 'Regional Coordinator',
    displayName: 'Regional Coordinator',
    description: 'Coordinates activities across a specific region. Can manage site visits, assign work, and monitor progress.',
    category: 'field',
    icon: 'Globe',
    recommended: false,
    permissions: [
      { resource: 'site_visits', action: 'create' },
      { resource: 'site_visits', action: 'read' },
      { resource: 'site_visits', action: 'update' },
      { resource: 'site_visits', action: 'assign' },
      { resource: 'mmp', action: 'read' },
      { resource: 'mmp', action: 'update' },
      { resource: 'users', action: 'read' },
      { resource: 'reports', action: 'read' },
    ],
  },
  {
    id: 'hr_manager',
    name: 'HR Manager',
    displayName: 'HR Manager',
    description: 'Manages user accounts, assigns roles, and maintains team structure. Can create and update user profiles.',
    category: 'administrative',
    icon: 'Users',
    recommended: false,
    permissions: [
      { resource: 'users', action: 'create' },
      { resource: 'users', action: 'read' },
      { resource: 'users', action: 'update' },
      { resource: 'roles', action: 'read' },
      { resource: 'roles', action: 'assign' },
      { resource: 'reports', action: 'read' },
    ],
  },
  {
    id: 'auditor',
    name: 'Auditor',
    displayName: 'Auditor',
    description: 'Reviews and audits operations, financial records, and compliance. Read-only access to ensure data integrity.',
    category: 'financial',
    icon: 'FileSearch',
    recommended: false,
    permissions: [
      { resource: 'projects', action: 'read' },
      { resource: 'mmp', action: 'read' },
      { resource: 'site_visits', action: 'read' },
      { resource: 'finances', action: 'read' },
      { resource: 'users', action: 'read' },
      { resource: 'reports', action: 'read' },
      { resource: 'permissions', action: 'read' },
    ],
  },
  {
    id: 'senior_operations_lead',
    name: 'Senior Operations Lead',
    displayName: 'Senior Operations Lead',
    description: 'Senior leadership role with budget override authority. Can approve over-budget expenses, escalate financial decisions, and provide final approval for restricted transactions.',
    category: 'administrative',
    icon: 'ShieldCheck',
    recommended: true,
    permissions: [
      { resource: 'projects', action: 'read' },
      { resource: 'projects', action: 'update' },
      { resource: 'projects', action: 'approve' },
      { resource: 'mmp', action: 'read' },
      { resource: 'mmp', action: 'update' },
      { resource: 'mmp', action: 'approve' },
      { resource: 'site_visits', action: 'read' },
      { resource: 'site_visits', action: 'update' },
      { resource: 'site_visits', action: 'approve' },
      { resource: 'finances', action: 'read' },
      { resource: 'finances', action: 'update' },
      { resource: 'finances', action: 'approve' },
      { resource: 'finances', action: 'override' },
      { resource: 'users', action: 'read' },
      { resource: 'reports', action: 'read' },
      { resource: 'reports', action: 'create' },
      { resource: 'wallets', action: 'read' },
      { resource: 'wallets', action: 'approve' },
      { resource: 'wallets', action: 'override' },
      { resource: 'audit_logs', action: 'read' },
      { resource: 'settings', action: 'read' },
    ],
  },
  {
    id: 'technical_support',
    name: 'Technical Support',
    displayName: 'Technical Support',
    description: 'Provides technical assistance, manages system settings, and resolves user issues. Can update settings and view system configurations.',
    category: 'technical',
    icon: 'Wrench',
    recommended: false,
    permissions: [
      { resource: 'users', action: 'read' },
      { resource: 'users', action: 'update' },
      { resource: 'settings', action: 'read' },
      { resource: 'settings', action: 'update' },
      { resource: 'reports', action: 'read' },
    ],
  },
];

export const getCategoryColor = (category: RoleTemplate['category']): string => {
  const colors = {
    field: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700',
    administrative: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
    financial: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700',
    technical: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
  };
  return colors[category];
};

export const getCategoryIcon = (category: RoleTemplate['category']): string => {
  const icons = {
    field: 'MapPin',
    administrative: 'Briefcase',
    financial: 'DollarSign',
    technical: 'Cpu',
  };
  return icons[category];
};

// Permission presets for common scenarios
export interface PermissionPreset {
  id: string;
  name: string;
  description: string;
  permissions: { resource: ResourceType; action: ActionType }[];
}

export const permissionPresets: PermissionPreset[] = [
  {
    id: 'read_only',
    name: 'Read Only Access',
    description: 'View-only access to all resources without editing capabilities',
    permissions: [
      { resource: 'projects', action: 'read' },
      { resource: 'mmp', action: 'read' },
      { resource: 'site_visits', action: 'read' },
      { resource: 'finances', action: 'read' },
      { resource: 'reports', action: 'read' },
      { resource: 'users', action: 'read' },
    ],
  },
  {
    id: 'field_operations',
    name: 'Field Operations',
    description: 'Standard permissions for field team members',
    permissions: [
      { resource: 'site_visits', action: 'read' },
      { resource: 'site_visits', action: 'update' },
      { resource: 'mmp', action: 'read' },
      { resource: 'reports', action: 'read' },
    ],
  },
  {
    id: 'financial_management',
    name: 'Financial Management',
    description: 'Permissions for handling financial operations and approvals',
    permissions: [
      { resource: 'finances', action: 'read' },
      { resource: 'finances', action: 'update' },
      { resource: 'finances', action: 'approve' },
      { resource: 'site_visits', action: 'read' },
      { resource: 'reports', action: 'read' },
    ],
  },
  {
    id: 'project_coordination',
    name: 'Project Coordination',
    description: 'Permissions for coordinating projects and managing teams',
    permissions: [
      { resource: 'projects', action: 'read' },
      { resource: 'projects', action: 'update' },
      { resource: 'mmp', action: 'read' },
      { resource: 'mmp', action: 'update' },
      { resource: 'site_visits', action: 'read' },
      { resource: 'site_visits', action: 'assign' },
      { resource: 'users', action: 'read' },
    ],
  },
];
