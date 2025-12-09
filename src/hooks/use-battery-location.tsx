import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BatteryStatus,
  BatteryMode,
  LocationConfig,
  getBatteryStatus,
  onBatteryStatusChange,
  onLocationConfigChange,
  getCurrentMode,
  setManualMode,
  getManualMode,
  getModeDescription,
  getCurrentLocationConfig,
  initBatteryMonitor,
  BatteryAwareLocationTracker,
} from '@/lib/battery-location';

interface UseBatteryStatusReturn {
  batteryStatus: BatteryStatus;
  isCharging: boolean;
  level: number;
  isLow: boolean;
  isCritical: boolean;
  isInitialized: boolean;
  initError: string | null;
}

export function useBatteryStatus(): UseBatteryStatusReturn {
  const [batteryStatus, setBatteryStatus] = useState<BatteryStatus>(getBatteryStatus());
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    initBatteryMonitor().then((result) => {
      setIsInitialized(result.success);
      if (!result.success) {
        setInitError(result.error || 'Failed to initialize');
      }
    });
    const unsubscribe = onBatteryStatusChange(setBatteryStatus);
    return unsubscribe;
  }, []);

  return {
    batteryStatus,
    isCharging: batteryStatus.isCharging,
    level: batteryStatus.level,
    isLow: batteryStatus.level < 20,
    isCritical: batteryStatus.level < 10,
    isInitialized,
    initError,
  };
}

interface UseBatteryAwareModeReturn {
  currentMode: BatteryMode;
  manualMode: BatteryMode | null;
  config: LocationConfig;
  modeDescription: ReturnType<typeof getModeDescription>;
  setMode: (mode: BatteryMode | null) => void;
  isAutoMode: boolean;
}

export function useBatteryAwareMode(): UseBatteryAwareModeReturn {
  const [currentMode, setCurrentMode] = useState<BatteryMode>(getCurrentMode());
  const [manualMode, setManualModeState] = useState<BatteryMode | null>(getManualMode());
  const [config, setConfig] = useState<LocationConfig>(getCurrentLocationConfig());

  useEffect(() => {
    initBatteryMonitor();

    const unsubscribeBattery = onBatteryStatusChange(() => {
      setCurrentMode(getCurrentMode());
      setConfig(getCurrentLocationConfig());
    });

    const unsubscribeConfig = onLocationConfigChange((newConfig, mode) => {
      setConfig(newConfig);
      setCurrentMode(mode);
    });

    return () => {
      unsubscribeBattery();
      unsubscribeConfig();
    };
  }, []);

  const setMode = useCallback((mode: BatteryMode | null) => {
    setManualMode(mode);
    setManualModeState(mode);
    setCurrentMode(mode || getCurrentMode());
    setConfig(getCurrentLocationConfig());
  }, []);

  return {
    currentMode,
    manualMode,
    config,
    modeDescription: getModeDescription(currentMode),
    setMode,
    isAutoMode: manualMode === null,
  };
}

interface UseBatteryAwareLocationOptions {
  enabled?: boolean;
  onPosition?: (position: GeolocationPosition) => void;
  onError?: (error: GeolocationPositionError) => void;
}

interface UseBatteryAwareLocationReturn {
  position: GeolocationPosition | null;
  error: GeolocationPositionError | null;
  isTracking: boolean;
  currentMode: BatteryMode;
  start: () => void;
  stop: () => void;
}

export function useBatteryAwareLocation(
  options: UseBatteryAwareLocationOptions = {}
): UseBatteryAwareLocationReturn {
  const { enabled = true, onPosition, onError } = options;

  const [position, setPosition] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [currentMode, setCurrentMode] = useState<BatteryMode>(getCurrentMode());

  const trackerRef = useRef<BatteryAwareLocationTracker | null>(null);

  const handlePosition = useCallback(
    (pos: GeolocationPosition) => {
      setPosition(pos);
      setError(null);
      onPosition?.(pos);
    },
    [onPosition]
  );

  const handleError = useCallback(
    (err: GeolocationPositionError) => {
      setError(err);
      onError?.(err);
    },
    [onError]
  );

  const start = useCallback(() => {
    if (trackerRef.current || !enabled) return;

    initBatteryMonitor();

    trackerRef.current = new BatteryAwareLocationTracker(handlePosition, handleError);
    trackerRef.current.start();
    setIsTracking(true);

    const unsubscribe = onLocationConfigChange((_, mode) => {
      setCurrentMode(mode);
    });

    return unsubscribe;
  }, [enabled, handlePosition, handleError]);

  const stop = useCallback(() => {
    if (!trackerRef.current) return;

    trackerRef.current.stop();
    trackerRef.current = null;
    setIsTracking(false);
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    }

    return () => {
      stop();
    };
  }, [enabled, start, stop]);

  return {
    position,
    error,
    isTracking,
    currentMode,
    start,
    stop,
  };
}

export function useLocationModeSelector(): {
  modes: Array<{
    mode: BatteryMode;
    name: string;
    description: string;
    batteryImpact: string;
    accuracy: string;
  }>;
  currentMode: BatteryMode;
  selectMode: (mode: BatteryMode | null) => void;
  isAutoMode: boolean;
} {
  const { currentMode, setMode, isAutoMode } = useBatteryAwareMode();

  const modes: BatteryMode[] = ['high_accuracy', 'balanced', 'power_saver', 'ultra_saver'];

  const modeOptions = modes.map((mode) => ({
    mode,
    ...getModeDescription(mode),
  }));

  return {
    modes: modeOptions,
    currentMode,
    selectMode: setMode,
    isAutoMode,
  };
}
