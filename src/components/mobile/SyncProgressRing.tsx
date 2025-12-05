import { useState, useEffect } from 'react';
import { RefreshCw, Check, AlertTriangle, CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { syncManager, type SyncProgress } from '@/lib/sync-manager';
import { getOfflineStats } from '@/lib/offline-db';
import { cn } from '@/lib/utils';

interface SyncProgressRingProps {
  size?: 'sm' | 'md' | 'lg';
  showButton?: boolean;
  className?: string;
}

export function SyncProgressRing({ 
  size = 'md', 
  showButton = true,
  className 
}: SyncProgressRingProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncSuccess, setLastSyncSuccess] = useState<boolean | null>(null);

  const sizeConfig = {
    sm: { ring: 32, stroke: 3, icon: 12, text: 'text-xs' },
    md: { ring: 48, stroke: 4, icon: 16, text: 'text-sm' },
    lg: { ring: 64, stroke: 5, icon: 20, text: 'text-base' },
  };

  const config = sizeConfig[size];
  const radius = (config.ring - config.stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressPercent = progress.total > 0 
    ? (progress.completed / progress.total) * 100 
    : 0;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    const updateStats = async () => {
      try {
        const stats = await getOfflineStats();
        setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
      } catch (error) {
        console.error('Failed to get offline stats:', error);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete((result) => {
      setLastSyncSuccess(result.success);
      updateStats();
    });

    updateStats();
    const interval = setInterval(updateStats, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
      clearInterval(interval);
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline || progress.isRunning) return;
    await syncManager.forceSync();
  };

  const getStatusColor = () => {
    if (!isOnline) return 'text-destructive';
    if (progress.isRunning) return 'text-black dark:text-white';
    if (lastSyncSuccess === false) return 'text-destructive';
    return 'text-black dark:text-white';
  };

  const getStrokeColor = () => {
    if (!isOnline) return 'stroke-destructive';
    if (progress.isRunning) return 'stroke-black dark:stroke-white';
    if (lastSyncSuccess === false) return 'stroke-destructive';
    return 'stroke-black dark:stroke-white';
  };

  const renderIcon = () => {
    if (!isOnline) {
      return <CloudOff className={`h-${config.icon / 4} w-${config.icon / 4}`} style={{ width: config.icon, height: config.icon }} />;
    }
    if (progress.isRunning) {
      return <RefreshCw className="animate-spin" style={{ width: config.icon, height: config.icon }} />;
    }
    if (lastSyncSuccess === false) {
      return <AlertTriangle style={{ width: config.icon, height: config.icon }} />;
    }
    if (pendingCount > 0) {
      return <span className={cn("font-bold", config.text)}>{pendingCount}</span>;
    }
    return <Check style={{ width: config.icon, height: config.icon }} />;
  };

  const ring = (
    <div 
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: config.ring, height: config.ring }}
    >
      <svg
        className="absolute transform -rotate-90"
        width={config.ring}
        height={config.ring}
      >
        <circle
          cx={config.ring / 2}
          cy={config.ring / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={config.stroke}
          className="text-muted/20"
        />
        {progress.isRunning && (
          <circle
            cx={config.ring / 2}
            cy={config.ring / 2}
            r={radius}
            fill="none"
            strokeWidth={config.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={cn("transition-all duration-300", getStrokeColor())}
          />
        )}
        {!progress.isRunning && pendingCount === 0 && isOnline && lastSyncSuccess !== false && (
          <circle
            cx={config.ring / 2}
            cy={config.ring / 2}
            r={radius}
            fill="none"
            strokeWidth={config.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={0}
            className="stroke-black dark:stroke-white"
          />
        )}
      </svg>
      <div className={cn("z-10", getStatusColor())}>
        {renderIcon()}
      </div>
    </div>
  );

  if (!showButton) {
    return ring;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleSync}
      disabled={!isOnline || progress.isRunning}
      className={cn("rounded-full p-0", className)}
      style={{ width: config.ring + 8, height: config.ring + 8 }}
      data-testid="button-sync-ring"
    >
      {ring}
    </Button>
  );
}

export function SyncStatusPill({ className }: { className?: string }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [progress, setProgress] = useState<SyncProgress>(syncManager.getProgress());
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const unsubProgress = syncManager.onProgress(setProgress);
    const unsubComplete = syncManager.onComplete(async () => {
      const stats = await getOfflineStats();
      setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
    });

    const updateStats = async () => {
      const stats = await getOfflineStats();
      setPendingCount(stats.pendingActions + stats.unsyncedVisits + stats.unsyncedLocations);
    };

    updateStats();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubProgress();
      unsubComplete();
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline || progress.isRunning) return;
    await syncManager.forceSync();
  };

  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        bg: 'bg-destructive/10',
        text: 'text-destructive',
        label: 'Offline',
        icon: CloudOff,
      };
    }
    if (progress.isRunning) {
      return {
        bg: 'bg-black/10 dark:bg-white/10',
        text: 'text-black dark:text-white',
        label: 'Syncing...',
        icon: RefreshCw,
        animate: true,
      };
    }
    if (pendingCount > 0) {
      return {
        bg: 'bg-black/10 dark:bg-white/10',
        text: 'text-black dark:text-white',
        label: `${pendingCount} pending`,
        icon: AlertTriangle,
      };
    }
    return {
      bg: 'bg-black/10 dark:bg-white/10',
      text: 'text-black dark:text-white',
      label: 'Synced',
      icon: Check,
    };
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <button
      onClick={handleSync}
      disabled={!isOnline || progress.isRunning}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
        config.bg,
        config.text,
        "hover:opacity-80 disabled:opacity-50",
        className
      )}
      data-testid="button-sync-pill"
    >
      <Icon className={cn("h-3 w-3", config.animate && "animate-spin")} />
      <span>{config.label}</span>
    </button>
  );
}
