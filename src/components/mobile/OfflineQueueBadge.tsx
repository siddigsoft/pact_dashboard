import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cloud, 
  CloudOff, 
  Upload, 
  Check, 
  X, 
  Clock, 
  RefreshCw, 
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  WifiOff
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { formatDistanceToNow } from 'date-fns';

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'offline';

interface QueuedItem {
  id: string;
  type: 'visit' | 'photo' | 'cost' | 'signature' | 'form' | 'location';
  title: string;
  description?: string;
  timestamp: Date;
  status: 'pending' | 'syncing' | 'success' | 'error';
  retryCount?: number;
  error?: string;
  size?: number;
}

interface OfflineQueueBadgeProps {
  queuedCount: number;
  status: SyncStatus;
  onClick?: () => void;
  className?: string;
}

export function OfflineQueueBadge({
  queuedCount,
  status,
  onClick,
  className,
}: OfflineQueueBadgeProps) {
  if (queuedCount === 0 && status === 'idle') return null;

  const getIcon = () => {
    switch (status) {
      case 'syncing':
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case 'success':
        return <Check className="h-3 w-3" />;
      case 'error':
        return <AlertCircle className="h-3 w-3" />;
      case 'offline':
        return <WifiOff className="h-3 w-3" />;
      default:
        return <Cloud className="h-3 w-3" />;
    }
  };

  const getBg = () => {
    switch (status) {
      case 'syncing':
        return 'bg-black dark:bg-white text-white dark:text-black';
      case 'success':
        return 'bg-black dark:bg-white text-white dark:text-black';
      case 'error':
        return 'bg-destructive text-white';
      case 'offline':
        return 'bg-black/60 dark:bg-white/60 text-white dark:text-black';
      default:
        return 'bg-black/80 dark:bg-white/80 text-white dark:text-black';
    }
  };

  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
        getBg(),
        className
      )}
      onClick={() => {
        hapticPresets.buttonPress();
        onClick?.();
      }}
      data-testid="offline-queue-badge"
    >
      {getIcon()}
      <span>
        {status === 'syncing' ? 'Syncing...' : 
         status === 'offline' ? 'Offline' :
         queuedCount > 0 ? `${queuedCount} pending` : 'Synced'}
      </span>
    </motion.button>
  );
}

interface OfflineQueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
  items: QueuedItem[];
  status: SyncStatus;
  onSync?: () => void;
  onRetry?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClearAll?: () => void;
  className?: string;
}

