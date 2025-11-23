
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Map, FileText, Users, MessageSquare, Receipt } from 'lucide-react';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useAppContext } from '@/context/AppContext';
import { AppRole } from '@/types';

const MobileNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { getUnreadMessagesCount } = useChat();
  const { currentUser, roles } = useAppContext();
  const unreadChatCount = getUnreadMessagesCount();
  
  // Check if user is a data collector or admin
  const isDataCollector = roles?.includes('dataCollector' as AppRole) || currentUser?.role === 'dataCollector';
  const isAdmin = roles?.includes('admin' as AppRole) || currentUser?.role === 'admin';
  
  const navItems = [
    { icon: Home, label: 'Home', path: '/dashboard' },
    { icon: Map, label: 'Field', path: '/field-team' },
    { icon: FileText, label: 'MMP', path: '/mmp' },
    { icon: MessageSquare, label: 'Chat', path: '/chat', badge: unreadChatCount },
    ...(isDataCollector || isAdmin ? [{ icon: Receipt, label: 'Costs', path: '/cost-submission' }] : []),
    { icon: Users, label: 'Team', path: '/users' },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard' && location.pathname === '/dashboard') {
      return true;
    }
    // For other paths, check if the current path starts with the nav item path
    // But make an exception for dashboard
    return path !== '/dashboard' && location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card dark:bg-card border-t border-border z-50 shadow-lg">
      <div className="grid grid-cols-6 h-16">
        {navItems.map((item) => (
          <button
            key={item.path}
            data-testid={`button-nav-${item.label.toLowerCase()}`}
            className={`flex flex-col items-center justify-center space-y-1 transition-colors hover-elevate ${
              isActive(item.path) ? 'text-primary' : 'text-muted-foreground'
            }`}
            onClick={() => navigate(item.path)}
          >
            <div className="relative">
              <item.icon className="h-5 w-5" />
              {item.badge && item.badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-gradient-to-br from-red-500 to-red-700 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center shadow-md">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </div>
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default MobileNavigation;
