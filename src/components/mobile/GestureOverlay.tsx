import { useRef, useCallback, type ReactNode } from 'react';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { triggerHaptic } from '@/lib/haptics';

interface GestureOverlayProps {
  children: ReactNode;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onDoubleTap?: () => void;
  swipeThreshold?: number;
  className?: string;
  disabled?: boolean;
  testId?: string;
  ariaLabel?: string;
}

const SWIPE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 500;
const DOUBLE_TAP_DELAY = 300;

export function GestureOverlay({
  children,
  onSwipeUp,
  onSwipeDown,
  onSwipeLeft,
  onSwipeRight,
  onDoubleTap,
  swipeThreshold = SWIPE_THRESHOLD,
  className,
  disabled = false,
  testId = 'gesture-overlay',
  ariaLabel = 'Swipe gesture area',
}: GestureOverlayProps) {
  const lastTapTime = useRef(0);
  const y = useMotionValue(0);
  const x = useMotionValue(0);
  
  const translateY = useTransform(y, [-100, 0, 100], [-20, 0, 20]);
  const translateX = useTransform(x, [-100, 0, 100], [-20, 0, 20]);

  const handlePanEnd = useCallback((_: any, info: PanInfo) => {
    if (disabled) return;

    const { offset, velocity } = info;
    const absOffsetX = Math.abs(offset.x);
    const absOffsetY = Math.abs(offset.y);
    const absVelocityX = Math.abs(velocity.x);
    const absVelocityY = Math.abs(velocity.y);

    // Determine if it's a horizontal or vertical swipe
    if (absOffsetX > absOffsetY) {
      // Horizontal swipe
      if ((absOffsetX > swipeThreshold || absVelocityX > VELOCITY_THRESHOLD)) {
        if (offset.x > 0 && onSwipeRight) {
          triggerHaptic('light');
          onSwipeRight();
        } else if (offset.x < 0 && onSwipeLeft) {
          triggerHaptic('light');
          onSwipeLeft();
        }
      }
    } else {
      // Vertical swipe
      if ((absOffsetY > swipeThreshold || absVelocityY > VELOCITY_THRESHOLD)) {
        if (offset.y > 0 && onSwipeDown) {
          triggerHaptic('light');
          onSwipeDown();
        } else if (offset.y < 0 && onSwipeUp) {
          triggerHaptic('light');
          onSwipeUp();
        }
      }
    }

    // Reset position
    x.set(0);
    y.set(0);
  }, [disabled, swipeThreshold, onSwipeUp, onSwipeDown, onSwipeLeft, onSwipeRight, x, y]);

  const handleTap = useCallback(() => {
    if (disabled || !onDoubleTap) return;

    const now = Date.now();
    if (now - lastTapTime.current < DOUBLE_TAP_DELAY) {
      triggerHaptic('medium');
      onDoubleTap();
      lastTapTime.current = 0;
    } else {
      lastTapTime.current = now;
    }
  }, [disabled, onDoubleTap]);

  return (
    <motion.div
      className={className}
      style={{ x: translateX, y: translateY }}
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.1}
      onDragEnd={handlePanEnd}
      onTap={handleTap}
      data-testid={testId}
      aria-label={ariaLabel}
      role="region"
    >
      {children}
    </motion.div>
  );
}

interface SwipeableCardProps {
  children: ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  leftAction?: ReactNode;
  rightAction?: ReactNode;
  className?: string;
  testId?: string;
  leftActionLabel?: string;
  rightActionLabel?: string;
}

export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  leftAction,
  rightAction,
  className,
  testId = 'swipeable-card',
  leftActionLabel = 'Swipe right for action',
  rightActionLabel = 'Swipe left for action',
}: SwipeableCardProps) {
  const x = useMotionValue(0);
  const opacity = useTransform(x, [-100, -50, 0, 50, 100], [1, 0.8, 0, 0.8, 1]);
  
  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    const { offset, velocity } = info;
    
    if (Math.abs(offset.x) > 80 || Math.abs(velocity.x) > 500) {
      if (offset.x > 0 && onSwipeRight) {
        triggerHaptic('medium');
        onSwipeRight();
      } else if (offset.x < 0 && onSwipeLeft) {
        triggerHaptic('medium');
        onSwipeLeft();
      }
    }
  }, [onSwipeLeft, onSwipeRight]);

  const ariaDescription = [
    onSwipeLeft && rightActionLabel,
    onSwipeRight && leftActionLabel,
  ].filter(Boolean).join('. ');

  return (
    <div className="relative overflow-hidden" data-testid={testId}>
      {/* Background actions */}
      <div className="absolute inset-0 flex items-center justify-between px-4">
        <motion.div 
          style={{ opacity }} 
          className="flex items-center"
          aria-hidden="true"
        >
          {leftAction}
        </motion.div>
        <motion.div 
          style={{ opacity }} 
          className="flex items-center"
          aria-hidden="true"
        >
          {rightAction}
        </motion.div>
      </div>
      
      {/* Swipeable content */}
      <motion.div
        className={className}
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -100, right: 100 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        role="region"
        aria-label={ariaDescription || 'Swipeable card'}
      >
        {children}
      </motion.div>
    </div>
  );
}
