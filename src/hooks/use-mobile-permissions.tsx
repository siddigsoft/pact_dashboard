import { useState, useEffect, useCallback, useRef } from 'react';

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
      if (type === 'storage') return 'granted';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  };

  const checkLocationOnly = useCallback(async (): Promise<PermissionStatus> => {
    return await checkWebPermission('location');
  }, []);

  const checkAllPermissions = useCallback(async () => {
    setIsChecking(true);
    const newPermissions: PermissionState = { ...defaultPermissions };

    try {
      newPermissions.location = await checkWebPermission('location');
      newPermissions.camera = await checkWebPermission('camera');
      newPermissions.microphone = await checkWebPermission('microphone');
      newPermissions.notifications = await checkWebPermission('notifications');
      newPermissions.storage = 'granted';
    } catch (error) {
      console.error('Error checking permissions:', error);
    }

    setPermissions(newPermissions);
    setIsChecking(false);

    if (newPermissions.location !== 'granted') {
      setIsLocationBlocked(true);
    } else {
      setIsLocationBlocked(false);
      if (!setupComplete) {
        localStorage.setItem(PERMISSION_SETUP_KEY, 'true');
        setSetupComplete(true);
      }
    }

    return newPermissions;
  }, [setupComplete]);

  const requestPermission = async (type: PermissionType): Promise<PermissionResult> => {
    try {
      if (type === 'location') {
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
              if (status === 'denied') setIsLocationBlocked(true);
              resolve({ type, status, error: error.message });
            },
            { enableHighAccuracy: true, timeout: 10000 }
          );
        });
      }

      if (type === 'camera') {
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

      if (type === 'microphone') {
        try {
          if (!navigator.mediaDevices?.getUserMedia) {
            setPermissions(prev => ({ ...prev, microphone: 'denied' }));
            return { type, status: 'denied', error: 'Microphone not supported on this device' };
          }
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
          setPermissions(prev => ({ ...prev, microphone: 'granted' }));
          return { type, status: 'granted' };
        } catch (error: any) {
          if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
            setPermissions(prev => ({ ...prev, microphone: 'denied' }));
            return { type, status: 'denied', error: 'Microphone access was denied.' };
          }
          setPermissions(prev => ({ ...prev, microphone: 'prompt' }));
          return { type, status: 'prompt', error: 'Could not access microphone.' };
        }
      }

      if (type === 'notifications') {
        if (!('Notification' in window)) {
          return { type, status: 'denied', error: 'Notifications not supported' };
        }
        const result = await Notification.requestPermission();
        const status: PermissionStatus =
          result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'prompt';
        setPermissions(prev => ({ ...prev, notifications: status }));
        return { type, status };
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
    for (const type of ['location', 'camera', 'microphone', 'notifications', 'storage'] as PermissionType[]) {
      setShowPermissionModal(type);
      const result = await requestPermission(type);
      results.push(result);
      if (type === 'location' && result.status !== 'granted') {
        setShowPermissionModal(null);
        return results;
      }
    }
    setShowPermissionModal(null);
    return results;
  };

  const getPermissionMessage = (type: PermissionType): { title: string; description: string; icon: string } => {
    switch (type) {
      case 'location':
        return {
          title: 'Location Access Required',
          description: 'PACT needs access to your location to track field visits and share your position with your team.',
          icon: 'map-pin',
        };
      case 'camera':
        return {
          title: 'Camera Access',
          description: 'PACT needs camera access to capture site photos and verify field visits.',
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
          description: 'Stay updated with assignment alerts, approval requests, and team messages.',
          icon: 'bell',
        };
      case 'storage':
        return {
          title: 'Storage Access',
          description: 'PACT needs storage access to save offline data and cache site information.',
          icon: 'folder',
        };
      default:
        return { title: '', description: '', icon: '' };
    }
  };

  const openAppSettings = async (): Promise<boolean> => false;

  const isSetupComplete = (): boolean => {
    try {
      return localStorage.getItem(PERMISSION_SETUP_KEY) === 'true';
    } catch {
      return false;
    }
  };

  const markSetupComplete = () => {
    try {
      localStorage.setItem(PERMISSION_SETUP_KEY, 'true');
      setSetupComplete(true);
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

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    setSetupComplete(isSetupComplete());
    checkAllPermissions().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (setupComplete) {
      locationCheckInterval.current = setInterval(async () => {
        const locationStatus = await checkLocationOnly();
        setIsLocationBlocked(locationStatus !== 'granted');
        setPermissions(prev => ({ ...prev, location: locationStatus }));
      }, LOCATION_CHECK_INTERVAL);
    }
    return () => {
      if (locationCheckInterval.current) clearInterval(locationCheckInterval.current);
    };
  }, [setupComplete, checkLocationOnly]);

  useEffect(() => {
    if (!setupComplete) return;
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return;
      const locationStatus = await checkLocationOnly();
      setPermissions(prev => ({ ...prev, location: locationStatus }));
      setIsLocationBlocked(locationStatus !== 'granted');
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [setupComplete, checkLocationOnly]);

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
