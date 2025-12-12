import { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  MapPin, 
  Wallet, 
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from '@/context/user/UserContext';
import { AppRole } from '@/types';
import { EmergencySOS } from './EmergencySOS';

interface NavItem {
  icon: React.ElementType;
  label: string;
  path: string;
  badgeType?: 'notifications' | 'approvals' | 'chat';
  offlineCapable?: boolean;
}

interface MobileBottomNavProps {
  notificationCount?: number;
  className?: string;
  showSOSButton?: boolean;
}

const getNavItemsForRole = (hasRole: (role: AppRole) => boolean): NavItem[] => {
  // Fixed navigation: Home, Sites, SOS, Wallet only
  const items: NavItem[] = [
    { icon: LayoutDashboard, label: 'Home', path: '/dashboard', offlineCapable: false },
    { icon: MapPin, label: 'Sites', path: '/site-visits', offlineCapable: true },
    { icon: Wallet, label: 'Wallet', path: '/wallet', offlineCapable: false },
  ];

  return items;
};

export function MobileBottomNav({ 
  notificationCount = 0, 
  className,
  showSOSButton = true
}: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasRole } = useUser();
  const [showSOS, setShowSOS] = useState(false);

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
        <div className="flex items-center justify-around h-12 px-0.5">
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
                  "transition-all duration-200 touch-manipulation",
                  active 
                    ? "text-black dark:text-white" 
                    : "text-black/40 dark:text-white/40 active:text-black dark:active:text-white"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.div 
                    className="absolute inset-0 bg-black/5 dark:bg-white/5 rounded-lg"
                    layoutId="nav-glow"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <motion.div 
                  className="relative z-10"
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
                  "text-[10px] font-medium relative z-10",
                  active && "font-semibold"
                )}>
                  {item.label}
                </span>
              </button>
            );
          })}

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
        </div>
      </nav>

      <div className="h-12 sm:hidden" aria-hidden="true" />
      
      {/* Emergency SOS Modal */}
      <EmergencySOS isVisible={showSOS} onClose={() => setShowSOS(false)} />
    </>
  );
}

export function MobileNavSpacer() {
  return <div className="h-12 sm:hidden" aria-hidden="true" />;
}
