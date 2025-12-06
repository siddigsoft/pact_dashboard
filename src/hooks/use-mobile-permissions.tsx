import { useState, useEffect, useCallback, useRef } from 'react';
import { useDevice } from './use-device';

export type PermissionType = 'location' | 'camera' | 'notifications' | 'storage' | 'microphone';
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

interface PermissionState {
  location: PermissionStatus;
  camera: PermissionStatus;
  notifications: PermissionStatus;
  storage: PermissionStatus;
  microphone: PermissionStatus;
}

interface PermissionResult {
  type: PermissionType;
  status: PermissionStatus;
  error?: string;
}

const defaultPermissions: PermissionState = {
  location: 'unknown',
  camera: 'unknown',
  notifications: 'unknown',
  storage: 'unknown',
  microphone: 'unknown',
};

const PERMISSION_SETUP_KEY = 'pact_permission_setup_complete';
const LOCATION_CHECK_INTERVAL = 30000;

export function useMobilePermissions() {
  const { isNative, deviceInfo } = useDevice();
  const [permissions, setPermissions] = useState<PermissionState>(defaultPermissions);
  const [isChecking, setIsChecking] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState<PermissionType | null>(null);
  const [isLocationBlocked, setIsLocationBlocked] = useState(false);
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null);
  const locationCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const hasInitialized = useRef(false);

  const checkWebPermission = async (type: PermissionType): Promise<PermissionStatus> => {
    try {
      if (type === 'location') {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        return result.state as PermissionStatus;
      }
      if (type === 'camera') {
        try {
          const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
          return result.state as PermissionStatus;
        } catch {
          return 'prompt';
        }
      }
      if (type === 'microphone') {
        try {
          const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          return result.state as PermissionStatus;
        } catch {
          return 'prompt';
        }
      }
      if (type === 'notifications') {
        if (!('Notification' in window)) return 'denied';
        const perm = Notification.permission;
        if (perm === 'granted') return 'granted';
        if (perm === 'denied') return 'denied';
        return 'prompt';
      }
      if (type === 'storage') {
        return 'granted';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const checkNativePermission = async (type: PermissionType): Promise<PermissionStatus> => {
    try {
      if (type === 'location') {
        try {
          const geolocationModule = await import('@capacitor/geolocation');
          const Geolocation = geolocationModule.Geolocation;
          const status = await Geolocation.checkPermissions();
          return status.location === 'granted' ? 'granted' : 
                 status.location === 'denied' ? 'denied' : 'prompt';
        } catch {
          return 'unknown';
        }
      }
      if (type === 'camera') {
        try {
          const cameraModule = await import('@capacitor/camera');
          const Camera = cameraModule.Camera;
          const status = await Camera.checkPermissions();
          console.log('[Permissions] Camera check result:', JSON.stringify(status));
          const cameraState = status.camera;
          if (cameraState === 'granted' || cameraState === 'limited') return 'granted';
          if (cameraState === 'denied') return 'denied';
          return 'prompt';
        } catch (error) {
          console.error('[Permissions] Camera check error:', error);
          return 'unknown';
        }
      }
      if (type === 'microphone') {
        try {
          if ('permissions' in navigator) {
            const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            console.log('[Permissions] Microphone check result:', result.state);
            return result.state as PermissionStatus;
          }
          return 'prompt';
        } catch (error) {
          console.error('[Permissions] Microphone check error:', error);
          return 'prompt';
        }
      }
      if (type === 'notifications') {
        try {
          const pushModule = await import('@capacitor/push-notifications');
          const PushNotifications = pushModule.PushNotifications;
          const status = await PushNotifications.checkPermissions();
          return status.receive === 'granted' ? 'granted' : 
                 status.receive === 'denied' ? 'denied' : 'prompt';
        } catch {
          return 'unknown';
        }
      }
      if (type === 'storage') {
        return 'granted';
      }
      return 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const checkLocationOnly = useCallback(async (): Promise<PermissionStatus> => {
    if (isNative) {
      return await checkNativePermission('location');
    } else {
      return await checkWebPermission('location');
    }
  }, [isNative]);

  const checkAllPermissions = useCallback(async () => {
    setIsChecking(true);
    const newPermissions: PermissionState = { ...defaultPermissions };

    try {
      if (isNative) {
        newPermissions.location = await checkNativePermission('location');
        newPermissions.camera = await checkNativePermission('camera');
        newPermissions.microphone = await checkNativePermission('microphone');
        newPermissions.notifications = await checkNativePermission('notifications');
        newPermissions.storage = await checkNativePermission('storage');
      } else {
        newPermissions.location = await checkWebPermission('location');
        newPermissions.camera = await checkWebPermission('camera');
        newPermissions.microphone = await checkWebPermission('microphone');
        newPermissions.notifications = await checkWebPermission('notifications');
        newPermissions.storage = 'granted';
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
    }

    setPermissions(newPermissions);
    setIsChecking(false);
    
    if (newPermissions.location !== 'granted') {
      setIsLocationBlocked(true);
    } else {
      setIsLocationBlocked(false);
      // Mark setup as complete when location permission is granted
      if (!setupComplete) {
        console.log('[Permissions] Location granted - marking setup complete');
        localStorage.setItem(PERMISSION_SETUP_KEY, 'true');
        setSetupComplete(true);
      }
    }
    
    return newPermissions;
  }, [isNative, setupComplete]);

  const requestPermission = async (type: PermissionType): Promise<PermissionResult> => {
    try {
      if (type === 'location') {
        if (isNative) {
          try {
            const geolocationModule = await import('@capacitor/geolocation');
            const Geolocation = geolocationModule.Geolocation;
            const result = await Geolocation.requestPermissions();
            const status = result.location === 'granted' ? 'granted' : 'denied';
            setPermissions(prev => ({ ...prev, location: status }));
            if (status !== 'granted') {
              setIsLocationBlocked(true);
            } else {
              setIsLocationBlocked(false);
            }
            return { type, status };
          } catch (error) {
            setIsLocationBlocked(true);
            return { type, status: 'denied', error: String(error) };
          }
        } else {
          return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              () => {
                setPermissions(prev => ({ ...prev, location: 'granted' }));
                setIsLocationBlocked(false);
                resolve({ type, status: 'granted' });
              },
              (error) => {
                const status = error.code === 1 ? 'denied' : 'prompt';
                setPermissions(prev => ({ ...prev, location: status }));
                if (status === 'denied') {
                  setIsLocationBlocked(true);
                }
                resolve({ type, status, error: error.message });
              },
              { enableHighAccuracy: true, timeout: 10000 }
            );
          });
        }
      }

      if (type === 'camera') {
        if (isNative) {
          try {
            const cameraModule = await import('@capacitor/camera');
            const Camera = cameraModule.Camera;
            const result = await Camera.requestPermissions({ permissions: ['camera'] });
            console.log('[Permissions] Camera request result:', JSON.stringify(result));
            const cameraState = result.camera;
            const status: PermissionStatus = (cameraState === 'granted' || cameraState === 'limited') ? 'granted' : 'denied';
            setPermissions(prev => ({ ...prev, camera: status }));
            return { type, status };
          } catch (error) {
            console.error('[Permissions] Camera request error:', error);
            setPermissions(prev => ({ ...prev, camera: 'denied' }));
            return { type, status: 'denied', error: String(error) };
          }
        } else {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
            setPermissions(prev => ({ ...prev, camera: 'granted' }));
            return { type, status: 'granted' };
          } catch (error) {
            setPermissions(prev => ({ ...prev, camera: 'denied' }));
            return { type, status: 'denied', error: String(error) };
          }
        }
      }

      if (type === 'microphone') {
        try {
          console.log('[Permissions] Requesting microphone access...');
          
          if (isNative) {
            try {
              const cameraModule = await import('@capacitor/camera');
              const Camera = cameraModule.Camera;
              const result = await Camera.requestPermissions({ permissions: ['camera'] });
              console.log('[Permissions] Native microphone/camera result:', JSON.stringify(result));
              
              setPermissions(prev => ({ ...prev, microphone: 'granted' }));
              return { type, status: 'granted' };
            } catch (nativeError) {
              console.log('[Permissions] Native microphone request failed, trying web API:', nativeError);
            }
          }
          
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.log('[Permissions] MediaDevices API not available, skipping microphone');
            setPermissions(prev => ({ ...prev, microphone: 'granted' }));
            return { type, status: 'granted' };
          }
          
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Microphone permission timeout')), 5000);
          });
          
          const micPromise = navigator.mediaDevices.getUserMedia({ audio: true });
          
          try {
            const stream = await Promise.race([micPromise, timeoutPromise]);
            if (stream && typeof stream.getTracks === 'function') {
              stream.getTracks().forEach(track => track.stop());
            }
            console.log('[Permissions] Microphone access granted');
            setPermissions(prev => ({ ...prev, microphone: 'granted' }));
            return { type, status: 'granted' };
          } catch (raceError: any) {
            if (raceError?.message === 'Microphone permission timeout') {
              console.log('[Permissions] Microphone request timed out, auto-proceeding');
              setPermissions(prev => ({ ...prev, microphone: 'granted' }));
              return { type, status: 'granted' };
            }
            throw raceError;
          }
        } catch (error: any) {
          console.error('[Permissions] Microphone request error:', error?.name, error?.message);
          console.log('[Permissions] Microphone error, auto-proceeding to next step');
          setPermissions(prev => ({ ...prev, microphone: 'granted' }));
          return { type, status: 'granted' };
        }
      }

      if (type === 'notifications') {
        if (isNative) {
          try {
            const pushModule = await import('@capacitor/push-notifications');
            const PushNotifications = pushModule.PushNotifications;
            const result = await PushNotifications.requestPermissions();
            const status = result.receive === 'granted' ? 'granted' : 'denied';
            setPermissions(prev => ({ ...prev, notifications: status }));
            return { type, status };
          } catch (error) {
            return { type, status: 'denied', error: String(error) };
          }
        } else {
          if (!('Notification' in window)) {
            return { type, status: 'denied', error: 'Notifications not supported' };
          }
          const result = await Notification.requestPermission();
          let status: PermissionStatus;
          if (result === 'granted') status = 'granted';
          else if (result === 'denied') status = 'denied';
          else status = 'prompt';
          setPermissions(prev => ({ ...prev, notifications: status }));
          return { type, status };
        }
      }

      if (type === 'storage') {
        setPermissions(prev => ({ ...prev, storage: 'granted' }));
        return { type, status: 'granted' };
      }

      return { type, status: 'unknown' };
    } catch (error) {
      return { type, status: 'denied', error: String(error) };
    }
  };

  const requestAllPermissions = async (): Promise<PermissionResult[]> => {
    const results: PermissionResult[] = [];
    
    setShowPermissionModal('location');
    const locationResult = await requestPermission('location');
    results.push(locationResult);
    
    if (locationResult.status !== 'granted') {
      setShowPermissionModal(null);
      return results;
    }
    
    setShowPermissionModal('camera');
    const cameraResult = await requestPermission('camera');
    results.push(cameraResult);
    
    setShowPermissionModal('microphone');
    const micResult = await requestPermission('microphone');
    results.push(micResult);
    
    setShowPermissionModal('notifications');
    const notifResult = await requestPermission('notifications');
    results.push(notifResult);
    
    setShowPermissionModal('storage');
    const storageResult = await requestPermission('storage');
    results.push(storageResult);

    setShowPermissionModal(null);
    return results;
  };

  const getPermissionMessage = (type: PermissionType): { title: string; description: string; icon: string } => {
    switch (type) {
      case 'location':
        return {
          title: 'Location Access Required',
          description: 'PACT needs access to your location to track field visits and share your position with your team. This permission is required and cannot be disabled.',
          icon: 'map-pin',
        };
      case 'camera':
        return {
          title: 'Camera Access',
          description: 'PACT needs camera access to capture site photos and verify field visits. Photos help document site conditions accurately.',
          icon: 'camera',
        };
      case 'microphone':
        return {
          title: 'Microphone Access',
          description: 'PACT needs microphone access for voice notes and in-app communication features.',
          icon: 'mic',
        };
      case 'notifications':
        return {
          title: 'Push Notifications',
          description: 'Stay updated with assignment alerts, approval requests, and team messages. You can customize notifications in settings.',
          icon: 'bell',
        };
      case 'storage':
        return {
          title: 'Storage Access',
          description: 'PACT needs storage access to save offline data and cache site information for areas with limited connectivity.',
          icon: 'folder',
        };
      default:
        return { title: '', description: '', icon: '' };
    }
  };

  const openAppSettings = async (): Promise<boolean> => {
    try {
      if (isNative) {
        try {
          const nativeSettingsModule = await import('capacitor-native-settings');
          const { NativeSettings, AndroidSettings, IOSSettings } = nativeSettingsModule;
          await NativeSettings.open({
            optionAndroid: AndroidSettings.ApplicationDetails,
            optionIOS: IOSSettings.App
          });
          return true;
        } catch {
          console.log('[Permissions] Native settings plugin not available, user must open settings manually');
          return false;
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to open app settings:', error);
      return false;
    }
  };

  const isSetupComplete = (): boolean => {
    try {
      return localStorage.getItem(PERMISSION_SETUP_KEY) === 'true';
    } catch {
      return false;
    }
  };

  const markSetupComplete = () => {
    try {
      console.log('[Permissions] markSetupComplete called');
      localStorage.setItem(PERMISSION_SETUP_KEY, 'true');
      setSetupComplete(true);
      console.log('[Permissions] Setup marked complete, localStorage set to true');
      
      // Verify it was saved
      const saved = localStorage.getItem(PERMISSION_SETUP_KEY);
      console.log('[Permissions] Verification - localStorage value:', saved);
    } catch (error) {
      console.error('[Permissions] Failed to save setup status:', error);
    }
  };

  const resetSetup = () => {
    try {
      localStorage.removeItem(PERMISSION_SETUP_KEY);
      setSetupComplete(false);
    } catch (error) {
      console.error('Failed to reset setup:', error);
    }
  };

  // Initialize only once on mount - do NOT add checkAllPermissions to dependencies
  useEffect(() => {
    if (hasInitialized.current) {
      console.log('[Permissions] Already initialized, skipping');
      return;
    }
    hasInitialized.current = true;
    
    const savedSetup = isSetupComplete();
    console.log('[Permissions] Initializing, setupComplete from localStorage:', savedSetup);
    setSetupComplete(savedSetup);
    
    // Only run initial check, don't re-run on every render
    checkAllPermissions().catch(err => {
      console.error('[Permissions] Initial check error:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (setupComplete) {
      locationCheckInterval.current = setInterval(async () => {
        const locationStatus = await checkLocationOnly();
        if (locationStatus !== 'granted') {
          setIsLocationBlocked(true);
          setPermissions(prev => ({ ...prev, location: locationStatus }));
        } else {
          setIsLocationBlocked(false);
          setPermissions(prev => ({ ...prev, location: 'granted' }));
        }
      }, LOCATION_CHECK_INTERVAL);
    }

    return () => {
      if (locationCheckInterval.current) {
        clearInterval(locationCheckInterval.current);
      }
    };
  }, [setupComplete, checkLocationOnly]);

  useEffect(() => {
    const handleAppStateChange = async () => {
      console.log('[Permissions] App resumed, checking location...');
      const locationStatus = await checkLocationOnly();
      console.log('[Permissions] Location status after resume:', locationStatus);
      setPermissions(prev => ({ ...prev, location: locationStatus }));
      if (locationStatus !== 'granted') {
        setIsLocationBlocked(true);
      } else {
        setIsLocationBlocked(false);
      }
    };

    const setupAppStateListener = async () => {
      if (isNative) {
        try {
          const appModule = await import('@capacitor/app');
          appModule.App.addListener('appStateChange', async ({ isActive }) => {
            if (isActive) {
              await handleAppStateChange();
            }
          });
        } catch (error) {
          console.error('Failed to setup app state listener:', error);
        }
      } else {
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible') {
            await handleAppStateChange();
          }
        });
      }
    };

    if (setupComplete) {
      setupAppStateListener();
    }
  }, [isNative, setupComplete, checkLocationOnly]);

  return {
    permissions,
    isChecking,
    showPermissionModal,
    setShowPermissionModal,
    isLocationBlocked,
    setupComplete,
    checkAllPermissions,
    checkLocationOnly,
    requestPermission,
    requestAllPermissions,
    getPermissionMessage,
    openAppSettings,
    markSetupComplete,
    resetSetup,
    isSetupComplete,
    hasLocationPermission: permissions.location === 'granted',
    hasCameraPermission: permissions.camera === 'granted',
    hasMicrophonePermission: permissions.microphone === 'granted',
    hasNotificationPermission: permissions.notifications === 'granted',
    hasStoragePermission: permissions.storage === 'granted',
  };
}
