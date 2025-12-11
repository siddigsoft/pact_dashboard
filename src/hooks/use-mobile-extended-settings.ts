import { useState, useEffect, useCallback } from 'react';

export type ImageQuality = 'low' | 'medium' | 'high' | 'original';
export type FontSize = 'small' | 'medium' | 'large' | 'extra-large';
export type HapticIntensity = 'off' | 'light' | 'medium' | 'strong';

export interface DataUsageSettings {
  syncOnWifiOnly: boolean;
  imageQuality: ImageQuality;
  cacheLimitMB: number;
  autoDeleteOldData: boolean;
  autoDeleteDays: number;
}

export interface AccessibilitySettings {
  fontSize: FontSize;
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderOptimized: boolean;
}

export interface SyncHistoryEntry {
  id: string;
  timestamp: string;
  type: 'full' | 'partial' | 'manual';
  itemsSynced: number;
  success: boolean;
  error?: string;
}

export interface SyncStatus {
  lastSyncTime: string | null;
  pendingItemsCount: number;
  isSyncing: boolean;
  syncHistory: SyncHistoryEntry[];
}

export interface BatteryOptimizationSettings {
  hasSeenGuidance: boolean;
  isOptimizationDisabled: boolean;
  lastChecked: string | null;
}

export interface MobileExtendedSettings {
  dataUsage: DataUsageSettings;
  accessibility: AccessibilitySettings;
  syncStatus: SyncStatus;
  batteryOptimization: BatteryOptimizationSettings;
  hapticIntensity: HapticIntensity;
  language: 'en' | 'ar';
  isRTL: boolean;
}

const DEFAULT_SETTINGS: MobileExtendedSettings = {
  dataUsage: {
    syncOnWifiOnly: false,
    imageQuality: 'medium',
    cacheLimitMB: 500,
    autoDeleteOldData: true,
    autoDeleteDays: 30,
  },
  accessibility: {
    fontSize: 'medium',
    highContrast: false,
    reducedMotion: false,
    screenReaderOptimized: false,
  },
  syncStatus: {
    lastSyncTime: null,
    pendingItemsCount: 0,
    isSyncing: false,
    syncHistory: [],
  },
  batteryOptimization: {
    hasSeenGuidance: false,
    isOptimizationDisabled: false,
    lastChecked: null,
  },
  hapticIntensity: 'medium',
  language: 'en',
  isRTL: false,
};

const STORAGE_KEY = 'pact_mobile_extended_settings';
const SYNC_HISTORY_KEY = 'pact_sync_history';

