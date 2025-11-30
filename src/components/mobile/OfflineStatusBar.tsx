import { useOffline } from '@/hooks/use-offline';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  WifiOff, 
  Wifi, 
  CloudOff, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Cloud
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface OfflineStatusBarProps {
  className?: string;
  compact?: boolean;
}

export function OfflineStatusBar({ className, compact = false }: OfflineStatusBarProps) {
  const { 
    isOnline, 
    stats, 
    syncProgress, 
    isSyncing, 
    syncNow,
    lastSyncResult 
  } = useOffline();

  const hasPendingData = stats.pendingActions > 0 || stats.unsyncedVisits > 0 || stats.unsyncedLocations > 0;
  const totalPending = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;

  if (isOnline && !hasPendingData && !isSyncing && compact) {
    return null;
  }

  if (compact) {
    if (!isOnline) {
      return (
        <div 
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 bg-destructive/10 text-destructive rounded-full text-sm",
            className
          )}
          data-testid="offline-status-compact"
        >
          <WifiOff className="h-3.5 w-3.5" />
          <span>Offline</span>
          {hasPendingData && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {totalPending}
            </Badge>
          )}
        </div>
      );
    }

    if (isSyncing && syncProgress) {
      const percent = syncProgress.total > 0 
        ? Math.round((syncProgress.completed / syncProgress.total) * 100) 
        : 0;
      return (
        <div 
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full text-sm",
            className
          )}
          data-testid="sync-status-compact"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Syncing {percent}%</span>
        </div>
      );
    }

    if (hasPendingData) {
      return (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => syncNow()}
          className={cn("gap-2 text-amber-600 dark:text-amber-400", className)}
          data-testid="button-sync-pending"
        >
          <CloudOff className="h-3.5 w-3.5" />
          <span>{totalPending} pending</span>
        </Button>
      );
    }

    return null;
  }

  return (
    <div 
      className={cn(
        "p-4 rounded-lg border",
        !isOnline ? "bg-destructive/5 border-destructive/20" : 
        isSyncing ? "bg-blue-500/5 border-blue-500/20" :
        hasPendingData ? "bg-amber-500/5 border-amber-500/20" :
        "bg-emerald-500/5 border-emerald-500/20",
        className
      )}
      data-testid="offline-status-full"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-full",
            !isOnline ? "bg-destructive/10" :
            isSyncing ? "bg-blue-500/10" :
            hasPendingData ? "bg-amber-500/10" :
            "bg-emerald-500/10"
          )}>
            {!isOnline ? (
              <WifiOff className="h-5 w-5 text-destructive" />
            ) : isSyncing ? (
              <RefreshCw className="h-5 w-5 text-blue-500 animate-spin" />
            ) : hasPendingData ? (
              <CloudOff className="h-5 w-5 text-amber-500" />
            ) : (
              <Cloud className="h-5 w-5 text-emerald-500" />
            )}
          </div>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-sm">
                {!isOnline ? 'Offline Mode' :
                 isSyncing ? 'Syncing Data' :
                 hasPendingData ? 'Pending Sync' :
                 'All Synced'}
              </h4>
              {isOnline && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Wifi className="h-3 w-3" />
                  Online
                </Badge>
              )}
            </div>
            
            <p className="text-xs text-muted-foreground">
              {!isOnline 
                ? 'Changes are saved locally and will sync when online.'
                : isSyncing && syncProgress
                ? syncProgress.current || 'Processing...'
                : hasPendingData
                ? `${totalPending} item${totalPending > 1 ? 's' : ''} waiting to sync.`
                : 'All your data is up to date.'}
            </p>

            {hasPendingData && !isSyncing && (
              <div className="flex flex-wrap gap-2 mt-2">
                {stats.unsyncedVisits > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {stats.unsyncedVisits} visit{stats.unsyncedVisits > 1 ? 's' : ''}
                  </Badge>
                )}
                {stats.unsyncedLocations > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {stats.unsyncedLocations} location{stats.unsyncedLocations > 1 ? 's' : ''}
                  </Badge>
                )}
                {stats.pendingActions > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {stats.pendingActions} action{stats.pendingActions > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            )}

            {lastSyncResult && !isSyncing && (
              <div className="flex items-center gap-2 mt-2">
                {lastSyncResult.success ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                )}
                <span className="text-xs text-muted-foreground">
                  Last sync: {lastSyncResult.synced} synced
                  {lastSyncResult.failed > 0 && `, ${lastSyncResult.failed} failed`}
                </span>
              </div>
            )}
          </div>
        </div>

        {isOnline && hasPendingData && !isSyncing && (
          <Button 
            size="sm" 
            onClick={() => syncNow()}
            data-testid="button-sync-now"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Sync Now
          </Button>
        )}
      </div>

      {isSyncing && syncProgress && syncProgress.total > 0 && (
        <div className="mt-4 space-y-2">
          <Progress 
            value={(syncProgress.completed / syncProgress.total) * 100} 
            className="h-2"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {syncProgress.completed} of {syncProgress.total} items
            </span>
            <span>
              {Math.round((syncProgress.completed / syncProgress.total) * 100)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function OfflineIndicator() {
  const { isOnline, stats, isSyncing } = useOffline();
  const hasPendingData = stats.pendingActions > 0 || stats.unsyncedVisits > 0 || stats.unsyncedLocations > 0;
  const totalPending = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;

  if (isOnline && !hasPendingData && !isSyncing) {
    return null;
  }

  return (
    <div 
      className={cn(
        "fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 py-1 text-xs font-medium",
        !isOnline ? "bg-destructive text-destructive-foreground" :
        isSyncing ? "bg-blue-500 text-white" :
        "bg-amber-500 text-white"
      )}
      data-testid="offline-banner"
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3 w-3" />
          <span>Offline - Changes saved locally</span>
        </>
      ) : isSyncing ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Syncing...</span>
        </>
      ) : (
        <>
          <CloudOff className="h-3 w-3" />
          <span>{totalPending} item{totalPending > 1 ? 's' : ''} pending sync</span>
        </>
      )}
    </div>
  );
}
