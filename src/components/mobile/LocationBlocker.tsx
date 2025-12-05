import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { MapPinOff, Settings, RefreshCw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMobilePermissions } from '@/hooks/use-mobile-permissions';
import { hapticPresets } from '@/lib/haptics';

interface LocationBlockerProps {
  onRetry?: () => void;
}

export function LocationBlocker({ onRetry }: LocationBlockerProps) {
  const { 
    openAppSettings, 
    checkAllPermissions,
    requestPermission,
  } = useMobilePermissions();

  const handleOpenSettings = useCallback(async () => {
    hapticPresets.buttonPress();
    await openAppSettings();
  }, [openAppSettings]);

  const handleRetry = useCallback(async () => {
    hapticPresets.buttonPress();
    
    const result = await requestPermission('location');
    
    if (result.status === 'granted') {
      hapticPresets.success();
      await checkAllPermissions();
      onRetry?.();
    } else {
      hapticPresets.error();
    }
  }, [requestPermission, checkAllPermissions, onRetry]);

  return (
    <div className="fixed inset-0 bg-white dark:bg-black z-[100] flex flex-col safe-area-top safe-area-bottom">
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="w-32 h-32 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-8"
        >
          <div className="w-24 h-24 rounded-full bg-black/10 dark:bg-white/10 flex items-center justify-center">
            <MapPinOff className="w-12 h-12 text-black dark:text-white" />
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-sm font-medium text-red-500 uppercase tracking-wide">
              Location Required
            </span>
          </div>

          <h1 
            className="text-2xl font-bold text-black dark:text-white mb-4"
            data-testid="text-location-blocked-title"
          >
            Location Access Disabled
          </h1>

          <p 
            className="text-base text-black/60 dark:text-white/60 max-w-sm leading-relaxed mb-8"
            data-testid="text-location-blocked-description"
          >
            PACT requires location access to function. This helps us track field visits, coordinate team assignments, and ensure accurate data collection.
          </p>

          <div className="bg-black/5 dark:bg-white/5 rounded-xl p-4 mb-8 max-w-sm">
            <h3 className="font-semibold text-black dark:text-white mb-2">
              How to enable location:
            </h3>
            <ol className="text-sm text-black/60 dark:text-white/60 text-left space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                <span>Open your device Settings</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                <span>Find "PACT Workflow" in Apps</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                <span>Tap Permissions, then Location</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                <span>Select "Allow all the time" or "Allow while using app"</span>
              </li>
            </ol>
          </div>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col gap-3 w-full max-w-sm"
        >
          <Button
            size="lg"
            onClick={handleOpenSettings}
            className="w-full h-14 rounded-full bg-black dark:bg-white text-white dark:text-black font-semibold text-lg"
            data-testid="button-open-settings"
            aria-label="Open device settings"
          >
            <Settings className="w-5 h-5 mr-2" />
            Open Settings
          </Button>

          <Button
            variant="ghost"
            size="lg"
            onClick={handleRetry}
            className="w-full h-14 rounded-full text-black dark:text-white font-medium"
            data-testid="button-retry-location"
            aria-label="Retry location permission"
          >
            <RefreshCw className="w-5 h-5 mr-2" />
            Try Again
          </Button>
        </motion.div>
      </div>

      <div className="px-8 pb-8 text-center">
        <p className="text-xs text-black/40 dark:text-white/40">
          Your location data is only shared with your team during active field visits and is protected by our privacy policy.
        </p>
      </div>
    </div>
  );
}
