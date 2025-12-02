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
  FileText,
  Cloud,
  CloudOff,
  RefreshCw,
  Map,
  DollarSign,
  MessageSquare,
  WifiOff,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useState } from 'react';
import { useOffline } from '@/hooks/use-offline';
import { Progress } from '@/components/ui/progress';

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

const moreNavItems: NavItem[] = [
  { icon: ClipboardList, label: 'MMP List', path: '/mmp', offlineCapable: true },
  { icon: Map, label: 'Field Team', path: '/field-team', offlineCapable: false },
  { icon: Users, label: 'Team', path: '/users', offlineCapable: false },
  { icon: MessageSquare, label: 'Chat', path: '/chat', offlineCapable: false },
  { icon: DollarSign, label: 'Costs', path: '/cost-submission', offlineCapable: true },
  { icon: FileText, label: 'Reports', path: '/tracker-preparation', offlineCapable: false },
  { icon: Settings, label: 'Settings', path: '/settings', offlineCapable: true },
];

export function MobileBottomNav({ notificationCount = 0, className }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const { isOnline, stats, syncProgress, isSyncing, syncNow } = useOffline();

  const pendingCount = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;

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

  const handleSync = async () => {
    if (!isSyncing && isOnline && pendingCount > 0) {
      await syncNow();
    }
  };

  return (
    <>
      {!isOnline && (
        <div 
          className="fixed bottom-16 left-0 right-0 z-50 bg-amber-500/90 text-amber-950 px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-2 sm:hidden"
          data-testid="offline-banner"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span>Offline Mode - Changes will sync when connected</span>
        </div>
      )}

      {isSyncing && syncProgress && (
        <div 
          className="fixed bottom-16 left-0 right-0 z-50 bg-primary/90 text-primary-foreground px-3 py-1.5 sm:hidden"
          data-testid="sync-progress-banner"
        >
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Syncing...
            </span>
            <span>{syncProgress.completed}/{syncProgress.total}</span>
          </div>
          <Progress value={(syncProgress.completed / Math.max(syncProgress.total, 1)) * 100} className="h-1" />
        </div>
      )}

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
                    : "text-muted-foreground active:text-foreground",
                  !isOnline && !item.offlineCapable && "opacity-50"
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
                  "flex flex-col items-center justify-center flex-1 h-full gap-0.5 relative",
                  "transition-colors touch-manipulation",
                  moreOpen
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                )}
                data-testid="nav-more"
              >
                <div className="relative">
                  <Menu className="h-5 w-5" />
                  {pendingCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 min-w-4 flex items-center justify-center rounded-full bg-amber-500 text-amber-950 text-[10px] font-medium px-1">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-auto max-h-[80vh] rounded-t-xl">
              <SheetHeader className="pb-3">
                <SheetTitle className="flex items-center justify-between">
                  <span>More Options</span>
                  <div className="flex items-center gap-2">
                    {isOnline ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <Cloud className="h-3.5 w-3.5" />
                        Online
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                        <CloudOff className="h-3.5 w-3.5" />
                        Offline
                      </span>
                    )}
                  </div>
                </SheetTitle>
              </SheetHeader>

              {pendingCount > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-muted">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                      <span className="text-sm font-medium">Pending Sync</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{pendingCount} items</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 mb-2">
                    {stats.unsyncedVisits > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Site Visits</span>
                        <span>{stats.unsyncedVisits}</span>
                      </div>
                    )}
                    {stats.unsyncedLocations > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Locations</span>
                        <span>{stats.unsyncedLocations}</span>
                      </div>
                    )}
                    {stats.pendingActions > 0 && (
                      <div className="flex items-center justify-between">
                        <span>Other Actions</span>
                        <span>{stats.pendingActions}</span>
                      </div>
                    )}
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full"
                    onClick={handleSync}
                    disabled={isSyncing || !isOnline}
                    data-testid="button-sync-now"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        Syncing...
                      </>
                    ) : isOnline ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        Sync Now
                      </>
                    ) : (
                      <>
                        <CloudOff className="h-3.5 w-3.5 mr-1.5" />
                        Sync When Online
                      </>
                    )}
                  </Button>
                </div>
              )}

              <ScrollArea className="max-h-[40vh]">
                <div className="grid grid-cols-4 gap-3 pb-4">
                  {moreNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    const disabled = !isOnline && !item.offlineCapable;
                    
                    return (
                      <button
                        key={item.path}
                        onClick={() => !disabled && handleNavigation(item.path)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-2.5 rounded-lg relative",
                          "transition-colors touch-manipulation",
                          active 
                            ? "bg-primary/10 text-primary" 
                            : "text-muted-foreground active:bg-muted",
                          disabled && "opacity-40 cursor-not-allowed"
                        )}
                        disabled={disabled}
                        data-testid={`nav-more-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium text-center leading-tight">{item.label}</span>
                        {item.offlineCapable && (
                          <span className="absolute top-1 right-1">
                            <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <Separator className="my-2" />

                <div className="py-3">
                  <p className="text-[10px] text-muted-foreground text-center mb-2">
                    <CheckCircle2 className="h-2.5 w-2.5 inline mr-1 text-green-500" />
                    = Works Offline
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => {
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
