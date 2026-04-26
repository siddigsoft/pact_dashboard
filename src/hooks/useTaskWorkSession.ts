import { useCallback, useEffect, useRef, useState } from 'react';

type StoredSession = {
  startedAt: number | null;
  accumulatedSec: number;
};

const SESSION_KEY = (taskId: string, userId: string) =>
  `task-work-session::${taskId}::${userId}`;
const PROMPT_KEY = (taskId: string, userId: string) =>
  `task-open-prompt-shown::${taskId}::${userId}`;

function readStored(taskId: string, userId: string): StoredSession {
  try {
    const raw = localStorage.getItem(SESSION_KEY(taskId, userId));
    if (!raw) return { startedAt: null, accumulatedSec: 0 };
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    return {
      startedAt: typeof parsed.startedAt === 'number' ? parsed.startedAt : null,
      accumulatedSec: typeof parsed.accumulatedSec === 'number' ? parsed.accumulatedSec : 0,
    };
  } catch {
    return { startedAt: null, accumulatedSec: 0 };
  }
}

function writeStored(taskId: string, userId: string, value: StoredSession) {
  try {
    localStorage.setItem(SESSION_KEY(taskId, userId), JSON.stringify(value));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

function clearStored(taskId: string, userId: string) {
  try { localStorage.removeItem(SESSION_KEY(taskId, userId)); } catch { /* */ }
}

export function shouldShowOpenPrompt(taskId: string, userId: string): boolean {
  try {
    return sessionStorage.getItem(PROMPT_KEY(taskId, userId)) !== '1';
  } catch {
    return false;
  }
}

export function markOpenPromptShown(taskId: string, userId: string) {
  try { sessionStorage.setItem(PROMPT_KEY(taskId, userId), '1'); } catch { /* */ }
}

export type TaskWorkSession = {
  isRunning: boolean;
  elapsedSec: number;
  /** Elapsed converted to hours, rounded to 2 decimals (0.25 = 15 min). */
  elapsedHours: number;
  start: () => void;
  pause: () => void;
  reset: () => void;
};

/**
 * Live session timer for the currently-open task. Persists in localStorage
 * so a refresh / accidental close doesn't lose the session.
 *
 *  - `start()` begins counting (or resumes after a pause).
 *  - `pause()` freezes the timer at its current elapsed value.
 *  - `reset()` clears the persisted state (use after applying to actuals).
 *
 * Returns `{ isRunning: false, elapsedSec: 0 }` when `enabled` is false
 * (e.g. user is not a participant or task hasn't started).
 */
export function useTaskWorkSession(
  taskId: string | undefined,
  userId: string | undefined,
  enabled: boolean,
): TaskWorkSession {
  const tid = taskId ?? '';
  const uid = userId ?? '';
  const ready = enabled && !!tid && !!uid;

  const [stored, setStored] = useState<StoredSession>(() =>
    ready ? readStored(tid, uid) : { startedAt: null, accumulatedSec: 0 }
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const tickRef = useRef<number | null>(null);

  // Sync state when the task or user changes (navigation between tasks)
  useEffect(() => {
    if (!ready) {
      setStored({ startedAt: null, accumulatedSec: 0 });
      return;
    }
    setStored(readStored(tid, uid));
  }, [ready, tid, uid]);

  // 1-second tick while running
  useEffect(() => {
    if (!ready || stored.startedAt === null) {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    setNow(Date.now());
    tickRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [ready, stored.startedAt]);

  const elapsedSec = ready
    ? stored.accumulatedSec + (stored.startedAt !== null ? Math.max(0, Math.floor((now - stored.startedAt) / 1000)) : 0)
    : 0;

  const start = useCallback(() => {
    if (!ready) return;
    setStored(prev => {
      if (prev.startedAt !== null) return prev;
      const next: StoredSession = { startedAt: Date.now(), accumulatedSec: prev.accumulatedSec };
      writeStored(tid, uid, next);
      return next;
    });
  }, [ready, tid, uid]);

  const pause = useCallback(() => {
    if (!ready) return;
    setStored(prev => {
      if (prev.startedAt === null) return prev;
      const accumulated = prev.accumulatedSec + Math.max(0, Math.floor((Date.now() - prev.startedAt) / 1000));
      const next: StoredSession = { startedAt: null, accumulatedSec: accumulated };
      writeStored(tid, uid, next);
      return next;
    });
  }, [ready, tid, uid]);

  const reset = useCallback(() => {
    if (!ready) return;
    clearStored(tid, uid);
    setStored({ startedAt: null, accumulatedSec: 0 });
  }, [ready, tid, uid]);

  // Round elapsed to nearest 0.25h (15 min) for friendly display when applying.
  const rawHours = elapsedSec / 3600;
  const elapsedHours = Math.round(rawHours * 4) / 4;

  return {
    isRunning: ready && stored.startedAt !== null,
    elapsedSec,
    elapsedHours,
    start,
    pause,
    reset,
  };
}

/** Format seconds as `H:MM:SS` (hours can exceed 24). */
export function formatElapsed(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
