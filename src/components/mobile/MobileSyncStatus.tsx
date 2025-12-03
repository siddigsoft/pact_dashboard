import { useState, useEffect } from 'react';
import { 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle,
  WifiOff,
  Signal,
  MapPin
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOffline } from '@/hooks/use-offline';
import { Badge } from '@/components/ui/badge';

interface MobileSyncStatusProps {
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

export function MobileSyncStatus({ 
  showDetails = true, 
  compact = false,
  className 
}: MobileSyncStatusProps) {
  const { 
    isOnline, 
    stats, 
    syncProgress, 
    isSyncing, 
    lastSyncResult,
    syncNow 
  } = useOffline();

  const pendingCount = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;

  const handleSync = async () => {
    if (!isSyncing && isOnline && pendingCount > 0) {
      await syncNow();
    }
  };

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {isOnline ? (
          <Badge variant="outline" className="gap-1 text-green-600 border-green-600/30 bg-green-50 dark:bg-green-950/30">
            <Cloud className="h-3 w-3" />
            Online
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-amber-600 border-amber-600/30 bg-amber-50 dark:bg-amber-950/30">
            <CloudOff className="h-3 w-3" />
            Offline
          </Badge>
        )}
        {pendingCount > 0 && (
          <Badge variant="secondary" className="gap-1">
            <RefreshCw className={cn("h-3 w-3", isSyncing && "animate-spin")} />
            {pendingCount} pending
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("sm:hidden", className)} data-testid="mobile-sync-status">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            {isOnline ? (
              <>
                <Signal className="h-4 w-4 text-green-500" />
                Connected
              </>
            ) : (
              <>
                <WifiOff className="h-4 w-4 text-amber-500" />
                Offline Mode
              </>
            )}
          </span>
          {pendingCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {pendingCount} pending
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      {(showDetails || pendingCount > 0 || isSyncing) && (
        <CardContent className="pt-0 space-y-3">
          {isSyncing && syncProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  {syncProgress.current || 'Syncing...'}
                </span>
                <span className="text-muted-foreground">
                  {syncProgress.completed}/{syncProgress.total}
                </span>
              </div>
              <Progress 
                value={(syncProgress.completed / Math.max(syncProgress.total, 1)) * 100} 
                className="h-1.5" 
              />
            </div>
          )}

          {pendingCount > 0 && !isSyncing && (
            <>
              <div className="text-xs text-muted-foreground space-y-1.5">
                {stats.unsyncedVisits > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      Site Visits
                    </span>
                    <span className="font-medium">{stats.unsyncedVisits}</span>
                  </div>
                )}
                {stats.unsyncedLocations > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      Locations
                    </span>
                    <span className="font-medium">{stats.unsyncedLocations}</span>
                  </div>
                )}
                {stats.pendingActions > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="h-3 w-3" />
                      Other Actions
                    </span>
                    <span className="font-medium">{stats.pendingActions}</span>
                  </div>
                )}
              </div>
              
              <Button 
                size="sm" 
                variant="outline" 
                className="w-full"
                onClick={handleSync}
                disabled={!isOnline}
                data-testid="button-sync-now-card"
              >
                {isOnline ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Sync Now
                  </>
                ) : (
                  <>
                    <CloudOff className="h-3.5 w-3.5 mr-1.5" />
                    Will Sync When Online
                  </>
                )}
              </Button>
            </>
          )}

          {lastSyncResult && pendingCount === 0 && !isSyncing && (
            <div className="flex items-center gap-2 text-xs">
              {lastSyncResult.success ? (
                <>
                  <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-muted-foreground">
                    Last sync: {lastSyncResult.synced} items synced
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-muted-foreground">
                    Sync had {lastSyncResult.failed} errors
                  </span>
                </>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function MobileOfflineBanner() {
  const { isOnline, stats, isSyncing } = useOffline();
  const pendingCount = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;

  if (isOnline && pendingCount === 0) return null;

  return (
    <div 
      className={cn(
        "sm:hidden px-3 py-1.5 text-xs font-medium flex items-center justify-center gap-2",
        !isOnline 
          ? "bg-amber-500/90 text-amber-950" 
          : isSyncing 
            ? "bg-primary/90 text-primary-foreground"
            : "bg-muted text-muted-foreground"
      )}
      data-testid="mobile-status-banner"
    >
      {!isOnline ? (
        <>
          <WifiOff className="h-3.5 w-3.5" />
          <span>Offline - Changes saved locally ({pendingCount} pending)</span>
        </>
      ) : isSyncing ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          <span>Syncing data...</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{pendingCount} items ready to sync</span>
        </>
      ) : null}
    </div>
  );
}