export function useMobileExtendedSettings() {
  const [settings, setSettings] = useState<MobileExtendedSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings(prev => ({
          ...DEFAULT_SETTINGS,
          ...parsed,
          dataUsage: { ...DEFAULT_SETTINGS.dataUsage, ...parsed.dataUsage },
          accessibility: { ...DEFAULT_SETTINGS.accessibility, ...parsed.accessibility },
          syncStatus: { ...DEFAULT_SETTINGS.syncStatus, ...parsed.syncStatus },
          batteryOptimization: { ...DEFAULT_SETTINGS.batteryOptimization, ...parsed.batteryOptimization },
        }));
      }

      const syncHistory = localStorage.getItem(SYNC_HISTORY_KEY);
      if (syncHistory) {
        const history = JSON.parse(syncHistory);
        setSettings(prev => ({
          ...prev,
          syncStatus: { ...prev.syncStatus, syncHistory: history },
        }));
      }
    } catch (error) {
      console.error('Failed to load extended settings:', error);
    }
    setIsLoaded(true);
  }, []);

  const saveSettings = useCallback((newSettings: MobileExtendedSettings) => {
    try {
      const { syncStatus, ...settingsToStore } = newSettings;
      const { syncHistory, ...statusToStore } = syncStatus;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...settingsToStore, syncStatus: statusToStore }));
      localStorage.setItem(SYNC_HISTORY_KEY, JSON.stringify(syncHistory.slice(0, 50)));
    } catch (error) {
      console.error('Failed to save extended settings:', error);
    }
  }, []);

  const updateDataUsage = useCallback((updates: Partial<DataUsageSettings>) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        dataUsage: { ...prev.dataUsage, ...updates },
      };
      saveSettings(newSettings);
      return newSettings;
    });
  }, [saveSettings]);

  const updateAccessibility = useCallback((updates: Partial<AccessibilitySettings>) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        accessibility: { ...prev.accessibility, ...updates },
      };
      saveSettings(newSettings);
      
      if (updates.fontSize) {
        applyFontSize(updates.fontSize);
      }
      if (updates.highContrast !== undefined) {
        applyHighContrast(updates.highContrast);
      }
      if (updates.reducedMotion !== undefined) {
        applyReducedMotion(updates.reducedMotion);
      }
      
      return newSettings;
    });
  }, [saveSettings]);

  const updateBatteryOptimization = useCallback((updates: Partial<BatteryOptimizationSettings>) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        batteryOptimization: { ...prev.batteryOptimization, ...updates },
      };
      saveSettings(newSettings);
      return newSettings;
    });
  }, [saveSettings]);

  const updateHapticIntensity = useCallback((intensity: HapticIntensity) => {
    setSettings(prev => {
      const newSettings = { ...prev, hapticIntensity: intensity };
      saveSettings(newSettings);
      return newSettings;
    });
  }, [saveSettings]);

  const updateLanguage = useCallback((language: 'en' | 'ar') => {
    const isRTL = language === 'ar';
    setSettings(prev => {
      const newSettings = { ...prev, language, isRTL };
      saveSettings(newSettings);
      
      document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
      document.documentElement.lang = language;
      
      return newSettings;
    });
  }, [saveSettings]);

  const addSyncHistoryEntry = useCallback((entry: Omit<SyncHistoryEntry, 'id'>) => {
    setSettings(prev => {
      const newEntry: SyncHistoryEntry = {
        ...entry,
        id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
      const newHistory = [newEntry, ...prev.syncStatus.syncHistory].slice(0, 50);
      const newSettings = {
        ...prev,
        syncStatus: {
          ...prev.syncStatus,
          syncHistory: newHistory,
          lastSyncTime: entry.success ? entry.timestamp : prev.syncStatus.lastSyncTime,
        },
      };
      saveSettings(newSettings);
      return newSettings;
    });
  }, [saveSettings]);

  const updateSyncStatus = useCallback((updates: Partial<Omit<SyncStatus, 'syncHistory'>>) => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        syncStatus: { ...prev.syncStatus, ...updates },
      };
      saveSettings(newSettings);
      return newSettings;
    });
  }, [saveSettings]);

  const clearSyncHistory = useCallback(() => {
    setSettings(prev => {
      const newSettings = {
        ...prev,
        syncStatus: { ...prev.syncStatus, syncHistory: [] },
      };
      localStorage.removeItem(SYNC_HISTORY_KEY);
      saveSettings(newSettings);
      return newSettings;
    });
  }, [saveSettings]);

  const clearCache = useCallback(async () => {
    try {
      if ('caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      }
      
      const dbNames = ['pact-offline-db', 'pact-cache'];
      for (const dbName of dbNames) {
        try {
          const deleteReq = indexedDB.deleteDatabase(dbName);
          await new Promise((resolve, reject) => {
            deleteReq.onsuccess = resolve;
            deleteReq.onerror = reject;
          });
        } catch (e) {
          console.warn(`Failed to delete ${dbName}:`, e);
        }
      }
      
      return { success: true };
    } catch (error) {
      console.error('Failed to clear cache:', error);
      return { success: false, error };
    }
  }, []);

  return {
    settings,
    isLoaded,
    updateDataUsage,
    updateAccessibility,
    updateBatteryOptimization,
    updateHapticIntensity,
    updateLanguage,
    addSyncHistoryEntry,
    updateSyncStatus,
    clearSyncHistory,
    clearCache,
  };
}

function applyFontSize(size: FontSize) {
  const sizes: Record<FontSize, string> = {
    'small': '14px',
    'medium': '16px',
    'large': '18px',
    'extra-large': '20px',
  };
  document.documentElement.style.setProperty('--base-font-size', sizes[size]);
  document.documentElement.style.fontSize = sizes[size];
}

function applyHighContrast(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add('high-contrast');
  } else {
    document.documentElement.classList.remove('high-contrast');
  }
}

function applyReducedMotion(enabled: boolean) {
  if (enabled) {
    document.documentElement.classList.add('reduce-motion');
  } else {
    document.documentElement.classList.remove('reduce-motion');
  }
}

export function getHapticMultiplier(intensity: HapticIntensity): number {
  const multipliers: Record<HapticIntensity, number> = {
    'off': 0,
    'light': 0.5,
    'medium': 1,
    'strong': 1.5,
  };
  return multipliers[intensity];
}
