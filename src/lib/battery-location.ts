import { Capacitor } from '@capacitor/core';

export interface BatteryStatus {
  level: number;
  isCharging: boolean;
  chargingTime: number | null;
  dischargingTime: number | null;
}

export interface LocationConfig {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
  minInterval: number;
  minDisplacement: number;
}

export type BatteryMode = 'high_accuracy' | 'balanced' | 'power_saver' | 'ultra_saver';

interface BatteryLocationConfig {
  mode: BatteryMode;
  batteryThresholds: {
    high: number;
    medium: number;
    low: number;
    critical: number;
  };
  configs: Record<BatteryMode, LocationConfig>;
}

const DEFAULT_CONFIG: BatteryLocationConfig = {
  mode: 'balanced',
  batteryThresholds: {
    high: 80,
    medium: 50,
    low: 20,
    critical: 10,
  },
  configs: {
    high_accuracy: {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
      minInterval: 5000,
      minDisplacement: 5,
    },
    balanced: {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
      minInterval: 15000,
      minDisplacement: 10,
    },
    power_saver: {
      enableHighAccuracy: false,
      timeout: 30000,
      maximumAge: 30000,
      minInterval: 30000,
      minDisplacement: 25,
    },
    ultra_saver: {
      enableHighAccuracy: false,
      timeout: 60000,
      maximumAge: 60000,
      minInterval: 60000,
      minDisplacement: 50,
    },
  },
};

let currentBatteryStatus: BatteryStatus = {
  level: 100,
  isCharging: false,
  chargingTime: null,
  dischargingTime: null,
};

let batteryStatusListeners: Set<(status: BatteryStatus) => void> = new Set();
let configChangeListeners: Set<(config: LocationConfig, mode: BatteryMode) => void> = new Set();
let manualMode: BatteryMode | null = null;
let batteryMonitorInterval: NodeJS.Timeout | null = null;
let initError: string | null = null;
let isInitialized = false;

async function getBatteryAPI(): Promise<any | null> {
  if ('getBattery' in navigator) {
    try {
      return await (navigator as any).getBattery();
    } catch {
      return null;
    }
  }
  return null;
}

export async function initBatteryMonitor(): Promise<{ success: boolean; error?: string }> {
  if (isInitialized) {
    return { success: true };
  }

  try {
    const battery = await getBatteryAPI();

    if (battery) {
      const updateBatteryStatus = () => {
        const newStatus: BatteryStatus = {
          level: Math.round(battery.level * 100),
          isCharging: battery.charging,
          chargingTime: battery.chargingTime === Infinity ? null : battery.chargingTime,
          dischargingTime: battery.dischargingTime === Infinity ? null : battery.dischargingTime,
        };

        if (
          newStatus.level !== currentBatteryStatus.level ||
          newStatus.isCharging !== currentBatteryStatus.isCharging
        ) {
          currentBatteryStatus = newStatus;
          notifyBatteryListeners();
          updateLocationConfigBasedOnBattery();
        }
      };

      battery.addEventListener('levelchange', updateBatteryStatus);
      battery.addEventListener('chargingchange', updateBatteryStatus);
      battery.addEventListener('chargingtimechange', updateBatteryStatus);
      battery.addEventListener('dischargingtimechange', updateBatteryStatus);

      updateBatteryStatus();
      isInitialized = true;
      initError = null;
      console.log('[BatteryLocation] Battery monitor initialized via Battery API');
    } else {
      batteryMonitorInterval = setInterval(async () => {
        if (Capacitor.isNativePlatform()) {
          try {
            const { Device } = await import('@capacitor/device');
            const info = await Device.getBatteryInfo();

            const newStatus: BatteryStatus = {
              level: Math.round((info.batteryLevel || 1) * 100),
              isCharging: info.isCharging || false,
              chargingTime: null,
              dischargingTime: null,
            };

            if (
              newStatus.level !== currentBatteryStatus.level ||
              newStatus.isCharging !== currentBatteryStatus.isCharging
            ) {
              currentBatteryStatus = newStatus;
              notifyBatteryListeners();
              updateLocationConfigBasedOnBattery();
            }
          } catch (error) {
            console.warn('[BatteryLocation] Failed to get battery info:', error);
          }
        }
      }, 60000);

      isInitialized = true;
      initError = null;
      console.log('[BatteryLocation] Battery monitor initialized via polling');
    }

    return { success: true };
  } catch (error: any) {
    const errorMessage = error?.message || 'Failed to initialize battery monitor';
    initError = errorMessage;
    console.error('[BatteryLocation] Init error:', error);
    return { success: false, error: errorMessage };
  }
}

export function getInitStatus(): { isInitialized: boolean; error: string | null } {
  return { isInitialized, error: initError };
}

export function stopBatteryMonitor(): void {
  if (batteryMonitorInterval) {
    clearInterval(batteryMonitorInterval);
    batteryMonitorInterval = null;
  }
}

function notifyBatteryListeners(): void {
  batteryStatusListeners.forEach((listener) => listener(currentBatteryStatus));
}

function notifyConfigListeners(config: LocationConfig, mode: BatteryMode): void {
  configChangeListeners.forEach((listener) => listener(config, mode));
}

export function getBatteryStatus(): BatteryStatus {
  return { ...currentBatteryStatus };
}

