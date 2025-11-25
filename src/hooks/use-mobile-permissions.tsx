import { useState, useEffect, useCallback } from 'react';
import { useDevice } from './use-device';

export type PermissionType = 'location' | 'camera' | 'notifications' | 'storage';
export type PermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

interface PermissionState {
  location: PermissionStatus;
  camera: PermissionStatus;
  notifications: PermissionStatus;
  storage: PermissionStatus;
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
};

export function useMobilePermissions() {
  const { isNative, deviceInfo } = useDevice();
  const [permissions, setPermissions] = useState<PermissionState>(defaultPermissions);
  const [isChecking, setIsChecking] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState<PermissionType | null>(null);

  const checkWebPermission = async (type: PermissionType): Promise<PermissionStatus> => {
    try {
      if (type === 'location') {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        return result.state as PermissionStatus;
      }
      if (type === 'camera') {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
        return result.state as PermissionStatus;
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
          return status.camera === 'granted' ? 'granted' : 
                 status.camera === 'denied' ? 'denied' : 'prompt';
        } catch {
          return 'unknown';
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

  const checkAllPermissions = useCallback(async () => {
    setIsChecking(true);
    const newPermissions: PermissionState = { ...defaultPermissions };

    try {
      if (isNative) {
        newPermissions.location = await checkNativePermission('location');
        newPermissions.camera = await checkNativePermission('camera');
        newPermissions.notifications = await checkNativePermission('notifications');
        newPermissions.storage = await checkNativePermission('storage');
      } else {
        newPermissions.location = await checkWebPermission('location');
        newPermissions.camera = await checkWebPermission('camera');
        newPermissions.notifications = await checkWebPermission('notifications');
        newPermissions.storage = 'granted';
      }
    } catch (error) {
      console.error('Error checking permissions:', error);
    }

    setPermissions(newPermissions);
    setIsChecking(false);
    return newPermissions;
  }, [isNative]);

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
            return { type, status };
          } catch (error) {
            return { type, status: 'denied', error: String(error) };
          }
        } else {
          return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
              () => {
                setPermissions(prev => ({ ...prev, location: 'granted' }));
                resolve({ type, status: 'granted' });
              },
              (error) => {
                const status = error.code === 1 ? 'denied' : 'prompt';
                setPermissions(prev => ({ ...prev, location: status }));
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
            const result = await Camera.requestPermissions();
            const status = result.camera === 'granted' ? 'granted' : 'denied';
            setPermissions(prev => ({ ...prev, camera: status }));
            return { type, status };
          } catch (error) {
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
    
    if (permissions.location !== 'granted') {
      setShowPermissionModal('location');
      const result = await requestPermission('location');
      results.push(result);
    }
    
    if (permissions.camera !== 'granted') {
      setShowPermissionModal('camera');
      const result = await requestPermission('camera');
      results.push(result);
    }
    
    if (permissions.notifications !== 'granted') {
      setShowPermissionModal('notifications');
      const result = await requestPermission('notifications');
      results.push(result);
    }

    setShowPermissionModal(null);
    return results;
  };

  const getPermissionMessage = (type: PermissionType): { title: string; description: string } => {
    switch (type) {
      case 'location':
        return {
          title: 'Location Access Required',
          description: 'PACT needs access to your location to track field visits and share your position with your team. This helps coordinators manage assignments effectively.',
        };
      case 'camera':
        return {
          title: 'Camera Access Required',
          description: 'PACT needs camera access to capture site photos and verify field visits. Photos help document site conditions accurately.',
        };
      case 'notifications':
        return {
          title: 'Enable Notifications',
          description: 'Stay updated with assignment alerts, approval requests, and team messages. You can customize notifications in settings.',
        };
      case 'storage':
        return {
          title: 'Storage Access Required',
          description: 'PACT needs storage access to save offline data and cache site information for areas with limited connectivity.',
        };
      default:
        return { title: '', description: '' };
    }
  };

  useEffect(() => {
    checkAllPermissions();
  }, [checkAllPermissions]);

  return {
    permissions,
    isChecking,
    showPermissionModal,
    setShowPermissionModal,
    checkAllPermissions,
    requestPermission,
    requestAllPermissions,
    getPermissionMessage,
    hasLocationPermission: permissions.location === 'granted',
    hasCameraPermission: permissions.camera === 'granted',
    hasNotificationPermission: permissions.notifications === 'granted',
  };
}
