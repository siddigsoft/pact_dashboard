export type DashboardZone = 
  | 'operations'       // SuperAdmin, Admin - system overview
  | 'fom'              // Field Operations Manager - hub & team management
  | 'team'             // Supervisor - team activity & compliance
  | 'planning'         // Coordinator - site verification, MMP status
  | 'dataCollector'    // DataCollector - my sites, wallet, upcoming visits
  | 'financial'        // FinancialAdmin - budget, cost approvals
  | 'ict'              // ICT - system health, user stats
  | 'projectManager';  // Project Manager - full project oversight, budget approval, deadlines

export interface MenuPreferences {
  hiddenItems: string[];       // URLs to hide from sidebar
  pinnedItems: string[];       // URLs to pin at top of their group
  collapsedGroups: string[];   // Group labels to collapse by default
  favoritePages: string[];     // Quick access pages
}

export interface DashboardPreferences {
  defaultZone: DashboardZone;
  hiddenWidgets: string[];     // Widget IDs to hide
  widgetOrder: string[];       // Custom widget ordering
  quickStats: string[];        // Stats to show prominently
  defaultTimeRange: 'day' | 'week' | 'month' | 'quarter';
}

export interface UserLayoutPreferences {
  menuPreferences: MenuPreferences;
  dashboardPreferences: DashboardPreferences;
}

export const DEFAULT_MENU_PREFERENCES: MenuPreferences = {
  hiddenItems: [],
  pinnedItems: [],
  collapsedGroups: [],
  favoritePages: []
};

export const DEFAULT_DASHBOARD_PREFERENCES: DashboardPreferences = {
  defaultZone: 'operations',
  hiddenWidgets: [],
  widgetOrder: [],
  quickStats: [],
  defaultTimeRange: 'week'
};

export const ROLE_DEFAULT_ZONES: Record<string, DashboardZone> = {
  superAdmin: 'operations',
  admin: 'operations',
  ict: 'ict',
  financialAdmin: 'financial',
  projectManager: 'projectManager',
  fom: 'fom',
  'field operation manager (fom)': 'fom',
  supervisor: 'team',
  coordinator: 'planning',
  dataCollector: 'dataCollector',
  reviewer: 'planning'
};

export interface DashboardWidget {
  id: string;
  title: string;
  description: string;
  zones: DashboardZone[];      // Which zones this widget appears in
  roles?: string[];            // Optional role restrictions
  size: 'small' | 'medium' | 'large' | 'full';
  priority: number;            // Lower = higher priority
}

export const DASHBOARD_WIDGETS: DashboardWidget[] = [
  { id: 'pending-approvals', title: 'Pending Approvals', description: 'MMPs and requests awaiting approval', zones: ['operations', 'fom', 'projectManager'], size: 'medium', priority: 1 },
  { id: 'system-overview', title: 'System Overview', description: 'Key system metrics', zones: ['operations', 'ict'], size: 'large', priority: 1 },
  { id: 'active-projects', title: 'Active Projects', description: 'Current project status', zones: ['operations', 'fom', 'planning', 'projectManager'], size: 'medium', priority: 2 },
  { id: 'mmp-pipeline', title: 'MMP Pipeline', description: 'MMP workflow status', zones: ['operations', 'fom', 'planning', 'ict', 'projectManager'], size: 'medium', priority: 2 },
  { id: 'site-visits-today', title: "Today's Site Visits", description: 'Scheduled visits for today', zones: ['operations', 'fom', 'team', 'dataCollector', 'projectManager'], size: 'medium', priority: 1 },
  { id: 'team-locations', title: 'Team Locations', description: 'Live team member locations', zones: ['fom', 'team', 'projectManager'], size: 'large', priority: 2 },
  { id: 'team-activity', title: 'Team Activity', description: 'Recent team member activity', zones: ['fom', 'team', 'projectManager'], size: 'medium', priority: 3 },
  { id: 'hub-stats', title: 'Hub Statistics', description: 'Performance by hub', zones: ['operations', 'fom', 'projectManager'], size: 'medium', priority: 3 },
  { id: 'compliance-overview', title: 'Compliance Overview', description: 'Team compliance metrics', zones: ['team'], size: 'medium', priority: 1 },
  { id: 'site-verification', title: 'Sites for Verification', description: 'Pending site verifications', zones: ['planning'], size: 'medium', priority: 1 },
  { id: 'my-sites', title: 'My Assigned Sites', description: 'Your site assignments', zones: ['dataCollector'], size: 'large', priority: 1 },
  { id: 'my-wallet', title: 'My Wallet', description: 'Wallet balance and transactions', zones: ['dataCollector'], size: 'medium', priority: 2 },
  { id: 'upcoming-visits', title: 'Upcoming Visits', description: 'Your scheduled site visits', zones: ['dataCollector'], size: 'medium', priority: 3 },
  { id: 'budget-tracking', title: 'Budget Tracking', description: 'Budget utilization overview', zones: ['financial', 'operations', 'projectManager'], size: 'large', priority: 1 },
  { id: 'cost-approvals', title: 'Cost Approvals', description: 'Pending cost submissions', zones: ['financial', 'projectManager'], size: 'medium', priority: 1 },
  { id: 'wallet-overview', title: 'Wallet Overview', description: 'All wallets summary', zones: ['financial', 'projectManager'], size: 'medium', priority: 2 },
  { id: 'user-stats', title: 'User Statistics', description: 'User registration and activity', zones: ['ict', 'operations'], size: 'medium', priority: 2 },
  { id: 'system-health', title: 'System Health', description: 'System performance metrics', zones: ['ict'], size: 'medium', priority: 1 },
  { id: 'recent-activity', title: 'Recent Activity', description: 'Latest system activity', zones: ['operations', 'ict', 'projectManager'], size: 'medium', priority: 4 },
  { id: 'project-overview', title: 'Project Overview', description: 'Complete project status and progress', zones: ['projectManager'], size: 'large', priority: 1 },
  { id: 'budget-approval', title: 'Budget Approvals', description: 'Pending budget requests requiring approval', zones: ['projectManager'], size: 'medium', priority: 1 },
  { id: 'deadline-tracker', title: 'Deadline Tracker', description: 'Upcoming deadlines and milestones', zones: ['projectManager'], size: 'medium', priority: 2 },
  { id: 'team-performance', title: 'Team Performance', description: 'Team productivity and metrics', zones: ['projectManager'], size: 'medium', priority: 3 },
  { id: 'project-timeline', title: 'Project Timeline', description: 'Activities and milestones timeline', zones: ['projectManager'], size: 'large', priority: 2 }
];

