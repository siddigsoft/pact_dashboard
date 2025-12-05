import { useEffect, useState } from 'react';
import { WifiOff, Wifi, RefreshCw, CloudOff, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface OfflineStatusBannerProps {
  className?: string;
  onRetry?: () => void;
}

export function OfflineStatusBanner({ className, onRetry }: OfflineStatusBannerProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [pendingActions, setPendingActions] = useState(0);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (wasOffline) {
        setShowReconnected(true);
        setTimeout(() => setShowReconnected(false), 3000);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setWasOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const checkPendingActions = () => {
      try {
        const offlineQueue = localStorage.getItem('offline_queue');
        if (offlineQueue) {
          const queue = JSON.parse(offlineQueue);
          setPendingActions(Array.isArray(queue) ? queue.length : 0);
        }
      } catch {
        setPendingActions(0);
      }
    };

    checkPendingActions();
    const interval = setInterval(checkPendingActions, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, [wasOffline]);

  const handleRetry = async () => {
    setIsRetrying(true);
    if (onRetry) {
      await onRetry();
    }
    setTimeout(() => setIsRetrying(false), 2000);
  };

  if (isOnline && !showReconnected && pendingActions === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        'safe-area-top',
        className
      )}
      role="alert"
      aria-live="polite"
    >
      {!isOnline && (
        <div className="bg-black dark:bg-white text-white dark:text-black px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <WifiOff className="h-5 w-5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-sm">No Internet Connection</p>
              <p className="text-xs opacity-70 truncate">
                Changes will sync when you're back online
                {pendingActions > 0 && ` (${pendingActions} pending)`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="flex-shrink-0 text-white dark:text-black hover:bg-white/10 dark:hover:bg-black/10 min-h-[36px]"
            onClick={handleRetry}
            disabled={isRetrying}
            data-testid="button-retry-connection"
          >
            <RefreshCw className={cn('h-4 w-4', isRetrying && 'animate-spin')} />
          </Button>
        </div>
      )}

      {showReconnected && (
        <div className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 flex items-center justify-center gap-2">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Back Online</span>
          {pendingActions > 0 && (
            <span className="text-xs opacity-70">
              Syncing {pendingActions} changes...
            </span>
          )}
        </div>
      )}

      {isOnline && pendingActions > 0 && !showReconnected && (
        <div className="bg-black dark:bg-white text-white dark:text-black px-4 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CloudOff className="h-4 w-4" />
            <span className="text-sm font-medium">Syncing {pendingActions} offline changes...</span>
          </div>
          <RefreshCw className="h-4 w-4 animate-spin" />
        </div>
      )}
    </div>
  );
}

export function ConnectionStatusIndicator() {
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
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
        isOnline
          ? 'bg-black/10 dark:bg-white/10 text-black dark:text-white'
          : 'bg-black/10 dark:bg-white/10 text-black dark:text-white'
      )}
      data-testid="status-connection"
    >
      {isOnline ? (
        <>
          <Wifi className="h-3 w-3" />
          <span>Online</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3" />
          <span>Offline</span>
        </>
      )}
    </div>
  );
}
