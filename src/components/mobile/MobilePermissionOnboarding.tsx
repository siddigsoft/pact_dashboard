import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Camera, Mic, Bell, FolderOpen, CheckCircle2, XCircle, ChevronRight, Shield } from 'lucide-react';
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

export function MobilePermissionOnboarding({ onComplete }: MobilePermissionOnboardingProps) {
  const { 
    permissions, 
    requestPermission, 
    getPermissionMessage,
    markSetupComplete,
    isChecking,
  } = useMobilePermissions();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isRequesting, setIsRequesting] = useState(false);
  const [results, setResults] = useState<Record<PermissionType, PermissionStatus>>({
    location: 'unknown',
    camera: 'unknown',
    microphone: 'unknown',
    notifications: 'unknown',
    storage: 'unknown',
  });

  const currentPermission = permissionOrder[currentStep];
  const Icon = permissionIcons[currentPermission];
  const message = getPermissionMessage(currentPermission);
  const isLocationStep = currentPermission === 'location';

  const handleAllow = useCallback(async () => {
    hapticPresets.buttonPress();
    setIsRequesting(true);
    
    try {
      const result = await requestPermission(currentPermission);
      setResults(prev => ({ ...prev, [currentPermission]: result.status }));
      
      if (currentPermission === 'location' && result.status !== 'granted') {
        hapticPresets.error();
        return;
      }
      
      hapticPresets.success();
      
      if (currentStep < permissionOrder.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        markSetupComplete();
        onComplete();
      }
    } finally {
      setIsRequesting(false);
    }
  }, [currentPermission, currentStep, requestPermission, markSetupComplete, onComplete]);

  const handleSkip = useCallback(() => {
    if (isLocationStep) return;
    
    hapticPresets.buttonPress();
    setResults(prev => ({ ...prev, [currentPermission]: 'denied' }));
    
    if (currentStep < permissionOrder.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      markSetupComplete();
      onComplete();
    }
  }, [currentPermission, currentStep, isLocationStep, markSetupComplete, onComplete]);

  const getStatusIcon = (status: PermissionStatus) => {
    if (status === 'granted') return <CheckCircle2 className="w-5 h-5 text-black dark:text-white" />;
    if (status === 'denied') return <XCircle className="w-5 h-5 text-black/40 dark:text-white/40" />;
    return null;
  };

  if (isChecking) {
    return (
      <div className="fixed inset-0 bg-white dark:bg-black flex items-center justify-center z-50">
        <div className="animate-pulse">
          <Shield className="w-16 h-16 text-black dark:text-white" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white dark:bg-black z-50 flex flex-col safe-area-top safe-area-bottom">
      <div className="flex-1 flex flex-col px-6 py-8">
        <div className="flex items-center gap-2 mb-8">
          {permissionOrder.map((perm, idx) => (
            <div
              key={perm}
              className={`h-1 flex-1 rounded-full transition-all ${
                idx < currentStep
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
              key={currentPermission}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex flex-col items-center text-center"
            >
              <div className="w-24 h-24 rounded-full bg-black dark:bg-white flex items-center justify-center mb-8">
                <Icon className="w-12 h-12 text-white dark:text-black" />
              </div>

              <h1 
                className="text-2xl font-bold text-black dark:text-white mb-4"
                data-testid={`text-permission-title-${currentPermission}`}
              >
                {message.title}
              </h1>

              <p 
                className="text-base text-black/60 dark:text-white/60 max-w-sm leading-relaxed"
                data-testid={`text-permission-description-${currentPermission}`}
              >
                {message.description}
              </p>

              {isLocationStep && (
                <div className="mt-6 px-4 py-3 bg-black/5 dark:bg-white/5 rounded-full">
                  <p className="text-sm font-medium text-black dark:text-white">
                    This permission is required
                  </p>
                </div>
              )}

              {results[currentPermission] === 'denied' && isLocationStep && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-6 px-4 py-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl"
                >
                  <p className="text-sm text-red-600 dark:text-red-400">
                    Location access was denied. Please enable it in your device settings to continue.
                  </p>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-3 mt-8">
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
        </div>

        <div className="mt-8 flex justify-center gap-6">
          {permissionOrder.map((perm) => {
            const PIcon = permissionIcons[perm];
            const status = results[perm];
            return (
              <div
                key={perm}
                className="flex flex-col items-center gap-1"
                data-testid={`status-${perm}`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  status === 'granted'
                    ? 'bg-black dark:bg-white'
                    : status === 'denied'
                    ? 'bg-black/10 dark:bg-white/10'
                    : 'bg-black/5 dark:bg-white/5'
                }`}>
                  <PIcon className={`w-5 h-5 ${
                    status === 'granted'
                      ? 'text-white dark:text-black'
                      : 'text-black/40 dark:text-white/40'
                  }`} />
                </div>
                {getStatusIcon(status)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
