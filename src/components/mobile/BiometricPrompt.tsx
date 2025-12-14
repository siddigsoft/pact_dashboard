import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, ScanFace, Shield, X, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useBiometric } from '@/hooks/use-biometric';

type BiometricType = 'fingerprint' | 'face' | 'iris' | 'unknown';
type BiometricStatus = 'idle' | 'scanning' | 'success' | 'error' | 'locked';

interface BiometricPromptProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onError?: (error: string) => void;
  onFallback?: () => void;
  title?: string;
  subtitle?: string;
  biometricType?: BiometricType;
  maxAttempts?: number;
  lockoutDuration?: number;
  showFallback?: boolean;
  fallbackLabel?: string;
  className?: string;
}

export function BiometricPrompt({
  isOpen,
  onClose,
  onSuccess,
  onError,
  onFallback,
  title = 'Authenticate',
  subtitle = 'Use biometrics to continue',
  biometricType = 'fingerprint',
  maxAttempts = 3,
  lockoutDuration = 30,
  showFallback = true,
  fallbackLabel = 'Use Password',
  className,
}: BiometricPromptProps) {
  const [status, setStatus] = useState<BiometricStatus>('idle');
  const [attempts, setAttempts] = useState(0);
  const [lockoutTime, setLockoutTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const biometric = useBiometric();
  const detectedType = biometric.status.biometricType !== 'none' 
    ? biometric.status.biometricType 
    : biometricType;

  const BiometricIcon = detectedType === 'face' ? ScanFace : Fingerprint;

  const startScan = useCallback(async () => {
    if (status === 'scanning' || status === 'locked') return;

    hapticPresets.selection();
    setStatus('scanning');
    setErrorMessage(null);

    try {
      if (!biometric.status.isAvailable) {
        throw new Error('Biometric authentication not available on this device');
      }

      const result = await biometric.authenticate({
        reason: 'Verify your identity to continue',
        title: title,
        subtitle: subtitle,
      });

      if (result.success) {
        hapticPresets.success();
        setStatus('success');
        setTimeout(() => {
          onSuccess();
        }, 500);
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } catch (error) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      
      if (newAttempts >= maxAttempts) {
        hapticPresets.error();
        setStatus('locked');
        setLockoutTime(lockoutDuration);
        setErrorMessage(`Too many attempts. Try again in ${lockoutDuration}s`);
      } else {
        hapticPresets.error();
        setStatus('error');
        setErrorMessage(error instanceof Error ? error.message : 'Authentication failed');
        onError?.(error instanceof Error ? error.message : 'Authentication failed');
      }
    }
  }, [status, attempts, maxAttempts, lockoutDuration, onSuccess, onError, biometric, title, subtitle]);

  useEffect(() => {
    if (lockoutTime > 0) {
      const timer = setInterval(() => {
        setLockoutTime(prev => {
          if (prev <= 1) {
            setStatus('idle');
            setAttempts(0);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [lockoutTime]);

  useEffect(() => {
    if (isOpen && status === 'idle') {
      const timer = setTimeout(startScan, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, status, startScan]);

  const handleClose = useCallback(() => {
    hapticPresets.buttonPress();
    setStatus('idle');
    setAttempts(0);
    setErrorMessage(null);
    onClose();
  }, [onClose]);

  const handleFallback = useCallback(() => {
    hapticPresets.buttonPress();
    onFallback?.();
    handleClose();
  }, [onFallback, handleClose]);

  const getStatusColor = () => {
    switch (status) {
      case 'scanning':
        return 'text-black dark:text-white';
      case 'success':
        return 'text-black dark:text-white';
      case 'error':
        return 'text-destructive';
      case 'locked':
        return 'text-destructive';
      default:
        return 'text-black/40 dark:text-white/40';
    }
  };

  const getStatusBg = () => {
    switch (status) {
      case 'scanning':
        return 'bg-black/10 dark:bg-white/10';
      case 'success':
        return 'bg-black dark:bg-white';
      case 'error':
        return 'bg-destructive/10';
      case 'locked':
        return 'bg-destructive/10';
      default:
        return 'bg-black/5 dark:bg-white/5';
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
        onClick={handleClose}
        data-testid="biometric-prompt"
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={cn(
            "w-full max-w-md bg-white dark:bg-neutral-900 rounded-t-3xl p-6 pb-10",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-center mb-2">
            <div className="w-10 h-1 rounded-full bg-black/20 dark:bg-white/20" />
          </div>

          <div className="flex flex-col items-center text-center">
            <motion.div
              className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center mb-6",
                getStatusBg()
              )}
              animate={status === 'scanning' ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 1, repeat: status === 'scanning' ? Infinity : 0 }}
            >
              {status === 'success' ? (
                <Check className="h-12 w-12 text-white dark:text-black" />
              ) : status === 'scanning' ? (
                <Loader2 className={cn("h-12 w-12 animate-spin", getStatusColor())} />
              ) : (
                <BiometricIcon className={cn("h-12 w-12", getStatusColor())} />
              )}
            </motion.div>

            <h2 className="text-xl font-semibold text-black dark:text-white mb-2">
              {status === 'success' ? 'Success!' : title}
            </h2>

            <p className="text-sm text-black/60 dark:text-white/60 mb-6">
              {status === 'locked' 
                ? `Try again in ${lockoutTime} seconds`
                : status === 'success'
                ? 'Authentication successful'
                : subtitle}
            </p>

            {errorMessage && status !== 'locked' && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive/10 text-destructive text-sm mb-6"
                data-testid="biometric-error"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{errorMessage}</span>
              </motion.div>
            )}

            {status !== 'success' && (
              <div className="flex flex-col gap-3 w-full">
                {status !== 'locked' && (
                  <Button
                    variant="default"
                    size="lg"
                    onClick={startScan}
                    disabled={status === 'scanning'}
                    className="w-full rounded-full bg-black dark:bg-white text-white dark:text-black"
                    data-testid="button-scan-biometric"
                  >
                    {status === 'scanning' ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <BiometricIcon className="h-5 w-5 mr-2" />
                        {biometricType === 'face' ? 'Scan Face' : 'Touch Sensor'}
                      </>
                    )}
                  </Button>
                )}

                {showFallback && (
                  <Button
                    variant="ghost"
                    size="lg"
                    onClick={handleFallback}
                    className="w-full rounded-full"
                    data-testid="button-fallback-auth"
                  >
                    {fallbackLabel}
                  </Button>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="w-full"
                  data-testid="button-cancel-biometric"
                >
                  Cancel
                </Button>
              </div>
            )}

            {attempts > 0 && attempts < maxAttempts && status !== 'locked' && (
              <p className="text-xs text-black/40 dark:text-white/40 mt-4">
                {maxAttempts - attempts} attempts remaining
              </p>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}


interface BiometricButtonProps {
  onSuccess: () => void;
  onError?: (error: string) => void;
  biometricType?: BiometricType;
  disabled?: boolean;
  className?: string;
}

export function BiometricButton({
  onSuccess,
  onError,
  biometricType = 'fingerprint',
  disabled = false,
  className,
}: BiometricButtonProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  const BiometricIcon = biometricType === 'face' ? ScanFace : Fingerprint;

  return (
    <>
      <Button
        variant="outline"
        size="lg"
        onClick={() => {
          hapticPresets.buttonPress();
          setShowPrompt(true);
        }}
        disabled={disabled}
        className={cn("rounded-full", className)}
        data-testid="button-biometric-login"
      >
        <BiometricIcon className="h-5 w-5 mr-2" />
        {biometricType === 'face' ? 'Face ID' : 'Fingerprint'}
      </Button>

      <BiometricPrompt
        isOpen={showPrompt}
        onClose={() => setShowPrompt(false)}
        onSuccess={onSuccess}
        onError={onError}
        biometricType={biometricType}
      />
    </>
  );
}

interface BiometricSetupProps {
  onComplete: () => void;
  onSkip?: () => void;
  className?: string;
}

export function BiometricSetup({
  onComplete,
  onSkip,
  className,
}: BiometricSetupProps) {
  const biometric = useBiometric();
  const [isEnrolling, setIsEnrolling] = useState(false);

  const handleEnroll = useCallback(async () => {
    hapticPresets.buttonPress();
    setIsEnrolling(true);

    try {
      const result = await biometric.authenticate({
        reason: 'Set up biometric authentication',
        title: 'Enable Biometrics',
      });
      
      if (result.success) {
        hapticPresets.success();
        onComplete();
      } else {
        hapticPresets.error();
      }
    } catch {
      hapticPresets.error();
    } finally {
      setIsEnrolling(false);
    }
  }, [onComplete, biometric]);

  return (
    <div className={cn("flex flex-col items-center text-center p-6", className)} data-testid="biometric-setup">
      <div className="w-24 h-24 rounded-full bg-black/5 dark:bg-white/5 flex items-center justify-center mb-6">
        <Shield className="h-12 w-12 text-black dark:text-white" />
      </div>

      <h2 className="text-xl font-semibold text-black dark:text-white mb-2">
        Enable Biometric Login
      </h2>

      <p className="text-sm text-black/60 dark:text-white/60 mb-8">
        Use your fingerprint or face to quickly and securely sign in to your account.
      </p>

      {!biometric.status.isAvailable && !biometric.isLoading && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-black/5 dark:bg-white/5 text-black/60 dark:text-white/60 text-sm mb-6 w-full">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{biometric.status.errorMessage || 'Biometric authentication is not available on this device.'}</span>
        </div>
      )}

      <div className="flex flex-col gap-3 w-full">
        <Button
          variant="default"
          size="lg"
          onClick={handleEnroll}
          disabled={!biometric.status.isAvailable || isEnrolling || biometric.isLoading}
          className="w-full rounded-full bg-black dark:bg-white text-white dark:text-black"
          data-testid="button-enable-biometric"
        >
          {isEnrolling ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Setting up...
            </>
          ) : (
            <>
              <Fingerprint className="h-5 w-5 mr-2" />
              Enable Biometrics
            </>
          )}
        </Button>

        {onSkip && (
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              hapticPresets.buttonPress();
              onSkip();
            }}
            className="w-full rounded-full"
            data-testid="button-skip-biometric"
          >
            Maybe Later
          </Button>
        )}
      </div>
    </div>
  );
}
