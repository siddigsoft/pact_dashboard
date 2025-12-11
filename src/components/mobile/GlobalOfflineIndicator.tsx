import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi, Cloud, CloudOff, Signal, SignalLow, SignalZero } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOfflineStats } from '@/lib/offline-db';
import { getMediaStats } from '@/lib/offline-media-queue';
import { useLowBandwidth } from '@/contexts/LowBandwidthContext';

interface OfflineStats {
  pendingActions: number;
  unsyncedVisits: number;
  unsyncedLocations: number;
  mediaQueue: number;
  isOnline: boolean;
}

export function GlobalOfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [stats, setStats] = useState<OfflineStats>({
    pendingActions: 0,
    unsyncedVisits: 0,
    unsyncedLocations: 0,
    mediaQueue: 0,
    isOnline: navigator.onLine,
  });
  const [showDetails, setShowDetails] = useState(false);

  const { isLowBandwidthMode, effectiveType } = useLowBandwidth();

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, []);

  useEffect(() => {
    const updateStats = async () => {
      try {
        const [offlineStats, mediaStats] = await Promise.all([
          getOfflineStats(),
          getMediaStats(),
        ]);

        setStats({
          pendingActions: offlineStats.pendingActions,
          unsyncedVisits: offlineStats.unsyncedVisits,
          unsyncedLocations: offlineStats.unsyncedLocations,
          mediaQueue: mediaStats.pending + mediaStats.uploading,
          isOnline: navigator.onLine,
        });
      } catch (error) {
        console.error('[OfflineIndicator] Error loading stats:', error);
      }
    };

    updateStats();
    const interval = setInterval(updateStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalPending = stats.pendingActions + stats.unsyncedVisits + stats.mediaQueue;
  const hasOfflineData = totalPending > 0;

  const getSignalIcon = () => {
    if (!isOnline) return <WifiOff className="h-3.5 w-3.5" />;
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return <SignalZero className="h-3.5 w-3.5" />;
    if (effectiveType === '3g') return <SignalLow className="h-3.5 w-3.5" />;
    return <Signal className="h-3.5 w-3.5" />;
  };

  if (isOnline && !hasOfflineData && !isLowBandwidthMode) {
    return null;
  }

  return (
    <>
      <motion.button
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
          !isOnline 
            ? "bg-destructive/10 text-destructive"
            : hasOfflineData
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
              : isLowBandwidthMode
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60"
        )}
        onClick={() => setShowDetails(!showDetails)}
        data-testid="badge-offline-status"
        aria-label={isOnline ? `Online with ${totalPending} pending items` : 'Offline mode'}
      >
        {getSignalIcon()}
        {!isOnline ? (
          'Offline'
        ) : hasOfflineData ? (
          `${totalPending} pending`
        ) : isLowBandwidthMode ? (
          'Low Data'
        ) : null}
      </motion.button>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-black border border-black/10 dark:border-white/10 rounded-xl shadow-lg p-4 z-50"
          >
            <div className="space-y-3">
              {/* Connection Status */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-black dark:text-white">Connection</span>
                <div className={cn(
                  "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs",
                  isOnline 
                    ? "bg-green-500/10 text-green-600 dark:text-green-400" 
                    : "bg-destructive/10 text-destructive"
                )}>
                  {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                  {isOnline ? 'Online' : 'Offline'}
                </div>
              </div>

              {/* Network Type */}
              {effectiveType && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-black/60 dark:text-white/60">Network</span>
                  <span className="text-black dark:text-white uppercase">{effectiveType}</span>
                </div>
              )}

              {/* Low Bandwidth Mode */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-black/60 dark:text-white/60">Low Data Mode</span>
                <span className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  isLowBandwidthMode 
                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" 
                    : "bg-black/5 dark:bg-white/10 text-black/40 dark:text-white/40"
                )}>
                  {isLowBandwidthMode ? 'On' : 'Off'}
                </span>
              </div>

              {/* Pending Items */}
              {hasOfflineData && (
                <>
                  <div className="border-t border-black/10 dark:border-white/10 pt-3 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-black/60 dark:text-white/60">Pending Actions</span>
                      <span className="font-medium text-black dark:text-white">{stats.pendingActions}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-black/60 dark:text-white/60">Unsynced Visits</span>
                      <span className="font-medium text-black dark:text-white">{stats.unsyncedVisits}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-black/60 dark:text-white/60">Media Queue</span>
                      <span className="font-medium text-black dark:text-white">{stats.mediaQueue}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function OfflineBadge({ className }: { className?: string }) {
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

  if (isOnline) return null;

  return (
    <div 
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        "bg-destructive/10 text-destructive",
        className
      )}
      data-testid="badge-offline"
      aria-label="Currently offline"
    >
      <CloudOff className="h-3 w-3" />
      Offline
    </div>
  );
}
