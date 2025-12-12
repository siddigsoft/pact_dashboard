/**
 * DataFreshnessBadge Component
 * Shows when data was last updated and warns about stale data
 */

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw, Clock, AlertTriangle, Check, Wifi, WifiOff } from 'lucide-react';
import { formatDistanceToNow, differenceInMinutes } from 'date-fns';
import { cn } from '@/lib/utils';
import { useRealtimeHealth } from '@/hooks/useRealtimeHealth';

interface DataFreshnessBadgeProps {
  lastUpdated?: Date | null;
  onRefresh?: () => Promise<void>;
  staleThresholdMinutes?: number;
  showLabel?: boolean;
  variant?: 'badge' | 'inline' | 'compact';
  className?: string;
}

export function DataFreshnessBadge({
  lastUpdated,
  onRefresh,
  staleThresholdMinutes = 5,
  showLabel = true,
  variant = 'badge',
  className,
}: DataFreshnessBadgeProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [now, setNow] = useState(new Date());
  const health = useRealtimeHealth();

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStaleStatus = () => {
    if (!lastUpdated) return { isStale: false, isCritical: false };
    const minutesAgo = differenceInMinutes(now, lastUpdated);
    return {
      isStale: minutesAgo >= staleThresholdMinutes,
      isCritical: minutesAgo >= staleThresholdMinutes * 3,
    };
  };

  const { isStale, isCritical } = getStaleStatus();
  const isConnected = health.isOnline && health.connectedChannels > 0;
  const isOffline = !health.isOnline;

  const getStatusConfig = () => {
    if (isOffline) {
      return {
        icon: WifiOff,
        color: "text-slate-500",
        bgColor: "bg-slate-100 dark:bg-slate-800",
        borderColor: "border-slate-300 dark:border-slate-700",
        label: "Offline",
      };
    }
    if (isCritical) {
      return {
        icon: AlertTriangle,
        color: "text-red-600 dark:text-red-400",
        bgColor: "bg-red-50 dark:bg-red-950/30",
        borderColor: "border-red-200 dark:border-red-900",
        label: "Data may be outdated",
      };
    }
    if (isStale) {
      return {
        icon: Clock,
        color: "text-amber-600 dark:text-amber-400",
        bgColor: "bg-amber-50 dark:bg-amber-950/30",
        borderColor: "border-amber-200 dark:border-amber-900",
        label: "Checking for updates...",
      };
    }
    return {
      icon: isConnected ? Wifi : Check,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-950/30",
      borderColor: "border-green-200 dark:border-green-900",
      label: "Live",
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const timeText = lastUpdated
    ? formatDistanceToNow(lastUpdated, { addSuffix: true })
    : 'Never';

  if (variant === 'compact') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex items-center gap-1.5 cursor-default", className)}>
            <span className={cn("h-2 w-2 rounded-full", 
              isOffline ? "bg-slate-500" :
              isCritical ? "bg-red-500" :
              isStale ? "bg-amber-500" : "bg-green-500",
              !isStale && !isCritical && !isOffline && "animate-pulse"
            )} />
            <span className="text-xs text-muted-foreground">{timeText}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{config.label}</p>
          {lastUpdated && <p className="text-xs opacity-70">Last updated {timeText}</p>}
        </TooltipContent>
      </Tooltip>
    );
  }

  if (variant === 'inline') {
    return (
      <div className={cn("flex items-center gap-2", className)} data-testid="data-freshness-inline">
        <Icon className={cn("h-3.5 w-3.5", config.color)} />
        <span className={cn("text-xs", config.color)}>
          {showLabel ? config.label : ''} {lastUpdated && `· Updated ${timeText}`}
        </span>
        {onRefresh && (isStale || isCritical) && (
          <Button
            size="icon"
            variant="ghost"
            onClick={handleRefresh}
            disabled={isRefreshing || isOffline}
            className="h-5 w-5"
            data-testid="button-refresh-inline"
          >
            <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
          </Button>
        )}
      </div>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          className={cn(
            "flex items-center gap-1.5 cursor-default transition-colors",
            config.bgColor,
            config.borderColor,
            className
          )}
          data-testid="data-freshness-badge"
        >
          <Icon className={cn("h-3 w-3", config.color, 
            !isStale && !isCritical && !isOffline && Icon === Wifi && "animate-pulse"
          )} />
          {showLabel && (
            <span className={cn("text-xs font-normal", config.color)}>
              {config.label}
            </span>
          )}
          {onRefresh && (
            <Button
              size="icon"
              variant="ghost"
              onClick={handleRefresh}
              disabled={isRefreshing || isOffline}
              className={cn("h-4 w-4 ml-1 -mr-1", config.color)}
              data-testid="button-refresh-badge"
            >
              <RefreshCw className={cn("h-2.5 w-2.5", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <div className="text-xs space-y-1">
          <p className="font-medium">{config.label}</p>
          {lastUpdated && <p className="opacity-70">Updated {timeText}</p>}
          {health.connectedChannels > 0 && (
            <p className="opacity-70">{health.connectedChannels} live channels</p>
          )}
          {health.totalRetries > 0 && (
            <p className="opacity-70">{health.totalRetries} reconnection attempts</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
