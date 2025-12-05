import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Camera, Mic, Bell, FolderOpen, CheckCircle2, XCircle, ChevronRight, Shield, Settings, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMobilePermissions, PermissionType, PermissionStatus } from '@/hooks/use-mobile-permissions';
import { hapticPresets } from '@/lib/haptics';

interface MobilePermissionOnboardingProps {
  onComplete: () => void;
}

const permissionOrder: PermissionType[] = ['location', 'camera', 'microphone', 'notifications', 'storage'];

const permissionIcons: Record<PermissionType, typeof MapPin> = {
  location: MapPin,
  camera: Camera,
  microphone: Mic,
  notifications: Bell,
  storage: FolderOpen,
};

const permissionLabels: Record<PermissionType, string> = {
  location: 'Location',
  camera: 'Camera',
  microphone: 'Mic',
  notifications: 'Alerts',
  storage: 'Files',
};

export function MobilePermissionOnboarding({ onComplete }: MobilePermissionOnboardingProps) {
  const { 
    permissions,
    requestPermission, 
    getPermissionMessage,
    markSetupComplete,
    isChecking,
    openAppSettings,
    checkAllPermissions,
  } = useMobilePermissions();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isRequesting, setIsRequesting] = useState(false);
  const [showDeniedState, setShowDeniedState] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const [grantedPermissions, setGrantedPermissions] = useState<Set<PermissionType>>(new Set());

  const currentPermission = permissionOrder[currentStep];
  const Icon = permissionIcons[currentPermission];
  const message = getPermissionMessage(currentPermission);
  const isLocationStep = currentPermission === 'location';
  const currentStatus = permissions[currentPermission];

  useEffect(() => {
    if (currentStatus === 'granted' && !grantedPermissions.has(currentPermission)) {
      setGrantedPermissions(prev => new Set([...prev, currentPermission]));
    }
  }, [currentStatus, currentPermission, grantedPermissions]);

  const moveToNextStep = useCallback(() => {
    if (currentStep < permissionOrder.length - 1) {
      setCurrentStep(prev => prev + 1);
      setShowDeniedState(false);
      setAttemptCount(0);
    } else {
      markSetupComplete();
      onComplete();
    }
  }, [currentStep, markSetupComplete, onComplete]);

  const handleAllow = useCallback(async () => {
    hapticPresets.buttonPress();
    setIsRequesting(true);
    setShowDeniedState(false);
    
    try {
      const result = await requestPermission(currentPermission);
      console.log(`[Onboarding] ${currentPermission} permission result:`, result.status);
      
      await checkAllPermissions();
      
      if (result.status === 'granted') {
        setGrantedPermissions(prev => new Set([...prev, currentPermission]));
        hapticPresets.success();
        
        setTimeout(() => {
          moveToNextStep();
        }, 300);
      } else {
        if (currentPermission === 'location') {
          hapticPresets.error();
          setShowDeniedState(true);
          setAttemptCount(prev => prev + 1);
        } else {
          hapticPresets.buttonPress();
          moveToNextStep();
        }
      }
    } catch (error) {
      console.error(`[Onboarding] ${currentPermission} permission error:`, error);
      if (currentPermission === 'location') {
        setShowDeniedState(true);
        setAttemptCount(prev => prev + 1);
      } else {
        moveToNextStep();
      }
    } finally {
      setIsRequesting(false);
    }
  }, [currentPermission, requestPermission, checkAllPermissions, moveToNextStep]);

  const handleSkip = useCallback(() => {
    if (isLocationStep) return;
    
    hapticPresets.buttonPress();
    moveToNextStep();
  }, [isLocationStep, moveToNextStep]);

  const handleOpenSettings = useCallback(async () => {
    hapticPresets.buttonPress();
    const opened = await openAppSettings();
    if (!opened) {
      console.log('[Onboarding] Could not open settings automatically');
    }
  }, [openAppSettings]);

  const handleRetryFromSettings = useCallback(async () => {
    hapticPresets.buttonPress();
    setIsRequesting(true);
    
    try {
      const updatedPermissions = await checkAllPermissions();
      const newStatus = updatedPermissions[currentPermission];
      
      console.log(`[Onboarding] Retry from settings - ${currentPermission}:`, newStatus);
      
      if (newStatus === 'granted') {
        setGrantedPermissions(prev => new Set([...prev, currentPermission]));
        hapticPresets.success();
        setShowDeniedState(false);
        setTimeout(() => {
          moveToNextStep();
        }, 300);
      } else {
        hapticPresets.error();
        setAttemptCount(prev => prev + 1);
      }
    } catch (error) {
      console.error(`[Onboarding] Error checking permissions:`, error);
      hapticPresets.error();
    } finally {
      setIsRequesting(false);
    }
  }, [checkAllPermissions, currentPermission, moveToNextStep]);

  const getStatusForPermission = (perm: PermissionType): 'granted' | 'denied' | 'pending' => {
    const permStatus = permissions[perm];
    if (grantedPermissions.has(perm) || permStatus === 'granted') {
      return 'granted';
    }
    
    const permIndex = permissionOrder.indexOf(perm);
    if (permIndex < currentStep) {
      return 'denied';
    }
    return 'pending';
  };

  if (isChecking) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-black flex items-center justify-center z-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          <Shield className="w-16 h-16 text-black dark:text-white" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white dark:bg-black z-50 flex flex-col safe-area-top safe-area-bottom">
      <div className="flex-1 flex flex-col px-6 py-8">
        <div className="flex items-center gap-2 mb-8">
          {permissionOrder.map((perm, idx) => (
            <motion.div
              key={perm}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              className={`h-1.5 flex-1 rounded-full transition-all origin-left ${
                idx < currentStep || grantedPermissions.has(perm)
                  ? 'bg-black dark:bg-white'
                  : idx === currentStep
                  ? 'bg-black/60 dark:bg-white/60'
                  : 'bg-black/10 dark:bg-white/10'
              }`}
              data-testid={`progress-step-${perm}`}
            />
          ))}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${currentPermission}-${showDeniedState}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center text-center"
            >
              <motion.div 
                className="w-28 h-28 rounded-full flex items-center justify-center mb-8 bg-black dark:bg-white"
                animate={showDeniedState ? { scale: [1, 1.05, 1] } : {}}
                transition={{ duration: 0.5 }}
              >
                {showDeniedState ? (
                  <AlertTriangle className="w-14 h-14 text-white dark:text-black" />
                ) : (
                  <Icon className="w-14 h-14 text-white dark:text-black" />
                )}
              </motion.div>

              <h1 
                className="text-2xl font-bold mb-4 text-black dark:text-white"
                data-testid={`text-permission-title-${currentPermission}`}
              >
                {showDeniedState ? 'Permission Required' : message.title}
              </h1>

              <p 
                className="text-base text-black/60 dark:text-white/60 max-w-sm leading-relaxed px-4"
                data-testid={`text-permission-description-${currentPermission}`}
              >
                {showDeniedState 
                  ? `${message.title} is required for PACT to function properly. Please enable it in your device settings.`
                  : message.description
                }
              </p>

              {isLocationStep && !showDeniedState && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 px-5 py-3 bg-black/5 dark:bg-white/5 rounded-full"
                >
                  <p className="text-sm font-semibold text-black dark:text-white">
                    Required to continue
                  </p>
                </motion.div>
              )}

              {showDeniedState && attemptCount >= 2 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-6 px-4 py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl max-w-sm"
                >
                  <p className="text-sm text-black/70 dark:text-white/70">
                    If the permission dialog doesn't appear, you may need to enable it manually in Settings.
                  </p>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3 mt-8">
          {showDeniedState ? (
            <>
              <Button
                size="lg"
                onClick={handleOpenSettings}
                className="w-full h-14 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold text-lg gap-2"
                data-testid="button-open-settings"
                aria-label="Open device settings"
              >
                <Settings className="w-5 h-5" />
                Open Settings
              </Button>
              
              <Button
                size="lg"
                variant="outline"
                onClick={handleRetryFromSettings}
                disabled={isRequesting}
                className="w-full h-14 rounded-full border-2 border-black dark:border-white text-black dark:text-white font-semibold text-lg gap-2"
                data-testid="button-retry-permission"
                aria-label="Check permission again"
              >
                {isRequesting ? (
                  <div className="w-5 h-5 border-2 border-black/30 dark:border-white/30 border-t-black dark:border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    I've Enabled It
                  </>
                )}
              </Button>

              {!isLocationStep && (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={handleSkip}
                  className="w-full h-14 rounded-full text-black/60 dark:text-white/60 font-medium"
                  data-testid="button-skip-anyway"
                  aria-label="Skip this permission"
                >
                  Skip Anyway
                </Button>
              )}
            </>
          ) : (
            <>
              <Button
                size="lg"
                onClick={handleAllow}
                disabled={isRequesting}
                className="w-full h-14 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold text-lg"
                data-testid={`button-allow-${currentPermission}`}
                aria-label={`Allow ${currentPermission} access`}
              >
                {isRequesting ? (
                  <div className="w-5 h-5 border-2 border-white/30 dark:border-black/30 border-t-white dark:border-t-black rounded-full animate-spin" />
                ) : (
                  <>
                    Allow Access
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </>
                )}
              </Button>

              {!isLocationStep && (
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={handleSkip}
                  disabled={isRequesting}
                  className="w-full h-14 rounded-full text-black/60 dark:text-white/60 font-medium"
                  data-testid={`button-skip-${currentPermission}`}
                  aria-label={`Skip ${currentPermission} permission`}
                >
                  Skip for Now
                </Button>
              )}
            </>
          )}
        </div>

        <div className="mt-8 flex justify-center gap-4">
          {permissionOrder.map((perm) => {
            const PIcon = permissionIcons[perm];
            const status = getStatusForPermission(perm);
            const isCurrent = perm === currentPermission;
            
            return (
              <motion.div
                key={perm}
                className="flex flex-col items-center gap-1.5"
                data-testid={`status-${perm}`}
                animate={isCurrent ? { scale: [1, 1.1, 1] } : {}}
                transition={{ duration: 0.5, repeat: isCurrent ? Infinity : 0, repeatDelay: 1 }}
              >
                <div className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                  status === 'granted'
                    ? 'bg-black dark:bg-white'
                    : status === 'denied'
                    ? 'bg-black/10 dark:bg-white/10'
                    : isCurrent
                    ? 'bg-black/20 dark:bg-white/20 ring-2 ring-black dark:ring-white'
                    : 'bg-black/5 dark:bg-white/5'
                }`}>
                  <PIcon className={`w-5 h-5 ${
                    status === 'granted'
                      ? 'text-white dark:text-black'
                      : status === 'denied'
                      ? 'text-black/40 dark:text-white/40'
                      : 'text-black/40 dark:text-white/40'
                  }`} />
                  
                  {status === 'granted' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-0.5 -right-0.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-black dark:text-white bg-white dark:bg-black rounded-full" />
                    </motion.div>
                  )}
                  
                  {status === 'denied' && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-0.5 -right-0.5"
                    >
                      <XCircle className="w-4 h-4 text-black/50 dark:text-white/50 bg-white dark:bg-black rounded-full" />
                    </motion.div>
                  )}
                </div>
                
                <span className={`text-[10px] font-medium ${
                  status === 'granted' 
                    ? 'text-black dark:text-white' 
                    : 'text-black/40 dark:text-white/40'
                }`}>
                  {permissionLabels[perm]}
                </span>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-xs text-black/40 dark:text-white/40 mt-6">
          Step {currentStep + 1} of {permissionOrder.length}
        </p>
      </div>
    </div>
  );
}
