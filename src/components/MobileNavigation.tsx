
import React, { useState, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, Map, FileText, Users, MessageSquare, Receipt, 
  DollarSign, Wallet, FolderOpen, BarChart, Calendar,
  Settings, Archive, MoreHorizontal, X, Sparkles, CreditCard,
  CheckCircle, TrendingUp, MapPin, Banknote, Search
} from 'lucide-react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useAppContext } from '@/context/AppContext';
import { AppRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUnifiedNavigation } from '@/hooks/use-unified-navigation';
import MobileGlobalSearch from '@/components/MobileGlobalSearch';

interface NavItem {
  icon: any;
  label: string;
  path: string;
  roles?: AppRole[];
  badge?: number;
  premium?: boolean;
}

const MobileNavigation = React.memo(() => {
  const location = useLocation();
  const navigate = useNavigate();
  const { getUnreadMessagesCount } = useChat();
  const { currentUser, roles } = useAppContext();
  const { primaryItems, secondaryItems, tertiaryItems } = useUnifiedNavigation();
  const unreadChatCount = getUnreadMessagesCount();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  // Memoize navigation items to prevent unnecessary recalculations
  const primaryNavItems = useMemo(() => {
    const items = primaryItems.slice(0, 4).map(item => ({
      icon: item.icon,
      label: item.label,
      path: item.path,
      roles: item.roles,
      badge: item.badge === 'chat' ? unreadChatCount : undefined
    }));

    // Add "More" item
    items.push({
      icon: MoreHorizontal,
      label: 'More',
      path: '',
      roles: [],
      badge: undefined
    });

    return items;
  }, [primaryItems, unreadChatCount]);

  const filteredPrimaryNavItems = primaryNavItems; // Our unified system already handles filtering

  // Combine secondary and tertiary items for the "More" sheet
  const moreNavItems = useMemo(() =>
    [...secondaryItems, ...tertiaryItems].map(item => ({
      icon: item.icon,
      label: item.label,
      path: item.path,
      roles: item.roles,
      badge: item.badge === 'chat' ? unreadChatCount : undefined
    })), [secondaryItems, tertiaryItems, unreadChatCount]
  );

  // Memoize handlers
  const handleNavigation = useCallback((path: string) => {
    if (path) {
      navigate(path);
      setIsMoreOpen(false);
    } else {
      setIsMoreOpen(true);
    }
  }, [navigate]);

  const handleSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const isActive = useCallback((path: string) => {
    if (!path) return false;
    if (path === '/dashboard' && location.pathname === '/dashboard') {
      return true;
    }
    return path !== '/dashboard' && location.pathname.startsWith(path);
  }, [location.pathname]);

  return (
    <>
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 shadow-lg bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-5 h-[56px]">
          {filteredPrimaryNavItems.map((item, index) => {
            const active = isActive(item.path);
            return (
              <button
                key={index}
                data-testid={`button-nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center gap-0.5 transition-all duration-150 relative overflow-visible min-h-[52px] touch-manipulation select-none active:scale-95 px-1 ${
                  active 
                    ? 'text-black dark:text-white' 
                    : 'text-gray-400 dark:text-gray-500'
                }`}
                onClick={() => handleNavigation(item.path)}
                onTouchStart={() => {
                  if (navigator.vibrate) {
                    navigator.vibrate(10);
                  }
                }}
                style={{
                  WebkitTapHighlightColor: 'transparent',
                  touchAction: 'manipulation'
                }}
              >
                <div className="relative">
                  <item.icon className={`h-6 w-6 ${active ? 'stroke-[2.5px]' : ''}`} />
                  {item.badge && item.badge > 0 && (
                    <span className="absolute -top-1 -right-2 bg-black dark:bg-white text-white dark:text-black text-[9px] rounded-full min-w-[14px] h-[14px] flex items-center justify-center shadow-sm z-10 px-0.5">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-medium leading-tight">{item.label}</span>
                {active && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-10 h-0.5 bg-black dark:bg-white rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <SheetContent 
          side="bottom" 
          className="h-[70vh] bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800"
        >
          <SheetHeader className="border-b border-gray-200 dark:border-gray-800 pb-4">
            <SheetTitle className="text-xl font-bold text-black dark:text-white flex items-center gap-2">
              More Features
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(70vh-80px)] mt-4">
            <div className="grid grid-cols-3 gap-3 p-2">
              {moreNavItems.map((item, index) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={index}
                    data-testid={`button-more-${item.label.toLowerCase()}`}
                    className={`flex flex-col items-center justify-center min-h-[84px] p-4 rounded-2xl transition-all duration-200 touch-manipulation select-none active:scale-95 ${
                      active
                        ? 'bg-black dark:bg-white text-white dark:text-black'
                        : 'bg-gray-100 dark:bg-gray-900 hover:bg-gray-200 dark:hover:bg-gray-800'
                    }`}
                    onClick={() => handleNavigation(item.path)}
                    onTouchStart={() => {
                      if (navigator.vibrate) {
                        navigator.vibrate(10);
                      }
                    }}
                    style={{
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation'
                    }}
                  >
                    <div className="relative mb-2">
                      <item.icon 
                        className={`h-7 w-7 ${
                          active 
                            ? 'text-white dark:text-black' 
                            : 'text-gray-600 dark:text-gray-400'
                        }`} 
                      />
                    </div>
                    <span className={`text-[11px] font-medium text-center leading-tight ${
                      active ? 'text-white dark:text-black' : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Floating Search Button - Uber style black */}
      <Button
        onClick={handleSearch}
        className="fixed bottom-20 right-4 z-40 h-12 w-12 rounded-full shadow-lg bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 active:scale-95 transition-all duration-200"
        style={{
          WebkitTapHighlightColor: 'transparent',
          touchAction: 'manipulation'
        }}
        onTouchStart={() => {
          if (navigator.vibrate) {
            navigator.vibrate(10);
          }
        }}
      >
        <Search className="h-5 w-5 text-white dark:text-black" />
        <span className="sr-only">Search</span>
      </Button>

      {/* Mobile Search Overlay */}
      <MobileGlobalSearch
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
});

export default MobileNavigation;
