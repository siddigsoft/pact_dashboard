import { useEffect, useState, useCallback } from 'react';
import { useMobilePermissions } from '@/hooks/use-mobile-permissions';
import { useDevice } from '@/hooks/use-device';
import { MobilePermissionOnboarding } from './MobilePermissionOnboarding';
import { LocationBlocker } from './LocationBlocker';

// Key used by both hook and guard for consistency
const PERMISSION_SETUP_KEY = 'pact_permission_setup_complete';

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
    markSetupComplete,
  } = useMobilePermissions();
  
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showBlocker, setShowBlocker] = useState(false);
  
  // Check localStorage directly on mount to avoid race conditions
  const [localSetupComplete, setLocalSetupComplete] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PERMISSION_SETUP_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Sync with hook's setupComplete when it updates
  useEffect(() => {
    if (setupComplete === true) {
      setLocalSetupComplete(true);
    }
  }, [setupComplete]);

  useEffect(() => {
    // Use localSetupComplete for immediate localStorage-backed decision
    const isSetupDone = localSetupComplete || setupComplete === true;
    
    if (setupComplete === null && !localSetupComplete) {
      // Still initializing and no localStorage value
      if (!isChecking) {
        console.log('[PermissionGuard] Waiting for initialization...');
      }
      return;
    }

    console.log('[PermissionGuard] State update - isNative:', isNative, 'setupComplete:', setupComplete, 'localSetupComplete:', localSetupComplete, 'isLocationBlocked:', isLocationBlocked, 'location:', permissions.location);

    // Don't make decisions while still checking permissions
    if (isChecking) {
      console.log('[PermissionGuard] Still checking permissions, waiting...');
      return;
    }

    if (isNative && !isSetupDone) {
      console.log('[PermissionGuard] Showing onboarding');
      setShowOnboarding(true);
      setShowBlocker(false);
    } else if (isNative && isSetupDone && permissions.location === 'denied') {
      // Only show blocker if permission is explicitly DENIED (not unknown/prompt)
      console.log('[PermissionGuard] Showing location blocker - permission denied');
      setShowOnboarding(false);
      setShowBlocker(true);
    } else {
      // Default: show main app (trust that setup is complete)
      console.log('[PermissionGuard] Showing main app');
      setShowOnboarding(false);
      setShowBlocker(false);
    }
  }, [isNative, setupComplete, localSetupComplete, isLocationBlocked, isChecking, permissions.location]);

  const handleOnboardingComplete = useCallback(async () => {
    console.log('[PermissionGuard] handleOnboardingComplete called');
    
    // Persist to localStorage via the hook - this is the source of truth
    markSetupComplete();
    
    // Also update local state for immediate UI response
    setLocalSetupComplete(true);
    setShowOnboarding(false);
    
    console.log('[PermissionGuard] Onboarding hidden, checking location...');
    
    // Quick location check with timeout - don't block the UI
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
  }, [markSetupComplete, checkAllPermissions, permissions.location]);

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
