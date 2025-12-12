/**
 * Connection Status Component
 * Shows realtime connection status with visual feedback, error states, and refresh capability
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, WifiOff, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useRealtimeHealth } from '@/hooks/useRealtimeHealth';

interface ConnectionStatusProps {
  isConnected: boolean;
  channelCount?: number;
  lastUpdate?: Date | null;
  totalEvents?: number;
  onRefresh?: () => void | Promise<void>;
  variant?: 'badge' | 'compact' | 'minimal';
  showHealthDetails?: boolean;
}

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting' | 'error' | 'offline';

export const ConnectionStatus = ({ 
  isConnected, 
  channelCount = 0,
  lastUpdate: externalLastUpdate,
  totalEvents = 0,
  onRefresh,
  variant = 'badge',
  showHealthDetails = false,
}: ConnectionStatusProps) => {
  const [internalLastUpdate, setInternalLastUpdate] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const health = useRealtimeHealth();
  
  const lastUpdate = externalLastUpdate || internalLastUpdate;

  const getConnectionState = (): ConnectionState => {
    if (!health.isOnline) return 'offline';
    if (health.maxRetriesReached) return 'error';
    if (health.errorChannels > 0 && health.connectedChannels === 0) return 'error';
    if (health.channelCount > 0 && health.connectedChannels < health.channelCount) return 'reconnecting';
    if (isConnected) return 'connected';
    return 'disconnected';
  };

  const connectionState = getConnectionState();

  useEffect(() => {
    if (isConnected && !externalLastUpdate) {
      setInternalLastUpdate(new Date());
    }
  }, [isConnected, externalLastUpdate]);

  useEffect(() => {
    if (externalLastUpdate) return;
    
    const heartbeatInterval = setInterval(() => {
      if (isConnected) {
        setInternalLastUpdate(new Date());
      }
    }, 30000);

    return () => clearInterval(heartbeatInterval);
  }, [isConnected, externalLastUpdate]);

  const handleRefresh = async () => {
    if (isRefreshing || !onRefresh) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const getStatusConfig = () => {
    switch (connectionState) {
      case 'connected':
        return {
          color: 'bg-green-500',
          textColor: 'text-green-600 dark:text-green-400',
          icon: Activity,
          label: 'Live',
          badgeVariant: 'default' as const,
          animate: true,
        };
      case 'reconnecting':
        return {
          color: 'bg-yellow-500',
          textColor: 'text-yellow-600 dark:text-yellow-400',
          icon: Loader2,
          label: 'Reconnecting',
          badgeVariant: 'secondary' as const,
          animate: true,
        };
      case 'error':
        return {
          color: 'bg-red-500',
          textColor: 'text-red-600 dark:text-red-400',
          icon: AlertTriangle,
          label: health.maxRetriesReached ? 'Connection Failed' : 'Error',
          badgeVariant: 'destructive' as const,
          animate: false,
        };
      case 'offline':
        return {
          color: 'bg-gray-500',
          textColor: 'text-gray-600 dark:text-gray-400',
          icon: WifiOff,
          label: 'Offline',
          badgeVariant: 'secondary' as const,
          animate: false,
        };
      default:
        return {
          color: 'bg-red-500',
          textColor: 'text-red-600 dark:text-red-400',
          icon: WifiOff,
          label: 'Disconnected',
          badgeVariant: 'destructive' as const,
          animate: false,
        };
    }
  };

  const config = getStatusConfig();
  const StatusIcon = config.icon;

  if (variant === 'minimal') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'h-2 w-2 rounded-full inline-block',
              config.color,
              config.animate && 'animate-pulse'
            )}
            data-testid="status-connection-dot"
          />
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs space-y-1">
            <p>{config.label}</p>
            {totalEvents > 0 && <p>{totalEvents} events received</p>}
            {health.lastError && connectionState === 'error' && (
              <p className="text-red-400">Error: {health.lastError}</p>
            )}
            {health.totalRetries > 0 && connectionState === 'reconnecting' && (
              <p>Retry attempt {health.totalRetries}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-1.5" data-testid="status-connection-compact">
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            config.color,
            config.animate && 'animate-pulse'
          )}
        />
        <span className={cn('text-xs font-medium', config.textColor)}>
          {config.label}
        </span>
        {connectionState === 'reconnecting' && health.totalRetries > 0 && (
          <span className="text-xs text-muted-foreground">
            ({health.totalRetries})
          </span>
        )}
        {onRefresh && (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="h-6 w-6"
            data-testid="button-refresh-compact"
          >
            <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2" data-testid="status-connection-badge">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={config.badgeVariant}
            className="flex items-center gap-2 px-3 py-1 cursor-default"
            data-testid="badge-connection-status"
          >
            <StatusIcon className={cn(
              'h-3 w-3',
              config.animate && connectionState === 'connected' && 'animate-pulse',
              connectionState === 'reconnecting' && 'animate-spin'
            )} />
            <span>{config.label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs space-y-1">
            {health.connectedChannels > 0 && (
              <p>{health.connectedChannels}/{health.channelCount} channels connected</p>
            )}
            {totalEvents > 0 && <p>{totalEvents} events received</p>}
            {connectionState === 'reconnecting' && (
              <p>Retry attempt {health.totalRetries}</p>
            )}
            {connectionState === 'error' && health.lastError && (
              <p className="text-red-400">{health.lastError}</p>
            )}
            {connectionState === 'error' && health.maxRetriesReached && (
              <p className="text-red-400">Max retries reached. Click refresh to retry.</p>
            )}
            {connectionState === 'offline' && (
              <p>No network connection</p>
            )}
            {showHealthDetails && (
              <>
                <hr className="border-border/50 my-1" />
                <p>Uptime: {Math.round(health.uptime / 1000)}s</p>
                <p>Total retries: {health.totalRetries}</p>
                <p>Error channels: {health.errorChannels}</p>
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
      
      {connectionState === 'connected' && lastUpdate && (
        <span className="text-xs text-muted-foreground hidden sm:inline" data-testid="text-last-update">
          Updated {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </span>
      )}

      {onRefresh && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="h-7 w-7"
              data-testid="button-refresh-status"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isRefreshing && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {connectionState === 'error' ? 'Retry connection' : 'Force refresh all data'}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};
