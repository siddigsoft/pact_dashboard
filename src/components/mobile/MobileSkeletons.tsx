import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

function Skeleton({ className }: SkeletonProps) {
  return (
    <div 
      className={cn(
        "animate-pulse rounded-md bg-black/10 dark:bg-white/10",
        className
      )} 
    />
  );
}

export function CardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("p-4 rounded-2xl border border-black/10 dark:border-white/10 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function ListItemSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("flex items-center gap-4 p-4", className)}>
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton className="h-6 w-16 rounded-full" />
    </div>
  );
}

export function SiteVisitCardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("p-4 rounded-2xl border border-black/10 dark:border-white/10 space-y-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 flex-1">
          <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
    </div>
  );
}

export function DashboardStatsSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="p-4 rounded-2xl border border-black/10 dark:border-white/10 space-y-3">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function WalletCardSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("p-6 rounded-2xl bg-black dark:bg-white space-y-4", className)}>
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20 bg-white/20 dark:bg-black/20" />
          <Skeleton className="h-8 w-32 bg-white/20 dark:bg-black/20" />
        </div>
        <Skeleton className="h-10 w-10 rounded-full bg-white/20 dark:bg-black/20" />
      </div>
      <div className="flex gap-3 pt-2">
        <Skeleton className="h-10 flex-1 rounded-full bg-white/20 dark:bg-black/20" />
        <Skeleton className="h-10 flex-1 rounded-full bg-white/20 dark:bg-black/20" />
      </div>
    </div>
  );
}

export function NotificationSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("flex items-start gap-3 p-4", className)}>
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-1/4" />
      </div>
    </div>
  );
}

export function ProfileSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="flex flex-col items-center gap-4 py-6">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="space-y-2 text-center">
          <Skeleton className="h-6 w-40 mx-auto" />
          <Skeleton className="h-4 w-32 mx-auto" />
        </div>
      </div>
      
      <div className="space-y-2 px-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-4 p-4 rounded-xl">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
            <Skeleton className="h-5 w-5" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MapSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl", className)}>
      <Skeleton className="w-full h-64" />
      <div className="absolute bottom-4 left-4 right-4">
        <div className="bg-white dark:bg-black rounded-xl p-3 shadow-lg space-y-2">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SkeletonListProps {
  count?: number;
  ItemComponent?: React.ComponentType<SkeletonProps>;
  className?: string;
  itemClassName?: string;
}

export function SkeletonList({ 
  count = 5, 
  ItemComponent = ListItemSkeleton,
  className,
  itemClassName
}: SkeletonListProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <ItemComponent key={i} className={itemClassName} />
      ))}
    </div>
  );
}

export function FullPageSkeleton() {
  return (
    <div className="min-h-screen bg-background p-4 space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </div>
      
      <DashboardStatsSkeleton />
      
      <div className="space-y-2">
        <Skeleton className="h-5 w-24" />
        <SkeletonList count={3} ItemComponent={SiteVisitCardSkeleton} />
      </div>
    </div>
  );
}

export function SettingsRowSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("flex items-center gap-3 p-4 border-b border-black/5 dark:border-white/5", className)}>
      <Skeleton className="h-5 w-5 rounded" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-5 w-5 rounded" />
    </div>
  );
}

export function SettingsSectionSkeleton({ 
  rowCount = 4,
  className 
}: { 
  rowCount?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Skeleton className="h-4 w-24 mb-2 ml-4" />
      {Array.from({ length: rowCount }).map((_, i) => (
        <SettingsRowSkeleton key={i} />
      ))}
    </div>
  );
}

interface PullToRefreshIndicatorProps {
  isRefreshing: boolean;
  progress?: number;
  className?: string;
}

export function PullToRefreshIndicator({ 
  isRefreshing,
  progress = 0,
  className 
}: PullToRefreshIndicatorProps) {
  if (!isRefreshing && progress === 0) return null;

  return (
    <div 
      className={cn(
        "flex items-center justify-center py-4 transition-all duration-200",
        className
      )}
      role="status"
      aria-live="polite"
      data-testid="pull-to-refresh-indicator"
    >
      <div 
        className={cn(
          "w-6 h-6 border-2 border-black dark:border-white rounded-full",
          isRefreshing 
            ? "border-t-transparent animate-spin" 
            : "border-t-transparent"
        )}
        style={{ 
          opacity: isRefreshing ? 1 : Math.min(progress / 100, 1),
          transform: `rotate(${progress * 3.6}deg)`
        }}
        aria-hidden="true"
      />
      {isRefreshing && (
        <span className="sr-only">Refreshing content</span>
      )}
    </div>
  );
}
