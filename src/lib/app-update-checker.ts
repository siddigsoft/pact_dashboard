import { useState, useEffect, useCallback } from 'react';

export interface AppVersion {
  version: string;
  buildNumber: number;
  releaseDate: string;
  releaseNotes?: string[];
  mandatory?: boolean;
  downloadUrl?: string;
}

export interface UpdateStatus {
  available: boolean;
  currentVersion: string;
  latestVersion: AppVersion | null;
  lastChecked: Date | null;
  isChecking: boolean;
  error: string | null;
}

const CURRENT_VERSION = '1.0.0';
const CURRENT_BUILD_NUMBER = 1;
const UPDATE_CHECK_URL = 'https://pact-dashboard-831y.vercel.app/api/app-version';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STORAGE_KEY = 'pact_app_update_check';

async function getDeviceInfo(): Promise<{ platform: string; version: string; buildNumber: number }> {
  try {
    if (typeof (window as any).Capacitor !== 'undefined') {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      return {
        platform: 'android',
        version: info.version,
        buildNumber: parseInt(info.build, 10),
      };
    }
  } catch (error) {
    console.warn('[AppUpdate] Failed to get native app info:', error);
  }

  return {
    platform: 'web',
    version: CURRENT_VERSION,
    buildNumber: CURRENT_BUILD_NUMBER,
  };
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

export async function checkForUpdate(): Promise<{
  available: boolean;
  current: string;
  latest: AppVersion | null;
  mandatory: boolean;
}> {
  try {
    const deviceInfo = await getDeviceInfo();
    
    if (deviceInfo.platform === 'web') {
      console.log('[AppUpdate] Web platform, skipping update check');
      return {
        available: false,
        current: deviceInfo.version,
        latest: null,
        mandatory: false,
      };
    }

    const response = await fetch(UPDATE_CHECK_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Version': deviceInfo.version,
        'X-App-Build': String(deviceInfo.buildNumber),
        'X-App-Platform': deviceInfo.platform,
      },
    });

    if (!response.ok) {
      console.warn('[AppUpdate] Update check failed:', response.status);
      return {
        available: false,
        current: deviceInfo.version,
        latest: null,
        mandatory: false,
      };
    }

    const latestVersion: AppVersion = await response.json();
    const updateAvailable = compareVersions(latestVersion.version, deviceInfo.version) > 0;

    if (updateAvailable) {
      console.log('[AppUpdate] Update available:', latestVersion.version);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      lastChecked: new Date().toISOString(),
      latestVersion: updateAvailable ? latestVersion : null,
    }));

    return {
      available: updateAvailable,
      current: deviceInfo.version,
      latest: updateAvailable ? latestVersion : null,
      mandatory: updateAvailable && latestVersion.mandatory === true,
    };
  } catch (error) {
    console.error('[AppUpdate] Check failed:', error);
    return {
      available: false,
      current: CURRENT_VERSION,
      latest: null,
      mandatory: false,
    };
  }
}

export async function openAppStore(): Promise<void> {
  try {
    if (typeof (window as any).Capacitor !== 'undefined') {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      
      const storeUrl = `https://play.google.com/store/apps/details?id=${info.id}`;
      window.open(storeUrl, '_system');
    }
  } catch (error) {
    console.error('[AppUpdate] Failed to open app store:', error);
  }
}

export async function openDownloadUrl(url: string): Promise<void> {
  try {
    if (typeof (window as any).Capacitor !== 'undefined') {
      window.open(url, '_system');
    } else {
      window.open(url, '_blank');
    }
  } catch (error) {
    console.error('[AppUpdate] Failed to open download URL:', error);
  }
}

export function useAppUpdate(): {
  status: UpdateStatus;
  checkNow: () => Promise<void>;
  dismissUpdate: () => void;
} {
  const [status, setStatus] = useState<UpdateStatus>({
    available: false,
    currentVersion: CURRENT_VERSION,
    latestVersion: null,
    lastChecked: null,
    isChecking: false,
    error: null,
  });

  const checkNow = useCallback(async () => {
    setStatus(prev => ({ ...prev, isChecking: true, error: null }));

    try {
      const result = await checkForUpdate();
      setStatus({
        available: result.available,
        currentVersion: result.current,
        latestVersion: result.latest,
        lastChecked: new Date(),
        isChecking: false,
        error: null,
      });
    } catch (error: any) {
      setStatus(prev => ({
        ...prev,
        isChecking: false,
        error: error.message || 'Failed to check for updates',
      }));
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setStatus(prev => ({
      ...prev,
      available: false,
      latestVersion: null,
    }));

    localStorage.setItem(`${STORAGE_KEY}_dismissed`, JSON.stringify({
      version: status.latestVersion?.version,
      dismissedAt: new Date().toISOString(),
    }));
  }, [status.latestVersion]);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const lastChecked = new Date(parsed.lastChecked);
        const timeSinceCheck = Date.now() - lastChecked.getTime();

        if (timeSinceCheck < CHECK_INTERVAL_MS && parsed.latestVersion) {
          const dismissed = localStorage.getItem(`${STORAGE_KEY}_dismissed`);
          if (dismissed) {
            const dismissedData = JSON.parse(dismissed);
            if (dismissedData.version === parsed.latestVersion.version) {
              return;
            }
          }

          setStatus(prev => ({
            ...prev,
            available: true,
            latestVersion: parsed.latestVersion,
            lastChecked,
          }));
          return;
        }
      } catch (error) {
        console.warn('[AppUpdate] Failed to parse stored update info:', error);
      }
    }

    const timeout = setTimeout(() => {
      checkNow();
    }, 5000);

    return () => clearTimeout(timeout);
  }, [checkNow]);

  return {
    status,
    checkNow,
    dismissUpdate,
  };
}

export function getStoredUpdateInfo(): {
  lastChecked: Date | null;
  pendingUpdate: AppVersion | null;
} {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return { lastChecked: null, pendingUpdate: null };
    }

    const parsed = JSON.parse(stored);
    return {
      lastChecked: parsed.lastChecked ? new Date(parsed.lastChecked) : null,
      pendingUpdate: parsed.latestVersion || null,
    };
  } catch {
    return { lastChecked: null, pendingUpdate: null };
  }
}
