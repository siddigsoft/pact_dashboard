import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Home, Map, FileText, Users, MessageSquare, Receipt,
  DollarSign, Wallet, BarChart, Calendar, Settings,
  Archive, Menu, X, Search, Bell, User, Sun, Moon
} from 'lucide-react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useAppContext } from '@/context/AppContext';
import { AppRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useUser } from '@/context/user/UserContext';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { useTheme } from 'next-themes';
import NotificationDropdown from '@/components/NotificationDropdown';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUnifiedNavigation } from '@/hooks/use-unified-navigation';

interface NavItem {
  icon: any;
  label: string;
  path: string;
  roles?: AppRole[];
  badge?: number;
}

const TabletNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { getUnreadMessagesCount } = useChat();
  const { currentUser, roles } = useAppContext();
  const { currentUser: userContext } = useUser();
  const { getUnreadNotificationsCount } = useNotifications();
  const { setTheme, theme } = useTheme();
  const { primaryItems, secondaryItems } = useUnifiedNavigation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const unreadChatCount = getUnreadMessagesCount();

  // Convert navigation items to the format expected by the component
  const primaryNavItems: NavItem[] = primaryItems.map(item => ({
    icon: item.icon,
    label: item.label,
    path: item.path,
    roles: item.roles,
    badge: item.badge === 'chat' ? unreadChatCount : undefined
  }));

  const secondaryNavItems: NavItem[] = secondaryItems.map(item => ({
    icon: item.icon,
    label: item.label,
    path: item.path,
    roles: item.roles,
    badge: item.badge === 'chat' ? unreadChatCount : undefined
  }));

  const isActive = (path: string) => {
    if (!path) return false;
    if (path === '/dashboard' && location.pathname === '/dashboard') {
      return true;
    }
    return path !== '/dashboard' && location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setIsMenuOpen(false);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
      setIsMenuOpen(false);
    }
  };

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center px-4">
          {/* Mobile Menu Trigger */}
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80">
              <SheetHeader>
                <SheetTitle>Navigation</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-80px)] mt-4">
                <div className="space-y-2">
                  {[...primaryNavItems, ...secondaryNavItems].map((item) => {
                    const active = isActive(item.path);
                    return (
                      <Button
                        key={item.path}
                        variant={active ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => handleNavigation(item.path)}
                      >
                        <item.icon className="mr-2 h-4 w-4" />
                        {item.label}
                        {item.badge && item.badge > 0 && (
                          <Badge variant="destructive" className="ml-auto">
                            {item.badge > 99 ? '99+' : item.badge}
                          </Badge>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          {/* Brand/Title */}
          <div className="flex items-center space-x-2">
            <h1 className="text-lg font-semibold">PACT Platform</h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 ml-8">
            {primaryNavItems.slice(0, 6).map((item) => {
              const active = isActive(item.path);
              return (
                <Button
                  key={item.path}
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => handleNavigation(item.path)}
                  className="relative"
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                  {item.badge && item.badge > 0 && (
                    <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-xs">
                      {item.badge > 99 ? '99' : item.badge}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </nav>

          {/* Search Bar */}
          <div className="flex-1 max-w-md mx-4">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-4"
              />
            </form>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center space-x-2">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle theme</span>
            </Button>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="h-4 w-4" />
                  {getUnreadNotificationsCount() > 0 && (
                    <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-xs">
                      {getUnreadNotificationsCount() > 9 ? '9+' : getUnreadNotificationsCount()}
                    </Badge>
                  )}
                  <span className="sr-only">Notifications</span>
                </Button>
              </DropdownMenuTrigger>
              <NotificationDropdown onClose={() => {}} />
            </DropdownMenu>

            {/* User Menu */}
            <Button variant="ghost" size="sm" className="flex items-center gap-2 px-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={userContext?.avatar || undefined} alt="User" />
                <AvatarFallback>
                  {userContext?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="hidden lg:inline-block font-medium text-sm">
                {userContext?.name || 'User'}
              </span>
            </Button>
          </div>
        </div>
      </header>

      {/* Bottom Navigation for smaller tablets */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur border-t">
        <div className="grid grid-cols-5 h-14">
          {primaryNavItems.slice(0, 5).map((item, index) => {
            const active = isActive(item.path);
            return (
              <button
                key={index}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => handleNavigation(item.path)}
              >
                <div className="relative">
                  <item.icon className={`h-5 w-5 ${active ? 'drop-shadow-sm' : ''}`} />
                  {item.badge && item.badge > 0 && (
                    <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-xs">
                      {item.badge > 99 ? '99' : item.badge}
                    </Badge>
                  )}
                </div>
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};

export default TabletNavigation;