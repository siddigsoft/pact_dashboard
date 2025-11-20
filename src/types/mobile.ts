
export interface DeviceInfo {
  platform: 'ios' | 'android' | 'web';
  isVirtual: boolean;
  manufacturer: string;
  model: string;
  operatingSystem: string;
  osVersion: string;
  webViewVersion: string;
}

export interface GeolocationPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

export interface MobileSettings {
  enablePushNotifications: boolean;
  enableLocationTracking: boolean;
  enableBackgroundSync: boolean;
  darkMode: boolean;
  offlineMode: boolean;
}

export interface MobileCapabilities {
  supportsLocationTracking: boolean;
  supportsPushNotifications: boolean;
  supportsOfflineMode: boolean;
}
