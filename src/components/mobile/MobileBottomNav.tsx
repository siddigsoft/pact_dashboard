import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MapPin, 
  Wallet, 
  Bell, 
  Menu,
  ClipboardList,
  Users,
  Settings,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';

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

const moreNavItems: NavItem[] = [
  { icon: ClipboardList, label: 'MMPs', path: '/mmps' },
  { icon: Users, label: 'Team', path: '/team' },
  { icon: FileText, label: 'Reports', path: '/tracker-preparation' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

export function MobileBottomNav({ notificationCount = 0, className }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    setMoreOpen(false);
  };

  return (
    <>
      <nav 
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 bg-background border-t safe-area-bottom",
          "sm:hidden",
          className
        )}
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

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-0.5",
                  "transition-colors touch-manipulation",
                  moreOpen
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                )}
                data-testid="nav-more"
              >
                <Menu className="h-5 w-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[70vh] rounded-t-xl">
              <SheetHeader className="pb-4">
                <SheetTitle>More Options</SheetTitle>
              </SheetHeader>
              <ScrollArea className="max-h-[50vh]">
                <div className="grid grid-cols-4 gap-4 pb-6">
                  {moreNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNavigation(item.path)}
                        className={cn(
                          "flex flex-col items-center gap-2 p-3 rounded-lg",
                          "transition-colors touch-manipulation",
                          active 
                            ? "bg-primary/10 text-primary" 
                            : "text-muted-foreground active:bg-muted"
                        )}
                        data-testid={`nav-more-${item.label.toLowerCase()}`}
                      >
                        <Icon className="h-6 w-6" />
                        <span className="text-xs font-medium">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
                <Separator className="my-2" />
                <div className="pt-4 pb-2">
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => {
                      // Get current user ID from localStorage or context
                      const storedUser = localStorage.getItem('PACTCurrentUser');
                      if (storedUser) {
                        try {
                          const user = JSON.parse(storedUser);
                          if (user.id) {
                            handleNavigation(`/users/${user.id}`);
                          }
                        } catch (e) {
                          console.error('Error parsing user:', e);
                        }
                      }
                    }}
                    data-testid="nav-profile"
                  >
                    View Profile
                  </Button>
                </div>
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      <div className="h-16 sm:hidden" aria-hidden="true" />
    </>
  );
}

export function MobileNavSpacer() {
  return <div className="h-16 sm:hidden" aria-hidden="true" />;
}
