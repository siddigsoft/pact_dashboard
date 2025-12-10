import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Upload, 
  MapPin, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  Wifi,
  WifiOff,
  FileText,
  Camera,
  DollarSign
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  getPendingSyncActions,
  getUnsyncedSiteVisits,
  getOfflineStats,
  removeSyncAction,
  type PendingSyncAction,
  type OfflineSiteVisit,
} from '@/lib/offline-db';
import { syncManager } from '@/lib/sync-manager';
import { formatDistanceToNow } from 'date-fns';

interface SyncPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

interface SyncItemGroup {
  type: string;
  label: string;
  icon: typeof MapPin;
  items: (PendingSyncAction | OfflineSiteVisit)[];
  count: number;
}

export function SyncPreview({ isOpen, onClose, onSyncComplete }: SyncPreviewProps) {
  const [pendingActions, setPendingActions] = useState<PendingSyncAction[]>([]);
  const [unsyncedVisits, setUnsyncedVisits] = useState<OfflineSiteVisit[]>([]);
  const [stats, setStats] = useState({ pendingActions: 0, unsyncedVisits: 0, unsyncedLocations: 0, cachedItems: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ completed: 0, total: 0, current: '' });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['site_visits']));
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [itemToDelete, setItemToDelete] = useState<PendingSyncAction | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<{ success: boolean; synced: number; failed: number } | null>(null);

  const loadPendingItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const [actions, visits, offlineStats] = await Promise.all([
        getPendingSyncActions(),
        getUnsyncedSiteVisits(),
        getOfflineStats(),
      ]);
      setPendingActions(actions);
      setUnsyncedVisits(visits);
      setStats(offlineStats);
    } catch (error) {
      console.error('[SyncPreview] Failed to load pending items:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadPendingItems();
    } else {
      // Reset state when closed to prevent stale data
      setSyncProgress({ completed: 0, total: 0, current: '' });
      setLastSyncResult(null);
    }
  }, [isOpen, loadPendingItems]);

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

  useEffect(() => {
    const unsubProgress = syncManager.onProgress((progress) => {
      setSyncProgress({
        completed: progress.completed,
        total: progress.total,
        current: progress.current || '',
      });
      setIsSyncing(progress.isRunning);
    });

    const unsubComplete = syncManager.onComplete((result) => {
      setLastSyncResult({
        success: result.success,
        synced: result.synced,
        failed: result.failed,
      });
      loadPendingItems();
      if (result.success && onSyncComplete) {
        onSyncComplete();
      }
    });

    return () => {
      unsubProgress();
      unsubComplete();
    };
  }, [loadPendingItems, onSyncComplete]);

  const handleSync = async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    setLastSyncResult(null);
    await syncManager.syncAll(true);
  };

  const handleDeleteAction = async (action: PendingSyncAction) => {
    try {
      await removeSyncAction(action.id);
      await loadPendingItems();
      setItemToDelete(null);
    } catch (error) {
      console.error('[SyncPreview] Failed to delete action:', error);
    }
  };

  const toggleGroup = (groupType: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupType)) {
        next.delete(groupType);
      } else {
        next.add(groupType);
      }
      return next;
    });
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'site_visit_claim':
      case 'site_visit_start':
      case 'site_visit_complete':
        return MapPin;
      case 'location_update':
        return MapPin;
      case 'photo_upload':
        return Camera;
      case 'cost_submission':
        return DollarSign;
      default:
        return FileText;
    }
  };

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'site_visit_claim': return 'Site Claim';
      case 'site_visit_start': return 'Visit Start';
      case 'site_visit_complete': return 'Visit Complete';
      case 'location_update': return 'Location Update';
      case 'photo_upload': return 'Photo Upload';
      case 'cost_submission': return 'Cost Submission';
      default: return type;
    }
  };

  const groupedItems: SyncItemGroup[] = [
    {
      type: 'site_visits',
      label: 'Site Visits',
      icon: MapPin,
      items: unsyncedVisits,
      count: unsyncedVisits.length,
    },
    ...Object.entries(
      pendingActions.reduce((acc, action) => {
        const key = action.type;
        if (!acc[key]) acc[key] = [];
        acc[key].push(action);
        return acc;
      }, {} as Record<string, PendingSyncAction[]>)
    ).map(([type, items]) => ({
      type,
      label: getActionLabel(type),
      icon: getActionIcon(type),
      items,
      count: items.length,
    })),
  ].filter(group => group.count > 0);

  const totalPending = stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        data-testid="sync-preview-overlay"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute bottom-0 left-0 right-0 bg-background rounded-t-xl max-h-[85vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
          data-testid="sync-preview-panel"
        >
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Upload className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Pending Changes</h2>
                <p className="text-sm text-muted-foreground">
                  {totalPending} item{totalPending !== 1 ? 's' : ''} waiting to sync
                </p>
              </div>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={onClose}
              data-testid="button-close-sync-preview"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <div className="p-4 border-b">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <Badge variant="outline" className="gap-1 text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800">
                    <Wifi className="w-3 h-3" />
                    Online
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-amber-600 border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800">
                    <WifiOff className="w-3 h-3" />
                    Offline
                  </Badge>
                )}
                {lastSyncResult && (
                  <Badge 
                    variant="outline" 
                    className={lastSyncResult.success 
                      ? "gap-1 text-green-600 border-green-200 bg-green-50 dark:bg-green-900/20" 
                      : "gap-1 text-red-600 border-red-200 bg-red-50 dark:bg-red-900/20"
                    }
                  >
                    {lastSyncResult.success ? (
                      <CheckCircle2 className="w-3 h-3" />
                    ) : (
                      <AlertCircle className="w-3 h-3" />
                    )}
                    {lastSyncResult.synced} synced{lastSyncResult.failed > 0 && `, ${lastSyncResult.failed} failed`}
                  </Badge>
                )}
              </div>
              <Button
                onClick={handleSync}
                disabled={!isOnline || isSyncing || totalPending === 0}
                size="sm"
                data-testid="button-sync-now"
              >
                {isSyncing ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </Button>
            </div>

            {isSyncing && syncProgress.total > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{syncProgress.current}</span>
                  <span>{syncProgress.completed}/{syncProgress.total}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${(syncProgress.completed / syncProgress.total) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1 p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : groupedItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
                <p className="font-medium">All synced!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  No pending changes to upload
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {groupedItems.map((group) => {
                  const isExpanded = expandedGroups.has(group.type);
                  const GroupIcon = group.icon;

                  return (
                    <Card key={group.type} className="overflow-hidden">
                      <button
                        onClick={() => toggleGroup(group.type)}
                        className="w-full flex items-center justify-between p-3 text-left hover-elevate"
                        data-testid={`button-toggle-group-${group.type}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-1.5 rounded-md bg-primary/10">
                            <GroupIcon className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-medium">{group.label}</span>
                          <Badge variant="secondary" className="text-xs">
                            {group.count}
                          </Badge>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="border-t divide-y">
                              {group.items.map((item, index) => {
                                const isVisit = 'siteName' in item;
                                const action = item as PendingSyncAction;
                                const visit = item as OfflineSiteVisit;

                                return (
                                  <div 
                                    key={isVisit ? visit.id : action.id}
                                    className="p-3 flex items-start justify-between gap-3"
                                    data-testid={`sync-item-${isVisit ? visit.id : action.id}`}
                                  >
                                    <div className="flex-1 min-w-0">
                                      {isVisit ? (
                                        <>
                                          <p className="font-medium truncate">{visit.siteName}</p>
                                          <p className="text-xs text-muted-foreground truncate">
                                            {visit.siteCode} - {visit.state}, {visit.locality}
                                          </p>
                                          <div className="flex items-center gap-2 mt-1">
                                            <Badge variant="outline" className="text-xs">
                                              {visit.status}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                              <Clock className="w-3 h-3" />
                                              {formatDistanceToNow(new Date(visit.startedAt), { addSuffix: true })}
                                            </span>
                                          </div>
                                        </>
                                      ) : (
                                        <>
                                          <p className="font-medium">{getActionLabel(action.type)}</p>
                                          <div className="flex items-center gap-2 mt-1">
                                            {action.status === 'failed' && (
                                              <Badge variant="destructive" className="text-xs gap-1">
                                                <AlertCircle className="w-3 h-3" />
                                                Failed ({action.retries} retries)
                                              </Badge>
                                            )}
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                              <Clock className="w-3 h-3" />
                                              {formatDistanceToNow(action.timestamp, { addSuffix: true })}
                                            </span>
                                          </div>
                                          {action.errorMessage && (
                                            <p className="text-xs text-destructive mt-1 truncate">
                                              {action.errorMessage}
                                            </p>
                                          )}
                                        </>
                                      )}
                                    </div>
                                    {!isVisit && (
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="shrink-0 text-muted-foreground"
                                        onClick={() => setItemToDelete(action)}
                                        data-testid={`button-delete-action-${action.id}`}
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="p-4 border-t bg-muted/30">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="font-semibold text-lg">{stats.unsyncedVisits}</p>
                <p className="text-muted-foreground">Visits</p>
              </div>
              <div>
                <p className="font-semibold text-lg">{stats.pendingActions}</p>
                <p className="text-muted-foreground">Actions</p>
              </div>
              <div>
                <p className="font-semibold text-lg">{stats.unsyncedLocations}</p>
                <p className="text-muted-foreground">Locations</p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <AlertDialog open={!!itemToDelete} onOpenChange={() => setItemToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete pending action?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this action from the sync queue. 
              The changes will not be uploaded to the server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => itemToDelete && handleDeleteAction(itemToDelete)}
              className="bg-destructive text-destructive-foreground"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AnimatePresence>
  );
}

export default SyncPreview;
