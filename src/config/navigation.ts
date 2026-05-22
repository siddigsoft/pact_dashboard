import {
  Home, MessageSquare, Receipt,
  DollarSign, Wallet, BarChart3, Calendar, Settings,
  CheckCircle, Banknote, Bell, Compass, FolderKanban,
  Database, CheckSquare, Inbox, LayoutDashboard,
  BookOpen, Briefcase, ShieldCheck
} from 'lucide-react';
import { AppRole } from '@/types';

export interface NavigationItem {
  id: string;
  icon: any;
  label: string;
  path: string;
  roles?: AppRole[];
  badge?: 'chat' | 'notifications';
  category: 'primary' | 'secondary' | 'tertiary';
  priority: number;
  description?: string;
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
  collapsible?: boolean;
  roles?: AppRole[];
}

export const navigationConfig: NavigationGroup[] = [
  {
    id: 'core',
    label: 'My Workspace',
    items: [
      {
        id: 'dashboard',
        icon: Home,
        label: 'Dashboard',
        path: '/dashboard',
        category: 'primary',
        priority: 100,
        description: 'Main dashboard overview'
      },
      {
        id: 'my-tasks',
        icon: CheckSquare,
        label: 'My Tasks',
        path: '/my-tasks',
        category: 'primary',
        priority: 98,
        description: 'Personal workspace — assigned tasks and daily to-dos'
      },
      {
        id: 'notifications',
        icon: Bell,
        label: 'Notifications',
        path: '/notifications',
        category: 'secondary',
        priority: 85,
        badge: 'notifications',
        description: 'System notifications'
      },
      {
        id: 'calendar',
        icon: Calendar,
        label: 'Calendar',
        path: '/calendar',
        category: 'secondary',
        priority: 71,
        description: 'Schedule calendar'
      }
    ]
  },
  {
    id: 'field-ops',
    label: 'Field Operations',
    items: [
      {
        id: 'field-ops-hub',
        icon: Compass,
        label: 'Field Ops Hub',
        path: '/field-ops',
        category: 'primary',
        priority: 95,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'ICT' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Coordinator' as AppRole, 'Supervisor' as AppRole, 'DataCollector' as AppRole],
        description: 'Site visits, safety, equipment and field team'
      },
      {
        id: 'mmp',
        icon: Database,
        label: 'My Sites',
        path: '/mmp',
        category: 'primary',
        priority: 88,
        roles: ['DataCollector' as AppRole, 'Coordinator' as AppRole, 'Supervisor' as AppRole],
        description: 'Monthly monitoring plans'
      }
    ]
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      {
        id: 'communication-hub',
        icon: MessageSquare,
        label: 'Communication',
        path: '/communication-hub',
        category: 'primary',
        priority: 90,
        badge: 'chat',
        description: 'Chat, calls, notifications and broadcasts'
      }
    ]
  },
  {
    id: 'programme',
    label: 'Programme Management',
    items: [
      {
        id: 'programme-hub',
        icon: FolderKanban,
        label: 'Programme Hub',
        path: '/programme-hub',
        category: 'primary',
        priority: 82,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'ICT' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Project Manager' as AppRole, 'Country Director' as AppRole],
        description: 'Projects, portfolio, surveys and analytics'
      }
    ]
  },
  {
    id: 'cycle-management',
    label: 'Cycle Management',
    items: [
      {
        id: 'mmp-cycle-close',
        icon: CheckCircle,
        label: 'Close Cycle',
        path: '/mmp/cycle-close',
        category: 'secondary',
        priority: 78,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'Supervisor' as AppRole, 'Field Operation Manager (FOM)' as AppRole],
        description: 'Manage MMP cycle closures'
      },
      {
        id: 'data-export-center',
        icon: BarChart3,
        label: 'Data Export',
        path: '/data-export-center',
        category: 'tertiary',
        priority: 40,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole],
        description: 'Export cycle reports, site visits, and analytics data'
      }
    ]
  },
  {
    id: 'finance',
    label: 'Finance',
    collapsible: true,
    items: [
      {
        id: 'my-wallet',
        icon: Wallet,
        label: 'My Wallet',
        path: '/wallet',
        category: 'secondary',
        priority: 76,
        roles: ['Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Supervisor' as AppRole, 'Coordinator' as AppRole, 'DataCollector' as AppRole],
        description: 'My digital wallet'
      },
      {
        id: 'cost-submission',
        icon: Receipt,
        label: 'Cost Submission',
        path: '/cost-submission',
        category: 'secondary',
        priority: 74,
        roles: ['DataCollector' as AppRole, 'Admin' as AppRole, 'Supervisor' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Coordinator' as AppRole],
        description: 'Submit operation costs'
      },
      {
        id: 'approvals-hub',
        icon: Inbox,
        label: 'Approvals',
        path: '/approvals',
        category: 'secondary',
        priority: 73,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Supervisor' as AppRole],
        description: 'All pending financial approvals'
      },
      {
        id: 'finance-hub',
        icon: DollarSign,
        label: 'Finance Hub',
        path: '/finance-hub',
        category: 'secondary',
        priority: 72,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole],
        description: 'Budgets, wallets, reconciliation and financial reports'
      },
      {
        id: 'accounting-hub',
        icon: BookOpen,
        label: 'Accounting',
        path: '/accounting',
        category: 'tertiary',
        priority: 35,
        roles: ['Super Admin' as AppRole, 'Admin' as AppRole, 'FinancialAdmin' as AppRole],
        description: 'Chart of accounts, journals, ledger and payables'
      }
    ],
    roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Supervisor' as AppRole, 'Coordinator' as AppRole, 'DataCollector' as AppRole]
  },
  {
    id: 'hr',
    label: 'HR & People',
    items: [
      {
        id: 'hr-hub',
        icon: Briefcase,
        label: 'HR Hub',
        path: '/hr',
        category: 'secondary',
        priority: 70,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'FinancialAdmin' as AppRole],
        description: 'Payroll, leave, performance and retainer management'
      }
    ],
    roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'FinancialAdmin' as AppRole]
  },
  {
    id: 'analytics',
    label: 'Analytics & Reports',
    items: [
      {
        id: 'analytics-hub',
        icon: BarChart3,
        label: 'Analytics Hub',
        path: '/analytics',
        category: 'secondary',
        priority: 68,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Country Director' as AppRole],
        description: 'Reports, monitoring, archive and data exports'
      }
    ]
  },
  {
    id: 'admin',
    label: 'Administration',
    collapsible: true,
    items: [
      {
        id: 'admin-hub',
        icon: LayoutDashboard,
        label: 'Admin Hub',
        path: '/admin-hub',
        category: 'secondary',
        priority: 50,
        roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'ICT' as AppRole],
        description: 'Users, roles, locations, sites and system settings'
      },
      {
        id: 'super-admin-hub',
        icon: ShieldCheck,
        label: 'Super Admin',
        path: '/super-admin-hub',
        category: 'tertiary',
        priority: 20,
        roles: ['Super Admin' as AppRole],
        description: 'Platform-wide system configuration'
      },
      {
        id: 'settings',
        icon: Settings,
        label: 'Settings',
        path: '/settings',
        category: 'secondary',
        priority: 10,
        description: 'Application settings'
      }
    ],
    roles: ['Admin' as AppRole, 'Super Admin' as AppRole, 'ICT' as AppRole]
  }
];

