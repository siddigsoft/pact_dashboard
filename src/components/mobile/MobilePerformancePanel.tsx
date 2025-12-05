import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Gauge,
  Cpu,
  HardDrive,
  Wifi,
  WifiOff,
  Zap,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  RefreshCw,
  BarChart3,
  Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import {
  performanceMonitor,
  usePerformanceMetrics,
  type PerformanceMetrics,
  type PerformanceLevel,
} from '@/lib/performanceMonitor';

interface MobilePerformancePanelProps {
  showDetails?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

export function MobilePerformancePanel({
  showDetails = true,
  autoRefresh = true,
  refreshInterval = 2000,
  className,
}: MobilePerformancePanelProps) {
  const metrics = usePerformanceMetrics(refreshInterval);
  const [expanded, setExpanded] = useState(false);
  const level = performanceMonitor.getPerformanceLevel();

  const getLevelColor = () => {
    switch (level) {
      case 'excellent':
        return 'text-black dark:text-white';
      case 'good':
        return 'text-black dark:text-white';
      case 'fair':
        return 'text-black/60 dark:text-white/60';
      case 'poor':
        return 'text-destructive';
    }
  };

  const getLevelIcon = () => {
    switch (level) {
      case 'excellent':
      case 'good':
        return <CheckCircle className="w-5 h-5" />;
      case 'fair':
        return <AlertTriangle className="w-5 h-5" />;
      case 'poor':
        return <AlertTriangle className="w-5 h-5" />;
    }
  };

  const getLevelBg = () => {
    switch (level) {
      case 'excellent':
        return 'bg-black dark:bg-white';
      case 'good':
        return 'bg-black/20 dark:bg-white/20';
      case 'fair':
        return 'bg-black/10 dark:bg-white/10';
      case 'poor':
        return 'bg-destructive/10';
    }
  };

  return (
    <Card className={cn("overflow-hidden", className)} data-testid="performance-panel">
      <button
        onClick={() => {
          hapticPresets.selection();
          setExpanded(!expanded);
        }}
        className="w-full p-4"
        data-testid="button-toggle-performance"
      >
        <div className="flex items-center gap-4">
          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center", getLevelBg())}>
            <div className={getLevelColor()}>
              {getLevelIcon()}
            </div>
          </div>

          <div className="flex-1 text-left">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base font-semibold text-black dark:text-white">
                Performance
              </span>
              <Badge variant="secondary" className="text-xs capitalize">
                {level}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-black/60 dark:text-white/60">
              <span>{metrics.fps} FPS</span>
              {metrics.memoryUsage !== null && (
                <span>{metrics.memoryUsage}% Memory</span>
              )}
            </div>
          </div>

          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4 text-black/40 dark:text-white/40" />
          </motion.div>
        </div>
      </button>

      <AnimatePresence>
        {expanded && showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-black/5 dark:border-white/5"
          >
            <div className="p-4 space-y-4">
              <MetricRow
                icon={<Gauge className="w-4 h-4" />}
                label="Frame Rate"
                value={`${metrics.fps} FPS`}
                progress={Math.min(100, (metrics.fps / 60) * 100)}
                progressColor={metrics.fps >= 50 ? 'bg-black dark:bg-white' : metrics.fps >= 30 ? 'bg-black/60 dark:bg-white/60' : 'bg-destructive'}
              />

              {metrics.memoryUsage !== null && (
                <MetricRow
                  icon={<HardDrive className="w-4 h-4" />}
                  label="Memory"
                  value={`${metrics.memoryUsage}%`}
                  progress={metrics.memoryUsage}
                  progressColor={metrics.memoryUsage < 60 ? 'bg-black dark:bg-white' : metrics.memoryUsage < 80 ? 'bg-black/60 dark:bg-white/60' : 'bg-destructive'}
                />
              )}

              <MetricRow
                icon={<Activity className="w-4 h-4" />}
                label="Long Tasks"
                value={metrics.longTasks.toString()}
                showProgress={false}
                status={metrics.longTasks < 5 ? 'good' : metrics.longTasks < 15 ? 'warning' : 'error'}
              />

              <MetricRow
                icon={<BarChart3 className="w-4 h-4" />}
                label="Cache Hit Rate"
                value={`${metrics.cacheHitRate}%`}
                progress={metrics.cacheHitRate}
                progressColor="bg-black dark:bg-white"
              />

              {metrics.pageLoadTime !== null && (
                <MetricRow
                  icon={<Clock className="w-4 h-4" />}
                  label="Page Load"
                  value={`${metrics.pageLoadTime}ms`}
                  showProgress={false}
                  status={metrics.pageLoadTime < 1000 ? 'good' : metrics.pageLoadTime < 3000 ? 'warning' : 'error'}
                />
              )}

              <div className="pt-2 flex justify-between items-center">
                <span className="text-xs text-black/40 dark:text-white/40">
                  {metrics.resourceCount} resources loaded
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    hapticPresets.buttonPress();
                    performanceMonitor.reset();
                  }}
                  data-testid="button-reset-metrics"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

interface MetricRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress?: number;
  progressColor?: string;
  showProgress?: boolean;
  status?: 'good' | 'warning' | 'error';
}

function MetricRow({
  icon,
  label,
  value,
  progress,
  progressColor = 'bg-black dark:bg-white',
  showProgress = true,
  status,
}: MetricRowProps) {
  const getStatusColor = () => {
    if (!status) return '';
    switch (status) {
      case 'good':
        return 'text-black dark:text-white';
      case 'warning':
        return 'text-black/60 dark:text-white/60';
      case 'error':
        return 'text-destructive';
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-black/60 dark:text-white/60">
          {icon}
          <span className="text-sm">{label}</span>
        </div>
        <span className={cn("text-sm font-medium text-black dark:text-white", getStatusColor())}>
          {value}
        </span>
      </div>
      {showProgress && progress !== undefined && (
        <div className="h-1.5 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className={cn("h-full rounded-full", progressColor)}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}
    </div>
  );
}

interface FPSMonitorProps {
  size?: 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

export function FPSMonitor({ 
  size = 'sm',
  showLabel = false,
  className 
}: FPSMonitorProps) {
  const metrics = usePerformanceMetrics(500);

  const getColor = () => {
    if (metrics.fps >= 50) return 'text-black dark:text-white';
    if (metrics.fps >= 30) return 'text-black/60 dark:text-white/60';
    return 'text-destructive';
  };

  return (
    <div 
      className={cn("flex items-center gap-1", className)}
      data-testid="fps-monitor"
      aria-label={`Frame rate: ${metrics.fps} FPS`}
    >
      <Gauge className={cn(size === 'sm' ? 'w-3 h-3' : 'w-4 h-4', getColor())} />
      <span className={cn(
        "font-mono font-medium",
        size === 'sm' ? 'text-xs' : 'text-sm',
        getColor()
      )} data-testid="text-fps-value">
        {metrics.fps}
      </span>
      {showLabel && (
        <span className="text-xs text-black/40 dark:text-white/40">FPS</span>
      )}
    </div>
  );
}

interface PerformanceBadgeProps {
  className?: string;
}

export function PerformanceBadge({ className }: PerformanceBadgeProps) {
  const level = performanceMonitor.getPerformanceLevel();

  const getVariant = (): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (level) {
      case 'excellent':
      case 'good':
        return 'secondary';
      case 'fair':
        return 'outline';
      case 'poor':
        return 'destructive';
    }
  };

  return (
    <Badge 
      variant={getVariant()} 
      className={cn("text-xs capitalize", className)}
      data-testid="performance-badge"
    >
      {level}
    </Badge>
  );
}
