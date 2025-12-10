/**
 * Device Trust Verification Module
 * 
 * Provides security hardening for biometric authentication by:
 * - Generating and storing device fingerprints
 * - Verifying device trust before allowing biometric login
 * - Managing device registration with the server
 * - Detecting suspicious device changes
 */

import { v4 as uuidv4 } from 'uuid';

export interface DeviceInfo {
  deviceId: string;
  platform: string;
  model: string;
  osVersion: string;
  appVersion: string;
  screenResolution: string;
  timezone: string;
  language: string;
  createdAt: string;
  lastVerifiedAt: string;
  trustScore: number;
}

export interface DeviceTrustResult {
  isTrusted: boolean;
  deviceId: string;
  trustScore: number;
  requiresReauth: boolean;
  reason?: string;
}

const DEVICE_STORAGE_KEY = 'pact_device_trust';
const DEVICE_HISTORY_KEY = 'pact_device_history';
const MAX_TRUST_AGE_DAYS = 30;
const TRUST_SCORE_THRESHOLD = 0.7;

/**
 * Generate a unique device fingerprint based on available device characteristics
 */
async function generateDeviceFingerprint(): Promise<string> {
  const components: string[] = [];
  
  // Screen characteristics
  components.push(`${window.screen.width}x${window.screen.height}`);
  components.push(`${window.screen.colorDepth}`);
  components.push(`${window.devicePixelRatio}`);
  
  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);
  
  // Language
  components.push(navigator.language);
  
  // Platform
  components.push(navigator.platform);
  
  // Hardware concurrency
  components.push(String(navigator.hardwareConcurrency || 0));
  
  // Device memory (if available)
  const nav = navigator as any;
  if (nav.deviceMemory) {
    components.push(String(nav.deviceMemory));
  }
  
  // Touch support
  components.push(String('ontouchstart' in window));
  
  // Canvas fingerprint (basic)
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('PACT Device Trust', 2, 2);
      components.push(canvas.toDataURL().slice(-50));
    }
  } catch {
    // Canvas fingerprinting blocked
  }
  
  // Generate hash from components
  const fingerprint = components.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Get device information for trust verification
 */
async function getDeviceInfo(): Promise<Partial<DeviceInfo>> {
  let platform = 'web';
  let model = 'unknown';
  let osVersion = 'unknown';
  
  // Try to get native device info if available
  if (typeof (window as any).Capacitor !== 'undefined') {
    try {
      const { Device } = await import('@capacitor/device');
      const info = await Device.getInfo();
      platform = info.platform;
      model = info.model;
      osVersion = info.osVersion;
    } catch {
      // Fallback to user agent parsing
      const ua = navigator.userAgent;
      if (/android/i.test(ua)) {
        platform = 'android';
      } else if (/iPad|iPhone|iPod/.test(ua)) {
        platform = 'ios';
      }
    }
  }
  
  return {
    platform,
    model,
    osVersion,
    appVersion: '1.0.0', // Should be replaced with actual version
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  };
}

/**
 * Calculate trust score based on device characteristics comparison
 */
function calculateTrustScore(stored: DeviceInfo, current: Partial<DeviceInfo>): number {
  let score = 0;
  let factors = 0;
  
  // Platform match (critical)
  factors += 3;
  if (stored.platform === current.platform) score += 3;
  
  // Screen resolution match
  factors += 2;
  if (stored.screenResolution === current.screenResolution) score += 2;
  
  // Timezone match
  factors += 1;
  if (stored.timezone === current.timezone) score += 1;
  
  // Language match
  factors += 1;
  if (stored.language === current.language) score += 1;
  
  // OS version (allow minor changes)
  factors += 1;
  if (stored.osVersion === current.osVersion) {
    score += 1;
  } else if (stored.platform === current.platform) {
    score += 0.5; // Partial credit for same platform
  }
  
  // App version (allow updates)
  factors += 1;
  if (stored.appVersion === current.appVersion) {
    score += 1;
  } else {
    score += 0.8; // App updates are expected
  }
  
  return score / factors;
}

/**
 * Check if device trust has expired
 */
