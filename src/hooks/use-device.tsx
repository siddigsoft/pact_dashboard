
import { useEffect, useState } from "react";
import { DeviceInfo, MobileCapabilities } from "@/types/mobile";

// Default device info
const defaultDeviceInfo: DeviceInfo = {
  platform: 'web',
  isVirtual: false,
  manufacturer: 'browser',
  model: 'web',
  operatingSystem: 'web',
  osVersion: 'unknown',
  webViewVersion: 'unknown'
};

// Default capabilities
const defaultCapabilities: MobileCapabilities = {
  supportsLocationTracking: true,
  supportsPushNotifications: false,
  supportsOfflineMode: false
};

export function useDevice() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(defaultDeviceInfo);
  const [capabilities, setCapabilities] = useState<MobileCapabilities>(defaultCapabilities);
  const [isLoading, setIsLoading] = useState(true);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    const detectDevice = async () => {
      try {
        // Check if we're running in a Capacitor native app
        if (typeof (window as any).Capacitor !== 'undefined') {
          try {
            // Dynamic import of the Capacitor device plugin
            const { Device } = await import('@capacitor/device');
            const info = await Device.getInfo();
            
            setDeviceInfo({
              platform: info.platform as 'ios' | 'android' | 'web',
              isVirtual: info.isVirtual,
              manufacturer: info.manufacturer,
              model: info.model,
              operatingSystem: info.operatingSystem,
              osVersion: info.osVersion,
              webViewVersion: info.webViewVersion
            });
            
            setIsNative(info.platform !== 'web');
            
            // Set capabilities based on platform
            setCapabilities({
              supportsLocationTracking: true,
              supportsPushNotifications: info.platform !== 'web',
              supportsOfflineMode: info.platform !== 'web'
            });
          } catch (importError) {
            console.warn('Capacitor detected but Device plugin not available:', importError);
            // Continue with default web values
          }
        }
      } catch (error) {
        console.error('Error detecting device:', error);
      } finally {
        setIsLoading(false);
      }
    };

    detectDevice();
  }, []);

  return {
    deviceInfo,
    capabilities,
    isNative,
    isLoading,
    isMobile: deviceInfo.platform !== 'web' || window.innerWidth < 768
  };
}
