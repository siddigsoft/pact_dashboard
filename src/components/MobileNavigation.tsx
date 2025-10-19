
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Map, FileText, Users, Wallet, MessageSquare } from 'lucide-react';
import { useChat } from '@/context/chat/ChatContextSupabase';

const MobileNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { getUnreadMessagesCount } = useChat();
  const unreadChatCount = getUnreadMessagesCount();
  
  const navItems = [
    { icon: Home, label: 'Home', path: '/dashboard' },
    { icon: Map, label: 'Field', path: '/field-team' },
    { icon: FileText, label: 'MMP', path: '/mmp' },
    { icon: MessageSquare, label: 'Chat', path: '/chat', badge: unreadChatCount },
    { icon: Users, label: 'Team', path: '/users' },
    { icon: Wallet, label: 'Wallet', path: '/wallet' },
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
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t z-50">
      <div className="grid grid-cols-6 h-16">
        {navItems.map((item) => (
          <button
            key={item.path}
            className={`flex flex-col items-center justify-center space-y-1 ${
              isActive(item.path) ? 'text-primary' : 'text-gray-500'
            }`}
            onClick={() => navigate(item.path)}
          >
            <div className="relative">
              <item.icon className="h-5 w-5" />
              {item.badge && item.badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
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
