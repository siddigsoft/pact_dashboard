import { RefreshCw, Cloud, CloudOff, Check, AlertTriangle, Loader2, WifiOff, Wifi, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useSyncStatus, useSyncStatusSafe, useNetworkStatus, usePendingSync } from '@/context/sync/SyncStatusContext';
import { cn } from '@/lib/utils';
import { useState, useCallback, useEffect } from 'react';
import type { SyncResult } from '@/context/sync/SyncStatusContext';

interface UnifiedSyncStatusBarProps {
  className?: string;
  showDetails?: boolean;
  compact?: boolean;
  onSyncComplete?: (result: SyncResult) => void;
}

export function UnifiedSyncStatusBar({ 
  className, 
  showDetails = true,
  compact = false,
  onSyncComplete 
}: UnifiedSyncStatusBarProps) {
  const syncStatus = useSyncStatus();
  const [isExpanded, setIsExpanded] = useState(false);

  const { 
    isOnline, 
    isSyncing, 
    progress, 
    lastResult, 
    stats, 
    pendingCount,
    justCameOnline,
    forceSync 
  } = syncStatus;

  const handleManualSync = useCallback(async () => {
    if (!isOnline || isSyncing) return;
    const result = await forceSync();
    onSyncComplete?.(result);
  }, [isOnline, isSyncing, forceSync, onSyncComplete]);

  const progressPercent = progress.total > 0 
    ? Math.round((progress.completed / progress.total) * 100) 
    : 0;

  const getStatusIcon = () => {
    if (!isOnline) {
      return <CloudOff className="h-4 w-4 text-destructive" />;
    }
    if (isSyncing) {
      return <Loader2 className="h-4 w-4 animate-spin text-foreground" />;
    }
    if (pendingCount > 0) {
      return <AlertTriangle className="h-4 w-4 text-foreground" />;
    }
    return <Cloud className="h-4 w-4 text-foreground" />;
  };

  const getStatusText = () => {
    if (!isOnline) {
      return 'Offline';
    }
    if (isSyncing) {
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
    if (isSyncing) return 'default';
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
            disabled={isSyncing || !isOnline}
            className="h-7 px-2"
            data-testid="button-sync-compact"
          >
            <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
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
            {pendingCount > 0 && !isSyncing && (
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
                disabled={isSyncing || !isOnline}
                data-testid="button-sync-now"
              >
                <RefreshCw className={cn("h-4 w-4 mr-1", isSyncing && "animate-spin")} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
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

        {isSyncing && (
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
                    <span className="text-foreground ml-1">
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

interface UnifiedOfflineBannerProps {
  className?: string;
  position?: 'fixed' | 'static';
}

export function UnifiedOfflineBanner({ className, position = 'static' }: UnifiedOfflineBannerProps) {
  const syncStatus = useSyncStatusSafe();
  const { isOnline: fallbackOnline, justCameOnline: fallbackJustCame } = useNetworkStatus();
  const { pendingCount: fallbackPending, isSyncing: fallbackSyncing } = usePendingSync();
  
  const isOnline = syncStatus?.isOnline ?? fallbackOnline;
  const justCameOnline = syncStatus?.justCameOnline ?? fallbackJustCame;
  const pendingCount = syncStatus?.pendingCount ?? fallbackPending;
  const isSyncing = syncStatus?.isSyncing ?? fallbackSyncing;

  const [showBanner, setShowBanner] = useState(!navigator.onLine);

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
    } else if (isOnline && !justCameOnline && pendingCount === 0) {
      setShowBanner(false);
    }
  }, [isOnline, justCameOnline, pendingCount]);

  if (!showBanner && isOnline && !justCameOnline && pendingCount === 0) {
    return null;
  }

  const positionClasses = position === 'fixed' 
    ? 'fixed top-0 left-0 right-0 z-50 safe-area-top' 
    : '';

  if (!isOnline) {
    return (
      <div 
        className={cn(
          "px-4 py-2 text-center text-sm font-medium bg-destructive/10 text-destructive",
          positionClasses,
          className
        )}
        data-testid="banner-offline"
        role="alert"
        aria-live="polite"
      >
        <span className="flex items-center justify-center gap-2">
          <CloudOff className="h-4 w-4" />
          You're offline - Changes will sync when back online
          {pendingCount > 0 && ` (${pendingCount} pending)`}
        </span>
      </div>
    );
  }

  if (justCameOnline || (isSyncing && pendingCount > 0)) {
    return (
      <div 
        className={cn(
          "px-4 py-2 text-center text-sm font-medium bg-muted text-foreground transition-colors",
          positionClasses,
          className
        )}
        data-testid="banner-syncing"
        role="status"
        aria-live="polite"
      >
        <span className="flex items-center justify-center gap-2">
          <Cloud className="h-4 w-4" />
          {isSyncing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Syncing your changes...
            </>
          ) : (
            'Back online - Ready to sync'
          )}
        </span>
      </div>
    );
  }

  return null;
}

export function UnifiedConnectionIndicator({ className }: { className?: string }) {
  const { isOnline } = useNetworkStatus();

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
        isOnline
          ? 'bg-muted text-foreground'
          : 'bg-destructive/10 text-destructive'
      )}
      data-testid="indicator-connection"
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

export function UnifiedSyncIndicator({ className }: { className?: string }) {
  const syncStatus = useSyncStatusSafe();
  const { isOnline } = useNetworkStatus();
  const { pendingCount, isSyncing, hasErrors } = usePendingSync();

  const pending = syncStatus?.pendingCount ?? pendingCount;
  const syncing = syncStatus?.isSyncing ?? isSyncing;
  const errors = syncStatus?.hasErrors ?? hasErrors;
  const online = syncStatus?.isOnline ?? isOnline;

  if (online && pending === 0 && !syncing) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {!online && (
        <Badge variant="destructive" className="text-xs">
          <CloudOff className="h-3 w-3 mr-1" />
          Offline
        </Badge>
      )}
      {syncing && (
        <Badge variant="default" className="text-xs">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Syncing
        </Badge>
      )}
      {online && pending > 0 && !syncing && (
        <Badge variant={errors ? "destructive" : "secondary"} className="text-xs">
          {errors && <AlertTriangle className="h-3 w-3 mr-1" />}
          {pending} pending
        </Badge>
      )}
    </div>
  );
}

export function SyncButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  const syncStatus = useSyncStatusSafe();
  const { isOnline } = useNetworkStatus();
  const { pendingCount, isSyncing } = usePendingSync();

  const pending = syncStatus?.pendingCount ?? pendingCount;
  const syncing = syncStatus?.isSyncing ?? isSyncing;
  const online = syncStatus?.isOnline ?? isOnline;
  const forceSync = syncStatus?.forceSync;

  const handleSync = useCallback(async () => {
    if (!online || syncing || !forceSync) return;
    await forceSync();
  }, [online, syncing, forceSync]);

  if (!forceSync) return null;

  if (compact) {
    return (
      <Button
        size="icon"
        variant="ghost"
        onClick={handleSync}
        disabled={syncing || !online || pending === 0}
        className={cn("h-8 w-8", className)}
        data-testid="button-sync-trigger"
      >
        <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant={pending > 0 ? "default" : "outline"}
      onClick={handleSync}
      disabled={syncing || !online || pending === 0}
      className={className}
      data-testid="button-sync-trigger"
    >
      <RefreshCw className={cn("h-4 w-4 mr-1", syncing && "animate-spin")} />
      {syncing ? 'Syncing...' : pending > 0 ? `Sync ${pending}` : 'Synced'}
    </Button>
  );
}
