import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  MapPin, 
  Download, 
  Trash2, 
  HardDrive, 
  Wifi, 
  WifiOff,
  X,
  Check,
  AlertTriangle
} from 'lucide-react';
import {
  downloadRegion,
  deleteRegion,
  getDownloadedRegions,
  estimateDownloadSize,
  getCacheStats,
  clearAllTiles,
} from '@/lib/offline-map-tiles';
import { hapticFeedback } from '@/lib/enhanced-haptics';
import { format } from 'date-fns';

interface DownloadedRegion {
  id: string;
  name: string;
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  minZoom: number;
  maxZoom: number;
  tileCount: number;
  size: number;
  downloadedAt: number;
}

interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  currentTile: string;
  estimatedSize: number;
  downloadedSize: number;
}

interface OfflineMapDownloaderProps {
  currentBounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  currentZoom?: number;
}

export function OfflineMapDownloader({ currentBounds, currentZoom }: OfflineMapDownloaderProps) {
  const [regions, setRegions] = useState<DownloadedRegion[]>([]);
  const [cacheStats, setCacheStats] = useState<{
    totalSizeMB: number;
    tileCount: number;
    maxSizeMB: number;
    usagePercent: number;
  } | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [showNewRegionDialog, setShowNewRegionDialog] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [regionName, setRegionName] = useState('');
  const [minZoom, setMinZoom] = useState(10);
  const [maxZoom, setMaxZoom] = useState(16);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const [loadedRegions, stats] = await Promise.all([
      getDownloadedRegions(),
      getCacheStats(),
    ]);
    setRegions(loadedRegions);
    setCacheStats(stats);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStartDownload = async () => {
    setErrorMessage(null);

    if (!currentBounds) {
      hapticFeedback.form.error();
      setErrorMessage('No map area selected. Pan the map to select an area.');
      return;
    }

    if (!regionName.trim()) {
      hapticFeedback.form.error();
      setErrorMessage('Please enter a name for this region.');
      return;
    }

    if (!navigator.onLine) {
      hapticFeedback.sync.error();
      setErrorMessage('You are offline. Connect to the internet to download maps.');
      return;
    }

    if (cacheStats && estimate) {
      const newTotalSize = cacheStats.totalSizeMB + estimate.estimatedSizeMB;
      if (newTotalSize > cacheStats.maxSizeMB) {
        hapticFeedback.warning();
        setErrorMessage(`Not enough storage. Need ${estimate.estimatedSizeMB.toFixed(1)} MB but only ${(cacheStats.maxSizeMB - cacheStats.totalSizeMB).toFixed(1)} MB available.`);
        return;
      }
    }

    const controller = new AbortController();
    setAbortController(controller);
    setIsDownloading(true);
    hapticFeedback.sync.start();

    try {
      const result = await downloadRegion(
        `region-${Date.now()}`,
        regionName.trim(),
        currentBounds,
        minZoom,
        maxZoom,
        'standard',
        (progress) => setDownloadProgress(progress),
        controller.signal
      );

      if (result.success) {
        hapticFeedback.sync.complete();
        await loadData();
        setShowNewRegionDialog(false);
        setRegionName('');
        setErrorMessage(null);
      } else {
        hapticFeedback.sync.error();
        setErrorMessage(result.error || 'Download failed. Please try again.');
        console.error('[OfflineMapDownloader] Download failed:', result.error);
      }
    } catch (error) {
      hapticFeedback.sync.error();
      setErrorMessage('Download failed. Please check your connection and try again.');
      console.error('[OfflineMapDownloader] Download error:', error);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
      setAbortController(null);
    }
  };

  const handleCancelDownload = () => {
    abortController?.abort();
    hapticFeedback.action.cancel();
  };

  const handleDeleteRegion = async (regionId: string) => {
    hapticFeedback.action.delete();
    await deleteRegion(regionId);
    await loadData();
  };

  const handleClearAll = async () => {
    hapticFeedback.action.delete();
    await clearAllTiles();
    await loadData();
    setShowClearDialog(false);
  };

  const estimate = currentBounds
    ? estimateDownloadSize(currentBounds, minZoom, maxZoom)
    : null;

  const formatSize = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    return mb < 1 ? `${(bytes / 1024).toFixed(1)} KB` : `${mb.toFixed(1)} MB`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Offline Maps
          </div>
          {cacheStats && (
            <Badge variant="outline" className="text-xs">
              <HardDrive className="h-3 w-3 mr-1" />
              {cacheStats.totalSizeMB.toFixed(1)} / {cacheStats.maxSizeMB} MB
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {cacheStats && (
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Storage Used</span>
              <span>{cacheStats.usagePercent.toFixed(1)}%</span>
            </div>
            <Progress value={cacheStats.usagePercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {cacheStats.tileCount.toLocaleString()} tiles cached
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={() => setShowNewRegionDialog(true)}
            disabled={!currentBounds || isDownloading}
            className="flex-1"
            data-testid="button-download-region"
            aria-label="Download current map area"
          >
            <Download className="h-4 w-4 mr-2" />
            Download Area
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowClearDialog(true)}
            disabled={!regions.length && !cacheStats?.tileCount}
            data-testid="button-clear-cache"
            aria-label="Clear all cached maps"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {regions.length > 0 && (
          <>
            <Separator />
            <div>
              <h4 className="text-sm font-medium mb-2">Downloaded Regions</h4>
              <ScrollArea className="max-h-48">
                <div className="space-y-2">
                  {regions.map((region) => (
                    <div
                      key={region.id}
                      className="flex items-center justify-between p-2 rounded-md border"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{region.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {region.tileCount.toLocaleString()} tiles • {formatSize(region.size)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(region.downloadedAt, 'MMM d, yyyy')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRegion(region.id)}
                        data-testid={`button-delete-region-${region.id}`}
                        aria-label={`Delete ${region.name} region`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        {regions.length === 0 && !cacheStats?.tileCount && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No offline maps downloaded</p>
            <p className="text-xs">Download map areas for offline use</p>
          </div>
        )}
      </CardContent>

      <Dialog open={showNewRegionDialog} onOpenChange={setShowNewRegionDialog}>
        <DialogContent className="max-w-sm" data-testid="dialog-download-region">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-download">Download Map Area</DialogTitle>
            <DialogDescription data-testid="dialog-desc-download">
              Save the current map view for offline use
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="region-name">Region Name</Label>
              <Input
                id="region-name"
                value={regionName}
                onChange={(e) => setRegionName(e.target.value)}
                placeholder="e.g., Khartoum Office Area"
                data-testid="input-region-name"
                aria-label="Region name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min-zoom">Min Zoom</Label>
                <Input
                  id="min-zoom"
                  type="number"
                  min={1}
                  max={18}
                  value={minZoom}
                  onChange={(e) => setMinZoom(Number(e.target.value))}
                  data-testid="input-min-zoom"
                  aria-label="Minimum zoom level"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max-zoom">Max Zoom</Label>
                <Input
                  id="max-zoom"
                  type="number"
                  min={1}
                  max={18}
                  value={maxZoom}
                  onChange={(e) => setMaxZoom(Number(e.target.value))}
                  data-testid="input-max-zoom"
                  aria-label="Maximum zoom level"
                />
              </div>
            </div>

            {estimate && (
              <div className="bg-muted rounded-md p-3 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="text-muted-foreground">Estimated tiles</span>
                  <span>{estimate.tileCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estimated size</span>
                  <span>{estimate.estimatedSizeMB.toFixed(1)} MB</span>
                </div>
              </div>
            )}

            {estimate && estimate.estimatedSizeMB > 100 && (
              <div className="flex items-start gap-2 text-amber-500 text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>Large download. Consider reducing zoom range.</span>
              </div>
            )}

            {isDownloading && downloadProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Downloading...</span>
                  <span data-testid="text-download-progress">
                    {downloadProgress.completed} / {downloadProgress.total}
                  </span>
                </div>
                <Progress
                  value={(downloadProgress.completed / downloadProgress.total) * 100}
                  className="h-2"
                  data-testid="progress-download"
                  aria-label="Download progress"
                />
                <p className="text-xs text-muted-foreground truncate" data-testid="text-current-tile">
                  {downloadProgress.currentTile}
                </p>
              </div>
            )}

            {errorMessage && (
              <div 
                className="flex items-start gap-2 text-destructive text-sm p-2 bg-destructive/10 rounded-md"
                data-testid="text-download-error"
                role="alert"
                aria-live="polite"
              >
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {isDownloading ? (
              <Button
                variant="destructive"
                onClick={handleCancelDownload}
                className="w-full"
                data-testid="button-cancel-download"
                aria-label="Cancel download"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowNewRegionDialog(false)}
                  className="flex-1"
                  data-testid="button-cancel-new-region"
                  aria-label="Cancel"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleStartDownload}
                  disabled={!regionName.trim()}
                  className="flex-1"
                  data-testid="button-confirm-download"
                  aria-label="Start download"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="max-w-sm" data-testid="dialog-clear-cache">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-clear">Clear All Cached Maps</DialogTitle>
            <DialogDescription data-testid="dialog-desc-clear">
              This will delete all downloaded map tiles. You will need to download them again for offline use.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(false)}
              className="flex-1"
              data-testid="button-cancel-clear"
              aria-label="Cancel"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleClearAll}
              className="flex-1"
              data-testid="button-confirm-clear"
              aria-label="Clear all maps"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
