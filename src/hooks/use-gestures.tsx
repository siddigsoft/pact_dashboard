
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDevice } from './use-device';
import { hapticPresets } from '@/lib/haptics';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onLongPress?: () => void;
  onDoubleTap?: () => void;
}

interface GestureOptions {
  minSwipeDistance?: number;
  longPressDelay?: number;
  doubleTapDelay?: number;
  enableHaptics?: boolean;
  preventScrollOnSwipe?: boolean;
}

const defaultOptions: GestureOptions = {
  minSwipeDistance: 50,
  longPressDelay: 500,
  doubleTapDelay: 300,
  enableHaptics: true,
  preventScrollOnSwipe: false,
};

export function useGestures(handlers?: SwipeHandlers, options?: GestureOptions) {
  const { isNative, deviceInfo } = useDevice();
  const navigate = useNavigate();
  const touchStartRef = useRef<{x: number; y: number; time: number}>({ x: 0, y: 0, time: 0 });
  const lastTapRef = useRef<number>(0);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(false);
  
  const config = { ...defaultOptions, ...options };

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isNative || window.innerWidth < 768) {
      setIsSwipeEnabled(true);
    }

    const handleTouchStart = (e: TouchEvent) => {
      const now = Date.now();
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: now
      };

      if (handlers?.onDoubleTap) {
        if (now - lastTapRef.current < config.doubleTapDelay!) {
          handlers.onDoubleTap();
          if (config.enableHaptics) hapticPresets.toggle();
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }

      if (handlers?.onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          handlers.onLongPress!();
          if (config.enableHaptics) hapticPresets.longPress();
        }, config.longPressDelay!);
      }
    };

    const handleTouchMove = () => {
      clearLongPressTimer();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      clearLongPressTimer();
      
      if (!isSwipeEnabled) return;
      
      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY
      };
      
      const deltaX = touchEnd.x - touchStartRef.current.x;
      const deltaY = touchEnd.y - touchStartRef.current.y;
      
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > config.minSwipeDistance!) {
          if (handlers?.onSwipeRight) {
            handlers.onSwipeRight();
            if (config.enableHaptics) hapticPresets.swipe();
          } else if (deviceInfo.platform === 'ios') {
            navigate(-1);
          }
        } else if (deltaX < -config.minSwipeDistance!) {
          if (handlers?.onSwipeLeft) {
            handlers.onSwipeLeft();
            if (config.enableHaptics) hapticPresets.swipe();
          }
        }
      } else {
        if (deltaY > config.minSwipeDistance! && handlers?.onSwipeDown) {
          handlers.onSwipeDown();
          if (config.enableHaptics) hapticPresets.swipe();
        } else if (deltaY < -config.minSwipeDistance! && handlers?.onSwipeUp) {
          handlers.onSwipeUp();
          if (config.enableHaptics) hapticPresets.swipe();
        }
      }
    };

    if (isSwipeEnabled) {
      document.addEventListener('touchstart', handleTouchStart, { passive: true });
      document.addEventListener('touchmove', handleTouchMove, { passive: true });
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      clearLongPressTimer();
    };
  }, [isNative, isSwipeEnabled, deviceInfo, navigate, handlers, config, clearLongPressTimer]);

  return { isSwipeEnabled };
}

export function usePullToRefresh(onRefresh: () => Promise<void>) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const threshold = 80;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const delta = currentY - startY.current;
    
    if (delta > 0) {
      setPullDistance(Math.min(delta * 0.5, 120));
    }
  }, [isPulling, isRefreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      hapticPresets.refresh();
      
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
      }
    }
    
    setIsPulling(false);
    setPullDistance(0);
  }, [pullDistance, isRefreshing, onRefresh]);

  return {
    pullDistance,
    isRefreshing,
    isPulling,
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
    },
  };
}
