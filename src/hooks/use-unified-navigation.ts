import { useMemo } from 'react';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useSettings } from '@/context/settings/SettingsContext';
import { AppRole } from '@/types';
import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from '@/types/user-preferences';
import {
  getNavigationGroupsForRoles,
  getPrimaryNavigationItems,
  getSecondaryNavigationItems,
  getTertiaryNavigationItems,
  NavigationGroup,
  NavigationItem
} from '@/config/navigation';

export interface UnifiedMenuGroup {
  id: string;
  label: string;
  order: number;
  items: Array<{
    id: string;
    title: string;
    url: string;
    icon: any;
    priority: number;
    isPinned?: boolean;
    badge?: 'chat' | 'notifications';
  }>;
  collapsible?: boolean;
}

export function useUnifiedNavigation(): {
  menuGroups: UnifiedMenuGroup[];
  primaryItems: NavigationItem[];
  secondaryItems: NavigationItem[];
  tertiaryItems: NavigationItem[];
  allItems: NavigationItem[];
} {
  const { currentUser, roles } = useAppContext();
  const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
  const { isSuperAdmin } = useSuperAdmin();
  const { userSettings } = useSettings();

  const menuPrefs: MenuPreferences = useMemo(() => {
    const savedPrefs = userSettings?.settings?.menuPreferences;
    return savedPrefs ? { ...DEFAULT_MENU_PREFERENCES, ...savedPrefs } : DEFAULT_MENU_PREFERENCES;
  }, [userSettings?.settings?.menuPreferences]);

  const isAdmin = hasAnyRole(['admin']);
  const isDataCollector = roles?.includes('DataCollector' as AppRole) ||
                          roles?.includes('dataCollector' as AppRole) ||
                          currentUser?.role?.toLowerCase() === 'datacollector' ||
                          currentUser?.role?.toLowerCase() === 'data collector';

  const perms = useMemo(() => ({
    dashboard: true,
    projects: checkPermission('projects', 'read') || isAdmin || hasAnyRole(['ict']),
    mmp: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
    siteVisits: checkPermission('site_visits', 'read') || isAdmin || hasAnyRole(['ict']),
    archive: checkPermission('reports', 'read') || isAdmin,
    fieldTeam: checkPermission('users', 'read') || isAdmin,
    fieldOpManager: checkPermission('site_visits', 'update') || isAdmin || hasAnyRole(['fom']),
    dataVisibility: checkPermission('reports', 'read') || isAdmin,
    reports: checkPermission('reports', 'read') || isAdmin,
    users: checkPermission('users', 'read') || isAdmin || hasAnyRole(['ict']),
    roleManagement: canManageRoles() || isAdmin,
    settings: checkPermission('settings', 'read') || isAdmin,
    financialOperations: checkPermission('finances', 'update') || checkPermission('finances', 'approve') || isAdmin || hasAnyRole(['financialAdmin']),
  }), [checkPermission, hasAnyRole, canManageRoles, isAdmin]);

  const isHidden = useMemo(() => (url: string) => menuPrefs.hiddenItems.includes(url), [menuPrefs.hiddenItems]);
  const isPinned = useMemo(() => (url: string) => menuPrefs.pinnedItems.includes(url), [menuPrefs.pinnedItems]);

  // Get navigation groups from centralized config
  const navigationGroups = useMemo(() => getNavigationGroupsForRoles(roles || []), [roles]);

  // Convert to unified menu groups format with legacy compatibility
  const menuGroups: UnifiedMenuGroup[] = useMemo(() => {
    const groups: UnifiedMenuGroup[] = [];

    navigationGroups.forEach((group, index) => {
      const items = group.items
        .filter(item => !isHidden(item.path))
        .map(item => ({
          id: item.id,
          title: item.label,
          url: item.path,
          icon: item.icon,
          priority: item.priority,
          isPinned: isPinned(item.path),
          badge: item.badge
        }))
        .sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          return a.priority - b.priority;
        });

      if (items.length > 0) {
        groups.push({
          id: group.id,
          label: group.label,
          order: index + 1,
          items,
          collapsible: group.collapsible
        });
      }
    });

    return groups;
  }, [navigationGroups, isHidden, isPinned]);

  const primaryItems = useMemo(() => getPrimaryNavigationItems(roles || []), [roles]);
  const secondaryItems = useMemo(() => getSecondaryNavigationItems(roles || []), [roles]);
  const tertiaryItems = useMemo(() => getTertiaryNavigationItems(roles || []), [roles]);
  const allItems = useMemo(() => [...primaryItems, ...secondaryItems, ...tertiaryItems], [primaryItems, secondaryItems, tertiaryItems]);

  return {
    menuGroups,
    primaryItems,
    secondaryItems,
    tertiaryItems,
    allItems
  };
}