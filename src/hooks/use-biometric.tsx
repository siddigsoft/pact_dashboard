import { useState, useEffect, useCallback } from 'react';
import { useDevice } from './use-device';

export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'none';

export interface BiometricStatus {
  isAvailable: boolean;
  biometricType: BiometricType;
  isEnrolled: boolean;
  hasStoredCredentials: boolean;
  strongBiometricAvailable: boolean;
  errorMessage: string | null;
}

export interface UseBiometricReturn {
  status: BiometricStatus;
  isLoading: boolean;
  authenticate: (options?: {
    reason?: string;
    title?: string;
    subtitle?: string;
    cancelTitle?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  authenticateAndGetCredentials: () => Promise<{ 
    success: boolean; 
    credentials?: BiometricCredentials;
    error?: string 
  }>;
  storeCredentials: (credentials: BiometricCredentials) => Promise<{ success: boolean; error?: string }>;
  clearCredentials: () => Promise<{ success: boolean; error?: string }>;
  checkAvailability: () => Promise<BiometricStatus>;
  refreshStatus: () => Promise<void>;
}

const defaultStatus: BiometricStatus = {
  isAvailable: false,
  biometricType: 'none',
  isEnrolled: false,
  hasStoredCredentials: false,
  strongBiometricAvailable: false,
  errorMessage: null,
};

async function checkBiometricEnrollment(): Promise<{
  isAvailable: boolean;
  isEnrolled: boolean;
  biometryType: number;
  errorCode?: number;
  errorMessage?: string;
}> {
  try {
    const { NativeBiometric } = await import('capacitor-native-biometric');
    const result = await NativeBiometric.isAvailable();
    
    if (!result.isAvailable) {
      let errorMessage = 'Biometric not available';
      let isEnrolled = false;
      
      if (result.errorCode === 1) {
        errorMessage = 'No biometric hardware on this device';
      } else if (result.errorCode === 2) {
        errorMessage = 'Biometrics not enrolled. Set up fingerprint or face in Settings.';
        isEnrolled = false;
      } else if (result.errorCode === 3) {
        errorMessage = 'Biometric temporarily locked due to too many attempts';
      }
      
      return {
        isAvailable: false,
        isEnrolled,
        biometryType: 0,
        errorCode: result.errorCode,
        errorMessage,
      };
    }
    
    return {
      isAvailable: true,
      isEnrolled: true,
      biometryType: result.biometryType,
    };
  } catch (error: any) {
    return {
      isAvailable: false,
      isEnrolled: false,
      biometryType: 0,
      errorMessage: error?.message || 'Failed to check biometric status',
    };
  }
}

async function checkStoredCredentialsExist(): Promise<boolean> {
  try {
    const { NativeBiometric } = await import('capacitor-native-biometric');
    const credentials = await NativeBiometric.getCredentials({ server: CREDENTIAL_SERVER });
    return !!(credentials.username && credentials.password);
  } catch {
    return false;
  }
}

export function useBiometric(): UseBiometricReturn {
  const { isNative } = useDevice();
  const [status, setStatus] = useState<BiometricStatus>(defaultStatus);
  const [isLoading, setIsLoading] = useState(true);

  const checkAvailability = useCallback(async (): Promise<BiometricStatus> => {
    if (!isNative) {
      console.log('[Biometric] Not running in native environment');
      return {
        ...defaultStatus,
        errorMessage: 'Biometric authentication is only available in the mobile app',
      };
    }

    try {
      const enrollmentStatus = await checkBiometricEnrollment();
      const hasCredentials = enrollmentStatus.isAvailable 
        ? await checkStoredCredentialsExist() 
        : false;

      if (!enrollmentStatus.isAvailable) {
        return {
          ...defaultStatus,
          isEnrolled: enrollmentStatus.isEnrolled,
          hasStoredCredentials: false,
          errorMessage: enrollmentStatus.errorMessage || 'Biometric not available',
        };
      }
      
      let biometricType: BiometricType = 'fingerprint';
      switch (enrollmentStatus.biometryType) {
        case 1: biometricType = 'fingerprint'; break;
        case 2: biometricType = 'face'; break;
        case 3: biometricType = 'iris'; break;
        default: biometricType = 'fingerprint';
      }

      const newStatus: BiometricStatus = {
        isAvailable: true,
        biometricType,
        isEnrolled: true,
        hasStoredCredentials: hasCredentials,
        strongBiometricAvailable: true,
        errorMessage: null,
      };

      console.log('[Biometric] Status:', newStatus);
      return newStatus;
    } catch (error: any) {
      console.error('[Biometric] Check availability error:', error);
      return {
        ...defaultStatus,
        errorMessage: error?.message || 'Failed to check biometric availability',
      };
    }
  }, [isNative]);

  const refreshStatus = useCallback(async () => {
    const newStatus = await checkAvailability();
    setStatus(newStatus);
  }, [checkAvailability]);

  const authenticate = useCallback(async (options?: {
    reason?: string;
    title?: string;
    subtitle?: string;
    cancelTitle?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    if (!isNative) {
      return { 
        success: false, 
        error: 'Biometric authentication is only available in the mobile app' 
      };
    }

    const currentStatus = await checkBiometricEnrollment();
    
    if (!currentStatus.isAvailable) {
      return { 
        success: false, 
        error: currentStatus.errorMessage || 'Biometric authentication not available' 
      };
    }

    if (!currentStatus.isEnrolled) {
      return {
        success: false,
        error: 'No biometric credentials enrolled. Please set up fingerprint or face recognition in device settings.',
      };
    }

    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      
      await NativeBiometric.verifyIdentity({
        reason: options?.reason || 'Authenticate to access PACT Workflow',
        title: options?.title || 'PACT Authentication',
        subtitle: options?.subtitle || 'Verify your identity',
        description: 'Use your fingerprint or face to sign in securely',
        negativeButtonText: options?.cancelTitle || 'Cancel',
        maxAttempts: 3,
        useFallback: true,
      });

      console.log('[Biometric] Authentication successful');
      return { success: true };
    } catch (error: any) {
      console.error('[Biometric] Authentication failed:', error);
      
      let errorMessage = 'Authentication failed';
      const errorCode = error?.code || error?.errorCode;
      
      switch (errorCode) {
        case 'BiometricNotEnrolled':
        case 10:
          errorMessage = 'No biometric credentials enrolled. Please set up in device settings.';
          break;
        case 'BiometricLocked':
        case 7:
          errorMessage = 'Too many failed attempts. Please try again later or use your device PIN.';
          break;
        case 'BiometricCancelled':
        case 13:
          errorMessage = 'Authentication cancelled';
          break;
        case 'BiometricNotAvailable':
        case 1:
          errorMessage = 'Biometric authentication not available on this device';
          break;
        case 11:
          errorMessage = 'Biometric authentication failed. Please try again.';
          break;
        default:
          errorMessage = error?.message || 'Authentication failed. Please try again.';
      }

      return { success: false, error: errorMessage };
    }
  }, [isNative]);

  const authenticateAndGetCredentials = useCallback(async (): Promise<{
    success: boolean;
    credentials?: BiometricCredentials;
    error?: string;
    requiresReauth?: boolean;
  }> => {
    const hasCredentials = await checkStoredCredentialsExist();
    if (!hasCredentials) {
      return {
        success: false,
        error: 'No saved credentials. Please log in with email and password first.',
      };
    }

    // Verify device trust before proceeding with biometric auth
    try {
      const { verifyDeviceTrust } = await import('@/lib/device-trust');
      // Get stored username to check device trust
      const { NativeBiometric } = await import('capacitor-native-biometric');
      const storedCreds = await NativeBiometric.getCredentials({ server: CREDENTIAL_SERVER });
      
      if (storedCreds.username) {
        const trustResult = await verifyDeviceTrust(storedCreds.username);
        
        if (!trustResult.isTrusted) {
          console.warn('[Biometric] Device trust verification failed:', trustResult.reason);
          return {
            success: false,
            error: trustResult.reason || 'Device verification failed. Please sign in with your password.',
            requiresReauth: true,
          };
        }
        
        console.log('[Biometric] Device trust verified, score:', trustResult.trustScore);
      }
    } catch (trustError) {
      // If device trust module fails, log but continue with biometric auth
      // This provides defense-in-depth without breaking functionality
      console.warn('[Biometric] Device trust check failed, proceeding with caution:', trustError);
    }

    const authResult = await authenticate({
      reason: 'Authenticate to retrieve your saved login',
      title: 'Sign In with Biometrics',
    });

    if (!authResult.success) {
      return { success: false, error: authResult.error };
    }

    const { credentials, error } = await getCredentials();
    if (!credentials) {
      return { success: false, error: error || 'Failed to retrieve credentials' };
    }

    return { success: true, credentials };
  }, [authenticate]);

  const storeCredentials = useCallback(async (credentials: BiometricCredentials): Promise<{ success: boolean; error?: string }> => {
    if (!isNative) {
      return { success: false, error: 'Biometric storage is only available in the mobile app' };
    }
    return saveCredentials(credentials);
  }, [isNative]);

  const clearCredentials = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    if (!isNative) {
      return { success: false, error: 'Biometric storage is only available in the mobile app' };
    }
    return deleteCredentials();
  }, [isNative]);

