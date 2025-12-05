import { useEffect, useState, useCallback } from 'react';
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

  useEffect(() => {
    if (setupComplete === null || isChecking) return;

    if (isNative && !setupComplete) {
      setShowOnboarding(true);
      setShowBlocker(false);
    } else if (isNative && setupComplete && (isLocationBlocked || permissions.location !== 'granted')) {
      setShowOnboarding(false);
      setShowBlocker(true);
    } else {
      setShowOnboarding(false);
      setShowBlocker(false);
    }
  }, [isNative, setupComplete, isLocationBlocked, isChecking, permissions.location]);

  const handleOnboardingComplete = useCallback(async () => {
    console.log('[PermissionGuard] Onboarding complete, hiding onboarding screen');
    setShowOnboarding(false);
    
    // Don't await checkAllPermissions to avoid hanging
    // Just do a quick location check
    try {
      const newPermissions = await Promise.race([
        checkAllPermissions(),
        new Promise<{ location: string }>((resolve) => 
          setTimeout(() => resolve({ location: permissions.location }), 2000)
        )
      ]);
      
      if (newPermissions.location !== 'granted') {
        console.log('[PermissionGuard] Location not granted, showing blocker');
        setShowBlocker(true);
      } else {
        console.log('[PermissionGuard] All permissions OK, showing app');
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
