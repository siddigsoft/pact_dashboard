import { useEffect, useState, useCallback, useRef } from 'react';
import { useMobilePermissions } from '@/hooks/use-mobile-permissions';
import { useDevice } from '@/hooks/use-device';
import { MobilePermissionOnboarding } from './MobilePermissionOnboarding';
import { LocationBlocker } from './LocationBlocker';

interface MobilePermissionGuardProps {
  children: React.ReactNode;
}

export function MobilePermissionGuard({ children }: MobilePermissionGuardProps) {
  const { isNative } = useDevice();
  const { 
    permissions,
    setupComplete, 
    isLocationBlocked, 
    isChecking,
    checkAllPermissions,
  } = useMobilePermissions();
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showBlocker, setShowBlocker] = useState(false);
  const onboardingCompletedRef = useRef(false);

  useEffect(() => {
    // Skip if onboarding was just completed - don't re-show it
    if (onboardingCompletedRef.current) {
      console.log('[PermissionGuard] Onboarding was completed, not re-showing');
      return;
    }
    
    if (setupComplete === null || isChecking) {
      console.log('[PermissionGuard] Still checking, setupComplete:', setupComplete, 'isChecking:', isChecking);
      return;
    }

    console.log('[PermissionGuard] State update - isNative:', isNative, 'setupComplete:', setupComplete, 'isLocationBlocked:', isLocationBlocked, 'location:', permissions.location);

    if (isNative && !setupComplete) {
      console.log('[PermissionGuard] Showing onboarding');
      setShowOnboarding(true);
      setShowBlocker(false);
    } else if (isNative && setupComplete && (isLocationBlocked || permissions.location !== 'granted')) {
      console.log('[PermissionGuard] Showing location blocker');
      setShowOnboarding(false);
      setShowBlocker(true);
    } else {
      console.log('[PermissionGuard] Showing main app');
      setShowOnboarding(false);
      setShowBlocker(false);
    }
  }, [isNative, setupComplete, isLocationBlocked, isChecking, permissions.location]);

  const handleOnboardingComplete = useCallback(async () => {
    console.log('[PermissionGuard] handleOnboardingComplete called');
    
    // Mark that onboarding was completed - prevents re-showing
    onboardingCompletedRef.current = true;
    setShowOnboarding(false);
    
    console.log('[PermissionGuard] Onboarding hidden, checking location...');
    
    // Quick location check with timeout
    try {
      const newPermissions = await Promise.race([
        checkAllPermissions(),
        new Promise<{ location: string }>((resolve) => 
          setTimeout(() => {
            console.log('[PermissionGuard] Permission check timed out, using current location status');
            resolve({ location: permissions.location });
          }, 2000)
        )
      ]);
      
      if (newPermissions.location !== 'granted') {
        console.log('[PermissionGuard] Location not granted, showing blocker');
        setShowBlocker(true);
      } else {
        console.log('[PermissionGuard] Location granted, showing main app');
        setShowBlocker(false);
      }
    } catch (error) {
      console.error('[PermissionGuard] Error checking permissions:', error);
      // If there's an error, still proceed if we think location is granted
      if (permissions.location !== 'granted') {
        setShowBlocker(true);
      }
    }
  }, [checkAllPermissions, permissions.location]);

  const handleRetryLocation = useCallback(async () => {
    const newPermissions = await checkAllPermissions();
    if (newPermissions.location === 'granted') {
      setShowBlocker(false);
    }
  }, [checkAllPermissions]);

  if (showOnboarding) {
    return <MobilePermissionOnboarding onComplete={handleOnboardingComplete} />;
  }

  if (showBlocker) {
    return <LocationBlocker onRetry={handleRetryLocation} />;
  }

  return <>{children}</>;
}
