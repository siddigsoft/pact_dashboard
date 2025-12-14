import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw,
  Phone,
  MessageSquare,
  Cloud,
  CloudOff,
  Loader2,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  X,
  MoreVertical,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { syncManager, type SyncProgress } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';

interface FloatingMobileToolbarProps {
  className?: string;
  onCall?: () => void;
  onMessage?: () => void;
  onSOS?: () => void;
  showCommunication?: boolean;
  showEmergency?: boolean;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  callerName?: string;
  callerRole?: string;
}

export function FloatingMobileToolbar({
  className,
  onCall,
  onMessage,
  onSOS,
  showCommunication = true,
  showEmergency = true,
  position = 'bottom-right',
  callerName = 'Supervisor',
  callerRole = 'Field Coordinator',
}: FloatingMobileToolbarProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isExpanded, setIsExpanded] = useState(false);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncSuccess, setLastSyncSuccess] = useState<boolean | null>(null);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const refreshStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (error) {
        console.error('Failed to get offline stats:', error);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete((result) => {
      setLastSyncSuccess(result.success);
      setTimeout(() => setLastSyncSuccess(null), 3000);
      refreshStats();
    });

    refreshStats();
    const interval = setInterval(refreshStats, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(interval);
    };
  }, []);

  const handleSync = useCallback(async () => {
    if (!isOnline || progress.isRunning) return;
    hapticPresets.buttonPress();
    await syncManager.forceSync();
  }, [isOnline, progress.isRunning]);

  const handleCall = useCallback(() => {
    hapticPresets.buttonPress();
    onCall?.();
  }, [onCall]);

  const handleMessage = useCallback(() => {
    hapticPresets.buttonPress();
    onMessage?.();
  }, [onMessage]);

  const handleSOS = useCallback(() => {
    hapticPresets.heavy();
    setIsExpanded(false);
    onSOS?.();
  }, [onSOS]);

  const toggleExpanded = useCallback(() => {
    hapticPresets.selection();
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const positionClasses = {
    'bottom-left': 'bottom-20 left-4',
    'bottom-right': 'bottom-20 right-4',
    'top-left': 'top-20 left-4',
    'top-right': 'top-20 right-4',
  };

  const getSyncIcon = () => {
    if (!isOnline) return <CloudOff className="h-5 w-5" />;
    if (progress.isRunning) return <Loader2 className="h-5 w-5 animate-spin" />;
    if (lastSyncSuccess === true) return <CheckCircle className="h-5 w-5" />;
    if (lastSyncSuccess === false) return <AlertTriangle className="h-5 w-5" />;
    if (pendingCount > 0) return <AlertTriangle className="h-5 w-5" />;
    return <Cloud className="h-5 w-5" />;
  };

  const getSyncButtonVariant = (): "default" | "ghost" | "destructive" | "outline" => {
    if (!isOnline) return 'destructive';
    if (pendingCount > 0 || lastSyncSuccess === false) return 'default';
    return 'ghost';
  };

  return (
    <div className={cn("fixed z-50", positionClasses[position], className)}>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-16 right-0 mb-2"
          >
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-xl border border-black/10 dark:border-white/10 p-2 min-w-[200px]">
              {/* Sync Status */}
              <div className="p-3 border-b border-black/5 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getSyncIcon()}
                    <span className="text-sm font-medium text-black dark:text-white">
                      {!isOnline ? 'Offline' : progress.isRunning ? 'Syncing...' : pendingCount > 0 ? `${pendingCount} pending` : 'Synced'}
                    </span>
                  </div>
                  {isOnline && pendingCount > 0 && !progress.isRunning && (
                    <Button
                      variant="default"
                      onClick={handleSync}
                      className="rounded-full min-h-[44px] min-w-[80px]"
                      data-testid="button-sync-expanded"
                      aria-label={`Sync ${pendingCount} pending items`}
                    >
                      <RefreshCw className="h-4 w-4 mr-1.5" />
                      Sync
                    </Button>
                  )}
                </div>
                {progress.isRunning && (
                  <div className="mt-2">
                    <div className="h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-black dark:bg-white"
                        initial={{ width: 0 }}
                        animate={{ width: `${(progress.completed / Math.max(progress.total, 1)) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-black/60 dark:text-white/60 mt-1">
                      {progress.current || 'Processing...'}
                    </p>
                  </div>
                )}
              </div>

              {/* Communication Actions */}
              {showCommunication && (
                <div className="p-2 space-y-1">
                  <p className="text-xs text-black/40 dark:text-white/40 px-2 py-1">
                    Contact {callerRole}
                  </p>
                  <button
                    onClick={handleCall}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    data-testid="button-call-supervisor"
                    aria-label={`Call ${callerName}`}
                  >
                    <div className="w-10 h-10 bg-black dark:bg-white rounded-full flex items-center justify-center flex-shrink-0">
                      <Phone className="h-5 w-5 text-white dark:text-black" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-black dark:text-white">Call {callerName}</p>
                      <p className="text-xs text-black/60 dark:text-white/60">{callerRole}</p>
                    </div>
                  </button>
                  <button
                    onClick={handleMessage}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    data-testid="button-message-supervisor"
                    aria-label={`Send message to ${callerName}`}
                  >
                    <div className="w-10 h-10 bg-black/10 dark:bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                      <MessageSquare className="h-5 w-5 text-black dark:text-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-black dark:text-white">Message {callerName}</p>
                      <p className="text-xs text-black/60 dark:text-white/60">Quick message</p>
                    </div>
                  </button>
                </div>
              )}

              {/* Emergency SOS */}
              {showEmergency && onSOS && (
                <div className="p-2 border-t border-black/5 dark:border-white/5">
                  <button
                    onClick={handleSOS}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-destructive/10 hover:bg-destructive/20 transition-colors"
                    data-testid="button-open-sos"
                    aria-label="Open Emergency SOS"
                  >
                    <div className="w-10 h-10 bg-destructive rounded-full flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-bold text-destructive">Emergency SOS</p>
                      <p className="text-xs text-black/60 dark:text-white/60">Alert supervisors</p>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB */}
      <motion.div
        whileTap={{ scale: 0.95 }}
        className="relative"
      >
        <Button
          size="icon"
          variant={isExpanded ? "default" : getSyncButtonVariant()}
          onClick={toggleExpanded}
          className={cn(
            "rounded-full min-w-[56px] min-h-[56px] shadow-lg",
            !isOnline && "bg-destructive hover:bg-destructive/90"
          )}
          data-testid="button-floating-toolbar-toggle"
          aria-label={isExpanded ? 'Close toolbar' : 'Open toolbar'}
        >
          <AnimatePresence mode="wait">
            {isExpanded ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                <X className="h-6 w-6" />
              </motion.div>
            ) : (
              <motion.div
                key="menu"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
                className="relative"
              >
                {progress.isRunning ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <MoreVertical className="h-6 w-6" />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </Button>

        {/* Badge for pending count or offline status */}
        {!isExpanded && (pendingCount > 0 || !isOnline) && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1"
          >
            <Badge
              variant={isOnline ? "secondary" : "destructive"}
              className="min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full"
            >
              {isOnline ? pendingCount : '!'}
            </Badge>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

export function CompactSyncButton({ className }: { className?: string }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const refreshStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (error) {
        console.error('Failed to get offline stats:', error);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete(() => refreshStats());

    refreshStats();
    const interval = setInterval(refreshStats, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(interval);
    };
  }, []);

  const handleSync = useCallback(async () => {
    if (!isOnline || progress.isRunning) return;
    hapticPresets.buttonPress();
    await syncManager.forceSync();
  }, [isOnline, progress.isRunning]);

  if (isOnline && pendingCount === 0 && !progress.isRunning) {
    return null;
  }

  return (
    <Button
      size="sm"
      variant={!isOnline ? "destructive" : pendingCount > 0 ? "default" : "ghost"}
      onClick={handleSync}
      disabled={!isOnline || progress.isRunning}
      className={cn("rounded-full gap-1.5 min-h-[36px]", className)}
      data-testid="button-compact-sync"
      aria-label={!isOnline ? 'Offline' : progress.isRunning ? 'Syncing' : `${pendingCount} items pending sync`}
    >
      {!isOnline ? (
        <>
          <CloudOff className="h-4 w-4" />
          <span className="text-xs">Offline</span>
        </>
      ) : progress.isRunning ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Syncing</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4" />
          <span className="text-xs">{pendingCount}</span>
        </>
      )}
    </Button>
  );
}

export function SyncFAB({ className }: { className?: string }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const refreshStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (error) {
        console.error('Failed to get offline stats:', error);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete(() => refreshStats());

    refreshStats();
    const interval = setInterval(refreshStats, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(interval);
    };
  }, []);

  const handleSync = useCallback(async () => {
    if (!isOnline || progress.isRunning) return;
    hapticPresets.buttonPress();
    await syncManager.forceSync();
  }, [isOnline, progress.isRunning]);

  if (isOnline && pendingCount === 0 && !progress.isRunning) {
    return null;
  }

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      className={cn("fixed bottom-24 right-4 z-50", className)}
    >
      <Button
        size="icon"
        variant={!isOnline ? "destructive" : "default"}
        onClick={handleSync}
        disabled={!isOnline || progress.isRunning}
        className="rounded-full min-w-[56px] min-h-[56px] shadow-lg"
        data-testid="button-sync-fab"
        aria-label={!isOnline ? 'Offline' : progress.isRunning ? 'Syncing' : 'Sync now'}
      >
        {!isOnline ? (
          <CloudOff className="h-6 w-6" />
        ) : progress.isRunning ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <RefreshCw className="h-6 w-6" />
        )}
      </Button>
      {pendingCount > 0 && isOnline && !progress.isRunning && (
        <Badge
          variant="secondary"
          className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 text-xs font-bold rounded-full"
        >
          {pendingCount}
        </Badge>
      )}
    </motion.div>
  );
}
