import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface TrendData {
  value: number;
  direction: 'up' | 'down' | 'neutral';
  label?: string;
}

interface MobileStatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: TrendData;
  onClick?: () => void;
  className?: string;
  variant?: 'default' | 'compact' | 'large';
}

export function MobileStatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  onClick,
  className,
  variant = 'default',
}: MobileStatsCardProps) {
  const handleClick = () => {
    if (onClick) {
      hapticPresets.buttonPress();
      onClick();
    }
  };

  const TrendIcon = trend?.direction === 'up' 
    ? TrendingUp 
    : trend?.direction === 'down' 
      ? TrendingDown 
      : Minus;

  if (variant === 'compact') {
    return (
      <button
        onClick={handleClick}
        disabled={!onClick}
        className={cn(
          "flex items-center gap-3 p-3 rounded-xl bg-black/5 dark:bg-white/5",
          "touch-manipulation transition-all active:scale-[0.98]",
          onClick && "cursor-pointer",
          className
        )}
        data-testid={`stats-card-${title.toLowerCase().replace(/\s/g, '-')}`}
      >
        {icon && (
          <div className="w-10 h-10 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-black dark:text-white">
            {icon}
          </div>
        )}
        <div className="flex-1 text-left">
          <p className="text-xs text-black/60 dark:text-white/60">{title}</p>
          <p className="text-lg font-bold text-black dark:text-white">{value}</p>
        </div>
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-xs font-medium",
            trend.direction === 'up' && "text-black dark:text-white",
            trend.direction === 'down' && "text-destructive",
            trend.direction === 'neutral' && "text-black/40 dark:text-white/40"
          )}>
            <TrendIcon className="h-3 w-3" />
            <span>{trend.value}%</span>
          </div>
        )}
      </button>
    );
  }

  if (variant === 'large') {
    return (
      <motion.button
        onClick={handleClick}
        disabled={!onClick}
        whileTap={onClick ? { scale: 0.98 } : undefined}
        className={cn(
          "w-full p-5 rounded-2xl bg-black dark:bg-white text-white dark:text-black",
          "touch-manipulation text-left",
          className
        )}
        data-testid={`stats-card-${title.toLowerCase().replace(/\s/g, '-')}`}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-sm text-white/60 dark:text-black/60">{title}</p>
            <p className="text-4xl font-bold mt-1">{value}</p>
          </div>
          {icon && (
            <div className="w-12 h-12 rounded-full bg-white/20 dark:bg-black/20 flex items-center justify-center">
              {icon}
            </div>
          )}
        </div>
        
        {(trend || subtitle) && (
          <div className="flex items-center justify-between">
            {trend && (
              <div className={cn(
                "flex items-center gap-1.5 text-sm font-medium",
                trend.direction === 'up' && "text-white dark:text-black",
                trend.direction === 'down' && "text-white/70 dark:text-black/70",
                trend.direction === 'neutral' && "text-white/50 dark:text-black/50"
              )}>
                <TrendIcon className="h-4 w-4" />
                <span>{trend.value}% {trend.label || 'vs last period'}</span>
              </div>
            )}
            {subtitle && (
              <span className="text-sm text-white/60 dark:text-black/60">{subtitle}</span>
            )}
          </div>
        )}

        {onClick && (
          <div className="flex items-center gap-1 mt-4 text-sm font-medium text-white/80 dark:text-black/80">
            View details
            <ArrowRight className="h-4 w-4" />
          </div>
        )}
      </motion.button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={!onClick}
      className={cn(
        "p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/5",
        "touch-manipulation transition-all active:scale-[0.98] text-left w-full",
        onClick && "cursor-pointer",
        className
      )}
      data-testid={`stats-card-${title.toLowerCase().replace(/\s/g, '-')}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-black/60 dark:text-white/60">{title}</p>
          <p className="text-2xl font-bold text-black dark:text-white mt-1">{value}</p>
          {subtitle && (
            <p className="text-xs text-black/40 dark:text-white/40 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="w-10 h-10 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-black dark:text-white">
            {icon}
          </div>
        )}
      </div>
      
      {trend && (
        <div className={cn(
          "flex items-center gap-1.5 mt-3 text-sm font-medium",
          trend.direction === 'up' && "text-black dark:text-white",
          trend.direction === 'down' && "text-destructive",
          trend.direction === 'neutral' && "text-black/40 dark:text-white/40"
        )}>
          <TrendIcon className="h-4 w-4" />
          <span>{trend.value}% {trend.label || 'from last week'}</span>
        </div>
      )}
    </button>
  );
}

interface MobileStatsRowProps {
  stats: Array<{
    label: string;
    value: string | number;
    icon?: React.ReactNode;
  }>;
  className?: string;
}

export function MobileStatsRow({ stats, className }: MobileStatsRowProps) {
  return (
    <div className={cn("flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide", className)}>
      {stats.map((stat, index) => (
        <div
          key={index}
          className="flex-shrink-0 min-w-[100px] p-3 rounded-xl bg-black/5 dark:bg-white/5 text-center"
        >
          {stat.icon && (
            <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center text-black dark:text-white">
              {stat.icon}
            </div>
          )}
          <p className="text-lg font-bold text-black dark:text-white">{stat.value}</p>
          <p className="text-xs text-black/60 dark:text-white/60">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}

interface MobileProgressCardProps {
  title: string;
  current: number;
  total: number;
  unit?: string;
  icon?: React.ReactNode;
  className?: string;
}

export function MobileProgressCard({
  title,
  current,
  total,
  unit = '',
  icon,
  className,
}: MobileProgressCardProps) {
  const percentage = Math.round((current / total) * 100);

  return (
    <div 
      className={cn(
        "p-4 rounded-2xl bg-white dark:bg-neutral-900 border border-black/5 dark:border-white/5",
        className
      )}
      data-testid={`progress-card-${title.toLowerCase().replace(/\s/g, '-')}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && (
            <div className="w-8 h-8 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center text-black dark:text-white">
              {icon}
            </div>
          )}
          <span className="text-sm font-medium text-black dark:text-white">{title}</span>
        </div>
        <span className="text-sm font-bold text-black dark:text-white">{percentage}%</span>
      </div>

      <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-black dark:bg-white rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      <p className="text-xs text-black/60 dark:text-white/60 mt-2">
        {current}{unit} of {total}{unit} completed
      </p>
    </div>
  );
}
