import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Settings, RefreshCw, AlertTriangle, Shield, ChevronRight } from 'lucide-react';
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

  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const handleOpenSettings = useCallback(async () => {
    hapticPresets.buttonPress();
    await openAppSettings();
  }, [openAppSettings]);

  const handleRetry = useCallback(async () => {
    hapticPresets.buttonPress();
    setIsRetrying(true);
    setRetryCount(prev => prev + 1);
    
    try {
      const result = await requestPermission('location');
      console.log('[LocationBlocker] Permission result:', result.status);
      
      if (result.status === 'granted') {
        hapticPresets.success();
        await checkAllPermissions();
        onRetry?.();
      } else {
        hapticPresets.error();
      }
    } catch (error) {
      console.error('[LocationBlocker] Error:', error);
      hapticPresets.error();
    } finally {
      setIsRetrying(false);
    }
  }, [requestPermission, checkAllPermissions, onRetry]);

  const handleCheckAgain = useCallback(async () => {
    hapticPresets.buttonPress();
    setIsRetrying(true);
    
    try {
      const permissions = await checkAllPermissions();
      
      if (permissions.location === 'granted') {
        hapticPresets.success();
        onRetry?.();
      } else {
        hapticPresets.error();
        setRetryCount(prev => prev + 1);
      }
    } finally {
      setIsRetrying(false);
    }
  }, [checkAllPermissions, onRetry]);

  return (
    <div className="fixed inset-0 bg-white dark:bg-black z-[100] flex flex-col safe-area-top safe-area-bottom overflow-y-auto">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20, duration: 0.5 }}
          className="flex flex-col items-center text-center w-full max-w-xs"
        >
          <motion.div 
            className="relative mb-6"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div className="w-24 h-24 rounded-full bg-black dark:bg-white flex items-center justify-center">
              <MapPin className="w-12 h-12 text-white dark:text-black" />
            </div>
            
            <motion.div
              className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-black dark:bg-white border-3 border-white dark:border-black flex items-center justify-center"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <AlertTriangle className="w-4 h-4 text-white dark:text-black" />
            </motion.div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="w-full"
          >
            <h1 
              className="text-xl font-bold text-black dark:text-white mb-2"
              data-testid="text-location-blocked-title"
            >
              Location Access Required
            </h1>

            <p 
              className="text-sm text-black/60 dark:text-white/60 leading-relaxed mb-4"
              data-testid="text-location-blocked-description"
            >
              PACT needs continuous location access to track field visits and verify your activities.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="bg-black/5 dark:bg-white/5 rounded-xl p-4 mb-4 w-full"
          >
            <h3 className="font-semibold text-sm text-black dark:text-white mb-2 text-left">
              How to enable:
            </h3>
            <ol className="text-xs text-black/70 dark:text-white/70 text-left space-y-2">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center flex-shrink-0">1</span>
                <span>Tap <strong>"Open Settings"</strong> below</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center flex-shrink-0">2</span>
                <span>Select <strong>"Permissions"</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center flex-shrink-0">3</span>
                <span>Tap <strong>"Location"</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-black dark:bg-white text-white dark:text-black text-xs font-bold flex items-center justify-center flex-shrink-0">4</span>
                <span>Choose <strong>"Allow all the time"</strong></span>
              </li>
            </ol>
          </motion.div>

          {retryCount >= 2 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4 px-3 py-2 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg w-full"
            >
              <p className="text-xs text-black/70 dark:text-white/70">
                If the permission dialog doesn't appear, please use the Settings button to enable it manually.
              </p>
            </motion.div>
          )}
        </motion.div>
      </div>

      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="px-4 pb-6 flex flex-col gap-2"
      >
        <Button
          size="lg"
          onClick={handleOpenSettings}
          className="w-full h-12 rounded-full !bg-black dark:!bg-white !text-white dark:!text-black font-semibold text-base gap-2 hover:!bg-black/90 dark:hover:!bg-white/90"
          data-testid="button-open-settings"
          aria-label="Open device settings"
        >
          <Settings className="w-4 h-4" />
          Open Settings
          <ChevronRight className="w-4 h-4 ml-auto" />
        </Button>

        <Button
          size="lg"
          variant="outline"
          onClick={handleCheckAgain}
          disabled={isRetrying}
          className="w-full h-12 rounded-full !border-2 !border-black dark:!border-white !text-black dark:!text-white font-semibold text-base gap-2 !bg-transparent hover:!bg-black/5 dark:hover:!bg-white/5"
          data-testid="button-check-location"
          aria-label="Check if location is enabled"
        >
          {isRetrying ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            >
              <RefreshCw className="w-4 h-4" />
            </motion.div>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              I've Enabled It
            </>
          )}
        </Button>

        <Button
          variant="ghost"
          size="default"
          onClick={handleRetry}
          disabled={isRetrying}
          className="w-full rounded-full text-black/60 dark:text-white/60 font-medium text-sm"
          data-testid="button-retry-location"
          aria-label="Try requesting location again"
        >
          Request Permission Again
        </Button>

        <div className="flex items-center justify-center gap-2 mt-1">
          <Shield className="w-3 h-3 text-black/40 dark:text-white/40 flex-shrink-0" />
          <p className="text-[10px] text-black/40 dark:text-white/40 text-center">
            Your location is encrypted and only shared during active visits
          </p>
        </div>
      </motion.div>
    </div>
  );
}
