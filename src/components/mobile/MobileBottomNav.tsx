import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MapPin, 
  Wallet, 
  Bell
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
  offlineCapable?: boolean;
}

interface MobileBottomNavProps {
  notificationCount?: number;
  className?: string;
}

const mainNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Home', path: '/dashboard', offlineCapable: false },
  { icon: MapPin, label: 'Sites', path: '/site-visits', offlineCapable: true },
  { icon: Wallet, label: 'Wallet', path: '/wallet', offlineCapable: false },
  { icon: Bell, label: 'Alerts', path: '/notifications', offlineCapable: false },
];

export function MobileBottomNav({ notificationCount = 0, className }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
  };

  return (
    <>
      <nav 
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40",
          "bg-white dark:bg-black border-t border-gray-200 dark:border-gray-800",
          "sm:hidden",
          className
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        data-testid="mobile-bottom-nav"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {mainNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const showBadge = item.path === '/notifications' && notificationCount > 0;

            return (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-0.5 relative",
                  "transition-colors touch-manipulation",
                  active 
                    ? "text-black dark:text-white" 
                    : "text-gray-400 dark:text-gray-500 active:text-black dark:active:text-white"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <div className="relative">
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 flex items-center justify-center rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-medium px-1">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  )}
                </div>
                <span className={cn(
                  "text-[10px] font-medium",
                  active && "font-semibold"
                )}>
                  {item.label}
                </span>
                {active && (
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-black dark:bg-white rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="h-16 sm:hidden" aria-hidden="true" />
    </>
  );
}

export function MobileNavSpacer() {
  return <div className="h-16 sm:hidden" aria-hidden="true" />;
}
