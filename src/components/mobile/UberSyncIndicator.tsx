import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RefreshCw, 
  Cloud, 
  CloudOff, 
  Check, 
  AlertTriangle, 
  Loader2,
  Wifi,
  WifiOff,
  ChevronUp
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncManager, type SyncProgress, type SyncResult, setupAutoSync } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface OfflineStats {
  pendingActions: number;
  unsyncedVisits: number;
  unsyncedLocations: number;
  cachedItems: number;
}

interface UberSyncIndicatorProps {
  className?: string;
  autoSyncInterval?: number;
  onSyncComplete?: (result: SyncResult) => void;
}

export function UberSyncIndicator({ 
  className,
  autoSyncInterval = 30000,
  onSyncComplete 
}: UberSyncIndicatorProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [lastResult, setLastResult] = useState<SyncResult | null>(syncManager.getLastResult());
  const [stats, setStats] = useState<OfflineStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [justSynced, setJustSynced] = useState(false);
  const autoSyncCleanup = useRef<(() => void) | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const offlineStats = await getOfflineStats();
      setStats(offlineStats);
    } catch (error) {
      console.error('[UberSync] Failed to get offline stats:', error);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      refreshStats();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete((result) => {
      setLastResult(result);
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 3000);
      refreshStats();
      onSyncComplete?.(result);
    });

    refreshStats();
    const statsInterval = setInterval(refreshStats, 5000);

    if (autoSyncInterval > 0) {
      autoSyncCleanup.current = setupAutoSync(autoSyncInterval);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(statsInterval);
      autoSyncCleanup.current?.();
    };
  }, [refreshStats, onSyncComplete, autoSyncInterval]);

  const handleManualSync = useCallback(async () => {
    if (!isOnline || progress.isRunning) return;
    hapticPresets.buttonPress();
    await syncManager.forceSync();
  }, [isOnline, progress.isRunning]);

  const pendingCount = stats 
    ? stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations 
    : 0;

  const progressPercent = progress.total > 0 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;

  const getStatusColor = () => {
    if (!isOnline) return 'bg-destructive';
    if (progress.isRunning) return 'bg-black dark:bg-white';
    if (justSynced) return 'bg-black dark:bg-white';
    if (pendingCount > 0) return 'bg-black/70 dark:bg-white/70';
    return 'bg-black dark:bg-white';
  };

  const getStatusIcon = () => {
    if (!isOnline) {
      return <WifiOff className="h-4 w-4" />;
    }
    if (progress.isRunning) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (justSynced) {
      return <Check className="h-4 w-4" />;
    }
    if (pendingCount > 0) {
      return <AlertTriangle className="h-4 w-4" />;
    }
    return <Wifi className="h-4 w-4" />;
  };

  const getStatusText = () => {
    if (!isOnline) return 'Offline';
    if (progress.isRunning) return 'Syncing...';
    if (justSynced) return 'Synced';
    if (pendingCount > 0) return `${pendingCount} pending`;
    return 'Online';
  };

  return (
    <div className={cn("fixed bottom-20 left-4 right-4 z-50 safe-area-bottom", className)}>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden"
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4"
          data-testid="button-sync-indicator"
          aria-label={`Connection status: ${getStatusText()}`}
        >
          <div className="flex items-center gap-3">
            <motion.div 
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-white",
                getStatusColor()
              )}
              animate={{ scale: progress.isRunning ? [1, 1.1, 1] : 1 }}
              transition={{ repeat: progress.isRunning ? Infinity : 0, duration: 1 }}
            >
              {getStatusIcon()}
            </motion.div>
            
            <div className="text-left">
              <div className="font-semibold text-black dark:text-white" data-testid="text-connection-status">
                {getStatusText()}
              </div>
              {progress.isRunning && (
                <div className="text-xs text-black/60 dark:text-white/60">
                  {progress.current || 'Syncing your data...'}
                </div>
              )}
              {!isOnline && (
                <div className="text-xs text-black/60 dark:text-white/60">
                  Changes saved locally
                </div>
              )}
              {isOnline && pendingCount > 0 && !progress.isRunning && (
                <div className="text-xs text-black/60 dark:text-white/60">
                  Tap Sync Now to upload
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isOnline && (pendingCount > 0 || progress.isRunning) && (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  handleManualSync();
                }}
                disabled={progress.isRunning || !isOnline}
                className="rounded-full bg-black dark:bg-white text-white dark:text-black hover:bg-black/90 dark:hover:bg-white/90 px-4"
                data-testid="button-sync-now"
                aria-label="Sync now"
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", progress.isRunning && "animate-spin")} />
                {progress.isRunning ? 'Syncing' : 'Sync Now'}
              </Button>
            )}
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronUp className="h-5 w-5 text-black/40 dark:text-white/40" />
            </motion.div>
          </div>
        </button>

        {progress.isRunning && (
          <div className="px-4 pb-2">
            <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-black dark:bg-white rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 pt-2 border-t border-black/5 dark:border-white/5 space-y-3">
                {stats && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                      <span className="text-sm text-black/60 dark:text-white/60">Actions</span>
                      <span className="font-semibold text-black dark:text-white" data-testid="text-pending-actions">
                        {stats.pendingActions}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                      <span className="text-sm text-black/60 dark:text-white/60">Visits</span>
                      <span className="font-semibold text-black dark:text-white" data-testid="text-unsynced-visits">
                        {stats.unsyncedVisits}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                      <span className="text-sm text-black/60 dark:text-white/60">Locations</span>
                      <span className="font-semibold text-black dark:text-white" data-testid="text-unsynced-locations">
                        {stats.unsyncedLocations}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                      <span className="text-sm text-black/60 dark:text-white/60">Cached</span>
                      <span className="font-semibold text-black dark:text-white" data-testid="text-cached-items">
                        {stats.cachedItems}
                      </span>
                    </div>
                  </div>
                )}

                {lastResult && (
                  <div className="flex items-center justify-between text-sm p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                    <span className="text-black/60 dark:text-white/60">Last sync</span>
                    <div className="flex items-center gap-2">
                      {lastResult.success ? (
                        <span className="flex items-center gap-1 text-black dark:text-white">
                          <Check className="h-3 w-3" />
                          {lastResult.synced} synced
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          {lastResult.failed} failed
                        </span>
                      )}
                      <span className="text-black/40 dark:text-white/40">
                        {lastResult.timestamp.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                )}

                {!isOnline && (
                  <div className="p-3 bg-destructive/10 rounded-xl">
                    <div className="flex items-center gap-2 text-destructive">
                      <CloudOff className="h-4 w-4" />
                      <span className="text-sm font-medium">No internet connection</span>
                    </div>
                    <p className="text-xs text-destructive/80 mt-1">
                      Your changes are saved locally and will sync automatically when you're back online.
                    </p>
                  </div>
                )}

                {isOnline && pendingCount === 0 && !progress.isRunning && (
                  <div className="p-3 bg-black/5 dark:bg-white/5 rounded-xl">
                    <div className="flex items-center gap-2 text-black dark:text-white">
                      <Cloud className="h-4 w-4" />
                      <span className="text-sm font-medium">All data synced</span>
                    </div>
                    <p className="text-xs text-black/60 dark:text-white/60 mt-1">
                      Your data is up to date with the server.
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export function UberOfflineBadge({ className }: { className?: string }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const updateStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (error) {
        console.error('[UberOfflineBadge] Failed to get stats:', error);
      }
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  if (isOnline && pendingCount === 0) return null;

  return (
    <motion.button
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer",
        !isOnline 
          ? "bg-destructive text-white" 
          : "bg-white/20 text-white border border-white/30",
        className
      )}
      data-testid="button-offline-badge"
      aria-label={isOnline ? `${pendingCount} items pending sync` : 'Currently offline'}
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3 w-3" />
          Offline
        </>
      ) : (
        <>
          <AlertTriangle className="h-3 w-3" />
          {pendingCount} pending
        </>
      )}
    </motion.button>
  );
}
