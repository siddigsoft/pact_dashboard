
import React, { useMemo, useState, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, Bell, Settings, LogOut, UserIcon } from 'lucide-react';
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
  const { currentUser, logout } = useUser();
  const { currentUser: appUser, roles } = useAppContext();
  const { checkPermission, hasAnyRole, canManageRoles } = useAuthorization();
  const { isSuperAdmin } = useSuperAdmin();
  const { userSettings } = useSettings();
  const [open, setOpen] = useState(false);

  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/auth');
  }, [logout, navigate]);
  
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
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
    () => getWorkflowMenuGroups(roles || [], appUser?.role || currentUser?.role || 'dataCollector', perms, isSuperAdmin, menuPrefs),
    [roles, appUser?.role, currentUser?.role, perms.dashboard, perms.projects, perms.mmp, perms.monitoringPlan, perms.siteVisits, perms.archive, perms.fieldTeam, perms.fieldOpManager, perms.dataVisibility, perms.reports, perms.users, perms.roleManagement, perms.settings, perms.financialOperations, isSuperAdmin, menuPrefs]
  );

  return (
    <>
    <header className="px-4 h-16 flex items-center justify-between bg-gradient-to-r from-blue-600 to-purple-600 shadow-md relative z-50">
      <div className="flex items-center gap-2">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setOpen(true)}
          className="h-9 w-9 text-white hover:bg-white/10"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-white truncate max-w-[180px]">
          {title}
        </h1>
      </div>
      
      <div className="flex items-center gap-3">
        {showNotification && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="relative h-9 w-9 text-white hover:bg-white/10" 
            onClick={() => navigate('/notifications')}
          >
            <Bell className="h-5 w-5" />
            {hasNotifications && (
              <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center bg-red-500">
                <span className="sr-only">New notifications</span>
              </Badge>
            )}
          </Button>
        )}
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button 
              className="rounded-full h-9 w-9 p-1 border border-white/30 hover:bg-white/10 cursor-pointer transition-colors"
            >
              <Avatar className="h-full w-full">
                <AvatarImage src={currentUser?.avatar} alt={currentUser?.name || ''} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-700 text-white">{currentUser?.name ? getInitials(currentUser.name) : "FO"}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 z-[9999]">
            <DropdownMenuLabel className="text-base font-semibold">My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => currentUser?.id && navigate(`/users/${currentUser.id}`)}>
              <UserIcon className="w-4 h-4 mr-2" />
              <span>Profile</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>

    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="left" className="w-[85vw] p-0">
        <SheetHeader className="px-4 py-3 border-b">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-56px)]">
          <div className="px-2 py-3 space-y-4">
            {menuGroups.map((group) => (
              <div key={group.id}>
                <div className="px-2 text-[11px] uppercase tracking-wide font-semibold text-blue-600 dark:text-blue-300 mb-2">
                  {group.label}
                </div>
                <div className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.id}
                      to={item.url}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-blue-50 dark:hover:bg-blue-900/30 ${location.pathname === item.url ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : ''}`}
                    >
                      <item.icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
