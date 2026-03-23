
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

  // Keep latest handlers/config in refs so the effect never needs to re-run
  // just because the caller passed a new object literal on each render.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const optionsRef = useRef(options);
  optionsRef.current = options;

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
      const h = handlersRef.current;
      const cfg = { ...defaultOptions, ...optionsRef.current };
      const now = Date.now();
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: now
      };

      if (h?.onDoubleTap) {
        if (now - lastTapRef.current < cfg.doubleTapDelay!) {
          h.onDoubleTap();
          if (cfg.enableHaptics) hapticPresets.toggle();
          lastTapRef.current = 0;
        } else {
          lastTapRef.current = now;
        }
      }

      if (h?.onLongPress) {
        longPressTimerRef.current = setTimeout(() => {
          handlersRef.current?.onLongPress!();
          if (cfg.enableHaptics) hapticPresets.longPress();
        }, cfg.longPressDelay!);
      }
    };

    const handleTouchMove = () => {
      clearLongPressTimer();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      clearLongPressTimer();

      if (!isSwipeEnabled) return;

      const h = handlersRef.current;
      const cfg = { ...defaultOptions, ...optionsRef.current };
      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY
      };

      const deltaX = touchEnd.x - touchStartRef.current.x;
      const deltaY = touchEnd.y - touchStartRef.current.y;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (deltaX > cfg.minSwipeDistance!) {
          if (h?.onSwipeRight) {
            h.onSwipeRight();
            if (cfg.enableHaptics) hapticPresets.swipe();
          } else if (deviceInfo.platform === 'ios') {
            navigate(-1);
          }
        } else if (deltaX < -cfg.minSwipeDistance!) {
          if (h?.onSwipeLeft) {
            h.onSwipeLeft();
            if (cfg.enableHaptics) hapticPresets.swipe();
          }
        }
      } else {
        if (deltaY > cfg.minSwipeDistance! && h?.onSwipeDown) {
          h.onSwipeDown();
          if (cfg.enableHaptics) hapticPresets.swipe();
        } else if (deltaY < -cfg.minSwipeDistance! && h?.onSwipeUp) {
          h.onSwipeUp();
          if (cfg.enableHaptics) hapticPresets.swipe();
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
  // handlers/options are intentionally excluded — read via refs inside the callbacks
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative, isSwipeEnabled, deviceInfo, navigate, clearLongPressTimer]);

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
