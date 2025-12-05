import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Cloud, CloudOff, Check, AlertTriangle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { syncManager, type SyncProgress, type SyncResult } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';
import { cn } from '@/lib/utils';

interface SyncStatusBarProps {
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
  onSyncComplete?: (result: SyncResult) => void;
}

interface OfflineStats {
  pendingActions: number;
  unsyncedVisits: number;
  unsyncedLocations: number;
  cachedItems: number;
}

export function SyncStatusBar({ 
  className, 
  showDetails = true,
  compact = false,
  onSyncComplete 
}: SyncStatusBarProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [lastResult, setLastResult] = useState<SyncResult | null>(syncManager.getLastResult());
  const [stats, setStats] = useState<OfflineStats | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [justCameOnline, setJustCameOnline] = useState(false);

  const refreshStats = useCallback(async () => {
    try {
      const offlineStats = await getOfflineStats();
      setStats(offlineStats);
    } catch (error) {
      console.error('Failed to get offline stats:', error);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setJustCameOnline(true);
      setTimeout(() => setJustCameOnline(false), 5000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setJustCameOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete((result) => {
      setLastResult(result);
      refreshStats();
      onSyncComplete?.(result);
    });

    refreshStats();
    const statsInterval = setInterval(refreshStats, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(statsInterval);
    };
  }, [refreshStats, onSyncComplete]);

  const handleManualSync = useCallback(async () => {
    if (!isOnline || progress.isRunning) return;
    await syncManager.forceSync();
  }, [isOnline, progress.isRunning]);

  const pendingCount = stats 
    ? stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations 
    : 0;

  const progressPercent = progress.total > 0 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;

  const getStatusIcon = () => {
    if (!isOnline) {
      return <CloudOff className="h-4 w-4 text-destructive" />;
    }
    if (progress.isRunning) {
      return <Loader2 className="h-4 w-4 animate-spin text-black dark:text-white" />;
    }
    if (pendingCount > 0) {
      return <AlertTriangle className="h-4 w-4 text-black dark:text-white" />;
    }
    return <Cloud className="h-4 w-4 text-black dark:text-white" />;
  };

  const getStatusText = () => {
    if (!isOnline) {
      return 'Offline';
    }
    if (progress.isRunning) {
      return progress.current || 'Syncing...';
    }
    if (justCameOnline && pendingCount > 0) {
      return 'Back online - Ready to sync';
    }
    if (pendingCount > 0) {
      return `${pendingCount} pending`;
    }
    if (lastResult?.success && lastResult.synced > 0) {
      return 'All synced';
    }
    return 'Up to date';
  };

  const getStatusBadgeVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    if (!isOnline) return 'destructive';
    if (progress.isRunning) return 'default';
    if (pendingCount > 0) return 'secondary';
    return 'outline';
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {getStatusIcon()}
        {pendingCount > 0 && (
          <Badge variant="secondary" className="text-xs">
            {pendingCount}
          </Badge>
        )}
        {(isOnline && (pendingCount > 0 || justCameOnline)) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={handleManualSync}
            disabled={progress.isRunning || !isOnline}
            className="h-7 px-2"
            data-testid="button-sync-compact"
          >
            <RefreshCw className={cn("h-3 w-3", progress.isRunning && "animate-spin")} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("p-3", className)}>
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {getStatusIcon()}
            <span className="text-sm truncate" data-testid="text-sync-status">
              {getStatusText()}
            </span>
            {pendingCount > 0 && !progress.isRunning && (
              <Badge variant={getStatusBadgeVariant()} className="shrink-0">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            {isOnline && (pendingCount > 0 || justCameOnline) && (
              <Button
                size="sm"
                variant={justCameOnline ? "default" : "outline"}
                onClick={handleManualSync}
                disabled={progress.isRunning || !isOnline}
                data-testid="button-sync-now"
              >
                <RefreshCw className={cn("h-4 w-4 mr-1", progress.isRunning && "animate-spin")} />
                {progress.isRunning ? 'Syncing...' : 'Sync Now'}
              </Button>
            )}
            
            {showDetails && (
              <CollapsibleTrigger asChild>
                <Button size="icon" variant="ghost" data-testid="button-expand-sync">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            )}
          </div>
        </div>

        {progress.isRunning && (
          <div className="mt-3 space-y-1">
            <Progress value={progressPercent} className="h-2" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{progress.current || 'Syncing...'}</span>
              <span>{progress.completed}/{progress.total}</span>
            </div>
          </div>
        )}

        <CollapsibleContent className="mt-3 space-y-3">
          {stats && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                <span className="text-muted-foreground">Pending Actions</span>
                <Badge variant={stats.pendingActions > 0 ? "secondary" : "outline"}>
                  {stats.pendingActions}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                <span className="text-muted-foreground">Site Visits</span>
                <Badge variant={stats.unsyncedVisits > 0 ? "secondary" : "outline"}>
                  {stats.unsyncedVisits}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                <span className="text-muted-foreground">Locations</span>
                <Badge variant={stats.unsyncedLocations > 0 ? "secondary" : "outline"}>
                  {stats.unsyncedLocations}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-2 bg-muted/50 rounded-md">
                <span className="text-muted-foreground">Cached</span>
                <Badge variant="outline">{stats.cachedItems}</Badge>
              </div>
            </div>
          )}

          {lastResult && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              <div className="flex items-center justify-between">
                <span>Last sync:</span>
                <span>
                  {lastResult.timestamp.toLocaleTimeString()} - 
                  {lastResult.success ? (
                    <span className="text-black dark:text-white ml-1">
                      <Check className="h-3 w-3 inline" /> {lastResult.synced} synced
                    </span>
                  ) : (
                    <span className="text-destructive ml-1">
                      <AlertTriangle className="h-3 w-3 inline" /> {lastResult.failed} failed
                    </span>
                  )}
                </span>
              </div>
              {lastResult.errors.length > 0 && (
                <div className="mt-1 text-destructive">
                  {lastResult.errors.slice(0, 2).map((err, i) => (
                    <div key={i} className="truncate">{err}</div>
                  ))}
                  {lastResult.errors.length > 2 && (
                    <div>+{lastResult.errors.length - 2} more errors</div>
                  )}
                </div>
              )}
            </div>
          )}

          {progress.nextRetryAt && (
            <div className="text-xs text-muted-foreground">
              Next retry: {progress.nextRetryAt.toLocaleTimeString()}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function OfflineBanner({ className }: { className?: string }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBanner, setShowBanner] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setTimeout(() => setShowBanner(false), 3000);
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div 
      className={cn(
        "px-4 py-2 text-center text-sm font-medium transition-colors",
        isOnline 
          ? "bg-black/10 dark:bg-white/10 text-black dark:text-white" 
          : "bg-destructive/10 text-destructive",
        className
      )}
      data-testid="banner-offline"
    >
      {isOnline ? (
        <span className="flex items-center justify-center gap-2">
          <Cloud className="h-4 w-4" />
          Back online - Syncing your changes...
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <CloudOff className="h-4 w-4" />
          You're offline - Changes will sync when back online
        </span>
      )}
    </div>
  );
}

export function SyncIndicator({ className }: { className?: string }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const updateStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (error) {
        console.error('Failed to get offline stats:', error);
      }
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress((progress) => {
      setIsSyncing(progress.isRunning);
    });

    const unsubComplete = syncManager.onComplete(() => {
      updateStats();
    });

    updateStats();
    const interval = setInterval(updateStats, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(interval);
    };
  }, []);

  if (isOnline && pendingCount === 0 && !isSyncing) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {!isOnline && (
        <Badge variant="destructive" className="text-xs">
          <CloudOff className="h-3 w-3 mr-1" />
          Offline
        </Badge>
      )}
      {isSyncing && (
        <Badge variant="default" className="text-xs">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Syncing
        </Badge>
      )}
      {isOnline && pendingCount > 0 && !isSyncing && (
        <Badge variant="secondary" className="text-xs">
          {pendingCount} pending
        </Badge>
      )}
    </div>
  );
}

export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updateStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (error) {
        console.error('Failed to get offline stats:', error);
      }
    };

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete(() => updateStats());

    updateStats();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
    };
  }, []);

  const sync = useCallback(async () => {
    return syncManager.forceSync();
  }, []);

  return {
    isOnline,
    isSyncing: progress.isRunning,
    pendingCount,
    progress,
    sync,
  };
}
