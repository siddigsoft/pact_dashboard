import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  HardDrive,
  Users,
  MapPin,
  FileText,
  Loader2
} from 'lucide-react';
import { useOfflineData } from '@/hooks/useOfflineData';
import { useUser } from '@/context/user/UserContext';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from '@/components/ui/sonner';

interface DownloadForOfflineProps {
  className?: string;
  compact?: boolean;
}

export function DownloadForOffline({ className, compact = false }: DownloadForOfflineProps) {
  const { currentUser } = useUser();
  const { 
    stats, 
    isDownloading, 
    downloadProgress, 
    lastResult,
    downloadForOffline,
    hasOfflineData 
  } = useOfflineData();
  const [showDetails, setShowDetails] = useState(false);

  const handleDownload = async () => {
    const result = await downloadForOffline(currentUser?.id);
    const totalItems = result.cached.profiles + result.cached.sites + result.cached.hubs + result.cached.mmps;
    
    if (result.success && totalItems > 0) {
      toast.success('Download Complete', {
        description: `Downloaded ${totalItems} items for offline use`,
      });
    } else if (!result.success && result.errors.length > 0) {
      toast.error('Download Failed', {
        description: result.errors[0],
      });
    } else if (totalItems === 0) {
      toast.info('No Data', {
        description: 'No data available to download',
      });
    }
  };

  const progressPercent = downloadProgress && downloadProgress.total > 0
    ? Math.round((downloadProgress.completed / downloadProgress.total) * 100)
    : 0;

  if (compact) {
    return (
      <Button
        variant={hasOfflineData ? "outline" : "default"}
        size="sm"
        onClick={handleDownload}
        disabled={isDownloading}
        className={cn("gap-2", className)}
        data-testid="button-download-offline-compact"
      >
        {isDownloading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{progressPercent}%</span>
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            <span>{hasOfflineData ? 'Update' : 'Download'}</span>
          </>
        )}
      </Button>
    );
  }

  return (
    <Card className={cn("", className)} data-testid="card-download-offline">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Offline Data</CardTitle>
          </div>
          {hasOfflineData && (
            <Badge variant="secondary" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Ready
            </Badge>
          )}
        </div>
        <CardDescription className="text-sm">
          Download data for offline use in remote areas
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isDownloading && downloadProgress ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {downloadProgress.current || 'Preparing...'}
              </span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        ) : (
          <>
            {stats && hasOfflineData && (
              <div 
                className="grid grid-cols-2 gap-3 cursor-pointer"
                onClick={() => setShowDetails(!showDetails)}
                data-testid="offline-stats-grid"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{stats.profiles} profiles</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{stats.sites} sites</span>
                </div>
                {showDetails && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{stats.mmps} MMPs</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{stats.hubs} hubs, {stats.states} states</span>
                    </div>
                  </>
                )}
              </div>
            )}

            {stats?.lastPrefetchAt && (
              <p className="text-xs text-muted-foreground">
                Last updated: {format(stats.lastPrefetchAt, 'MMM d, h:mm a')}
              </p>
            )}

            {lastResult && !lastResult.success && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span>Some data failed to download</span>
              </div>
            )}

            <Button
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-full gap-2"
              variant={hasOfflineData ? "outline" : "default"}
              data-testid="button-download-offline"
            >
              <Download className="h-4 w-4" />
              {hasOfflineData ? 'Update Offline Data' : 'Download for Offline'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
