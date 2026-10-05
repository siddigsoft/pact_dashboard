import { useState, useEffect, useCallback } from 'react';

export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'none';

export interface BiometricStatus {
  isAvailable: boolean;
  biometricType: BiometricType;
  isEnrolled: boolean;
  hasStoredCredentials: boolean;
  strongBiometricAvailable: boolean;
  errorMessage: string | null;
}

export interface BiometricCredentials {
  username: string;
  password: string;
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
    error?: string;
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
  errorMessage: 'Biometric authentication is only available in the mobile app',
};

const UNAVAILABLE = 'Biometric authentication is only available in the mobile app';

export function useBiometric(): UseBiometricReturn {
  const [status, setStatus] = useState<BiometricStatus>(defaultStatus);
  const [isLoading, setIsLoading] = useState(true);

  const checkAvailability = useCallback(async (): Promise<BiometricStatus> => defaultStatus, []);

  const refreshStatus = useCallback(async () => {
    setStatus(defaultStatus);
  }, []);

  const authenticate = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    return { success: false, error: UNAVAILABLE };
  }, []);

  const authenticateAndGetCredentials = useCallback(async () => {
    return { success: false, error: UNAVAILABLE };
  }, []);

  const storeCredentials = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    return { success: false, error: UNAVAILABLE };
  }, []);

  const clearCredentials = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    return { success: false, error: UNAVAILABLE };
  }, []);

  useEffect(() => {
    setStatus(defaultStatus);
    setIsLoading(false);
  }, []);

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

export async function saveCredentials(
  _credentials: BiometricCredentials
): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: UNAVAILABLE };
}

export async function getCredentials(): Promise<{
  credentials: BiometricCredentials | null;
  error?: string;
}> {
  return { credentials: null, error: UNAVAILABLE };
}

export async function deleteCredentials(): Promise<{ success: boolean; error?: string }> {
  return { success: false, error: UNAVAILABLE };
}

export async function hasStoredCredentials(): Promise<boolean> {
  return false;
}
