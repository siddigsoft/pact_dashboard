type BatteryMode = 'normal' | 'low_power' | 'critical' | 'charging';

interface BatteryStatus {
  level: number;
  charging: boolean;
  chargingTime: number | null;
  dischargingTime: number | null;
  mode: BatteryMode;
}

interface BatteryOptimizations {
  reducedAnimations: boolean;
  reducedPolling: boolean;
  disableBackgroundSync: boolean;
  reduceGpsAccuracy: boolean;
  disableAutoRefresh: boolean;
  pollingIntervalMultiplier: number;
  gpsUpdateInterval: number;
}

const LOW_BATTERY_THRESHOLD = 20;
const CRITICAL_BATTERY_THRESHOLD = 10;

const DEFAULT_OPTIMIZATIONS: Record<BatteryMode, BatteryOptimizations> = {
  normal: {
    reducedAnimations: false,
    reducedPolling: false,
    disableBackgroundSync: false,
    reduceGpsAccuracy: false,
    disableAutoRefresh: false,
    pollingIntervalMultiplier: 1,
    gpsUpdateInterval: 15000,
  },
  low_power: {
    reducedAnimations: true,
    reducedPolling: true,
    disableBackgroundSync: false,
    reduceGpsAccuracy: true,
    disableAutoRefresh: false,
    pollingIntervalMultiplier: 2,
    gpsUpdateInterval: 30000,
  },
  critical: {
    reducedAnimations: true,
    reducedPolling: true,
    disableBackgroundSync: true,
    reduceGpsAccuracy: true,
    disableAutoRefresh: true,
    pollingIntervalMultiplier: 4,
    gpsUpdateInterval: 60000,
  },
  charging: {
    reducedAnimations: false,
    reducedPolling: false,
    disableBackgroundSync: false,
    reduceGpsAccuracy: false,
    disableAutoRefresh: false,
    pollingIntervalMultiplier: 0.5,
    gpsUpdateInterval: 10000,
  },
};

type BatteryStatusCallback = (status: BatteryStatus) => void;
type OptimizationsCallback = (optimizations: BatteryOptimizations) => void;

class BatteryOptimizer {
  private battery: any | null = null;
  private currentStatus: BatteryStatus | null = null;
  private statusListeners: Set<BatteryStatusCallback> = new Set();
  private optimizationListeners: Set<OptimizationsCallback> = new Set();
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    if ('getBattery' in navigator) {
      try {
        this.battery = await (navigator as any).getBattery();
        this.setupBatteryListeners();
        this.updateStatus();
        this.initialized = true;
      } catch (error) {
        console.warn('Battery API not available:', error);
        this.setFallbackStatus();
      }
    } else {
      console.warn('Battery API not supported');
      this.setFallbackStatus();
    }
  }

  private setFallbackStatus(): void {
    this.currentStatus = {
      level: 100,
      charging: true,
      chargingTime: null,
      dischargingTime: null,
      mode: 'charging',
    };
    this.initialized = true;
  }

  private setupBatteryListeners(): void {
    if (!this.battery) return;

    this.battery.addEventListener('levelchange', () => this.updateStatus());
    this.battery.addEventListener('chargingchange', () => this.updateStatus());
    this.battery.addEventListener('chargingtimechange', () => this.updateStatus());
    this.battery.addEventListener('dischargingtimechange', () => this.updateStatus());
  }

  private updateStatus(): void {
    if (!this.battery) return;

    const level = Math.round(this.battery.level * 100);
    const charging = this.battery.charging;

    let mode: BatteryMode;
    if (charging) {
      mode = 'charging';
    } else if (level <= CRITICAL_BATTERY_THRESHOLD) {
      mode = 'critical';
    } else if (level <= LOW_BATTERY_THRESHOLD) {
      mode = 'low_power';
    } else {
      mode = 'normal';
    }

    const previousMode = this.currentStatus?.mode;

    this.currentStatus = {
      level,
      charging,
      chargingTime: this.battery.chargingTime === Infinity ? null : this.battery.chargingTime,
      dischargingTime: this.battery.dischargingTime === Infinity ? null : this.battery.dischargingTime,
      mode,
    };

    this.notifyStatusListeners();

    if (previousMode !== mode) {
      this.notifyOptimizationListeners();
    }
  }

  private notifyStatusListeners(): void {
    if (!this.currentStatus) return;
    this.statusListeners.forEach(callback => callback(this.currentStatus!));
  }

  private notifyOptimizationListeners(): void {
    const optimizations = this.getCurrentOptimizations();
    this.optimizationListeners.forEach(callback => callback(optimizations));
  }

  getStatus(): BatteryStatus | null {
    return this.currentStatus;
  }

  getCurrentOptimizations(): BatteryOptimizations {
    const mode = this.currentStatus?.mode || 'normal';
    return { ...DEFAULT_OPTIMIZATIONS[mode] };
  }

  onStatusChange(callback: BatteryStatusCallback): () => void {
    this.statusListeners.add(callback);
    if (this.currentStatus) {
      callback(this.currentStatus);
    }
    return () => this.statusListeners.delete(callback);
  }

  onOptimizationsChange(callback: OptimizationsCallback): () => void {
    this.optimizationListeners.add(callback);
    callback(this.getCurrentOptimizations());
    return () => this.optimizationListeners.delete(callback);
  }

  shouldReduceAnimations(): boolean {
    return this.getCurrentOptimizations().reducedAnimations;
  }

  shouldReducePolling(): boolean {
    return this.getCurrentOptimizations().reducedPolling;
  }

  getPollingInterval(baseInterval: number): number {
    const multiplier = this.getCurrentOptimizations().pollingIntervalMultiplier;
    return Math.round(baseInterval * multiplier);
  }

  getGpsUpdateInterval(): number {
    return this.getCurrentOptimizations().gpsUpdateInterval;
  }

  shouldDisableBackgroundSync(): boolean {
    return this.getCurrentOptimizations().disableBackgroundSync;
  }

  formatTimeRemaining(seconds: number | null): string {
    if (seconds === null || seconds === Infinity) {
      return 'Calculating...';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  getModeDescription(mode: BatteryMode): string {
    switch (mode) {
      case 'charging':
        return 'Charging - Full performance enabled';
      case 'normal':
        return 'Normal - All features enabled';
      case 'low_power':
        return 'Low Power - Reduced background activity';
      case 'critical':
        return 'Critical - Battery saver active';
    }
  }

  getBatteryIcon(status: BatteryStatus): string {
    if (status.charging) return 'battery-charging';
    if (status.level > 80) return 'battery-full';
    if (status.level > 50) return 'battery-medium';
    if (status.level > 20) return 'battery-low';
    return 'battery-warning';
  }
}

export const batteryOptimizer = new BatteryOptimizer();

export function useBatteryStatus(): BatteryStatus | null {
  const React = require('react');
  const [status, setStatus] = React.useState(null as BatteryStatus | null);

  React.useEffect(() => {
    batteryOptimizer.initialize().then(() => {
      setStatus(batteryOptimizer.getStatus());
    });

    return batteryOptimizer.onStatusChange(setStatus);
  }, []);

  return status;
}

export function useBatteryOptimizations(): BatteryOptimizations {
  const React = require('react');
  const [optimizations, setOptimizations] = React.useState(DEFAULT_OPTIMIZATIONS.normal as BatteryOptimizations);

  React.useEffect(() => {
    batteryOptimizer.initialize();
    return batteryOptimizer.onOptimizationsChange(setOptimizations);
  }, []);

  return optimizations;
}

export type { BatteryMode, BatteryStatus, BatteryOptimizations };