function isTrustExpired(deviceInfo: DeviceInfo): boolean {
  const lastVerified = new Date(deviceInfo.lastVerifiedAt);
  const now = new Date();
  const daysSinceVerification = (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceVerification > MAX_TRUST_AGE_DAYS;
}

/**
 * Store device trust information
 */
export async function registerTrustedDevice(userId: string): Promise<DeviceInfo> {
  const deviceId = uuidv4();
  const fingerprint = await generateDeviceFingerprint();
  const info = await getDeviceInfo();
  
  const deviceInfo: DeviceInfo = {
    deviceId,
    platform: info.platform || 'unknown',
    model: info.model || 'unknown',
    osVersion: info.osVersion || 'unknown',
    appVersion: info.appVersion || '1.0.0',
    screenResolution: info.screenResolution || 'unknown',
    timezone: info.timezone || 'unknown',
    language: info.language || 'en',
    createdAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    trustScore: 1.0,
  };
  
  // Store device info with user association
  const storageKey = `${DEVICE_STORAGE_KEY}_${userId}`;
  localStorage.setItem(storageKey, JSON.stringify(deviceInfo));
  
  // Add to device history
  addToDeviceHistory(userId, deviceInfo);
  
  console.log('[DeviceTrust] Device registered:', deviceId);
  return deviceInfo;
}

/**
 * Add device to history for audit purposes
 */
function addToDeviceHistory(userId: string, device: DeviceInfo): void {
  const historyKey = `${DEVICE_HISTORY_KEY}_${userId}`;
  let history: DeviceInfo[] = [];
  
  try {
    const stored = localStorage.getItem(historyKey);
    if (stored) {
      history = JSON.parse(stored);
    }
  } catch {
    history = [];
  }
  
  // Keep only last 10 devices
  history = [device, ...history.filter(d => d.deviceId !== device.deviceId)].slice(0, 10);
  localStorage.setItem(historyKey, JSON.stringify(history));
}

/**
 * Verify device trust for biometric authentication
 */
export async function verifyDeviceTrust(userId: string): Promise<DeviceTrustResult> {
  const storageKey = `${DEVICE_STORAGE_KEY}_${userId}`;
  const storedData = localStorage.getItem(storageKey);
  
  if (!storedData) {
    return {
      isTrusted: false,
      deviceId: '',
      trustScore: 0,
      requiresReauth: true,
      reason: 'Device not registered',
    };
  }
  
  try {
    const storedDevice: DeviceInfo = JSON.parse(storedData);
    const currentInfo = await getDeviceInfo();
    
    // Check if trust has expired
    if (isTrustExpired(storedDevice)) {
      return {
        isTrusted: false,
        deviceId: storedDevice.deviceId,
        trustScore: storedDevice.trustScore,
        requiresReauth: true,
        reason: 'Device trust expired',
      };
    }
    
    // Calculate trust score
    const trustScore = calculateTrustScore(storedDevice, currentInfo);
    
    if (trustScore < TRUST_SCORE_THRESHOLD) {
      console.warn('[DeviceTrust] Low trust score:', trustScore);
      return {
        isTrusted: false,
        deviceId: storedDevice.deviceId,
        trustScore,
        requiresReauth: true,
        reason: 'Device characteristics changed significantly',
      };
    }
    
    // Update last verified time
    storedDevice.lastVerifiedAt = new Date().toISOString();
    storedDevice.trustScore = trustScore;
    localStorage.setItem(storageKey, JSON.stringify(storedDevice));
    
    return {
      isTrusted: true,
      deviceId: storedDevice.deviceId,
      trustScore,
      requiresReauth: false,
    };
  } catch (error) {
    console.error('[DeviceTrust] Verification error:', error);
    return {
      isTrusted: false,
      deviceId: '',
      trustScore: 0,
      requiresReauth: true,
      reason: 'Trust verification failed',
    };
  }
}

/**
 * Revoke device trust (e.g., on logout or security event)
 */
export function revokeDeviceTrust(userId: string): void {
  const storageKey = `${DEVICE_STORAGE_KEY}_${userId}`;
  localStorage.removeItem(storageKey);
  console.log('[DeviceTrust] Device trust revoked for user:', userId);
}

/**
 * Get device history for a user (for security audit)
 */
export function getDeviceHistory(userId: string): DeviceInfo[] {
  const historyKey = `${DEVICE_HISTORY_KEY}_${userId}`;
  try {
    const stored = localStorage.getItem(historyKey);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return [];
}

/**
 * Check if this device is trusted without full verification
 */
export function isDeviceRegistered(userId: string): boolean {
  const storageKey = `${DEVICE_STORAGE_KEY}_${userId}`;
  return !!localStorage.getItem(storageKey);
}

/**
 * Get current device ID if registered
 */
export function getCurrentDeviceId(userId: string): string | null {
  const storageKey = `${DEVICE_STORAGE_KEY}_${userId}`;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const device: DeviceInfo = JSON.parse(stored);
      return device.deviceId;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}
