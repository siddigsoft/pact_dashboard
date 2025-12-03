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
}

interface MobileBottomNavProps {
  notificationCount?: number;
  className?: string;
}

const mainNavItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Home', path: '/dashboard' },
  { icon: MapPin, label: 'Sites', path: '/mmp' },
  { icon: Wallet, label: 'Wallet', path: '/wallet' },
  { icon: Bell, label: 'Alerts', path: '/notifications' },
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
          "fixed bottom-0 left-0 right-0 z-40 bg-background border-t",
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
                    ? "text-primary" 
                    : "text-muted-foreground active:text-foreground"
                )}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <div className="relative">
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
                  {showBadge && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium px-1">
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
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
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
