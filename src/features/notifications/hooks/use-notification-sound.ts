import { useCallback, useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/features/notifications/context/NotificationContext';
import { Notification } from '@/types';

const STORAGE_KEY = 'pact-notification-sound-enabled';

export function useNotificationSound() {
  const { notifications } = useNotifications();
  const prevCountRef = useRef(notifications.length);
  const prevIdsRef = useRef<Set<string>>(new Set(notifications.map(n => n.id)));
  const audioContextRef = useRef<AudioContext | null>(null);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleSound = useCallback(() => {
    setSoundEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  const playSound = useCallback((type: 'urgent' | 'normal' = 'normal') => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === 'urgent') {
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
        oscillator.frequency.setValueAtTime(880, ctx.currentTime + 0.2);
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.4);
      } else {
        oscillator.frequency.setValueAtTime(600, ctx.currentTime);
        oscillator.frequency.setValueAtTime(800, ctx.currentTime + 0.08);
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.2);
      }
    } catch {}
  }, [soundEnabled]);

  useEffect(() => {
    const currentIds = new Set(notifications.map(n => n.id));
    const newNotifications = notifications.filter(n => !prevIdsRef.current.has(n.id));

    if (newNotifications.length > 0 && prevIdsRef.current.size > 0) {
      const hasUrgent = newNotifications.some(
        (n: Notification) => n.priority === 'urgent' || n.type === 'error'
      );
      playSound(hasUrgent ? 'urgent' : 'normal');
    }

    prevCountRef.current = notifications.length;
    prevIdsRef.current = currentIds;
  }, [notifications, playSound]);

  return {
    soundEnabled,
    toggleSound,
    playSound,
  };
}
