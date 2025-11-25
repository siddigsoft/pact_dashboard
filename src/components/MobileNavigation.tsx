
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Home, Map, FileText, Users, MessageSquare, Receipt, 
  DollarSign, Wallet, FolderOpen, BarChart, Calendar,
  Settings, Archive, MoreHorizontal, X, Sparkles, CreditCard,
  CheckCircle, TrendingUp
} from 'lucide-react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useAppContext } from '@/context/AppContext';
import { AppRole } from '@/types';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NavItem {
  icon: any;
  label: string;
  path: string;
  roles?: AppRole[];
  badge?: number;
  premium?: boolean;
}

const MobileNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { getUnreadMessagesCount } = useChat();
  const { currentUser, roles } = useAppContext();
  const unreadChatCount = getUnreadMessagesCount();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  
  const hasRole = (requiredRoles: AppRole[]): boolean => {
    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.some(role => roles?.includes(role) || currentUser?.role === role);
  };

  const primaryNavItems: NavItem[] = [
    { icon: Home, label: 'Home', path: '/dashboard', roles: [] },
    { icon: Map, label: 'Field', path: '/field-team', roles: [] },
    { icon: FileText, label: 'MMP', path: '/mmp', roles: [] },
    { icon: MessageSquare, label: 'Chat', path: '/chat', badge: unreadChatCount, roles: [] },
    { icon: MoreHorizontal, label: 'More', path: '', roles: [] }
  ];

  const secondaryNavItems: NavItem[] = [
    { icon: DollarSign, label: 'Finance', path: '/finance', roles: ['admin' as AppRole, 'financialAdmin' as AppRole, 'fom' as AppRole] },
    { icon: TrendingUp, label: 'Financial Ops', path: '/financial-operations', roles: ['admin' as AppRole, 'financialAdmin' as AppRole, 'fom' as AppRole] },
    { icon: Wallet, label: 'Wallet', path: '/wallet', roles: [] },
    { icon: CreditCard, label: 'Admin Wallets', path: '/admin/wallets', roles: ['admin' as AppRole, 'financialAdmin' as AppRole] },
    { icon: CheckCircle, label: 'Withdrawals', path: '/withdrawal-approval', roles: ['admin' as AppRole, 'financialAdmin' as AppRole, 'fom' as AppRole] },
    { icon: DollarSign, label: 'Budget', path: '/budget', roles: ['admin' as AppRole, 'financialAdmin' as AppRole, 'fom' as AppRole] },
    { icon: FolderOpen, label: 'Projects', path: '/projects', roles: [] },
    { icon: BarChart, label: 'Reports', path: '/reports', roles: ['admin' as AppRole, 'supervisor' as AppRole, 'fom' as AppRole, 'financialAdmin' as AppRole] },
    { icon: Receipt, label: 'Costs', path: '/cost-submission', roles: ['dataCollector' as AppRole, 'admin' as AppRole] },
    { icon: Calendar, label: 'Calendar', path: '/calendar', roles: [] },
    { icon: Users, label: 'Team', path: '/users', roles: [] },
    { icon: Settings, label: 'Settings', path: '/settings', roles: [] },
    { icon: Archive, label: 'Archive', path: '/archive', roles: ['admin' as AppRole, 'supervisor' as AppRole, 'fom' as AppRole] }
  ].filter(item => hasRole(item.roles || []));

  const isActive = (path: string) => {
    if (!path) return false;
    if (path === '/dashboard' && location.pathname === '/dashboard') {
      return true;
    }
    return path !== '/dashboard' && location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    if (path) {
      navigate(path);
      setIsMoreOpen(false);
    } else {
      setIsMoreOpen(true);
    }
  };

  return (
    <>
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 shadow-2xl backdrop-blur-lg bg-gradient-to-r from-slate-900/95 via-slate-800/95 to-slate-900/95 dark:from-slate-950/95 dark:via-slate-900/95 dark:to-slate-950/95 border-t border-blue-500/20"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="grid grid-cols-5 h-[64px]">
          {primaryNavItems.map((item, index) => {
            const active = isActive(item.path);
            return (
              <button
                key={index}
                data-testid={`button-nav-${item.label.toLowerCase()}`}
                className={`flex flex-col items-center justify-center gap-1 transition-all duration-200 relative overflow-visible min-h-[56px] min-w-[56px] touch-manipulation select-none active:scale-95 ${
                  active 
                    ? 'bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                onClick={() => handleNavigation(item.path)}
              >
                <div className="relative">
                  <item.icon className={`h-6 w-6 ${active ? 'drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`} />
                  {item.badge && item.badge > 0 && (
                    <>
                      <span className="absolute -top-1.5 -right-2 bg-gradient-to-br from-red-500 to-red-700 text-white text-[10px] rounded-full min-w-[18px] h-[18px] flex items-center justify-center shadow-md z-10 px-1">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                      <Sparkles className="absolute -top-2 -right-2.5 h-3 w-3 text-yellow-400 animate-pulse z-0" />
                    </>
                  )}
                </div>
                <span className="text-[11px] font-medium">{item.label}</span>
                {active && (
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <Sheet open={isMoreOpen} onOpenChange={setIsMoreOpen}>
        <SheetContent 
          side="bottom" 
          className="h-[70vh] bg-gradient-to-b from-slate-900 to-slate-950 border-t border-blue-500/30"
        >
          <SheetHeader className="border-b border-blue-500/20 pb-4">
            <SheetTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-blue-400" />
              More Features
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(70vh-80px)] mt-4">
            <div className="grid grid-cols-3 gap-3 p-2">
              {secondaryNavItems.map((item, index) => {
                const active = isActive(item.path);
                return (
                  <button
                    key={index}
                    data-testid={`button-more-${item.label.toLowerCase()}`}
                    className={`flex flex-col items-center justify-center min-h-[80px] p-3 rounded-xl transition-all duration-200 touch-manipulation select-none active:scale-95 ${
                      active
                        ? 'bg-gradient-to-br from-blue-500/30 to-purple-500/30 shadow-lg shadow-blue-500/20 border border-blue-400/30'
                        : 'bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700'
                    }`}
                    onClick={() => handleNavigation(item.path)}
                  >
                    <div className="relative mb-2">
                      <item.icon 
                        className={`h-7 w-7 ${
                          active 
                            ? 'text-blue-400 drop-shadow-[0_0_10px_rgba(59,130,246,0.6)]' 
                            : 'text-gray-400'
                        }`} 
                      />
                      {active && (
                        <Sparkles className="absolute -top-1 -right-1 h-3 w-3 text-yellow-400 animate-pulse" />
                      )}
                    </div>
                    <span className={`text-[11px] font-medium text-center leading-tight ${
                      active ? 'text-white' : 'text-gray-300'
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
    </>
  );
};

export default MobileNavigation;
