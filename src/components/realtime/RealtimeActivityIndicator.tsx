/**
 * RealtimeActivityIndicator Component
 * Subtle animated indicator showing realtime connection activity
 * Perfect for headers, sidebars, and status bars
 */

import { useRealtimeHealth } from '@/hooks/useRealtimeHealth';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Activity, Wifi, WifiOff, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RealtimeActivityIndicatorProps {
  variant?: 'dot' | 'icon' | 'pulse' | 'bar';
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

export function RealtimeActivityIndicator({
  variant = 'dot',
  size = 'md',
  showTooltip = true,
  className,
}: RealtimeActivityIndicatorProps) {
  const health = useRealtimeHealth();

  const isConnected = health.isOnline && health.connectedChannels > 0 && !health.maxRetriesReached;
  const isReconnecting = health.isOnline && health.channelCount > 0 && health.connectedChannels < health.channelCount && !health.maxRetriesReached;
  const hasError = health.maxRetriesReached || (health.errorChannels > 0 && health.connectedChannels === 0);
  const isOffline = !health.isOnline;

  const getStatus = () => {
    if (isOffline) return { status: 'offline', label: 'Offline', color: 'slate' };
    if (hasError) return { status: 'error', label: 'Connection Failed', color: 'red' };
    if (isReconnecting) return { status: 'reconnecting', label: `Reconnecting... (${health.totalRetries})`, color: 'amber' };
    if (isConnected) return { status: 'connected', label: 'Live', color: 'green' };
    return { status: 'disconnected', label: 'Disconnected', color: 'slate' };
  };

  const { status, label, color } = getStatus();

  const sizeClasses = {
    sm: { dot: 'h-1.5 w-1.5', icon: 'h-3 w-3', bar: 'h-0.5 w-8' },
    md: { dot: 'h-2 w-2', icon: 'h-4 w-4', bar: 'h-1 w-12' },
    lg: { dot: 'h-3 w-3', icon: 'h-5 w-5', bar: 'h-1.5 w-16' },
  };

  const colorClasses = {
    green: {
      dot: 'bg-green-500',
      icon: 'text-green-500',
      bar: 'bg-green-500',
    },
    amber: {
      dot: 'bg-amber-500',
      icon: 'text-amber-500',
      bar: 'bg-amber-500',
    },
    red: {
      dot: 'bg-red-500',
      icon: 'text-red-500',
      bar: 'bg-red-500',
    },
    slate: {
      dot: 'bg-slate-400',
      icon: 'text-slate-400',
      bar: 'bg-slate-400',
    },
  };

  const getIcon = () => {
    if (isOffline) return WifiOff;
    if (hasError) return AlertTriangle;
    if (isReconnecting) return Loader2;
    if (isConnected) return Wifi;
    return Activity;
  };

  const Icon = getIcon();

  const renderIndicator = () => {
    switch (variant) {
      case 'dot':
        return (
          <span
            className={cn(
              'rounded-full inline-block',
              sizeClasses[size].dot,
              colorClasses[color].dot,
              isConnected && 'animate-pulse',
              isReconnecting && 'animate-pulse',
              className
            )}
            data-testid="realtime-indicator-dot"
          />
        );

      case 'icon':
        return (
          <Icon
            className={cn(
              sizeClasses[size].icon,
              colorClasses[color].icon,
              isReconnecting && 'animate-spin',
              className
            )}
            data-testid="realtime-indicator-icon"
          />
        );

      case 'pulse':
        return (
          <div className={cn("relative inline-flex", className)} data-testid="realtime-indicator-pulse">
            <span
              className={cn(
                'rounded-full',
                sizeClasses[size].dot,
                colorClasses[color].dot
              )}
            />
            {isConnected && (
              <span
                className={cn(
                  'absolute inline-flex rounded-full opacity-75 animate-ping',
                  sizeClasses[size].dot,
                  colorClasses[color].dot
                )}
              />
            )}
          </div>
        );

      case 'bar':
        return (
          <div
            className={cn(
              'rounded-full overflow-hidden bg-muted',
              sizeClasses[size].bar,
              className
            )}
            data-testid="realtime-indicator-bar"
          >
            <div
              className={cn(
                'h-full transition-all duration-500',
                colorClasses[color].bar,
                isConnected && 'animate-pulse'
              )}
              style={{
                width: isOffline ? '0%' :
                       hasError ? '100%' :
                       isReconnecting ? '50%' :
                       isConnected ? '100%' : '0%'
              }}
            />
          </div>
        );

      default:
        return null;
    }
  };

  if (!showTooltip) {
    return renderIndicator();
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center cursor-default">
          {renderIndicator()}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        <div className="space-y-1">
          <p className="font-medium">{label}</p>
          {health.connectedChannels > 0 && (
            <p className="opacity-70">{health.connectedChannels}/{health.channelCount} channels connected</p>
          )}
          {health.lastError && status === 'error' && (
            <p className="text-red-400">{health.lastError}</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function RealtimeConnectionBar({ className }: { className?: string }) {
  const health = useRealtimeHealth();
  
  const isConnected = health.isOnline && health.connectedChannels > 0 && !health.maxRetriesReached;
  const hasIssue = !health.isOnline || health.maxRetriesReached || health.errorChannels > 0;
  
  if (isConnected && !hasIssue) return null;

  return (
    <div
      className={cn(
        "h-1 w-full transition-colors",
        !health.isOnline ? "bg-slate-500" :
        health.maxRetriesReached ? "bg-red-500" :
        health.errorChannels > 0 ? "bg-amber-500" :
        "bg-green-500 animate-pulse",
        className
      )}
      data-testid="realtime-connection-bar"
    />
  );
}
