/**
 * Connection Status Component
 * Shows realtime connection status with visual feedback and refresh capability
 */

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, WifiOff, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface ConnectionStatusProps {
  isConnected: boolean;
  channelCount?: number;
  lastUpdate?: Date | null;
  totalEvents?: number;
  onRefresh?: () => void | Promise<void>;
  variant?: 'badge' | 'compact' | 'minimal';
}

export const ConnectionStatus = ({ 
  isConnected, 
  channelCount = 0,
  lastUpdate: externalLastUpdate,
  totalEvents = 0,
  onRefresh,
  variant = 'badge',
}: ConnectionStatusProps) => {
  const [internalLastUpdate, setInternalLastUpdate] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const lastUpdate = externalLastUpdate || internalLastUpdate;

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

  if (variant === 'minimal') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              'h-2 w-2 rounded-full inline-block',
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            )}
            data-testid="status-connection-dot"
          />
        </TooltipTrigger>
        <TooltipContent>
          <p>{isConnected ? 'Live updates active' : 'Disconnected'}</p>
          {totalEvents > 0 && <p className="text-xs">{totalEvents} events received</p>}
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
            isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
          )}
        />
        <span className={cn(
          'text-xs font-medium',
          isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
        )}>
          {isConnected ? 'Live' : 'Offline'}
        </span>
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
            variant={isConnected ? 'default' : 'destructive'}
            className="flex items-center gap-2 px-3 py-1 cursor-default"
            data-testid="badge-connection-status"
          >
            {isConnected ? (
              <>
                <Activity className="h-3 w-3 animate-pulse" />
                <span>Live</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Disconnected</span>
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <div className="text-xs space-y-1">
            {isConnected && channelCount > 0 && (
              <p>{channelCount} active channels</p>
            )}
            {totalEvents > 0 && <p>{totalEvents} events received</p>}
            {!isConnected && <p>Attempting to reconnect...</p>}
          </div>
        </TooltipContent>
      </Tooltip>
      
      {isConnected && lastUpdate && (
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
          <TooltipContent>Force refresh all data</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};
