import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Battery,
  BatteryCharging,
  BatteryFull,
  BatteryLow,
  BatteryMedium,
  BatteryWarning,
  Zap,
  ZapOff,
  Gauge,
  Activity,
  Settings,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import {
  batteryOptimizer,
  useBatteryStatus,
  useBatteryOptimizations,
  type BatteryStatus,
  type BatteryOptimizations,
} from '@/lib/batteryOptimizer';

interface MobileBatteryStatusProps {
  compact?: boolean;
  showOptimizations?: boolean;
  onModeChange?: (mode: string) => void;
  className?: string;
}

export function MobileBatteryStatus({
  compact = false,
  showOptimizations = true,
  onModeChange,
  className,
}: MobileBatteryStatusProps) {
  const status = useBatteryStatus();
  const optimizations = useBatteryOptimizations();
  const [showDetails, setShowDetails] = useState(false);

  const getBatteryIcon = () => {
    if (!status) return Battery;
    if (status.charging) return BatteryCharging;
    if (status.level > 80) return BatteryFull;
    if (status.level > 50) return BatteryMedium;
    if (status.level > 20) return BatteryLow;
    return BatteryWarning;
  };

  const getBatteryColor = () => {
    if (!status) return 'text-black/60 dark:text-white/60';
    if (status.charging) return 'text-black dark:text-white';
    if (status.level > 50) return 'text-black dark:text-white';
    if (status.level > 20) return 'text-black/60 dark:text-white/60';
    return 'text-destructive';
  };

  const getProgressColor = () => {
    if (!status) return 'bg-black/20 dark:bg-white/20';
    if (status.charging) return 'bg-black dark:bg-white';
    if (status.level > 50) return 'bg-black dark:bg-white';
    if (status.level > 20) return 'bg-black/60 dark:bg-white/60';
    return 'bg-destructive';
  };

  const BatteryIcon = getBatteryIcon();

  if (!status) {
    return null;
  }

  if (compact) {
    return (
      <div 
        className={cn("flex items-center gap-1.5", className)}
        data-testid="battery-status-compact"
        aria-label={`Battery ${status.level}%${status.charging ? ', charging' : ''}`}
      >
        <BatteryIcon className={cn("w-4 h-4", getBatteryColor())} />
        <span className="text-xs font-medium text-black dark:text-white" data-testid="text-battery-level">
          {status.level}%
        </span>
        {status.charging && (
          <Zap className="w-3 h-3 text-black dark:text-white" />
        )}
      </div>
    );
  }

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="battery-status-full">
      <button
        onClick={() => {
          hapticPresets.selection();
          setShowDetails(!showDetails);
        }}
        className="w-full p-4"
        data-testid="button-toggle-battery-details"
      >
        <div className="flex items-center gap-4">
          <div className={cn(
            "w-12 h-12 rounded-full flex items-center justify-center",
            status.charging ? "bg-black/10 dark:bg-white/10" : "bg-black/5 dark:bg-white/5"
          )}>
            <BatteryIcon className={cn("w-6 h-6", getBatteryColor())} />
          </div>

          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-base font-semibold text-black dark:text-white">
                {status.level}%
              </span>
              <Badge variant="secondary" className="text-xs">
                {status.charging ? 'Charging' : batteryOptimizer.getModeDescription(status.mode).split(' - ')[0]}
              </Badge>
            </div>
            <Progress 
              value={status.level} 
              className="h-2"
            />
          </div>

          <motion.div
            animate={{ rotate: showDetails ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4 text-black/40 dark:text-white/40" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-black/5 dark:border-white/5"
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-black/60 dark:text-white/60">Status</span>
                <span className="text-sm font-medium text-black dark:text-white">
                  {status.charging ? 'Charging' : 'On Battery'}
                </span>
              </div>

              {status.charging && status.chargingTime !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/60 dark:text-white/60">Full in</span>
                  <span className="text-sm font-medium text-black dark:text-white">
                    {batteryOptimizer.formatTimeRemaining(status.chargingTime)}
                  </span>
                </div>
              )}

              {!status.charging && status.dischargingTime !== null && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-black/60 dark:text-white/60">Time remaining</span>
                  <span className="text-sm font-medium text-black dark:text-white">
                    {batteryOptimizer.formatTimeRemaining(status.dischargingTime)}
                  </span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm text-black/60 dark:text-white/60">Power Mode</span>
                <Badge 
                  variant={status.mode === 'critical' ? 'destructive' : 'secondary'}
                  className="text-xs"
                >
                  {status.mode.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>

              {showOptimizations && (
                <div className="pt-2 border-t border-black/5 dark:border-white/5">
                  <p className="text-xs font-medium text-black/60 dark:text-white/60 mb-3">
                    Active Optimizations
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {optimizations.reducedAnimations && (
                      <OptimizationBadge icon={<Activity className="w-3 h-3" />} label="Reduced Animations" />
                    )}
                    {optimizations.reducedPolling && (
                      <OptimizationBadge icon={<Gauge className="w-3 h-3" />} label="Reduced Polling" />
                    )}
                    {optimizations.disableBackgroundSync && (
                      <OptimizationBadge icon={<ZapOff className="w-3 h-3" />} label="Sync Paused" />
                    )}
                    {optimizations.reduceGpsAccuracy && (
                      <OptimizationBadge icon={<Settings className="w-3 h-3" />} label="Low GPS" />
                    )}
                    {!optimizations.reducedAnimations && 
                     !optimizations.reducedPolling && 
                     !optimizations.disableBackgroundSync && (
                      <span className="text-xs text-black/40 dark:text-white/40">
                        No optimizations active
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

interface OptimizationBadgeProps {
  icon: React.ReactNode;
  label: string;
}

function OptimizationBadge({ icon, label }: OptimizationBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-black/5 dark:bg-white/5 rounded-full text-black/70 dark:text-white/70">
      {icon}
      {label}
    </span>
  );
}

interface BatteryIndicatorProps {
  size?: 'sm' | 'md' | 'lg';
  showPercentage?: boolean;
  className?: string;
}

export function BatteryIndicator({ 
  size = 'sm', 
  showPercentage = true,
  className 
}: BatteryIndicatorProps) {
  const status = useBatteryStatus();

  if (!status) return null;

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  };

  const getBatteryIcon = () => {
    if (status.charging) return BatteryCharging;
    if (status.level > 80) return BatteryFull;
    if (status.level > 50) return BatteryMedium;
    if (status.level > 20) return BatteryLow;
    return BatteryWarning;
  };

  const getColor = () => {
    if (status.charging) return 'text-black dark:text-white';
    if (status.level > 50) return 'text-black dark:text-white';
    if (status.level > 20) return 'text-black/60 dark:text-white/60';
    return 'text-destructive';
  };

  const Icon = getBatteryIcon();

  return (
    <div 
      className={cn("flex items-center gap-1", className)}
      data-testid="battery-indicator"
    >
      <Icon className={cn(sizeClasses[size], getColor())} />
      {showPercentage && (
        <span className="text-xs font-medium text-black dark:text-white">
          {status.level}%
        </span>
      )}
    </div>
  );
}

interface LowBatteryWarningProps {
  threshold?: number;
  onDismiss?: () => void;
  className?: string;
}

export function LowBatteryWarning({ 
  threshold = 20,
  onDismiss,
  className 
}: LowBatteryWarningProps) {
  const status = useBatteryStatus();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (status && status.level > threshold) {
      setDismissed(false);
    }
  }, [status?.level, threshold]);

  if (!status || status.level > threshold || status.charging || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    hapticPresets.buttonPress();
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "flex items-center gap-3 p-3 bg-destructive/10 rounded-xl",
        className
      )}
      data-testid="low-battery-warning"
    >
      <BatteryWarning className="w-5 h-5 text-destructive flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-destructive" data-testid="text-low-battery">
          Low Battery ({status.level}%)
        </p>
        <p className="text-xs text-destructive/70">
          Some features may be limited
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDismiss}
        className="text-destructive"
        data-testid="button-dismiss-battery-warning"
      >
        Dismiss
      </Button>
    </motion.div>
  );
}
