import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAndroidBack } from '@/hooks/use-android-back';
import { useOffline } from '@/hooks/use-offline';
import { MobileBottomNav } from './MobileBottomNav';
import { OfflineIndicator } from './OfflineStatusBar';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface MobileLayoutProps {
  children: React.ReactNode;
  hideBottomNav?: boolean;
  className?: string;
  notificationCount?: number;
}

export function MobileLayout({ 
  children, 
  hideBottomNav = false,
  className,
  notificationCount = 0
}: MobileLayoutProps) {
  const isMobile = useIsMobile();
  const location = useLocation();
  const { isOnline, stats } = useOffline();
  const { toast } = useToast();
  const [exitConfirm, setExitConfirm] = useState(false);

  const hasPendingData = stats.pendingActions > 0 || stats.unsyncedVisits > 0;

  useAndroidBack({
    exitOnBack: true,
    onBack: () => {
      if (location.pathname === '/' || location.pathname === '/dashboard') {
        if (!exitConfirm) {
          setExitConfirm(true);
          toast({
            title: 'Press back again to exit',
            description: hasPendingData 
              ? `You have ${stats.pendingActions + stats.unsyncedVisits} unsynced items`
              : undefined,
            duration: 2000,
          });
          setTimeout(() => setExitConfirm(false), 2000);
          return true;
        }
      }
      return false;
    },
  });

  const shouldShowBottomNav = isMobile && !hideBottomNav;
  const showOfflineIndicator = !isOnline || hasPendingData;

  return (
    <div className={cn("min-h-screen flex flex-col", className)}>
      {showOfflineIndicator && <OfflineIndicator />}
      
      <div 
        className={cn(
          "flex-1 overflow-auto",
          showOfflineIndicator && "pt-6",
          shouldShowBottomNav && "pb-16"
        )}
      >
        {children}
      </div>

      {shouldShowBottomNav && (
        <MobileBottomNav notificationCount={notificationCount} />
      )}
    </div>
  );
}

export function useMobileLayout() {
  const isMobile = useIsMobile();
  const { isOnline, stats, isSyncing } = useOffline();
  
  return {
    isMobile,
    isOnline,
    hasPendingSync: stats.pendingActions > 0 || stats.unsyncedVisits > 0,
    isSyncing,
    stats,
  };
}
