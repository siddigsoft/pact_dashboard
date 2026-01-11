/**
 * RealtimeBanner Component
 * Shows a global banner when connection is lost or reconnecting
 * Displays stale data warnings and provides manual refresh option
 */

import { useRealtimeHealth } from '@/hooks/useRealtimeHealth';
import { Button } from '@/components/ui/button';
import { WifiOff, X } from 'lucide-react';
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
  const [showBanner, setShowBanner] = useState(false);
  const [stableErrorState, setStableErrorState] = useState(false);

  // Only show banner for true offline state (no network)
  // Realtime websocket issues don't block the app - data just refreshes manually
  const isOffline = !health.isOnline;

  useEffect(() => {
    if (!isOffline) {
      setShowBanner(false);
      setStableErrorState(false);
      setIsDismissed(false);
      return;
    }

    // Only show banner after being offline for 2 seconds (avoid brief disconnects)
    const timer = setTimeout(() => {
      setStableErrorState(true);
      setShowBanner(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [isOffline]);

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
      setShowBanner(false);
      setStableErrorState(false);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Only show banner when truly offline (no network connection)
  if (!isOffline || !showBanner || isDismissed) return null;

  const config = {
    icon: WifiOff,
    title: "You're offline",
    message: "Changes will sync when you reconnect",
    bgClass: "bg-slate-800 dark:bg-slate-900",
    textClass: "text-white",
    iconClass: "text-slate-300",
  };

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
        {dismissible && (
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
