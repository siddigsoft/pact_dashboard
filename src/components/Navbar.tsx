
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
import { MoonIcon, SunIcon, Bell, Settings, LogOut, UserIcon, MessageSquare } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useUser } from '@/context/user/UserContext';
import NotificationDropdown from '@/components/NotificationDropdown';
import { useNotifications } from '@/context/notifications/NotificationContext';
import ChatNotificationIndicator from '@/components/chat/ChatNotificationIndicator';
import NavBrand from './navbar/NavBrand';
import { GlobalSearch } from './navbar/GlobalSearch';

const Navbar = () => {
  const { setTheme, theme } = useTheme();
  const navigate = useNavigate();
  const { currentUser, logout } = useUser();
  const { getUnreadNotificationsCount } = useNotifications();
  
  const handleLogout = useCallback(async () => {
    await logout();
    navigate('/auth');
  }, [logout, navigate]);
  
  return (
    <div className="border-b bg-gradient-to-r from-white to-gray-50 dark:from-gray-950 dark:to-gray-900">
      <div className="flex h-16 items-center px-4 container mx-auto">
        {/* Brand */}
        <NavBrand />
        
        {/* Global Search */}
        <GlobalSearch />
        
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
