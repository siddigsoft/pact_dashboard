import { useState, useCallback, useEffect } from 'react';
import { useNotifications } from '@/features/notifications/context/NotificationContext';

interface SnoozedNotification {
  notificationId: string;
  snoozeUntil: number;
}

const STORAGE_KEY = 'pact-snoozed-notifications';

export function useNotificationSnooze() {
  const [snoozedIds, setSnoozedIds] = useState<Set<string>>(new Set());
  const { markNotificationAsRead } = useNotifications();

  const loadSnoozed = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const items: SnoozedNotification[] = JSON.parse(stored);
      const now = Date.now();
      const active = items.filter(s => s.snoozeUntil > now);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      setSnoozedIds(new Set(active.map(s => s.notificationId)));
    } catch {
      setSnoozedIds(new Set());
    }
  }, []);

  useEffect(() => {
    loadSnoozed();
    const interval = setInterval(loadSnoozed, 60000);
    return () => clearInterval(interval);
  }, [loadSnoozed]);

  const snoozeNotification = useCallback((notificationId: string, durationMs: number) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const items: SnoozedNotification[] = stored ? JSON.parse(stored) : [];
      const filtered = items.filter(s => s.notificationId !== notificationId);
      filtered.push({ notificationId, snoozeUntil: Date.now() + durationMs });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      setSnoozedIds(prev => new Set([...prev, notificationId]));
    } catch {}
  }, []);

  const unsnoozeNotification = useCallback((notificationId: string) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const items: SnoozedNotification[] = stored ? JSON.parse(stored) : [];
      const filtered = items.filter(s => s.notificationId !== notificationId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      setSnoozedIds(prev => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    } catch {}
  }, []);

  const isSnoozed = useCallback((notificationId: string) => {
    return snoozedIds.has(notificationId);
  }, [snoozedIds]);

  const getSnoozedCount = useCallback(() => {
    return snoozedIds.size;
  }, [snoozedIds]);

  const SNOOZE_OPTIONS = [
    { label: '1 hour', labelAr: 'ساعة واحدة', duration: 60 * 60 * 1000 },
    { label: '4 hours', labelAr: '4 ساعات', duration: 4 * 60 * 60 * 1000 },
    { label: 'Tomorrow', labelAr: 'غداً', duration: 24 * 60 * 60 * 1000 },
    { label: 'Next week', labelAr: 'الأسبوع القادم', duration: 7 * 24 * 60 * 60 * 1000 },
  ] as const;

  return {
    snoozeNotification,
    unsnoozeNotification,
    isSnoozed,
    getSnoozedCount,
    snoozedIds,
    SNOOZE_OPTIONS,
  };
}
