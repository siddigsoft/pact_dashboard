import { Device } from '@capacitor/device';
import { Network } from '@capacitor/network';

interface DeviceFingerprint {
  deviceId: string;
  platform: string;
  osVersion: string;
  model: string;
  manufacturer: string;
  isVirtual: boolean;
  memoryUsed?: number;
  batteryLevel?: number;
  isCharging?: boolean;
  networkType: string;
  screenWidth: number;
  screenHeight: number;
  pixelRatio: number;
  language: string;
  timezone: string;
  timestamp: number;
}

interface LoginAnalytics {
  fingerprintId: string;
  userId: string;
  loginTime: Date;
  ipAddress?: string;
  location?: { latitude: number; longitude: number };
  deviceInfo: DeviceFingerprint;
  sessionDuration?: number;
  isNewDevice: boolean;
  trustScore: number;
}

const KNOWN_DEVICES_KEY = 'pact_known_devices';
const MAX_STORED_DEVICES = 10;

async function generateDeviceId(): Promise<string> {
  const info = await Device.getInfo();
  const components = [
    info.platform,
    info.model,
    info.manufacturer,
    info.osVersion,
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen.width,
    screen.height,
    window.devicePixelRatio,
  ].join('|');

  const encoder = new TextEncoder();
  const data = encoder.encode(components);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

export async function getDeviceFingerprint(): Promise<DeviceFingerprint> {
  try {
    const [deviceInfo, networkStatus] = await Promise.all([
      Device.getInfo(),
      Network.getStatus(),
    ]);

    let batteryLevel: number | undefined;
    let isCharging: boolean | undefined;

    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        batteryLevel = Math.round(battery.level * 100);
        isCharging = battery.charging;
      } catch {
      }
    }

    const deviceId = await generateDeviceId();

    return {
      deviceId,
      platform: deviceInfo.platform,
      osVersion: deviceInfo.osVersion,
      model: deviceInfo.model,
      manufacturer: deviceInfo.manufacturer,
      isVirtual: deviceInfo.isVirtual,
      memoryUsed: (performance as any).memory?.usedJSHeapSize,
      batteryLevel,
      isCharging,
      networkType: networkStatus.connectionType,
      screenWidth: screen.width,
      screenHeight: screen.height,
      pixelRatio: window.devicePixelRatio,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: Date.now(),
    };
  } catch (error) {
    console.warn('Could not get full device fingerprint:', error);
    return {
      deviceId: await generateDeviceId(),
      platform: 'web',
      osVersion: navigator.userAgent,
      model: 'unknown',
      manufacturer: 'unknown',
      isVirtual: false,
      networkType: 'unknown',
      screenWidth: screen.width,
      screenHeight: screen.height,
      pixelRatio: window.devicePixelRatio,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: Date.now(),
    };
  }
}

function getStoredDevices(): string[] {
  try {
    const stored = localStorage.getItem(KNOWN_DEVICES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function storeDevice(deviceId: string): void {
  try {
    const devices = getStoredDevices();
    if (!devices.includes(deviceId)) {
      devices.unshift(deviceId);
      if (devices.length > MAX_STORED_DEVICES) {
        devices.pop();
      }
      localStorage.setItem(KNOWN_DEVICES_KEY, JSON.stringify(devices));
    }
  } catch {
  }
}

function calculateTrustScore(fingerprint: DeviceFingerprint, isKnown: boolean): number {
  let score = 50;

  if (isKnown) score += 30;

  if (!fingerprint.isVirtual) score += 10;

  if (fingerprint.platform === 'android' || fingerprint.platform === 'ios') {
    score += 5;
  }

  if (fingerprint.batteryLevel !== undefined) {
    score += 5;
  }

  return Math.min(100, score);
}

export async function createLoginAnalytics(
  userId: string,
  location?: { latitude: number; longitude: number }
): Promise<LoginAnalytics> {
  const fingerprint = await getDeviceFingerprint();
  const knownDevices = getStoredDevices();
  const isNewDevice = !knownDevices.includes(fingerprint.deviceId);

  if (isNewDevice) {
    storeDevice(fingerprint.deviceId);
  }

  const trustScore = calculateTrustScore(fingerprint, !isNewDevice);

  return {
    fingerprintId: fingerprint.deviceId,
    userId,
    loginTime: new Date(),
    location,
    deviceInfo: fingerprint,
    isNewDevice,
    trustScore,
  };
}

export function isKnownDevice(deviceId: string): boolean {
  return getStoredDevices().includes(deviceId);
}

export function clearKnownDevices(): void {
  localStorage.removeItem(KNOWN_DEVICES_KEY);
}

export async function getDeviceAnalyticsSummary(): Promise<{
  currentDevice: DeviceFingerprint;
  knownDeviceCount: number;
  isCurrentDeviceKnown: boolean;
}> {
  const currentDevice = await getDeviceFingerprint();
  const knownDevices = getStoredDevices();

  return {
    currentDevice,
    knownDeviceCount: knownDevices.length,
    isCurrentDeviceKnown: knownDevices.includes(currentDevice.deviceId),
  };
}

export type { DeviceFingerprint, LoginAnalytics };
