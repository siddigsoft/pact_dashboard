import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MapPin, 
  Wallet, 
  MessageSquare,
  Menu,
  Receipt,
  CheckCircle,
  BarChart,
  FileText,
  Bell,
  AlertTriangle,
  Cloud,
  CloudOff,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/context/user/UserContext';
import { AppRole } from '@/types';
import { MobileMoreMenu } from './MobileMoreMenu';
import { EmergencySOS } from './EmergencySOS';
import { useSyncStatus } from './SyncStatusBar';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badgeType?: 'notifications' | 'approvals' | 'chat';
  offlineCapable?: boolean;
}

interface MobileBottomNavProps {
  notificationCount?: number;
  pendingApprovals?: number;
  chatUnread?: number;
  className?: string;
  showSyncStatus?: boolean;
  showSOSButton?: boolean;
  onOpenSyncQueue?: () => void;
}

const getNavItemsForRole = (hasRole: (role: AppRole) => boolean): NavItem[] => {
  const items: NavItem[] = [
    { icon: LayoutDashboard, label: 'Home', path: '/dashboard', offlineCapable: false },
    { icon: MapPin, label: 'Sites', path: '/site-visits', offlineCapable: true },
  ];

  if (hasRole('DataCollector')) {
    items.push({ icon: Receipt, label: 'Costs', path: '/cost-submission', offlineCapable: true });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('Coordinator')) {
    items.push({ icon: Receipt, label: 'Costs', path: '/cost-submission', offlineCapable: true });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('Reviewer')) {
    items.push({ icon: FileText, label: 'MMP', path: '/mmp', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('ICT')) {
    items.push({ icon: BarChart, label: 'Reports', path: '/reports', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('Supervisor')) {
    items.push({ icon: CheckCircle, label: 'Approvals', path: '/withdrawal-approval', badgeType: 'approvals', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('Field Operation Manager (FOM)')) {
    items.push({ icon: CheckCircle, label: 'Approvals', path: '/withdrawal-approval', badgeType: 'approvals', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('ProjectManager')) {
    items.push({ icon: CheckCircle, label: 'Approvals', path: '/withdrawal-approval', badgeType: 'approvals', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('SeniorOperationsLead')) {
    items.push({ icon: CheckCircle, label: 'Approvals', path: '/withdrawal-approval', badgeType: 'approvals', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('FinancialAdmin')) {
    items.push({ icon: CheckCircle, label: 'Approvals', path: '/finance-approval', badgeType: 'approvals', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else if (hasRole('Admin') || hasRole('SuperAdmin')) {
    items.push({ icon: CheckCircle, label: 'Approvals', path: '/finance-approval', badgeType: 'approvals', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  } else {
    items.push({ icon: Wallet, label: 'Wallet', path: '/wallet', offlineCapable: false });
    items.push({ icon: Bell, label: 'Alerts', path: '/notifications', badgeType: 'notifications', offlineCapable: false });
  }

  return items;
};

export function MobileBottomNav({ 
  notificationCount = 0, 
  pendingApprovals = 0, 
  chatUnread = 0, 
  className,
  showSyncStatus = true,
  showSOSButton = true,
  onOpenSyncQueue
}: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasRole } = useUser();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showSOS, setShowSOS] = useState(false);
  
  // Sync status hook
  const { isOnline, isSyncing, pendingCount } = useSyncStatus();

  const navItems = getNavItemsForRole(hasRole);

  const isActive = (path: string) => {
    if (path === '/dashboard') {
      return location.pathname === '/' || location.pathname === '/dashboard';
    }
    return location.pathname.startsWith(path);
  };

  const handleNavigation = (path: string) => {
    if (!isActive(path)) {
      hapticPresets.buttonPress();
    }
    navigate(path);
  };

  const handleOpenMenu = () => {
    hapticPresets.buttonPress();
    setIsMenuOpen(true);
  };

  const getBadgeCount = (badgeType?: string): number => {
    if (!badgeType) return 0;
    switch (badgeType) {
      case 'notifications': return notificationCount;
      case 'approvals': return pendingApprovals;
      case 'chat': return chatUnread;
      default: return 0;
    }
  };

  return (
    <>
      <nav 
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40",
          "bg-white dark:bg-black border-t border-black/10 dark:border-white/10",
          "sm:hidden",
          className
        )}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        data-testid="mobile-bottom-nav"
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-around h-16 px-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.path);
            const badgeCount = getBadgeCount(item.badgeType);
            const showBadge = badgeCount > 0;

            return (
              <button
                key={item.path}
                onClick={() => handleNavigation(item.path)}
                className={cn(
                  "flex flex-col items-center justify-center flex-1 h-full gap-0.5 relative",
                  "transition-colors touch-manipulation",
                  active 
                    ? "text-black dark:text-white" 
                    : "text-black/40 dark:text-white/40 active:text-black dark:active:text-white"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
              >
                <motion.div 
                  className="relative"
                  whileTap={{ scale: 0.9 }}
                  transition={{ duration: 0.1 }}
                >
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
                  {showBadge && (
                    <motion.span 
                      className="absolute -top-1 -right-1.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold px-1"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                      data-testid={`badge-${item.label.toLowerCase()}`}
                      aria-label={`${badgeCount} ${item.badgeType}`}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </motion.span>
                  )}
                </motion.div>
                <span className={cn(
                  "text-[10px] font-medium",
                  active && "font-semibold"
                )}>
                  {item.label}
                </span>
                {active && (
                  <motion.div 
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-black dark:bg-white rounded-full"
                    layoutId="nav-indicator"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </button>
            );
          })}

          {/* Sync Status Indicator */}
          {showSyncStatus && (
            <button
              onClick={() => {
                hapticPresets.buttonPress();
                onOpenSyncQueue?.();
              }}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 relative",
                "transition-colors touch-manipulation",
                !isOnline 
                  ? "text-destructive" 
                  : pendingCount > 0 
                    ? "text-black dark:text-white" 
                    : "text-black/40 dark:text-white/40"
              )}
              data-testid="nav-sync"
              aria-label={!isOnline ? 'Offline' : pendingCount > 0 ? `${pendingCount} pending sync` : 'Synced'}
            >
              <motion.div 
                className="relative"
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.1 }}
              >
                {!isOnline ? (
                  <CloudOff className="h-5 w-5" />
                ) : isSyncing ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Cloud className="h-5 w-5" />
                )}
                {pendingCount > 0 && isOnline && !isSyncing && (
                  <motion.span 
                    className="absolute -top-1 -right-1.5 h-4 min-w-4 flex items-center justify-center rounded-full bg-black dark:bg-white text-white dark:text-black text-[10px] font-bold px-1"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                    data-testid="badge-sync-pending"
                    aria-label={`${pendingCount} pending`}
                  >
                    {pendingCount > 99 ? '99+' : pendingCount}
                  </motion.span>
                )}
              </motion.div>
              <span className="text-[10px] font-medium">
                {!isOnline ? 'Offline' : isSyncing ? 'Syncing' : 'Sync'}
              </span>
            </button>
          )}

          {/* SOS Button */}
          {showSOSButton && (
            <button
              onClick={() => {
                hapticPresets.buttonPress();
                setShowSOS(true);
              }}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full gap-0.5 relative",
                "transition-colors touch-manipulation",
                "text-destructive active:text-destructive/80"
              )}
              data-testid="nav-sos"
              aria-label="Emergency SOS"
            >
              <motion.div 
                whileTap={{ scale: 0.9 }}
                transition={{ duration: 0.1 }}
              >
                <AlertTriangle className="h-5 w-5" />
              </motion.div>
              <span className="text-[10px] font-medium">SOS</span>
            </button>
          )}

          <button
            onClick={handleOpenMenu}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-0.5 relative",
              "transition-colors touch-manipulation",
              "text-black/40 dark:text-white/40 active:text-black dark:active:text-white"
            )}
            data-testid="nav-more"
            aria-label="More options"
            aria-haspopup="true"
            aria-expanded={isMenuOpen}
          >
            <motion.div 
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.1 }}
            >
              <Menu className="h-5 w-5" />
            </motion.div>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      <div className="h-16 sm:hidden" aria-hidden="true" />

      <MobileMoreMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
      
      {/* Emergency SOS Modal */}
      <EmergencySOS isVisible={showSOS} onClose={() => setShowSOS(false)} />
    </>
  );
}

export function MobileNavSpacer() {
  return <div className="h-16 sm:hidden" aria-hidden="true" />;
}
