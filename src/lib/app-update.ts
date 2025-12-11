import { Capacitor } from '@capacitor/core';

export interface AppVersion {
  version: string;
  build: number;
  minSupportedVersion: string;
  releaseDate: string;
  releaseNotes: string[];
  isCritical: boolean;
  downloadUrl?: string;
}

export interface UpdateCheckResult {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: AppVersion;
  isForceUpdate: boolean;
  canSkip: boolean;
}

const LAST_CHECK_KEY = 'pact_last_update_check';
const SKIPPED_VERSION_KEY = 'pact_skipped_version';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

let currentAppVersion: string = '1.0.0';
let currentBuildNumber: number = 1;

export async function initAppVersion(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      currentAppVersion = info.version;
      currentBuildNumber = parseInt(info.build, 10) || 1;
    } catch (error) {
      console.warn('[AppUpdate] Failed to get app info:', error);
    }
  } else {
    currentAppVersion = import.meta.env.VITE_APP_VERSION || '1.0.0';
    currentBuildNumber = parseInt(import.meta.env.VITE_BUILD_NUMBER || '1', 10);
  }

  console.log(`[AppUpdate] Current version: ${currentAppVersion} (${currentBuildNumber})`);
}

export function getCurrentVersion(): { version: string; build: number } {
  return {
    version: currentAppVersion,
    build: currentBuildNumber,
  };
}

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map((p) => parseInt(p, 10) || 0);
  const parts2 = v2.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

function isVersionSupported(currentVer: string, minSupportedVer: string): boolean {
  return compareVersions(currentVer, minSupportedVer) >= 0;
}

async function fetchLatestVersion(): Promise<AppVersion | null> {
  try {
    const platform = Capacitor.getPlatform();
    const versionEndpoint = import.meta.env.VITE_VERSION_CHECK_URL || '/api/version';

    const response = await fetch(`${versionEndpoint}?platform=${platform}`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch version: ${response.status}`);
    }

    const data = await response.json();
    return data as AppVersion;
  } catch (error) {
    console.warn('[AppUpdate] Failed to check for updates:', error);

    return {
      version: currentAppVersion,
      build: currentBuildNumber,
      minSupportedVersion: '1.0.0',
      releaseDate: new Date().toISOString(),
      releaseNotes: [],
      isCritical: false,
    };
  }
}

export async function checkForUpdate(force: boolean = false): Promise<UpdateCheckResult> {
  const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
  const now = Date.now();

  if (!force && lastCheck) {
    const lastCheckTime = parseInt(lastCheck, 10);
    if (now - lastCheckTime < CHECK_INTERVAL_MS) {
      return {
        updateAvailable: false,
        currentVersion: currentAppVersion,
        isForceUpdate: false,
        canSkip: true,
      };
    }
  }

  const latestVersion = await fetchLatestVersion();

  if (!latestVersion) {
    return {
      updateAvailable: false,
      currentVersion: currentAppVersion,
      isForceUpdate: false,
      canSkip: true,
    };
  }

  localStorage.setItem(LAST_CHECK_KEY, now.toString());

  const updateAvailable = compareVersions(latestVersion.version, currentAppVersion) > 0;
  const isForceUpdate =
    latestVersion.isCritical || !isVersionSupported(currentAppVersion, latestVersion.minSupportedVersion);

  const skippedVersion = localStorage.getItem(SKIPPED_VERSION_KEY);
  const canSkip = !isForceUpdate && skippedVersion !== latestVersion.version;

  return {
    updateAvailable,
    currentVersion: currentAppVersion,
    latestVersion: updateAvailable ? latestVersion : undefined,
    isForceUpdate,
    canSkip,
  };
}

export function skipVersion(version: string): void {
  localStorage.setItem(SKIPPED_VERSION_KEY, version);
}

export function clearSkippedVersion(): void {
  localStorage.removeItem(SKIPPED_VERSION_KEY);
}

export async function openAppStore(): Promise<{ success: boolean; error?: string }> {
  const platform = Capacitor.getPlatform();
  let storeUrl = '';

  if (platform === 'ios') {
    const appId = import.meta.env.VITE_IOS_APP_ID || '';
    storeUrl = `https://apps.apple.com/app/id${appId}`;
  } else if (platform === 'android') {
    const packageName = import.meta.env.VITE_ANDROID_PACKAGE || 'com.pact.workflow';
    storeUrl = `https://play.google.com/store/apps/details?id=${packageName}`;
  }

  if (!storeUrl) {
    console.warn('[AppUpdate] No store URL configured for platform:', platform);
    return { success: false, error: 'App store URL not configured' };
  }

  try {
    if (Capacitor.isNativePlatform()) {
      window.open(storeUrl, '_system');
    } else {
      const newWindow = window.open(storeUrl, '_blank');
      if (!newWindow) {
        console.warn('[AppUpdate] Pop-up blocked, providing link');
        return { success: false, error: 'Pop-up blocked. Please allow pop-ups to update.' };
      }
    }
    return { success: true };
  } catch (error: any) {
    console.error('[AppUpdate] Failed to open app store:', error);
    return { success: false, error: error?.message || 'Failed to open app store' };
  }
}

export function formatReleaseNotes(notes: string[]): string {
  return notes.map((note) => `• ${note}`).join('\n');
}

export function getUpdatePriority(result: UpdateCheckResult): 'critical' | 'recommended' | 'optional' | 'none' {
  if (!result.updateAvailable) return 'none';
  if (result.isForceUpdate) return 'critical';
  if (result.latestVersion?.isCritical) return 'critical';

  const versionDiff = compareVersions(result.latestVersion?.version || '', result.currentVersion);

  const latestParts = (result.latestVersion?.version || '').split('.');
  const currentParts = result.currentVersion.split('.');

  if (latestParts[0] !== currentParts[0]) {
    return 'recommended';
  }

  if (latestParts[1] !== currentParts[1]) {
    return 'recommended';
  }

  return 'optional';
}

export async function registerForAutoUpdateCheck(
  onUpdateAvailable: (result: UpdateCheckResult) => void,
  intervalMs: number = CHECK_INTERVAL_MS
): Promise<() => void> {
  const check = async () => {
    const result = await checkForUpdate();
    if (result.updateAvailable) {
      onUpdateAvailable(result);
    }
  };

  await check();

  const interval = setInterval(check, intervalMs);

  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await import('@capacitor/app');
      App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          await check();
        }
      });
    } catch (error) {
      console.warn('[AppUpdate] Failed to add app state listener:', error);
    }
  }

  return () => clearInterval(interval);
}