export function OfflineQueuePanel({
  isOpen,
  onClose,
  items,
  status,
  onSync,
  onRetry,
  onDelete,
  onClearAll,
  className,
}: OfflineQueuePanelProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const pendingCount = items.filter(i => i.status === 'pending').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const syncingCount = items.filter(i => i.status === 'syncing').length;

  const toggleItem = useCallback((id: string) => {
    hapticPresets.selection();
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const getTypeIcon = (type: QueuedItem['type']) => {
    const iconClass = "h-4 w-4";
    switch (type) {
      case 'visit':
        return <Clock className={iconClass} />;
      case 'photo':
        return <Upload className={iconClass} />;
      case 'cost':
        return <Upload className={iconClass} />;
      case 'signature':
        return <Upload className={iconClass} />;
      case 'form':
        return <Upload className={iconClass} />;
      case 'location':
        return <Upload className={iconClass} />;
      default:
        return <Cloud className={iconClass} />;
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50"
        onClick={onClose}
        data-testid="offline-queue-panel"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            "absolute bottom-0 left-0 right-0 bg-white dark:bg-neutral-900 rounded-t-3xl max-h-[80vh] flex flex-col",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20" />
          </div>

          <div className="flex items-center justify-between px-4 pb-3 border-b border-black/10 dark:border-white/10">
            <div className="flex items-center gap-2">
              {status === 'offline' ? (
                <CloudOff className="h-5 w-5 text-black/60 dark:text-white/60" />
              ) : (
                <Cloud className="h-5 w-5 text-black dark:text-white" />
              )}
              <h2 className="text-lg font-semibold text-black dark:text-white">
                Offline Queue
              </h2>
            </div>

            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-black/10 dark:bg-white/10">
                  {pendingCount} pending
                </span>
              )}
              {errorCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                  {errorCount} failed
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Check className="h-12 w-12 text-black/20 dark:text-white/20 mb-4" />
                <p className="text-sm text-black/60 dark:text-white/60">All synced!</p>
                <p className="text-xs text-black/40 dark:text-white/40 mt-1">
                  No items waiting to sync
                </p>
              </div>
            ) : (
              <div className="divide-y divide-black/5 dark:divide-white/5">
                {items.map((item) => (
                  <div key={item.id} data-testid={`queue-item-${item.id}`}>
                    <button
                      className="w-full flex items-center gap-3 p-4 text-left touch-manipulation"
                      onClick={() => toggleItem(item.id)}
                    >
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                        item.status === 'syncing' && "bg-black/10 dark:bg-white/10",
                        item.status === 'pending' && "bg-black/5 dark:bg-white/5",
                        item.status === 'success' && "bg-black dark:bg-white",
                        item.status === 'error' && "bg-destructive/10"
                      )}>
                        {item.status === 'syncing' ? (
                          <Loader2 className="h-4 w-4 animate-spin text-black dark:text-white" />
                        ) : item.status === 'success' ? (
                          <Check className="h-4 w-4 text-white dark:text-black" />
                        ) : item.status === 'error' ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          getTypeIcon(item.type)
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-black dark:text-white truncate">
                          {item.title}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-black/40 dark:text-white/40">
                          <span className="capitalize">{item.type}</span>
                          <span>•</span>
                          <span>{formatDistanceToNow(item.timestamp, { addSuffix: true })}</span>
                          {item.size && (
                            <>
                              <span>•</span>
                              <span>{formatSize(item.size)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {expandedItems.has(item.id) ? (
                        <ChevronUp className="h-4 w-4 text-black/40 dark:text-white/40" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-black/40 dark:text-white/40" />
                      )}
                    </button>

                    <AnimatePresence>
                      {expandedItems.has(item.id) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-1">
                            {item.description && (
                              <p className="text-xs text-black/60 dark:text-white/60 mb-3">
                                {item.description}
                              </p>
                            )}

                            {item.error && (
                              <div className="flex items-start gap-2 p-2 rounded-lg bg-destructive/10 text-destructive text-xs mb-3">
                                <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                <span>{item.error}</span>
                              </div>
                            )}

                            {item.retryCount && item.retryCount > 0 && (
                              <p className="text-xs text-black/40 dark:text-white/40 mb-3">
                                Retried {item.retryCount} time{item.retryCount > 1 ? 's' : ''}
                              </p>
                            )}

                            <div className="flex items-center gap-2">
                              {onRetry && (item.status === 'error' || item.status === 'pending') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    hapticPresets.buttonPress();
                                    onRetry(item.id);
                                  }}
                                  className="rounded-full"
                                  data-testid="button-retry-item"
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Retry
                                </Button>
                              )}

                              {onDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    hapticPresets.warning();
                                    onDelete(item.id);
                                  }}
                                  className="rounded-full text-destructive"
                                  data-testid="button-delete-item"
                                >
                                  <Trash2 className="h-3 w-3 mr-1" />
                                  Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-black/10 dark:border-white/10 flex items-center gap-3">
            {onClearAll && items.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  hapticPresets.warning();
                  onClearAll();
                }}
                className="rounded-full"
                data-testid="button-clear-queue"
              >
                Clear All
              </Button>
            )}

            {onSync && (
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  hapticPresets.buttonPress();
                  onSync();
                }}
                disabled={status === 'syncing' || status === 'offline' || pendingCount === 0}
                className="flex-1 rounded-full bg-black dark:bg-white text-white dark:text-black"
                data-testid="button-sync-now"
              >
                {status === 'syncing' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Now
                  </>
                )}
              </Button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

interface SyncIndicatorProps {
  status: SyncStatus;
  progress?: number;
  className?: string;
}

export function SyncIndicator({ status, progress, className }: SyncIndicatorProps) {
  return (
    <div 
      className={cn("flex items-center gap-2", className)}
      data-testid="sync-indicator"
    >
      {status === 'syncing' && (
        <>
          <Loader2 className="h-4 w-4 animate-spin text-black dark:text-white" />
          <div className="flex-1 h-1 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-black dark:bg-white"
              initial={{ width: 0 }}
              animate={{ width: `${progress || 0}%` }}
            />
          </div>
          <span className="text-xs text-black/60 dark:text-white/60">
            {progress || 0}%
          </span>
        </>
      )}

      {status === 'success' && (
        <>
          <Check className="h-4 w-4 text-black dark:text-white" />
          <span className="text-xs text-black/60 dark:text-white/60">Synced</span>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-xs text-destructive">Sync failed</span>
        </>
      )}

      {status === 'offline' && (
        <>
          <WifiOff className="h-4 w-4 text-black/40 dark:text-white/40" />
          <span className="text-xs text-black/40 dark:text-white/40">Offline</span>
        </>
      )}
    </div>
  );
}

interface LastSyncInfoProps {
  lastSyncTime?: Date;
  className?: string;
}

export function LastSyncInfo({ lastSyncTime, className }: LastSyncInfoProps) {
  if (!lastSyncTime) return null;

  return (
    <div 
      className={cn(
        "flex items-center gap-1 text-xs text-black/40 dark:text-white/40",
        className
      )}
      data-testid="last-sync-info"
    >
      <Cloud className="h-3 w-3" />
      <span>Last synced {formatDistanceToNow(lastSyncTime, { addSuffix: true })}</span>
    </div>
  );
}
