import { useState, useRef, useCallback, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  pullThreshold?: number;
  maxPull?: number;
}

export function PullToRefresh({
  onRefresh,
  children,
  className,
  disabled = false,
  pullThreshold = 80,
  maxPull = 120,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentY = useRef(0);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container) return;
    
    if (container.scrollTop <= 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;

    const container = containerRef.current;
    if (!container || container.scrollTop > 0) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    currentY.current = e.touches[0].clientY;
    const delta = currentY.current - startY.current;

    if (delta > 0) {
      e.preventDefault();
      const resistance = 0.5;
      const distance = Math.min(delta * resistance, maxPull);
      setPullDistance(distance);
    }
  }, [isPulling, disabled, isRefreshing, maxPull]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || disabled) return;

    setIsPulling(false);

    if (pullDistance >= pullThreshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(pullThreshold);
      
      try {
        await onRefresh();
      } catch (error) {
        console.error('Refresh failed:', error);
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [isPulling, disabled, pullDistance, pullThreshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const progress = Math.min(pullDistance / pullThreshold, 1);
  const rotation = progress * 360;
  const scale = 0.5 + progress * 0.5;
  const opacity = progress;

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div 
        className="absolute left-0 right-0 flex items-center justify-center transition-transform duration-200 ease-out z-10"
        style={{
          top: -40,
          transform: `translateY(${pullDistance}px)`,
        }}
      >
        <div 
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full bg-background border shadow-md transition-all",
            isRefreshing && "border-primary"
          )}
          style={{
            opacity: isRefreshing ? 1 : opacity,
            transform: `scale(${isRefreshing ? 1 : scale})`,
          }}
        >
          <RefreshCw 
            className={cn(
              "h-5 w-5 text-muted-foreground transition-colors",
              isRefreshing && "text-primary animate-spin",
              pullDistance >= pullThreshold && !isRefreshing && "text-primary"
            )}
            style={{
              transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
            }}
          />
        </div>
      </div>

      <div 
        ref={containerRef}
        className="h-full overflow-auto overscroll-contain"
        style={{
          transform: `translateY(${isPulling || isRefreshing ? pullDistance : 0}px)`,
          transition: !isPulling ? 'transform 0.2s ease-out' : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface RefreshableListProps<T> {
  items: T[];
  onRefresh: () => Promise<void>;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
  className?: string;
  emptyMessage?: string;
  isLoading?: boolean;
}

export function RefreshableList<T>({
  items,
  onRefresh,
  renderItem,
  keyExtractor,
  className,
  emptyMessage = 'No items',
  isLoading = false,
}: RefreshableListProps<T>) {
  return (
    <PullToRefresh onRefresh={onRefresh} className={cn("h-full", className)}>
      <div className="p-4 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          items.map((item, index) => (
            <div key={keyExtractor(item, index)}>
              {renderItem(item, index)}
            </div>
          ))
        )}
      </div>
    </PullToRefresh>
  );
}
