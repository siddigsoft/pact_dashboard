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
	{ name: 'Field Operation Manager', path: '/field-operation-manager' },
	// ...add more as your app grows
];

const Navbar = () => {
	const { setTheme, theme } = useTheme();
	const navigate = useNavigate();
	const { currentUser, logout } = useUser();
	const { getUnreadNotificationsCount } = useNotifications();
	const [globalSearch, setGlobalSearch] = useState('');
	const [showDropdown, setShowDropdown] = useState(false);

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
		<div className="border-b bg-gradient-to-r from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
			<div className="flex h-16 items-center px-4 container mx-auto">
				{/* Brand */}
				<NavBrand />

				{/* Global Search */}
				<div className="mx-4 flex-1 max-w-md relative">
					<form onSubmit={handleGlobalSearch}>
						<div className="relative">
							<input
								type="search"
								value={globalSearch}
								onChange={e => {
									setGlobalSearch(e.target.value);
									setShowDropdown(true);
								}}
								onFocus={() => setShowDropdown(true)}
								onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
								placeholder="Search anything…"
								className="w-full rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
								aria-label="Global search"
								autoComplete="off"
							/>
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
						</div>
					</form>
					{showDropdown && globalSearch && (
						<div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-auto">
							{filteredFeatures.length > 0 ? (
								<ul>
									{filteredFeatures.map(f => (
										<li key={f.path}>
											<button
												type="button"
												className="w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900 text-gray-900 dark:text-gray-100"
												onMouseDown={() => handleFeatureClick(f.path)}
											>
												{f.name}
											</button>
										</li>
									))}
								</ul>
							) : (
								<div className="px-4 py-2 text-muted-foreground text-sm">
									No features found.
								</div>
							)}
						</div>
					)}
				</div>

				<div className="ml-auto flex items-center space-x-2">
					{/* Theme Toggle */}
					<Button
						variant="ghost"
						size="icon"
						onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
						className="mr-2"
					>
						{theme === 'dark' ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
						<span className="sr-only">Toggle theme</span>
					</Button>

					{/* Chat */}
					<ChatNotificationIndicator />

					{/* Notifications */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="relative">
								<Bell className="h-5 w-5" />
								{getUnreadNotificationsCount() > 0 && (
									<span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs">
										{getUnreadNotificationsCount() > 9 ? '9+' : getUnreadNotificationsCount()}
									</span>
								)}
								<span className="sr-only">Notifications</span>
							</Button>
						</DropdownMenuTrigger>
						<NotificationDropdown onClose={() => {}} />
					</DropdownMenu>

					{/* User Menu */}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="sm" className="relative h-9 flex items-center gap-2 px-2">
								<Avatar className="h-8 w-8">
									<AvatarImage src={currentUser?.avatar || undefined} alt="User" />
									<AvatarFallback className="bg-purple-100 text-purple-500">
										{currentUser?.name?.charAt(0) || 'U'}
									</AvatarFallback>
								</Avatar>
								<span className="font-medium text-sm hidden md:inline-block">
									{currentUser?.name || 'User'}
								</span>
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="w-56">
							<DropdownMenuLabel>My Account</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={() => navigate(`/users/${currentUser?.id}`)}>
								<UserIcon className="w-4 h-4 mr-2" />
								Profile
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => navigate('/chat')}>
								<MessageSquare className="w-4 h-4 mr-2" />
								Messages
							</DropdownMenuItem>
							<DropdownMenuItem onClick={() => navigate('/settings')}>
								<Settings className="w-4 h-4 mr-2" />
								Settings
							</DropdownMenuItem>
							<DropdownMenuSeparator />
							<DropdownMenuItem onClick={handleLogout}>
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
