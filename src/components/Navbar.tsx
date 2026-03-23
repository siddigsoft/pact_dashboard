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
import { MoonIcon, SunIcon, Bell, Settings, LogOut, UserIcon, MessageSquare, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useUser } from '@/context/user/UserContext';
import NotificationDropdown from '@/components/NotificationDropdown';
import { useNotifications } from '@/context/notifications/NotificationContext';
import ChatNotificationIndicator from '@/components/chat/ChatNotificationIndicator';
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
        const { getUnreadNotificationsCount } = useNotifications();
        const [globalSearch, setGlobalSearch] = useState('');
        const [showDropdown, setShowDropdown] = useState(false);

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
                <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
                        <div className="grid h-16 grid-cols-[auto,1fr,auto] items-center px-4 gap-4">
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
                                <div className="flex items-center gap-1 justify-self-end">
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
                                        <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                                                <Bell className="h-4 w-4" />
                                                                {getUnreadNotificationsCount() > 0 && (
                                                                        <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white rounded-full h-4 w-4 flex items-center justify-center text-[10px] font-bold">
                                                                                {getUnreadNotificationsCount() > 9 ? '9+' : getUnreadNotificationsCount()}
                                                                        </span>
                                                                )}
                                                                <span className="sr-only">Notifications</span>
                                                        </Button>
                                                </DropdownMenuTrigger>
                                                <NotificationDropdown onClose={() => {}} />
                                        </DropdownMenu>

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
                                                                {currentUser?.role || 'My Account'}
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
