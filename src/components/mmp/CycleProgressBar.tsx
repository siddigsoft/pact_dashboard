import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

interface CycleProgressBarProps {
  covered: number;
  total: number;
  className?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const CycleProgressBar = ({
  covered,
  total,
  className,
  showLabel = true,
  size = 'md',
}: CycleProgressBarProps) => {
  const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;

  const color = useMemo(() => {
    if (percentage >= 80) return 'green';
    if (percentage >= 50) return 'amber';
    return 'red';
  }, [percentage]);

  const barColor = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
  }[color];

  const trackColor = {
    green: 'bg-green-100 dark:bg-green-900/30',
    amber: 'bg-amber-100 dark:bg-amber-900/30',
    red: 'bg-red-100 dark:bg-red-900/30',
  }[color];

  const textColor = {
    green: 'text-green-700 dark:text-green-400',
    amber: 'text-amber-700 dark:text-amber-400',
    red: 'text-red-700 dark:text-red-400',
  }[color];

  const Icon = {
    green: CheckCircle2,
    amber: AlertTriangle,
    red: XCircle,
  }[color];

  const barHeight = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2';
  const fontSize = size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-sm' : 'text-xs';

  if (total === 0) {
    return (
      <div className={cn('space-y-1', className)}>
        {showLabel && (
          <div className="flex items-center justify-between">
            <span className={cn('text-muted-foreground', fontSize)}>Coverage</span>
            <span className={cn('font-semibold text-muted-foreground', fontSize)}>No sites</span>
          </div>
        )}
        <div className={cn('w-full rounded-full bg-muted', barHeight)} />
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)} data-testid="cycle-progress-bar">
      {showLabel && (
        <div className="flex items-center justify-between">
          <div className={cn('flex items-center gap-1', textColor, fontSize)}>
            <Icon className="h-3.5 w-3.5" />
            <span className="font-medium">Coverage</span>
          </div>
          <div className={cn('flex items-center gap-1.5 font-semibold', textColor, fontSize)}>
            <span>{covered}/{total} sites</span>
            <span className="opacity-60">·</span>
            <span>{percentage}%</span>
          </div>
        </div>
      )}
      <div className={cn('w-full rounded-full overflow-hidden', trackColor, barHeight)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${percentage}%` }}
          data-testid="cycle-progress-fill"
        />
      </div>
    </div>
  );
};

export default CycleProgressBar;
