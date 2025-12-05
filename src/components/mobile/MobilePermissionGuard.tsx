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
    setShowOnboarding(false);
    const newPermissions = await checkAllPermissions();
    if (newPermissions.location !== 'granted') {
      setShowBlocker(true);
    }
  }, [checkAllPermissions]);

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
