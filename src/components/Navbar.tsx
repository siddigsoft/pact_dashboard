import { useCallback, useState } from 'react';
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
import { MoonIcon, SunIcon, Settings, LogOut, UserIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useUser } from '@/context/user/UserContext';
import ChatNotificationIndicator from '@/components/chat/ChatNotificationIndicator';
import { NavbarNotificationBell } from '@/components/navbar/NavbarNotificationBell';
import ErrorBoundary from '@/components/ErrorBoundary';
import NavBrand from './navbar/NavBrand';
import { GlobalSearch } from './navbar/GlobalSearch';
import { RealtimeActivityIndicator } from '@/components/realtime';
import { useFocusReconnect } from '@/hooks/useFocusReconnect';
import { CommandPalette } from '@/components/CommandPalette';

const featureList = [
        { name: 'Dashboard', path: '/dashboard' },
        { name: 'Projects', path: '/projects' },
        { name: 'Create Project', path: '/projects/create' },
        { name: 'Project Archive', path: '/archive' },
        { name: 'MMP Management', path: '/mmp' },
        { name: 'Upload MMP', path: '/mmp/upload' },
        { name: 'Site Visits', path: '/site-visits' },
        { name: 'Schedule Site Visit', path: '/site-visits/schedule' },
        { name: 'Site Visit Calendar', path: '/calendar' },
        { name: 'User Management', path: '/users' },
        { name: 'Register User', path: '/register' },
        { name: 'Role Management', path: '/role-management' },
        { name: 'Finance', path: '/finance' },
        { name: 'Reports', path: '/reports' },
        { name: 'Notifications', path: '/notifications' },
        { name: 'Chat', path: '/chat' },
        { name: 'Settings', path: '/settings' },
        { name: 'Field Team', path: '/field-team' },
        { name: 'Data Visibility', path: '/data-visibility' },
        { name: 'Pending Approvals', path: '/users?tab=pending-approvals' },
        { name: 'Approved Users', path: '/users?tab=approved-users' },
        { name: 'Coordinator Dashboard', path: '/coordinator-dashboard' },
        { name: 'Supervisor Dashboard', path: '/supervisor-dashboard' },
        // ...add more as your app grows
];

const Navbar = () => {
        const { setTheme, theme } = useTheme();
        const navigate = useNavigate();
        const { currentUser, logout } = useUser();
        const [globalSearch, setGlobalSearch] = useState('');
        const [showDropdown, setShowDropdown] = useState(false);

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

        const filteredFeatures = globalSearch
                ? featureList.filter(f =>
                                f.name.toLowerCase().includes(globalSearch.trim().toLowerCase())
                        )
                : [];

        const handleLogout = useCallback(async () => {
                await logout();
                navigate('/auth');
        }, [logout, navigate]);

        const handleGlobalSearch = (e: React.FormEvent) => {
                e.preventDefault();
                if (globalSearch.trim()) {
                        navigate(`/search?q=${encodeURIComponent(globalSearch.trim())}`);
                        setShowDropdown(false);
                        setGlobalSearch('');
                }
        };

        const handleFeatureClick = (path: string) => {
                setShowDropdown(false);
                setGlobalSearch('');
                navigate(path);
        };

        return (
                <div className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
                        <div className="grid h-16 grid-cols-[auto,1fr,auto] items-center px-4 lg:px-6 gap-4">
                                {/* Brand */}
                                <div className="flex items-center shrink-0">
                                        <NavBrand />
                                </div>

                                {/* Search — center, grows */}
                                <div className="w-full max-w-xl justify-self-center">
                                        <div className="mx-auto w-full max-w-lg">
                                                <CommandPalette />
                                        </div>
                                </div>

                                {/* Right actions — grouped with dividers */}
                                <div className="flex items-center gap-1.5 justify-self-end">
                                        {/* Realtime status dot */}
                                        <RealtimeActivityIndicator variant="pulse" size="sm" showTooltip={true} />

                                        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

                                        {/* Theme toggle */}
                                        <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                                                className="h-8 w-8 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                                title="Toggle theme"
                                        >
                                                {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                                                <span className="sr-only">Toggle theme</span>
                                        </Button>

                                        {/* Chat */}
                                        <ChatNotificationIndicator />

                                        {/* Notifications */}
                                        <ErrorBoundary fallback={null}>
                                          <NavbarNotificationBell />
                                        </ErrorBoundary>

                                        <div className="w-px h-5 bg-gray-200 dark:bg-gray-700 mx-1" />

                                        {/* User Menu */}
                                        <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="sm" className="h-8 flex items-center gap-2 px-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                                                                <Avatar className="h-7 w-7">
                                                                        <AvatarImage src={currentUser?.avatar || undefined} alt="User" />
                                                                        <AvatarFallback className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 text-xs font-semibold">
                                                                                {currentUser?.name?.charAt(0) || 'U'}
                                                                        </AvatarFallback>
                                                                </Avatar>
                                                                <span className="font-medium text-sm text-gray-700 dark:text-gray-300 hidden md:inline-block max-w-[120px] truncate">
                                                                        {currentUser?.name || 'User'}
                                                                </span>
                                                        </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-56">
                                                        <DropdownMenuLabel className="text-xs text-gray-500">
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
                </div>
  );
};

export default Navbar;
