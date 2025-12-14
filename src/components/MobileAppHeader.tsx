
import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  Menu, Bell, Settings, LogOut, UserIcon, RefreshCw, WifiOff,
  Home, Map, FileText, Users, MessageSquare, Receipt,
  DollarSign, Wallet, BarChart, Calendar, Settings as SettingsIcon,
  Archive, FolderOpen, CheckCircle, Banknote, CreditCard,
  TrendingUp, MapPin, Search, User, 
  Shield, ClipboardList, ChevronRight, Building2,
  FileCheck, UserCog, PenTool, HelpCircle, Phone, Eye,
  Globe, Lock, Database, Activity
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useSettings } from '@/context/settings/SettingsContext';
import { MenuPreferences, DEFAULT_MENU_PREFERENCES } from '@/types/user-preferences';
import { getWorkflowMenuGroups } from '@/navigation/menu';
import { syncManager } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';
import { hapticPresets } from '@/lib/haptics';
import { PresenceIndicator } from '@/components/shared/PresenceIndicator';
import { RealtimeStatusDot } from '@/components/realtime/RealtimeBanner';

interface MobileAppHeaderProps {
  toggleSidebar?: () => void;
  title?: string;
  showNotification?: boolean;
}

const MobileAppHeader = ({ 
  toggleSidebar, 
  title = "Field Operations",
  showNotification = true
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, logout } = useUser() || {};
  const { currentUser: appUser, roles } = useAppContext() || {};
  const { checkPermission = () => false, hasAnyRole = () => false, canManageRoles = () => false } = useAuthorization() || {};
  const { isSuperAdmin = false } = useSuperAdmin() || {};
  const { userSettings } = useSettings() || {};
  const [open, setOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Track online status and pending sync items
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const updateStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (error) {
        console.error('[Header] Failed to get stats:', error);
      }
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);

    // Subscribe to sync progress
    const unsubProgress = syncManager.onProgress((progress) => {
      setIsSyncing(progress.isRunning);
    });
    const unsubComplete = syncManager.onComplete(() => {
      setIsSyncing(false);
      updateStats();
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      unsubProgress();
      unsubComplete();
    };
  }, []);

  const handleSync = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    hapticPresets.buttonPress();
    setIsSyncing(true);
    try {
      await syncManager.forceSync();
    } catch (error) {
      console.error('[Header] Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing]);

  const handleLogout = useCallback(async () => {
    try {
      if (logout) {
        await logout();
      }
      navigate('/auth');
    } catch (error) {
      console.error('[Header] Logout failed:', error);
      navigate('/auth');
    }
  }, [logout, navigate]);
  
  const getInitials = (name: string) => {
    if (!name) return 'FO';
    try {
      return name
        .split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
    } catch {
      return 'FO';
    }
  };

  const hasNotifications = true;

  const menuPrefs: MenuPreferences = useMemo(() => {
    const saved = userSettings?.settings?.menuPreferences;
    return saved ? { ...DEFAULT_MENU_PREFERENCES, ...saved } : DEFAULT_MENU_PREFERENCES;
  }, [userSettings?.settings?.menuPreferences]);

  const isAdmin = hasAnyRole(['admin']);
  const perms = {
    dashboard: true,
    projects: checkPermission('projects', 'read') || isAdmin || hasAnyRole(['ict']),
    mmp: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
    monitoringPlan: checkPermission('mmp', 'read') || isAdmin || hasAnyRole(['ict']),
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
  };

  const menuGroups = useMemo(
    () => {
      try {
        const workflowGroups = getWorkflowMenuGroups(roles || [], appUser?.role || currentUser?.role || 'dataCollector', perms, isSuperAdmin, menuPrefs);
      
      // Add additional menu items from the "More" section
      const additionalMenuGroups = [
        {
          id: 'quick-access',
          label: 'Quick Access',
          items: [
            { id: 'chat', icon: MessageSquare, title: 'Team Chat', url: '/chat' },
            { id: 'notifications', icon: Bell, title: 'Notifications', url: '/notifications' },
            { id: 'search', icon: Search, title: 'Global Search', url: '/search' },
            { id: 'field-team', icon: Map, title: 'Field Team Map', url: '/field-team' },
          ]
        },
        {
          id: 'finance',
          label: 'Finance & Wallet',
          items: [
            { id: 'wallet', icon: Wallet, title: 'My Wallet', url: '/wallet' },
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'DataCollector', 'Coordinator', 'Supervisor']) ? [
              { id: 'cost-submission', icon: Receipt, title: 'Submit Costs', url: '/cost-submission' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead']) ? [
              { id: 'finance', icon: DollarSign, title: 'Finance Overview', url: '/finance' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)']) ? [
              { id: 'financial-ops', icon: TrendingUp, title: 'Financial Operations', url: '/financial-operations' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead']) ? [
              { id: 'budget', icon: Banknote, title: 'Budget', url: '/budget' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'FinancialAdmin']) ? [
              { id: 'admin-wallets', icon: CreditCard, title: 'Admin Wallets', url: '/admin/wallets' }
            ] : []),
          ]
        },
        ...(hasAnyRole(['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'Supervisor', 'ProjectManager', 'SeniorOperationsLead']) ? [{
          id: 'approvals',
          label: 'Approvals',
          items: [
            { id: 'withdrawal-approval', icon: CheckCircle, title: 'Supervisor Approval', url: '/withdrawal-approval' },
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'FinancialAdmin']) ? [
              { id: 'finance-approval', icon: CreditCard, title: 'Finance Approval', url: '/finance-approval' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'SeniorOperationsLead']) ? [
              { id: 'down-payment', icon: Banknote, title: 'Down Payment Approval', url: '/down-payment-approval' }
            ] : []),
          ]
        }] : []),
        ...(hasAnyRole(['SuperAdmin', 'Admin', 'ICT', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead', 'Supervisor']) ? [{
          id: 'team',
          label: 'Team Management',
          items: [
            { id: 'users', icon: Users, title: 'Team Members', url: '/users' },
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'ICT']) ? [
              { id: 'role-management', icon: UserCog, title: 'Role Management', url: '/role-management' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'Field Operation Manager (FOM)']) ? [
              { id: 'hub-operations', icon: Building2, title: 'Hub Operations', url: '/hub-operations' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin']) ? [
              { id: 'data-visibility', icon: Eye, title: 'Data Visibility', url: '/data-visibility' }
            ] : []),
          ]
        }] : []),
        ...(hasAnyRole(['SuperAdmin', 'Admin', 'ICT', 'FinancialAdmin', 'Field Operation Manager (FOM)', 'ProjectManager', 'SeniorOperationsLead', 'Supervisor', 'Reviewer']) ? [{
          id: 'reports',
          label: 'Reports & Analytics',
          items: [
            { id: 'reports', icon: BarChart, title: 'Reports', url: '/reports' },
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'FinancialAdmin']) ? [
              { id: 'wallet-reports', icon: ClipboardList, title: 'Wallet Reports', url: '/wallet-reports' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'Field Operation Manager (FOM)', 'Coordinator', 'ProjectManager']) ? [
              { id: 'tracker-plan', icon: FileCheck, title: 'Tracker Plan', url: '/tracker-preparation-plan' }
            ] : []),
            ...(hasAnyRole(['SuperAdmin', 'Admin', 'ICT']) ? [
              { id: 'login-analytics', icon: Activity, title: 'Login Analytics', url: '/login-analytics' }
            ] : []),
          ]
        }] : []),
        {
          id: 'tools',
          label: 'Tools',
          items: [
            { id: 'calendar', icon: Calendar, title: 'Calendar', url: '/calendar' },
            { id: 'signatures', icon: PenTool, title: 'Signatures', url: '/signatures' },
            { id: 'calls', icon: Phone, title: 'Calls', url: '/calls' },
            { id: 'advanced-map', icon: Globe, title: 'Advanced Map', url: '/advanced-map' },
          ]
        },
        ...(hasAnyRole(['SuperAdmin', 'Admin', 'ICT']) ? [{
          id: 'admin',
          label: 'Administration',
          items: [
            ...(hasAnyRole(['SuperAdmin', 'Admin']) ? [
              { id: 'classifications', icon: Database, title: 'Classifications', url: '/classifications' },
              { id: 'audit', icon: Shield, title: 'Audit & Compliance', url: '/audit-compliance' }
            ] : []),
          ]
        }] : []),
        {
          id: 'settings-section',
          label: 'Settings & Help',
          items: [
            { id: 'app-settings', icon: SettingsIcon, title: 'Settings', url: '/settings' },
            { id: 'help-docs', icon: HelpCircle, title: 'Help & Docs', url: '/documentation' },
          ]
        },
      ];

      // Merge workflow groups with additional groups
      return [...workflowGroups, ...additionalMenuGroups];
      } catch (error) {
        console.error('[MobileAppHeader] Error generating menu groups:', error);
        return [{
          id: 'error-fallback',
          label: 'Navigation',
          items: [
            { id: 'dashboard', icon: Home, title: 'Dashboard', url: '/dashboard' },
            { id: 'settings', icon: SettingsIcon, title: 'Settings', url: '/settings' },
          ]
        }];
      }
    },
    [roles, appUser?.role, currentUser?.role, perms.dashboard, perms.projects, perms.mmp, perms.monitoringPlan, perms.siteVisits, perms.archive, perms.fieldTeam, perms.fieldOpManager, perms.dataVisibility, perms.reports, perms.users, perms.roleManagement, perms.settings, perms.financialOperations, isSuperAdmin, menuPrefs, hasAnyRole]
  );

  return (
    <>
    <header className="fixed top-0 left-0 right-0 px-4 flex items-center justify-between bg-black dark:bg-black shadow-md z-50" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}>
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setOpen(true)}
          className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          data-testid="button-open-menu"
          aria-label="Open navigation menu"
        >
          <Menu className="h-4 w-4 text-white" />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-white">{title}</h1>
            <RealtimeStatusDot className="h-2.5 w-2.5" />
          </div>
          <p className="text-white/60 text-xs">Stay connected</p>
        </div>
      </div>
      
      <div className="flex items-center gap-1.5">
        {/* Always-visible Sync Button */}
        <button
          onClick={handleSync}
          disabled={!isOnline || isSyncing}
          className="relative w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors disabled:opacity-50"
          data-testid="button-sync-header"
          aria-label={isOnline ? (isSyncing ? 'Syncing data' : `Sync now${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`) : 'Offline - sync unavailable'}
        >
          {!isOnline ? (
            <WifiOff className="h-4 w-4 text-red-500" />
          ) : isSyncing ? (
            <RefreshCw className="h-4 w-4 text-white animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 text-white" />
          )}
          {/* Pending count badge */}
          {isOnline && pendingCount > 0 && !isSyncing && (
            <Badge className="absolute -top-1 -right-1 h-3.5 min-w-3.5 px-0.5 p-0 flex items-center justify-center bg-white text-black text-[9px]">
              {pendingCount > 9 ? '9+' : pendingCount}
            </Badge>
          )}
        </button>
        
        {showNotification && (
          <button 
            className="relative w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            data-testid="button-notifications"
            aria-label="View notifications"
            onClick={() => navigate('/notifications')}
          >
            <Bell className="h-4 w-4 text-white" />
            {hasNotifications && (
              <Badge className="absolute -top-1 -right-1 h-3.5 w-3.5 p-0 flex items-center justify-center bg-white text-black">
                <span className="sr-only">New notifications</span>
              </Badge>
            )}
          </button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="rounded-full w-8 h-8 p-0.5 border border-white/30 hover:bg-white/10 cursor-pointer transition-colors"
              data-testid="button-user-menu"
              aria-label="Open user menu"
            >
              <Avatar className="h-full w-full">
                <AvatarImage src={currentUser?.avatar} alt={currentUser?.name || ''} />
                <AvatarFallback className="bg-white text-black font-semibold text-[10px]">{currentUser?.name ? getInitials(currentUser.name) : "FO"}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-[9999]">
            <DropdownMenuLabel className="text-base font-semibold">My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => currentUser?.id && navigate(`/users/${currentUser.id}`)} data-testid="menu-profile" aria-label="View profile">
              <UserIcon className="w-4 h-4 mr-2" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')} data-testid="menu-settings" aria-label="Open settings">
              <Settings className="w-4 h-4 mr-2" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout" aria-label="Log out">
              <LogOut className="w-4 h-4 mr-2" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-[75vw] p-0 bg-white dark:bg-black border-r border-gray-200 dark:border-gray-800">
        <SheetHeader className="flex items-center justify-between px-2 py-2 border-b border-gray-200 dark:border-gray-800 bg-black">
  <SheetTitle className="text-sm font-semibold text-white">Menu</SheetTitle>
  <button
    type="button"
    aria-label="Close menu"
    data-testid="button-close-menu"
    className="p-2 rounded-full hover:bg-white/10 focus:outline-none"
    onClick={() => setOpen(false)}
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-5 w-5 text-white"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  </button>
</SheetHeader>
        <ScrollArea className="h-[calc(100vh-40px-48px)] pb-safe">
          <div className="px-1 py-1 space-y-2">
            {menuGroups.map((group) => (
              <div key={group.id}>
                <div className="px-1 text-[10px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-1">
                  {group.label}
                </div>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <Link
                      key={item.id}
                      to={item.url}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-full text-xs transition-colors ${location.pathname === item.url ? 'bg-black text-white dark:bg-white dark:text-black font-medium' : 'hover:bg-gray-100 dark:hover:bg-gray-900 text-gray-700 dark:text-gray-300'}`}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      <span className="truncate">{item.title}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
    </>
  );
};

export default MobileAppHeader;
