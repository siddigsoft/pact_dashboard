/**
 * Notification Sound Hook
 * Handles notification sound playback with throttling
 */

import { useCallback, useRef, useEffect, useState } from 'react';

interface NotificationSoundOptions {
  soundUrl?: string;
  volume?: number;
  throttleMs?: number;
  enabled?: boolean;
}

const DEFAULT_THROTTLE_MS = 1000;

// Try multiple fallback sound sources
const SOUND_SOURCES = [
  '/sounds/notification.mp3',
  '/notification.mp3',
  'data:audio/wav;base64,UklGRl4AAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToAAAD//wIA/f8DAP7/AgD//wEA//8AAAEAAQAAAP//AQD//wEA//8BAAAA//8BAAAA//8BAAAA'
];

export function useNotificationSound(options: NotificationSoundOptions = {}) {
  const {
    soundUrl,
    volume = 0.5,
    throttleMs = DEFAULT_THROTTLE_MS,
    enabled = true,
  } = options;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastPlayedRef = useRef<number>(0);
  const playedIdsRef = useRef<Set<string>>(new Set());
  const [soundLoaded, setSoundLoaded] = useState(false);

  // Initialize audio element with fallback support
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const sources = soundUrl ? [soundUrl, ...SOUND_SOURCES] : SOUND_SOURCES;
    let currentSourceIndex = 0;

    const tryLoadSound = () => {
      if (currentSourceIndex >= sources.length) {
        console.warn('No notification sound available');
        return;
      }

      const audio = new Audio();
      audio.volume = volume;
      audio.preload = 'auto';

      audio.oncanplaythrough = () => {
        audioRef.current = audio;
        setSoundLoaded(true);
      };

      audio.onerror = () => {
        currentSourceIndex++;
        tryLoadSound();
      };

      audio.src = sources[currentSourceIndex];
    };

    tryLoadSound();

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
