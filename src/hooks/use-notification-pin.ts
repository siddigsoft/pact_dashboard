import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'pact-pinned-notifications';

export function useNotificationPin() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const ids: string[] = JSON.parse(stored);
        setPinnedIds(new Set(ids));
      }
    } catch {}
  }, []);

  const savePinned = useCallback((ids: Set<string>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {}
  }, []);

  const pinNotification = useCallback((notificationId: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      next.add(notificationId);
      savePinned(next);
      return next;
    });
  }, [savePinned]);

  const unpinNotification = useCallback((notificationId: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      next.delete(notificationId);
      savePinned(next);
      return next;
    });
  }, [savePinned]);

  const togglePin = useCallback((notificationId: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(notificationId)) {
        next.delete(notificationId);
      } else {
        next.add(notificationId);
      }
      savePinned(next);
      return next;
    });
  }, [savePinned]);

  const isPinned = useCallback((notificationId: string) => {
    return pinnedIds.has(notificationId);
  }, [pinnedIds]);

  return {
    pinNotification,
    unpinNotification,
    togglePin,
    isPinned,
    pinnedIds,
  };
}
