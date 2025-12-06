import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, Cloud, CloudOff, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useMobileExtendedSettings } from '@/hooks/use-mobile-extended-settings';

interface MobileOfflineIndicatorProps {
  className?: string;
  showSyncButton?: boolean;
  onSync?: () => Promise<void>;
}

export function MobileOfflineIndicator({ 
  className, 
  showSyncButton = true,
  onSync 
}: MobileOfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const { settings } = useMobileExtendedSettings();
  const pendingCount = settings.syncStatus.pendingItemsCount;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    if (!onSync || isSyncing) return;
    
    setIsSyncing(true);
    try {
      await onSync();
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isOnline && pendingCount === 0 && !showSuccess) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-4 py-2",
        "text-sm font-medium transition-all duration-300",
        isOnline 
          ? showSuccess
            ? "bg-green-500 text-white"
            : "bg-amber-500 text-black" 
          : "bg-black text-white dark:bg-white dark:text-black",
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="offline-indicator"
    >
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <>
            <WifiOff className="w-4 h-4" aria-hidden="true" />
            <span>You're offline</span>
          </>
        ) : showSuccess ? (
          <>
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>All synced</span>
          </>
        ) : pendingCount > 0 ? (
          <>
            <CloudOff className="w-4 h-4" aria-hidden="true" />
            <span>{pendingCount} item{pendingCount !== 1 ? 's' : ''} pending sync</span>
          </>
        ) : null}
      </div>

      {showSyncButton && isOnline && pendingCount > 0 && onSync && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSync}
          disabled={isSyncing}
          className="h-7 px-2 text-black hover:bg-black/10"
          data-testid="button-sync-now"
          aria-label="Sync pending items now"
        >
          <RefreshCw className={cn("w-4 h-4 mr-1", isSyncing && "animate-spin")} aria-hidden="true" />
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </Button>
      )}
    </div>
  );
}

export function MobileConnectionBadge({ className }: { className?: string }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div 
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
        isOnline 
          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" 
          : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        className
      )}
      data-testid="connection-badge"
      aria-label={isOnline ? "Connected to internet" : "No internet connection"}
    >
      {isOnline ? (
        <>
          <Cloud className="w-3 h-3" aria-hidden="true" />
          <span>Online</span>
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" aria-hidden="true" />
          <span>Offline</span>
        </>
      )}
    </div>
  );
}
