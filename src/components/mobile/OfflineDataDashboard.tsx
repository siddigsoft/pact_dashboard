import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  HardDrive, 
  Users, 
  MapPin, 
  FileText,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Clock,
  Database
} from 'lucide-react';
import { useOfflineData } from '@/hooks/useOfflineData';
import { useOffline } from '@/hooks/use-offline';
import { clearAllOfflineData, getOfflineStats } from '@/lib/offline-db';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

interface OfflineDataDashboardProps {
  className?: string;
}

export function OfflineDataDashboard({ className }: OfflineDataDashboardProps) {
  const { 
    stats: prefetchStats, 
    isDownloading, 
    downloadProgress,
    downloadForOffline,
    refreshStats: refreshPrefetchStats 
  } = useOfflineData();
  
  const { 
    stats: syncStats, 
    syncProgress, 
    isSyncing, 
    syncNow,
    isOnline 
  } = useOffline();

  const [isClearing, setIsClearing] = useState(false);

  const handleClearData = async () => {
    if (confirm('Are you sure you want to clear all offline data? This cannot be undone.')) {
      setIsClearing(true);
      try {
        await clearAllOfflineData();
        await refreshPrefetchStats();
      } finally {
        setIsClearing(false);
      }
    }
  };

  const totalCached = prefetchStats 
    ? prefetchStats.profiles + prefetchStats.sites + prefetchStats.hubs + prefetchStats.states + prefetchStats.localities + prefetchStats.mmps
    : 0;

  const pendingSync = syncStats.pendingActions + syncStats.unsyncedVisits + syncStats.unsyncedLocations;

  return (
    <div className={cn("space-y-4", className)} data-testid="offline-data-dashboard">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <CardTitle className="text-base">Offline Storage</CardTitle>
            </div>
            <Badge variant={isOnline ? "secondary" : "destructive"}>
              {isOnline ? 'Online' : 'Offline'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Cached Data</span>
              </div>
              <p className="text-2xl font-bold">{totalCached}</p>
              <p className="text-xs text-muted-foreground">items stored</p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Pending Sync</span>
              </div>
              <p className="text-2xl font-bold">{pendingSync}</p>
              <p className="text-xs text-muted-foreground">items to sync</p>
            </div>
          </div>

          {prefetchStats?.lastPrefetchAt && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Last download: {formatDistanceToNow(prefetchStats.lastPrefetchAt, { addSuffix: true })}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cached Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Team Profiles</span>
              </div>
              <Badge variant="outline">{prefetchStats?.profiles || 0}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Assigned Sites</span>
              </div>
              <Badge variant="outline">{prefetchStats?.sites || 0}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">MMPs</span>
              </div>
              <Badge variant="outline">{prefetchStats?.mmps || 0}</Badge>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Geographic Data</span>
              </div>
              <Badge variant="outline">
                {(prefetchStats?.hubs || 0) + (prefetchStats?.states || 0) + (prefetchStats?.localities || 0)}
              </Badge>
            </div>
          </div>

          {isDownloading && downloadProgress && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{downloadProgress.current}</span>
                <span>{downloadProgress.completed}/{downloadProgress.total}</span>
              </div>
              <Progress 
                value={downloadProgress.total > 0 ? (downloadProgress.completed / downloadProgress.total) * 100 : 0} 
                className="h-1.5" 
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pending Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Site Visits</span>
              <Badge variant={syncStats.unsyncedVisits > 0 ? "default" : "outline"}>
                {syncStats.unsyncedVisits}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Location Updates</span>
              <Badge variant={syncStats.unsyncedLocations > 0 ? "default" : "outline"}>
                {syncStats.unsyncedLocations}
              </Badge>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm">Other Actions</span>
              <Badge variant={syncStats.pendingActions > 0 ? "default" : "outline"}>
                {syncStats.pendingActions}
              </Badge>
            </div>
          </div>

          {isSyncing && syncProgress && (
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{syncProgress.current}</span>
                <span>{syncProgress.completed}/{syncProgress.total}</span>
              </div>
              <Progress 
                value={syncProgress.total > 0 ? (syncProgress.completed / syncProgress.total) * 100 : 0} 
                className="h-1.5" 
              />
            </div>
          )}

          {pendingSync > 0 && isOnline && !isSyncing && (
            <Button 
              onClick={() => syncNow()} 
              className="w-full gap-2"
              size="sm"
              data-testid="button-sync-pending"
            >
              <RefreshCw className="h-4 w-4" />
              Sync Now
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          onClick={() => downloadForOffline()}
          disabled={isDownloading}
          className="flex-1 gap-2"
          data-testid="button-refresh-offline"
        >
          <RefreshCw className={cn("h-4 w-4", isDownloading && "animate-spin")} />
          {isDownloading ? 'Downloading...' : 'Refresh Offline Data'}
        </Button>

        <Button
          variant="outline"
          onClick={handleClearData}
          disabled={isClearing || totalCached === 0}
          data-testid="button-clear-offline"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
