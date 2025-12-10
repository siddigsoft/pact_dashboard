import { useState, useEffect, useCallback } from 'react';
import { Wifi, WifiOff, Signal, SignalLow, SignalMedium, SignalHigh } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

type NetworkQuality = 'offline' | 'slow' | 'moderate' | 'fast' | 'excellent';

interface NetworkInfo {
  isOnline: boolean;
  quality: NetworkQuality;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
}

function getNetworkQuality(connection: any): NetworkQuality {
  if (!navigator.onLine) return 'offline';
  
  if (!connection) return 'moderate';

  const effectiveType = connection.effectiveType;
  const downlink = connection.downlink;
  const rtt = connection.rtt;

  if (effectiveType === 'slow-2g' || effectiveType === '2g') {
    return 'slow';
  }
  
  if (effectiveType === '3g' || (rtt && rtt > 200)) {
    return 'moderate';
  }

  if (downlink && downlink >= 10) {
    return 'excellent';
  }

  return 'fast';
}

const qualityConfig: Record<NetworkQuality, { 
  label: string; 
  icon: React.ReactNode; 
  color: string;
  bgColor: string;
}> = {
  offline: {
    label: 'Offline',
    icon: <WifiOff className="h-3.5 w-3.5" />,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
  },
  slow: {
    label: 'Slow',
    icon: <SignalLow className="h-3.5 w-3.5" />,
    color: 'text-black/50 dark:text-white/50',
    bgColor: 'bg-black/5 dark:bg-white/5',
  },
  moderate: {
    label: 'Moderate',
    icon: <SignalMedium className="h-3.5 w-3.5" />,
    color: 'text-black/70 dark:text-white/70',
    bgColor: 'bg-black/5 dark:bg-white/10',
  },
  fast: {
    label: 'Good',
    icon: <SignalHigh className="h-3.5 w-3.5" />,
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/5 dark:bg-white/10',
  },
  excellent: {
    label: 'Excellent',
    icon: <Wifi className="h-3.5 w-3.5" />,
    color: 'text-black dark:text-white',
    bgColor: 'bg-black/10 dark:bg-white/10',
  },
};

export function useNetworkQuality(): NetworkInfo {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(() => {
    const connection = (navigator as any).connection;
    return {
      isOnline: navigator.onLine,
      quality: getNetworkQuality(connection),
      effectiveType: connection?.effectiveType,
      downlink: connection?.downlink,
      rtt: connection?.rtt,
      saveData: connection?.saveData,
    };
  });

  useEffect(() => {
    const connection = (navigator as any).connection;

    const updateNetworkInfo = () => {
      setNetworkInfo({
        isOnline: navigator.onLine,
        quality: getNetworkQuality(connection),
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt,
        saveData: connection?.saveData,
      });
    };

    window.addEventListener('online', updateNetworkInfo);
    window.addEventListener('offline', updateNetworkInfo);
    
    if (connection) {
      connection.addEventListener('change', updateNetworkInfo);
    }

    return () => {
      window.removeEventListener('online', updateNetworkInfo);
      window.removeEventListener('offline', updateNetworkInfo);
      if (connection) {
        connection.removeEventListener('change', updateNetworkInfo);
      }
    };
  }, []);

  return networkInfo;
}

interface NetworkQualityIndicatorProps {
  variant?: 'badge' | 'icon' | 'full';
  showLabel?: boolean;
  className?: string;
}

export function NetworkQualityIndicator({
  variant = 'badge',
  showLabel = true,
  className,
}: NetworkQualityIndicatorProps) {
  const { quality, downlink, rtt } = useNetworkQuality();
  const config = qualityConfig[quality];

  if (variant === 'icon') {
    return (
      <div 
        className={cn(config.color, className)} 
        title={config.label}
        data-testid="network-quality-icon"
      >
        {config.icon}
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <div 
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-xl",
          config.bgColor,
          className
        )}
        data-testid="network-quality-full"
      >
        <div className={config.color}>{config.icon}</div>
        <div className="flex-1">
          <div className={cn("text-sm font-medium", config.color)}>
            {config.label}
          </div>
          {quality !== 'offline' && (downlink || rtt) && (
            <div className="text-xs text-black/50 dark:text-white/50">
              {downlink && `${downlink} Mbps`}
              {downlink && rtt && ' · '}
              {rtt && `${rtt}ms`}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Badge 
      variant="secondary" 
      className={cn(
        "gap-1 font-medium",
        config.bgColor,
        config.color,
        className
      )}
      data-testid="network-quality-badge"
    >
      {config.icon}
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}

interface NetworkStatusBarProps {
  onRetry?: () => void;
  className?: string;
}

export function NetworkStatusBar({ onRetry, className }: NetworkStatusBarProps) {
  const { isOnline, quality, saveData } = useNetworkQuality();

  if (isOnline && quality !== 'slow') {
    return null;
  }

  return (
    <div 
      className={cn(
        "px-4 py-2 flex items-center justify-between gap-3",
        !isOnline 
          ? "bg-destructive text-white" 
          : "bg-black/10 dark:bg-white/10 text-black dark:text-white",
        className
      )}
      role="alert"
      data-testid="network-status-bar"
    >
      <div className="flex items-center gap-2 min-w-0">
        {!isOnline ? (
          <WifiOff className="h-4 w-4 flex-shrink-0" />
        ) : (
          <SignalLow className="h-4 w-4 flex-shrink-0" />
        )}
        <p className="text-sm font-medium truncate">
          {!isOnline 
            ? 'No internet connection' 
            : saveData 
              ? 'Data saver mode active' 
              : 'Slow connection detected'
          }
        </p>
      </div>
      
      {onRetry && !isOnline && (
        <button
          onClick={onRetry}
          className="text-sm font-semibold underline flex-shrink-0"
          data-testid="button-retry-network"
        >
          Retry
        </button>
      )}
    </div>
  );
}
