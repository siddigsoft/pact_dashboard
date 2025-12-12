/**
 * RealtimeBanner Component
 * Shows a global banner when connection is lost or reconnecting
 * Displays stale data warnings and provides manual refresh option
 */

import { useRealtimeHealth } from '@/hooks/useRealtimeHealth';
import { Button } from '@/components/ui/button';
import { WifiOff, RefreshCw, AlertTriangle, Wifi, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface RealtimeBannerProps {
  onRefresh?: () => Promise<void>;
  className?: string;
  dismissible?: boolean;
  showOnlyWhenDisconnected?: boolean;
}

export function RealtimeBanner({
  onRefresh,
  className,
  dismissible = true,
  showOnlyWhenDisconnected = true,
}: RealtimeBannerProps) {
  const health = useRealtimeHealth();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (health.isOnline && health.connectedChannels > 0 && !health.maxRetriesReached) {
      setIsDismissed(false);
    }
  }, [health.isOnline, health.connectedChannels, health.maxRetriesReached]);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const isConnected = health.isOnline && health.connectedChannels > 0 && !health.maxRetriesReached;
  const isReconnecting = health.isOnline && health.channelCount > 0 && health.connectedChannels < health.channelCount && !health.maxRetriesReached;
  const isOffline = !health.isOnline;
  const hasError = health.maxRetriesReached || health.errorChannels > 0;

  if (showOnlyWhenDisconnected && isConnected) return null;
  if (isDismissed && !hasError && !isOffline) return null;

  const getBannerConfig = () => {
    if (isOffline) {
      return {
        icon: WifiOff,
        title: "You're offline",
        message: "Changes will sync when you reconnect",
        bgClass: "bg-slate-800 dark:bg-slate-900",
        textClass: "text-white",
        iconClass: "text-slate-300",
      };
    }
    if (hasError) {
      return {
        icon: AlertTriangle,
        title: "Connection lost",
        message: "Data may be outdated. Click refresh to try again.",
        bgClass: "bg-red-500/90 dark:bg-red-900/90",
        textClass: "text-white",
        iconClass: "text-red-100",
      };
    }
    if (isReconnecting) {
      return {
        icon: RefreshCw,
        title: "Reconnecting...",
        message: `Attempt ${health.totalRetries}`,
        bgClass: "bg-amber-500/90 dark:bg-amber-900/90",
        textClass: "text-white",
        iconClass: "text-amber-100 animate-spin",
      };
    }
    return null;
  };

  const config = getBannerConfig();
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2",
        config.bgClass,
        config.textClass,
        className
      )}
      role="alert"
      data-testid="realtime-banner"
    >
      <div className="flex items-center gap-3">
        <Icon className={cn("h-4 w-4 flex-shrink-0", config.iconClass)} />
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{config.title}</span>
          <span className="opacity-80 hidden sm:inline">{config.message}</span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {onRefresh && (hasError || isOffline) && (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleRefresh}
            disabled={isRefreshing || isOffline}
            className="h-7 text-xs bg-white/20 hover:bg-white/30 text-white border-0"
            data-testid="button-banner-refresh"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", isRefreshing && "animate-spin")} />
            Refresh
          </Button>
        )}
        {dismissible && !hasError && !isOffline && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setIsDismissed(true)}
            className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/20"
            data-testid="button-dismiss-banner"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function RealtimeStatusDot({ className }: { className?: string }) {
  const health = useRealtimeHealth();
  
  const isConnected = health.isOnline && health.connectedChannels > 0 && !health.maxRetriesReached;
  const isReconnecting = health.isOnline && health.channelCount > 0 && health.connectedChannels < health.channelCount;
  const hasError = health.maxRetriesReached || health.errorChannels > 0;
  const isOffline = !health.isOnline;

  const getStatusColor = () => {
    if (isOffline) return "bg-slate-500";
    if (hasError) return "bg-red-500";
    if (isReconnecting) return "bg-amber-500";
    if (isConnected) return "bg-green-500";
    return "bg-slate-400";
  };

  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full inline-block",
        getStatusColor(),
        isConnected && "animate-pulse",
        className
      )}
      data-testid="status-realtime-dot"
    />
  );
}
