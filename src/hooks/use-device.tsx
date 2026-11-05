import { useEffect, useState } from "react";
import { DeviceInfo, MobileCapabilities } from "@/types/mobile";

const defaultDeviceInfo: DeviceInfo = {
  platform: 'web',
  isVirtual: false,
  manufacturer: 'browser',
  model: 'web',
  operatingSystem: 'web',
  osVersion: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
  webViewVersion: 'unknown'
};

const defaultCapabilities: MobileCapabilities = {
  supportsLocationTracking: true,
  supportsPushNotifications: typeof Notification !== 'undefined',
  supportsOfflineMode: false
};

export function useDevice() {
  const [deviceInfo] = useState<DeviceInfo>(defaultDeviceInfo);
  const [capabilities] = useState<MobileCapabilities>(defaultCapabilities);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(false);
  }, []);

  return {
    deviceInfo,
    capabilities,
    isNative: false,
    isLoading,
    isMobile: window.innerWidth < 768
  };
}
