import {
  Home, Map, FileText, Users, MessageSquare, Receipt,
  DollarSign, Wallet, BarChart, Calendar, Settings,
  Archive, FolderOpen, CheckCircle, Banknote, CreditCard,
  TrendingUp, MapPin, Sparkles, Bell, Search, User,
  Moon, Sun, LogOut
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
  priority: number; // Higher priority items appear first
  description?: string;
}

export interface NavigationGroup {
  id: string;
  label: string;
  items: NavigationItem[];
  collapsible?: boolean;
  roles?: AppRole[];
}

// Centralized navigation configuration
export const navigationConfig: NavigationGroup[] = [
  {
    id: 'core',
    label: 'Core Features',
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
        id: 'field-team',
        icon: Map,
        label: 'Field Team',
        path: '/field-team',
        category: 'primary',
        priority: 95,
        description: 'Field operations map'
      },
      {
        id: 'site-visits',
        icon: MapPin,
        label: 'Site Visits',
        path: '/site-visits',
        category: 'primary',
        priority: 90,
        description: 'Manage site visits'
      }
    ]
  },
  {
    id: 'documents',
    label: 'Documents & Files',
    items: [
      {
        id: 'mmp',
        icon: FileText,
        label: 'MMP Files',
        path: '/mmp',
        category: 'primary',
        priority: 85,
        description: 'Manage MMP documents'
      },
      {
        id: 'projects',
        icon: FolderOpen,
        label: 'Projects',
        path: '/projects',
        category: 'secondary',
        priority: 80,
        description: 'Project management'
      },
      {
        id: 'archive',
        icon: Archive,
        label: 'Archive',
        path: '/archive',
        category: 'tertiary',
        priority: 20,
        roles: ['Admin' as AppRole, 'Supervisor' as AppRole, 'Field Operation Manager (FOM)' as AppRole],
        description: 'Archived items'
      }
    ]
  },
  {
    id: 'communication',
    label: 'Communication',
    items: [
      {
        id: 'chat',
        icon: MessageSquare,
        label: 'Chat',
        path: '/chat',
        category: 'primary',
        priority: 88,
        badge: 'chat',
        description: 'Team messaging'
      },
      {
        id: 'notifications',
        icon: Bell,
        label: 'Notifications',
        path: '/notifications',
        category: 'secondary',
        priority: 75,
        badge: 'notifications',
        description: 'System notifications'
      }
    ]
  },
  {
    id: 'team',
    label: 'Team Management',
    items: [
      {
        id: 'users',
        icon: Users,
        label: 'Team Members',
        path: '/users',
        category: 'primary',
        priority: 82,
        description: 'Manage team members'
      },
      {
        id: 'user-management',
        icon: Users,
        label: 'User Management',
        path: '/users',
        category: 'secondary',
        priority: 70,
        roles: ['Admin' as AppRole],
        description: 'Advanced user management'
      },
      {
        id: 'role-management',
        icon: Settings,
        label: 'Role Management',
        path: '/role-management',
        category: 'tertiary',
        priority: 15,
        roles: ['Admin' as AppRole],
        description: 'Manage user roles'
      }
    ]
  },
  {
    id: 'finance',
    label: 'Finance & Operations',
    collapsible: true,
    items: [
      {
        id: 'finance',
        icon: DollarSign,
        label: 'Finance',
        path: '/finance',
        category: 'secondary',
        priority: 78,
        roles: ['Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole],
        description: 'Financial overview'
      },
      {
        id: 'financial-operations',
        icon: TrendingUp,
        label: 'Financial Ops',
        path: '/financial-operations',
        category: 'secondary',
        priority: 77,
        roles: ['Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole],
        description: 'Financial operations'
      },
      {
        id: 'wallet',
        icon: Wallet,
        label: 'Wallet',
        path: '/wallet',
        category: 'secondary',
        priority: 76,
        description: 'Digital wallet'
      },
      {
        id: 'admin-wallets',
        icon: CreditCard,
        label: 'Admin Wallets',
        path: '/admin/wallets',
        category: 'tertiary',
        priority: 25,
        roles: ['Admin' as AppRole, 'FinancialAdmin' as AppRole],
        description: 'Administrative wallets'
      },
      {
        id: 'withdrawal-approval',
        icon: CheckCircle,
        label: 'Supervisor Approval',
        path: '/withdrawal-approval',
        category: 'secondary',
        priority: 74,
        roles: ['Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Supervisor' as AppRole],
        description: 'Approve withdrawals'
      },
      {
        id: 'finance-approval',
        icon: Banknote,
        label: 'Finance Approval',
        path: '/finance-approval',
        category: 'secondary',
        priority: 73,
        roles: ['Admin' as AppRole, 'FinancialAdmin' as AppRole],
        description: 'Financial approvals'
      },
      {
        id: 'budget',
        icon: DollarSign,
        label: 'Budget',
        path: '/budget',
        category: 'tertiary',
        priority: 30,
        roles: ['Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole],
        description: 'Budget management'
      }
    ],
    roles: ['Admin' as AppRole, 'FinancialAdmin' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'Supervisor' as AppRole]
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      {
        id: 'cost-submission',
        icon: Receipt,
        label: 'Cost Submission',
        path: '/cost-submission',
        category: 'secondary',
        priority: 72,
        roles: ['DataCollector' as AppRole, 'Admin' as AppRole],
        description: 'Submit operation costs'
      },
      {
        id: 'calendar',
        icon: Calendar,
        label: 'Calendar',
        path: '/calendar',
        category: 'secondary',
        priority: 71,
        description: 'Schedule calendar'
      },
      {
        id: 'reports',
        icon: BarChart,
        label: 'Reports',
        path: '/reports',
        category: 'secondary',
        priority: 79,
        roles: ['Admin' as AppRole, 'Supervisor' as AppRole, 'Field Operation Manager (FOM)' as AppRole, 'FinancialAdmin' as AppRole],
        description: 'Analytics and reports'
      }
    ]
  },
  {
    id: 'settings',
    label: 'Settings & Configuration',
    collapsible: true,
    items: [
      {
        id: 'settings',
        icon: Settings,
        label: 'Settings',
        path: '/settings',
        category: 'secondary',
        priority: 10,
        description: 'Application settings'
      }
    ]
  }
];

// Helper functions for filtering navigation items
export function getNavigationItemsForRoles(userRoles: AppRole[] = []): NavigationItem[] {
  const allItems: NavigationItem[] = [];

  navigationConfig.forEach(group => {
    // Check if group has role restrictions
    if (group.roles && group.roles.length > 0) {
      const hasAccess = group.roles.some(role => userRoles.includes(role));
      if (!hasAccess) return;
    }

    group.items.forEach(item => {
      // Check if item has role restrictions
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
      // Check if group has role restrictions
      if (group.roles && group.roles.length > 0) {
        return group.roles.some(role => userRoles.includes(role));
      }
      return true;
    })
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        // Check if item has role restrictions
        if (item.roles && item.roles.length > 0) {
          return item.roles.some(role => userRoles.includes(role));
        }
        return true;
      })
    }))
    .filter(group => group.items.length > 0);
}

// Get navigation item by path
export function getNavigationItemByPath(path: string): NavigationItem | undefined {
  for (const group of navigationConfig) {
    const item = group.items.find(item => item.path === path);
    if (item) return item;
  }
  return undefined;
}

// Get navigation item by ID
export function getNavigationItemById(id: string): NavigationItem | undefined {
  for (const group of navigationConfig) {
    const item = group.items.find(item => item.id === id);
    if (item) return item;
  }
  return undefined;
}