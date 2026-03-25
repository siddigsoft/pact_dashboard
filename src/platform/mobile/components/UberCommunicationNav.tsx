import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare, Phone, Bell, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
}

interface UberCommunicationNavProps {
  chatUnread?: number;
  callsMissed?: number;
  notificationCount?: number;
}

export function UberCommunicationNav({ 
  chatUnread = 0, 
  callsMissed = 0, 
  notificationCount = 0 
}: UberCommunicationNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems: NavItem[] = [
    { icon: Home, label: 'Home', path: '/dashboard', badge: 0 },
    { icon: MessageSquare, label: 'Chat', path: '/chat', badge: chatUnread },
    { icon: Phone, label: 'Calls', path: '/calls', badge: callsMissed },
    { icon: Bell, label: 'Alerts', path: '/notifications', badge: notificationCount },
  ];

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname === path;
  };

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 uber-font"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      data-testid="uber-communication-nav"
    >
      <div className="bg-background/95 backdrop-blur-xl border-t border-border/30">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const showBadge = item.badge && item.badge > 0;

            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-1 relative",
                  "transition-all duration-200 touch-manipulation",
                  active 
                    ? "text-foreground" 
                    : "text-muted-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <div className="relative">
                  <div className={cn(
                    "p-2 rounded-full transition-all duration-200",
                    active && "bg-foreground/10"
                  )}>
                    <Icon className={cn(
                      "h-5 w-5 transition-all",
                      active && "stroke-[2.5px]"
                    )} />
                  </div>
                  {showBadge && (
                    <span 
                      className="uber-notification-dot"
                      data-testid={`badge-${item.label.toLowerCase()}`}
                    >
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] uber-text",
                  active ? "font-bold" : "font-medium"
                )}>
                  {item.label}
                </span>
                {active && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-1 bg-foreground rounded-b-full" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export function UberNavSpacer() {
  return <div className="h-20" aria-hidden="true" />;
}
