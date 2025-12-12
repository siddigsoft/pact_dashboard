/**
 * Notification Sound Hook
 * Handles notification sound playback with throttling
 */

import { useCallback, useRef, useEffect } from 'react';

interface NotificationSoundOptions {
  soundUrl?: string;
  volume?: number;
  throttleMs?: number;
  enabled?: boolean;
}

const DEFAULT_SOUND_URL = '/sounds/notification.mp3';
const DEFAULT_THROTTLE_MS = 1000;

export function useNotificationSound(options: NotificationSoundOptions = {}) {
  const {
    soundUrl = DEFAULT_SOUND_URL,
    volume = 0.5,
    throttleMs = DEFAULT_THROTTLE_MS,
    enabled = true,
  } = options;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedRef = useRef<number>(0);
  const playedIdsRef = useRef<Set<string>>(new Set());

  // Initialize audio element
  useEffect(() => {
    if (typeof window !== 'undefined') {
      audioRef.current = new Audio(soundUrl);
      audioRef.current.volume = volume;
      audioRef.current.preload = 'auto';
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, [soundUrl, volume]);

  // Update volume when it changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }
  }, [volume]);

  const playSound = useCallback(() => {
    if (!enabled || !audioRef.current) return;

    const now = Date.now();
    if (now - lastPlayedRef.current < throttleMs) {
      return; // Throttled
    }

    lastPlayedRef.current = now;
    
    // Reset and play
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch((error) => {
      // Ignore autoplay errors (user hasn't interacted yet)
      if (error.name !== 'NotAllowedError') {
        console.warn('Failed to play notification sound:', error);
      }
    });
  }, [enabled, throttleMs]);

  const playSoundForId = useCallback((notificationId: string) => {
    if (playedIdsRef.current.has(notificationId)) {
      return; // Already played for this notification
    }
    
    playedIdsRef.current.add(notificationId);
    playSound();
    
    // Clean up old IDs after 1 minute to prevent memory leak
    setTimeout(() => {
      playedIdsRef.current.delete(notificationId);
    }, 60000);
  }, [playSound]);

  const stopSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  return {
    playSound,
    playSoundForId,
    stopSound,
    isEnabled: enabled,
  };
}

export default useNotificationSound;
