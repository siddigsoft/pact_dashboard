import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cloud, CloudOff, Check, X, Loader2, RefreshCw, Upload, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { syncManager, type SyncProgress, type SyncResult } from '@/lib/sync-manager';
import { triggerHaptic } from '@/lib/haptics';

interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  title: string;
  message?: string;
  icon?: 'sync' | 'upload' | 'offline' | 'check' | 'error';
  duration?: number;
}

export function SyncProgressToast() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { ...toast, id }]);
    
    if (toast.duration !== 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, toast.duration || 3000);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      addToast({
        type: 'success',
        title: 'Back online',
        message: 'Syncing your data...',
        icon: 'sync',
        duration: 2000,
      });
      triggerHaptic('success');
    };

    const handleOffline = () => {
      setIsOnline(false);
      addToast({
        type: 'warning',
        title: 'You are offline',
        message: 'Changes will sync when connected',
        icon: 'offline',
        duration: 4000,
      });
      triggerHaptic('warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [addToast]);

  useEffect(() => {
    const unsubProgress = syncManager.onProgress((progress) => {
      setSyncProgress(progress);
    });

    const unsubComplete = syncManager.onComplete((result: SyncResult) => {
      setSyncProgress(null);
      
      if (result.synced > 0 || result.failed > 0) {
        if (result.success) {
          addToast({
            type: 'success',
            title: 'Sync complete',
            message: `${result.synced} item${result.synced !== 1 ? 's' : ''} synced`,
            icon: 'check',
            duration: 2500,
          });
          triggerHaptic('success');
        } else {
          addToast({
            type: 'error',
            title: 'Sync failed',
            message: `${result.failed} item${result.failed !== 1 ? 's' : ''} failed to sync`,
            icon: 'error',
            duration: 4000,
          });
          triggerHaptic('error');
        }
      }
    });

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, [addToast]);

  const getIcon = (icon?: string, isAnimating?: boolean) => {
    const iconClass = cn("h-4 w-4", isAnimating && "animate-spin");
    switch (icon) {
      case 'sync': return <RefreshCw className={iconClass} />;
      case 'upload': return <Upload className="h-4 w-4" />;
      case 'offline': return <WifiOff className="h-4 w-4" />;
      case 'check': return <Check className="h-4 w-4" />;
      case 'error': return <X className="h-4 w-4" />;
      default: return <Cloud className="h-4 w-4" />;
    }
  };

  const getToastStyles = (type: ToastMessage['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-destructive text-white';
      case 'warning':
        return 'bg-amber-500 text-white';
      default:
        return 'bg-black text-white dark:bg-white dark:text-black';
    }
  };

  return (
    <div className="fixed top-4 left-4 right-4 z-[60] pointer-events-none">
      <AnimatePresence mode="popLayout">
        {/* Sync Progress Bar */}
        {syncProgress?.isRunning && (
          <motion.div
            key="sync-progress"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-2 pointer-events-auto"
          >
            <div className="bg-black dark:bg-white text-white dark:text-black rounded-full px-4 py-2 shadow-lg flex items-center gap-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {syncProgress.current || 'Syncing...'}
                </div>
                <div className="h-1 mt-1 bg-white/20 dark:bg-black/20 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-white dark:bg-black"
                    initial={{ width: 0 }}
                    animate={{ 
                      width: syncProgress.total > 0 
                        ? `${(syncProgress.completed / syncProgress.total) * 100}%`
                        : '0%'
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
              <span className="text-xs opacity-60">
                {syncProgress.completed}/{syncProgress.total}
              </span>
            </div>
          </motion.div>
        )}

        {/* Toast Messages */}
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="mb-2 pointer-events-auto"
          >
            <button 
              className={cn(
                "w-full rounded-full px-4 py-2 shadow-lg flex items-center gap-3 cursor-pointer",
                getToastStyles(toast.type)
              )}
              onClick={() => removeToast(toast.id)}
              role="alert"
              aria-live="polite"
              data-testid={`button-dismiss-toast-${toast.id}`}
              aria-label={`Dismiss ${toast.title} notification`}
            >
              {getIcon(toast.icon, toast.icon === 'sync')}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{toast.title}</div>
                {toast.message && (
                  <div className="text-xs opacity-80">{toast.message}</div>
                )}
              </div>
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function useSyncToast() {
  const showSyncStarted = useCallback(() => {
    console.log('[SyncToast] Sync started');
  }, []);

  const showSyncComplete = useCallback((count: number) => {
    console.log(`[SyncToast] Synced ${count} items`);
  }, []);

  const showSyncError = useCallback((error: string) => {
    console.error(`[SyncToast] Sync error: ${error}`);
  }, []);

  return {
    showSyncStarted,
    showSyncComplete,
    showSyncError,
  };
}