  useEffect(() => {
    const initBiometric = async () => {
      setIsLoading(true);
      const newStatus = await checkAvailability();
      setStatus(newStatus);
      setIsLoading(false);
    };

    if (isNative) {
      initBiometric();
    } else {
      setStatus({
        ...defaultStatus,
        errorMessage: 'Running in web browser - biometric not available',
      });
      setIsLoading(false);
    }
  }, [isNative, checkAvailability]);

  return {
    status,
    isLoading,
    authenticate,
    authenticateAndGetCredentials,
    storeCredentials,
    clearCredentials,
    checkAvailability,
    refreshStatus,
  };
}

export interface BiometricCredentials {
  username: string;
  password: string;
}

const CREDENTIAL_SERVER = 'com.pact.workflow';

export async function saveCredentials(
  credentials: BiometricCredentials
): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof (window as any).Capacitor === 'undefined') {
      return { success: false, error: 'Not running in native environment' };
    }

    const enrollmentStatus = await checkBiometricEnrollment();
    if (!enrollmentStatus.isAvailable) {
      return { success: false, error: enrollmentStatus.errorMessage || 'Biometric not available' };
    }
    
    if (!enrollmentStatus.isEnrolled) {
      return { success: false, error: 'Biometrics not enrolled. Set up fingerprint or face in Settings.' };
    }

    const { NativeBiometric } = await import('capacitor-native-biometric');
    
    await NativeBiometric.setCredentials({
      username: credentials.username,
      password: credentials.password,
      server: CREDENTIAL_SERVER,
    });
    
    // Register device trust when saving credentials
    try {
      const { registerTrustedDevice } = await import('@/lib/device-trust');
      await registerTrustedDevice(credentials.username);
      console.log('[Biometric] Device trust registered for user');
    } catch (trustError) {
      // Log but don't fail - device trust is defense in depth
      console.warn('[Biometric] Failed to register device trust:', trustError);
    }
    
    console.log('[Biometric] Credentials saved');
    return { success: true };
  } catch (error: any) {
    console.error('[Biometric] Failed to save credentials:', error);
    return { success: false, error: error?.message || 'Failed to save credentials' };
  }
}

