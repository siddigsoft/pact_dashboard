import { useState, useCallback, useEffect } from 'react';

interface DNDSchedule {
  enabled: boolean;
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
}

interface DNDState {
  manualDND: boolean;
  manualUntil: number | null;
  schedule: DNDSchedule;
}

const STORAGE_KEY = 'pact-dnd-state';

const DEFAULT_STATE: DNDState = {
  manualDND: false,
  manualUntil: null,
  schedule: {
    enabled: false,
    startHour: 22,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
  },
};

export function useDoNotDisturb() {
  const [state, setState] = useState<DNDState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return DEFAULT_STATE;
  });

  const saveState = useCallback((newState: DNDState) => {
    setState(newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch {}
  }, []);

  useEffect(() => {
    if (state.manualDND && state.manualUntil && Date.now() >= state.manualUntil) {
      saveState({ ...state, manualDND: false, manualUntil: null });
    }
    const interval = setInterval(() => {
      if (state.manualDND && state.manualUntil && Date.now() >= state.manualUntil) {
        saveState({ ...state, manualDND: false, manualUntil: null });
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [state, saveState]);

  const isInScheduledDND = useCallback((): boolean => {
    if (!state.schedule.enabled) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = state.schedule.startHour * 60 + state.schedule.startMinute;
    const endMinutes = state.schedule.endHour * 60 + state.schedule.endMinute;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }, [state.schedule]);

  const isDND = useCallback((): boolean => {
    if (state.manualDND) {
      if (!state.manualUntil || Date.now() < state.manualUntil) return true;
    }
    return isInScheduledDND();
  }, [state.manualDND, state.manualUntil, isInScheduledDND]);

  const enableDND = useCallback((durationMs?: number) => {
    saveState({
      ...state,
      manualDND: true,
      manualUntil: durationMs ? Date.now() + durationMs : null,
    });
  }, [state, saveState]);

  const disableDND = useCallback(() => {
    saveState({ ...state, manualDND: false, manualUntil: null });
  }, [state, saveState]);

  const toggleDND = useCallback(() => {
    if (isDND()) {
      disableDND();
    } else {
      enableDND();
    }
  }, [isDND, enableDND, disableDND]);

  const updateSchedule = useCallback((schedule: Partial<DNDSchedule>) => {
    saveState({ ...state, schedule: { ...state.schedule, ...schedule } });
  }, [state, saveState]);

  const DND_DURATION_OPTIONS = [
    { label: '1 hour', duration: 60 * 60 * 1000 },
    { label: '2 hours', duration: 2 * 60 * 60 * 1000 },
    { label: '4 hours', duration: 4 * 60 * 60 * 1000 },
    { label: 'Until tomorrow', duration: 24 * 60 * 60 * 1000 },
    { label: 'Indefinite', duration: undefined },
  ] as const;

  return {
    isDND: isDND(),
    enableDND,
    disableDND,
    toggleDND,
    updateSchedule,
    schedule: state.schedule,
    DND_DURATION_OPTIONS,
  };
}
