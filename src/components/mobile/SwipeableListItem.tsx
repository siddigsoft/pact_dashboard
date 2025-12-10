import { useRef, useState, useCallback } from 'react';
import { motion, PanInfo, useMotionValue, useTransform, AnimatePresence } from 'framer-motion';
import { Trash2, Archive, CheckCircle, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

type SwipeAction = {
  icon: React.ReactNode;
  label: string;
  color: string;
  bgColor: string;
  onAction: () => void;
};

interface SwipeableListItemProps {
  children: React.ReactNode;
  leftAction?: SwipeAction;
  rightAction?: SwipeAction;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  swipeThreshold?: number;
  className?: string;
  disabled?: boolean;
}

export function SwipeableListItem({
  children,
  leftAction,
  rightAction,
  onSwipeLeft,
  onSwipeRight,
  swipeThreshold = 100,
  className,
  disabled = false,
}: SwipeableListItemProps) {
  const [isRevealed, setIsRevealed] = useState<'left' | 'right' | null>(null);
  const constraintsRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  
  const leftOpacity = useTransform(x, [0, swipeThreshold], [0, 1]);
  const rightOpacity = useTransform(x, [-swipeThreshold, 0], [1, 0]);
  const leftScale = useTransform(x, [0, swipeThreshold], [0.5, 1]);
  const rightScale = useTransform(x, [-swipeThreshold, 0], [1, 0.5]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (disabled) return;

    const offset = info.offset.x;
    const velocity = info.velocity.x;

    if (offset > swipeThreshold || velocity > 500) {
      if (leftAction) {
        hapticPresets.success();
        setIsRevealed('left');
      } else if (onSwipeRight) {
        hapticPresets.swipe();
        onSwipeRight();
      }
    } else if (offset < -swipeThreshold || velocity < -500) {
      if (rightAction) {
        hapticPresets.success();
        setIsRevealed('right');
      } else if (onSwipeLeft) {
        hapticPresets.swipe();
        onSwipeLeft();
      }
    } else {
      setIsRevealed(null);
    }
  }, [disabled, swipeThreshold, leftAction, rightAction, onSwipeLeft, onSwipeRight]);

  const handleActionClick = useCallback((action: SwipeAction) => {
    hapticPresets.buttonPress();
    action.onAction();
    setIsRevealed(null);
  }, []);

  const handleDismiss = useCallback(() => {
    setIsRevealed(null);
  }, []);

  return (
    <div 
      ref={constraintsRef}
      className={cn("relative overflow-hidden", className)}
    >
      {leftAction && (
        <motion.div
          className="absolute inset-y-0 left-0 flex items-center justify-start pl-4"
          style={{ 
            opacity: leftOpacity,
            backgroundColor: leftAction.bgColor,
          }}
        >
          <motion.button
            style={{ scale: leftScale }}
            onClick={() => handleActionClick(leftAction)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-lg",
              leftAction.color
            )}
            data-testid="swipe-action-left"
          >
            {leftAction.icon}
            <span className="text-xs font-medium">{leftAction.label}</span>
          </motion.button>
        </motion.div>
      )}

      {rightAction && (
        <motion.div
          className="absolute inset-y-0 right-0 flex items-center justify-end pr-4"
          style={{ 
            opacity: rightOpacity,
            backgroundColor: rightAction.bgColor,
          }}
        >
          <motion.button
            style={{ scale: rightScale }}
            onClick={() => handleActionClick(rightAction)}
            className={cn(
              "flex flex-col items-center gap-1 p-2 rounded-lg",
              rightAction.color
            )}
            data-testid="swipe-action-right"
          >
            {rightAction.icon}
            <span className="text-xs font-medium">{rightAction.label}</span>
          </motion.button>
        </motion.div>
      )}

      <motion.div
        drag={disabled ? false : "x"}
        dragConstraints={constraintsRef}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        style={{ x }}
        animate={{
          x: isRevealed === 'left' ? swipeThreshold : isRevealed === 'right' ? -swipeThreshold : 0
        }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        className="relative bg-white dark:bg-black touch-manipulation"
        onClick={isRevealed ? handleDismiss : undefined}
      >
        {children}
      </motion.div>
    </div>
  );
}

export const swipeActionPresets = {
  delete: {
    icon: <Trash2 className="h-5 w-5" />,
    label: 'Delete',
    color: 'text-white',
    bgColor: 'hsl(var(--destructive))',
  },
  archive: {
    icon: <Archive className="h-5 w-5" />,
    label: 'Archive',
    color: 'text-white dark:text-black',
    bgColor: '#000000',
  },
  complete: {
    icon: <CheckCircle className="h-5 w-5" />,
    label: 'Done',
    color: 'text-white dark:text-black',
    bgColor: '#000000',
  },
  more: {
    icon: <MoreHorizontal className="h-5 w-5" />,
    label: 'More',
    color: 'text-white dark:text-black',
    bgColor: '#333333',
  },
};

interface SwipeableCardProps extends SwipeableListItemProps {
  onDelete?: () => void;
  onArchive?: () => void;
  onComplete?: () => void;
}

export function SwipeableCard({
  children,
  onDelete,
  onArchive,
  onComplete,
  className,
  disabled,
}: SwipeableCardProps) {
  const leftAction = onComplete ? {
    ...swipeActionPresets.complete,
    onAction: onComplete,
  } : onArchive ? {
    ...swipeActionPresets.archive,
    onAction: onArchive,
  } : undefined;

  const rightAction = onDelete ? {
    ...swipeActionPresets.delete,
    onAction: onDelete,
  } : undefined;

  return (
    <SwipeableListItem
      leftAction={leftAction}
      rightAction={rightAction}
      className={cn("rounded-2xl", className)}
      disabled={disabled}
    >
      {children}
    </SwipeableListItem>
  );
}
