import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MoonIcon, SunIcon, Settings, LogOut, UserIcon, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useUser } from '@/context/user/UserContext';
import { useViewAs } from '@/context/ViewAsContext';
import ChatNotificationIndicator from '@/components/chat/ChatNotificationIndicator';
import { NavbarNotificationBell } from '@/components/navbar/NavbarNotificationBell';
import ErrorBoundary from '@/components/ErrorBoundary';
import { RealtimeActivityIndicator } from '@/components/realtime';
import { useFocusReconnect } from '@/hooks/useFocusReconnect';
import { CommandPalette } from '@/components/CommandPalette';

const Navbar = () => {
        const { setTheme, theme } = useTheme();
        const navigate = useNavigate();
        const { currentUser, logout } = useUser();
        const { viewAs } = useViewAs();

        // Resolve the displayed role label from user_roles (currentUser.roles) first,
        // falling back to profiles.role only when no user_roles entries exist.
        // This prevents stale profiles.role (e.g. 'dataCollector') from showing
        // in the navbar dropdown for users who have a higher role in user_roles.
        const resolvedRoleLabel = (() => {
          if (!currentUser) return 'My Account';
          const ROLE_LABEL: Record<string, string> = {
            superadmin: 'Super Admin', admin: 'Admin', ict: 'ICT',
            fom: 'Field Ops Manager', financialadmin: 'Financial Admin',
            supervisor: 'Supervisor', hubsupervisor: 'Hub Supervisor',
            coordinator: 'Coordinator', datacollector: 'Data Collector',
            datateam: 'Data Team', employee: 'Employee', hr: 'HR',
            hrmanager: 'HR Manager', countrydirector: 'Country Director',
            projectmanager: 'Project Manager', reviewer: 'Reviewer',
            senioroperationslead: 'Senior Ops Lead',
          };
          // When viewAs is active, show the previewed role label directly
          if (viewAs?.role) {
            const n = viewAs.role.toLowerCase().replace(/[\s_-]/g, '');
            return ROLE_LABEL[n] || viewAs.role.charAt(0).toUpperCase() + viewAs.role.slice(1);
          }
          const roleList: string[] = Array.isArray(currentUser.roles) && (currentUser.roles as string[]).length > 0
            ? (currentUser.roles as string[])
            : currentUser.role ? [currentUser.role] : [];
          // Highest-privilege roles win
          for (const r of roleList) {
            const n = String(r).toLowerCase().replace(/[\s_-]/g, '');
            if (n === 'superadmin') return 'Super Admin';
            if (n === 'admin') return 'Admin';
          }
          if (roleList.length > 0) {
            const n = String(roleList[0]).toLowerCase().replace(/[\s_-]/g, '');
            return ROLE_LABEL[n] || String(roleList[0]).charAt(0).toUpperCase() + String(roleList[0]).slice(1);
          }
          return 'My Account';
        })();

        // Auto-reconnect when window regains focus
        useFocusReconnect();

        const handleLogout = useCallback(async () => {
                await logout();
                navigate('/auth');
        }, [logout, navigate]);

        return (
                <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
                                {/* Search — centred in the available space */}
                                <div className="flex flex-1 justify-center min-w-0">
                                        <div className="w-full max-w-md">
                                                <CommandPalette />
                                        </div>
                                </div>

                                {/* Right actions */}
                                <div className="flex shrink-0 items-center gap-1">
                                        <RealtimeActivityIndicator variant="pulse" size="sm" showTooltip={true} />

                                        <div className="mx-1.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />

                                        <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                                className="h-9 w-9 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                                title="Toggle theme"
                                        >
                                                {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                                                <span className="sr-only">Toggle theme</span>
                                        </Button>

                                        <ChatNotificationIndicator />

                                        <ErrorBoundary fallback={null}>
                                          <NavbarNotificationBell />
                                        </ErrorBoundary>

                                        <div className="mx-1.5 h-5 w-px bg-slate-200 dark:bg-slate-700" />

                                        {/* User menu */}
                                        <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" className="h-9 flex items-center gap-2 rounded-lg px-1.5 hover:bg-slate-100 dark:hover:bg-slate-800">
                                                                <Avatar className="h-7 w-7">
                                                                        <AvatarImage src={currentUser?.avatar || undefined} alt="User" />
                                                                        <AvatarFallback className="bg-blue-100 text-xs font-semibold text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                                                                                {currentUser?.name?.charAt(0) || 'U'}
                                                                        </AvatarFallback>
                                                                </Avatar>
                                                                <span className="hidden max-w-[140px] flex-col items-start leading-tight md:flex">
                                                                        <span className="w-full truncate text-left text-[13px] font-medium text-slate-700 dark:text-slate-200">
                                                                                {currentUser?.name || 'User'}
                                                                        </span>
                                                                        <span className="w-full truncate text-left text-[10px] text-slate-400 dark:text-slate-500">
                                                                                {resolvedRoleLabel}
                                                                        </span>
                                                                </span>
                                                                <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 md:block" />
                                                        </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56">
                                                        <DropdownMenuLabel className="text-xs text-slate-500">
                                                                {resolvedRoleLabel}
                                                        </DropdownMenuLabel>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={() => navigate(`/users/${currentUser?.id}`)}>
                                                                <UserIcon className="w-4 h-4 mr-2" />
                                                                Profile
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem onClick={() => navigate('/settings')}>
                                                                <Settings className="w-4 h-4 mr-2" />
                                                                Settings
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem onClick={handleLogout} className="text-red-600 dark:text-red-400">
                                                                <LogOut className="w-4 h-4 mr-2" />
                                                                Log out
                                                        </DropdownMenuItem>
                                                </DropdownMenuContent>
                                        </DropdownMenu>
                                </div>
                        </div>
                </header>
  );
};

export default Navbar;
