/**
 * Notification Animation Hook
 * Handles slide-in/out animations for notifications
 */

import { useState, useCallback, useRef } from 'react';
import { animationClasses } from '@/theme/notifications-theme';

type AnimationDirection = 'top' | 'bottom';
type AnimationState = 'entering' | 'entered' | 'exiting' | 'exited';

interface AnimationOptions {
  direction?: AnimationDirection;
  enterDuration?: number;
  exitDuration?: number;
  autoHideDuration?: number | null;
}

interface AnimatedNotification<T> {
  id: string;
  data: T;
  state: AnimationState;
  className: string;
}

export function useNotificationAnimation<T>(options: AnimationOptions = {}) {
  const {
    direction = 'top',
    enterDuration = 300,
    exitDuration = 200,
    autoHideDuration = 5000,
  } = options;

  const [notifications, setNotifications] = useState<AnimatedNotification<T>[]>([]);
  const timeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const getEnterClass = useCallback(() => {
    return direction === 'top' 
      ? animationClasses.slideInTop 
      : animationClasses.slideInBottom;
  }, [direction]);

  const getExitClass = useCallback(() => {
    return direction === 'top'
      ? animationClasses.slideOutTop
      : animationClasses.slideOutBottom;
  }, [direction]);

  const clearTimeout = useCallback((id: string) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      globalThis.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const scheduleRemove = useCallback((id: string, delay: number) => {
    clearTimeout(id);
    const timeout = globalThis.setTimeout(() => {
      dismiss(id);
    }, delay);
    timeoutsRef.current.set(id, timeout);
  }, [clearTimeout]);

  const show = useCallback((id: string, data: T) => {
    const notification: AnimatedNotification<T> = {
      id,
      data,
      state: 'entering',
      className: getEnterClass(),
    };

    setNotifications((prev) => {
      // Remove existing notification with same ID
      const filtered = prev.filter((n) => n.id !== id);
      return [notification, ...filtered];
    });

    // Transition to entered state after animation
    globalThis.setTimeout(() => {
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, state: 'entered' as const, className: '' } : n
        )
      );
    }, enterDuration);

    // Schedule auto-hide if configured
    if (autoHideDuration && autoHideDuration > 0) {
      scheduleRemove(id, autoHideDuration);
    }
  }, [getEnterClass, enterDuration, autoHideDuration, scheduleRemove]);

  const dismiss = useCallback((id: string) => {
    clearTimeout(id);

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id
          ? { ...n, state: 'exiting' as const, className: getExitClass() }
          : n
      )
    );

    // Remove after exit animation
    globalThis.setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, exitDuration);
  }, [getExitClass, exitDuration, clearTimeout]);

  const dismissAll = useCallback(() => {
    notifications.forEach((n) => dismiss(n.id));
  }, [notifications, dismiss]);

  const pauseAutoHide = useCallback((id: string) => {
    clearTimeout(id);
  }, [clearTimeout]);

  const resumeAutoHide = useCallback((id: string) => {
    if (autoHideDuration && autoHideDuration > 0) {
      scheduleRemove(id, autoHideDuration);
    }
  }, [autoHideDuration, scheduleRemove]);

  return {
    notifications,
    show,
    dismiss,
    dismissAll,
    pauseAutoHide,
    resumeAutoHide,
    direction,
  };
}

export default useNotificationAnimation;