export async function getCredentials(): Promise<{ 
  credentials: BiometricCredentials | null; 
  error?: string 
}> {
  try {
    if (typeof (window as any).Capacitor === 'undefined') {
      return { credentials: null, error: 'Not running in native environment' };
    }

    const enrollmentStatus = await checkBiometricEnrollment();
    if (!enrollmentStatus.isAvailable) {
      return { credentials: null, error: enrollmentStatus.errorMessage || 'Biometric not available' };
    }

    const { NativeBiometric } = await import('capacitor-native-biometric');
    const credentials = await NativeBiometric.getCredentials({ server: CREDENTIAL_SERVER });
    
    if (credentials.username && credentials.password) {
      return {
        credentials: {
          username: credentials.username,
          password: credentials.password,
        },
      };
    }
    return { credentials: null };
  } catch (error: any) {
    console.error('[Biometric] Failed to get credentials:', error);
    return { credentials: null, error: error?.message || 'No saved credentials found' };
  }
}

export async function deleteCredentials(): Promise<{ success: boolean; error?: string }> {
  try {
    if (typeof (window as any).Capacitor === 'undefined') {
      return { success: false, error: 'Not running in native environment' };
    }

    // Get username before deleting to revoke device trust
    let username: string | null = null;
    try {
      const { NativeBiometric } = await import('capacitor-native-biometric');
      const storedCreds = await NativeBiometric.getCredentials({ server: CREDENTIAL_SERVER });
      username = storedCreds.username || null;
    } catch {
      // Continue with deletion even if we can't get username
    }

    const { NativeBiometric } = await import('capacitor-native-biometric');
    await NativeBiometric.deleteCredentials({ server: CREDENTIAL_SERVER });
    
    // Revoke device trust when deleting credentials
    if (username) {
      try {
        const { revokeDeviceTrust } = await import('@/lib/device-trust');
        revokeDeviceTrust(username);
        console.log('[Biometric] Device trust revoked for user');
      } catch (trustError) {
        console.warn('[Biometric] Failed to revoke device trust:', trustError);
      }
    }
    
    console.log('[Biometric] Credentials deleted');
    return { success: true };
  } catch (error: any) {
    console.error('[Biometric] Failed to delete credentials:', error);
    return { success: false, error: error?.message || 'Failed to delete credentials' };
  }
}

export async function hasStoredCredentials(): Promise<boolean> {
  return checkStoredCredentialsExist();
}
