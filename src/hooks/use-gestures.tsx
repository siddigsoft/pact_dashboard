
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDevice } from './use-device';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

export function useGestures(handlers?: SwipeHandlers) {
  const { isNative, deviceInfo } = useDevice();
  const navigate = useNavigate();
  const touchStartRef = useRef<{x: number; y: number}>({ x: 0, y: 0 });
  const [isSwipeEnabled, setIsSwipeEnabled] = useState(false);

  useEffect(() => {
    // Only enable swipe gestures in native mobile apps
    if (isNative || window.innerWidth < 768) {
      setIsSwipeEnabled(true);
    }

    const handleTouchStart = (e: TouchEvent) => {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!isSwipeEnabled) return;
      
      const touchEnd = {
        x: e.changedTouches[0].clientX,
        y: e.changedTouches[0].clientY
      };
      
      const deltaX = touchEnd.x - touchStartRef.current.x;
      const deltaY = touchEnd.y - touchStartRef.current.y;
      
      // Minimum distance for a swipe
      const minDistance = 50;
      
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (deltaX > minDistance) {
          // Swipe right
          if (handlers?.onSwipeRight) {
            handlers.onSwipeRight();
          } else if (deviceInfo.platform === 'ios') {
            // Default iOS behavior: swipe right to go back
            navigate(-1);
          }
        } else if (deltaX < -minDistance) {
          // Swipe left
          if (handlers?.onSwipeLeft) {
            handlers.onSwipeLeft();
          }
        }
      } else {
        // Vertical swipe
        if (deltaY > minDistance && handlers?.onSwipeDown) {
          handlers.onSwipeDown();
        } else if (deltaY < -minDistance && handlers?.onSwipeUp) {
          handlers.onSwipeUp();
        }
      }
    };

    if (isSwipeEnabled) {
      document.addEventListener('touchstart', handleTouchStart);
      document.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isNative, isSwipeEnabled, deviceInfo, navigate, handlers]);

  return { isSwipeEnabled };
}