export function onBatteryStatusChange(listener: (status: BatteryStatus) => void): () => void {
  batteryStatusListeners.add(listener);
  listener(currentBatteryStatus);
  return () => batteryStatusListeners.delete(listener);
}

export function onLocationConfigChange(
  listener: (config: LocationConfig, mode: BatteryMode) => void
): () => void {
  configChangeListeners.add(listener);
  const currentMode = getRecommendedMode();
  listener(DEFAULT_CONFIG.configs[currentMode], currentMode);
  return () => configChangeListeners.delete(listener);
}

function getRecommendedMode(): BatteryMode {
  if (manualMode) return manualMode;

  const { level, isCharging } = currentBatteryStatus;
  const { batteryThresholds } = DEFAULT_CONFIG;

  if (isCharging) {
    return 'high_accuracy';
  }

  if (level >= batteryThresholds.high) {
    return 'high_accuracy';
  } else if (level >= batteryThresholds.medium) {
    return 'balanced';
  } else if (level >= batteryThresholds.low) {
    return 'power_saver';
  } else {
    return 'ultra_saver';
  }
}

function updateLocationConfigBasedOnBattery(): void {
  const mode = getRecommendedMode();
  const config = DEFAULT_CONFIG.configs[mode];
  notifyConfigListeners(config, mode);
}

export function setManualMode(mode: BatteryMode | null): void {
  manualMode = mode;
  const currentMode = getRecommendedMode();
  const config = DEFAULT_CONFIG.configs[currentMode];
  notifyConfigListeners(config, currentMode);
}

export function getManualMode(): BatteryMode | null {
  return manualMode;
}

export function getCurrentLocationConfig(): LocationConfig {
  const mode = getRecommendedMode();
  return { ...DEFAULT_CONFIG.configs[mode] };
}

export function getCurrentMode(): BatteryMode {
  return getRecommendedMode();
}

export function getModeDescription(mode: BatteryMode): {
  name: string;
  description: string;
  batteryImpact: 'high' | 'medium' | 'low' | 'minimal';
  accuracy: 'highest' | 'high' | 'medium' | 'low';
} {
  const descriptions: Record<BatteryMode, ReturnType<typeof getModeDescription>> = {
    high_accuracy: {
      name: 'High Accuracy',
      description: 'Best GPS accuracy, updates every 5 seconds. Uses more battery.',
      batteryImpact: 'high',
      accuracy: 'highest',
    },
    balanced: {
      name: 'Balanced',
      description: 'Good accuracy with moderate battery usage. Updates every 15 seconds.',
      batteryImpact: 'medium',
      accuracy: 'high',
    },
    power_saver: {
      name: 'Power Saver',
      description: 'Reduced accuracy to save battery. Updates every 30 seconds.',
      batteryImpact: 'low',
      accuracy: 'medium',
    },
    ultra_saver: {
      name: 'Ultra Saver',
      description: 'Minimal location updates to maximize battery. Updates every 60 seconds.',
      batteryImpact: 'minimal',
      accuracy: 'low',
    },
  };

  return descriptions[mode];
}

export function getEstimatedBatteryUsage(mode: BatteryMode, durationHours: number): number {
  const usagePerHour: Record<BatteryMode, number> = {
    high_accuracy: 8,
    balanced: 4,
    power_saver: 2,
    ultra_saver: 1,
  };

  return usagePerHour[mode] * durationHours;
}

export class BatteryAwareLocationTracker {
  private watchId: number | null = null;
  private lastPosition: GeolocationPosition | null = null;
  private lastUpdateTime: number = 0;
  private configUnsubscribe: (() => void) | null = null;
  private currentConfig: LocationConfig;
  private onPositionUpdate: (position: GeolocationPosition) => void;
  private onError: (error: GeolocationPositionError) => void;

  constructor(
    onPositionUpdate: (position: GeolocationPosition) => void,
    onError: (error: GeolocationPositionError) => void
  ) {
    this.onPositionUpdate = onPositionUpdate;
    this.onError = onError;
    this.currentConfig = getCurrentLocationConfig();
  }

  start(): void {
    this.configUnsubscribe = onLocationConfigChange((config, mode) => {
      console.log(`[BatteryLocation] Mode changed to ${mode}`);
      this.currentConfig = config;
      this.restart();
    });

    this.startWatching();
  }

  private startWatching(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => this.handlePosition(position),
      (error) => this.onError(error),
      {
        enableHighAccuracy: this.currentConfig.enableHighAccuracy,
        timeout: this.currentConfig.timeout,
        maximumAge: this.currentConfig.maximumAge,
      }
    );
  }

  private handlePosition(position: GeolocationPosition): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;

    if (timeSinceLastUpdate < this.currentConfig.minInterval) {
      return;
    }

    if (this.lastPosition) {
      const distance = this.calculateDistance(
        this.lastPosition.coords.latitude,
        this.lastPosition.coords.longitude,
        position.coords.latitude,
        position.coords.longitude
      );

      if (distance < this.currentConfig.minDisplacement) {
        return;
      }
    }

    this.lastPosition = position;
    this.lastUpdateTime = now;
    this.onPositionUpdate(position);
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  private restart(): void {
    this.startWatching();
  }

  stop(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    if (this.configUnsubscribe) {
      this.configUnsubscribe();
      this.configUnsubscribe = null;
    }
  }

  getLastPosition(): GeolocationPosition | null {
    return this.lastPosition;
  }
}