export interface MenuGroup {
  id: string;
  label: string;
  icon?: string;
  order: number;
  items: MenuItem[];
}

export interface MenuItem {
  id: string;
  title: string;
  url: string;
  icon: string;
  roles?: string[];            // Roles that can see this item
  permissions?: { resource: string; action: string }[];  // Required permissions
  badge?: string;              // Optional badge text
  priority: number;            // For ordering within group
}

export const WORKFLOW_MENU_GROUPS: MenuGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    order: 1,
    items: [
      { id: 'dashboard', title: 'Dashboard', url: '/dashboard', icon: 'LayoutDashboard', priority: 1 },
      { id: 'my-wallet', title: 'My Wallet', url: '/wallet', icon: 'CreditCard', roles: ['dataCollector'], priority: 2 },
      { id: 'cost-submission', title: 'Cost Submission', url: '/cost-submission', icon: 'Receipt', roles: ['dataCollector', 'admin', 'coordinator'], priority: 3 }
    ]
  },
  {
    id: 'planning',
    label: 'Planning & Setup',
    order: 2,
    items: [
      { id: 'projects', title: 'Projects', url: '/projects', icon: 'FolderKanban', priority: 1 },
      { id: 'mmp-management', title: 'MMP Management', url: '/mmp', icon: 'Database', priority: 2 },
      { id: 'hub-operations', title: 'Hub Operations', url: '/hub-operations', icon: 'Building2', roles: ['admin', 'superAdmin'], priority: 3 }
    ]
  },
  {
    id: 'field-ops',
    label: 'Field Operations',
    order: 3,
    items: [
      { id: 'site-visits', title: 'Site Visits', url: '/site-visits', icon: 'ClipboardList', priority: 1 },
      { id: 'field-team', title: 'Field Team', url: '/field-team', icon: 'Activity', priority: 2 },
      { id: 'field-op-manager', title: 'Field Operation Manager', url: '/field-operation-manager', icon: 'MapPin', priority: 3 }
    ]
  },
  {
    id: 'verification',
    label: 'Verification & Review',
    order: 4,
    items: [
      { id: 'site-verification', title: 'Site Verification', url: '/coordinator/sites', icon: 'CheckCircle', roles: ['coordinator'], priority: 1 },
      { id: 'archive', title: 'Archive', url: '/archive', icon: 'Archive', priority: 2 }
    ]
  },
  {
    id: 'reports',
    label: 'Data & Reports',
    order: 5,
    items: [
      { id: 'data-visibility', title: 'Data Visibility', url: '/data-visibility', icon: 'Link2', priority: 1 },
      { id: 'reports', title: 'Reports', url: '/reports', icon: 'Calendar', priority: 2 }
    ]
  },
  {
    id: 'admin',
    label: 'Administration',
    order: 6,
    items: [
      { id: 'user-management', title: 'User Management', url: '/users', icon: 'Users', priority: 1 },
      { id: 'role-management', title: 'Role Management', url: '/role-management', icon: 'Shield', priority: 2 },
      { id: 'super-admin', title: 'Super Admin', url: '/super-admin-management', icon: 'ShieldCheck', roles: ['superAdmin'], priority: 3 },
      { id: 'classifications', title: 'Classifications', url: '/classifications', icon: 'Award', roles: ['admin', 'financialAdmin'], priority: 4 },
      { id: 'financial-ops', title: 'Financial Operations', url: '/financial-operations', icon: 'TrendingUp', priority: 5 },
      { id: 'budget', title: 'Budget', url: '/budget', icon: 'DollarSign', roles: ['admin', 'financialAdmin', 'projectManager'], priority: 6 },
      { id: 'wallets', title: 'Wallets', url: '/admin/wallets', icon: 'CreditCard', roles: ['admin', 'financialAdmin'], priority: 7 },
      { id: 'settings', title: 'Settings', url: '/settings', icon: 'Settings', priority: 8 },
      { id: 'project-manager-dashboard', title: 'PM Dashboard', url: '/dashboard', icon: 'FolderKanban', roles: ['projectManager'], priority: 9 },
      { id: 'project-approvals', title: 'Approvals Queue', url: '/dashboard?tab=approvals', icon: 'ClipboardCheck', roles: ['projectManager'], priority: 10 }
    ]
  }
];