export function getNavigationItemsForRoles(userRoles: AppRole[] = []): NavigationItem[] {
  const allItems: NavigationItem[] = [];

  navigationConfig.forEach(group => {
    if (group.roles && group.roles.length > 0) {
      const hasAccess = group.roles.some(role => userRoles.includes(role));
      if (!hasAccess) return;
    }

    group.items.forEach(item => {
      if (item.roles && item.roles.length > 0) {
        const hasAccess = item.roles.some(role => userRoles.includes(role));
        if (!hasAccess) return;
      }
      allItems.push(item);
    });
  });

  return allItems.sort((a, b) => b.priority - a.priority);
}

export function getPrimaryNavigationItems(userRoles: AppRole[] = []): NavigationItem[] {
  return getNavigationItemsForRoles(userRoles).filter(item => item.category === 'primary');
}

export function getSecondaryNavigationItems(userRoles: AppRole[] = []): NavigationItem[] {
  return getNavigationItemsForRoles(userRoles).filter(item => item.category === 'secondary');
}

export function getTertiaryNavigationItems(userRoles: AppRole[] = []): NavigationItem[] {
  return getNavigationItemsForRoles(userRoles).filter(item => item.category === 'tertiary');
}

export function getNavigationGroupsForRoles(userRoles: AppRole[] = []): NavigationGroup[] {
  return navigationConfig
    .filter(group => {
      if (group.roles && group.roles.length > 0) {
        return group.roles.some(role => userRoles.includes(role));
      }
      return true;
    })
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.roles && item.roles.length > 0) {
          return item.roles.some(role => userRoles.includes(role));
        }
        return true;
      })
    }))
    .filter(group => group.items.length > 0);
}

export function getNavigationItemByPath(path: string): NavigationItem | undefined {
  for (const group of navigationConfig) {
    const item = group.items.find(item => item.path === path);
    if (item) return item;
  }
  return undefined;
}

export function getNavigationItemById(id: string): NavigationItem | undefined {
  for (const group of navigationConfig) {
    const item = group.items.find(item => item.id === id);
    if (item) return item;
  }
  return undefined;
}
