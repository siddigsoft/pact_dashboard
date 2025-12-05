import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import PactLogo from '@/assets/logo.png';

interface MobileLoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  submessage?: string;
  progress?: number;
  showLogo?: boolean;
  variant?: 'fullscreen' | 'overlay' | 'inline';
  className?: string;
}

export function MobileLoadingOverlay({
  isVisible,
  message = 'Loading...',
  submessage,
  progress,
  showLogo = true,
  variant = 'fullscreen',
  className,
}: MobileLoadingOverlayProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.');
    }, 400);

    return () => clearInterval(interval);
  }, [isVisible]);

  const content = (
    <div className="flex flex-col items-center justify-center gap-6">
      {showLogo && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative"
        >
          <div className="w-20 h-20 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-2xl">
            <img 
              src={PactLogo} 
              alt="PACT" 
              className="w-12 h-12 object-contain"
            />
          </div>
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-black/20 dark:border-white/20"
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </motion.div>
      )}

      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-black dark:text-white" />
          <span className="text-base font-medium text-black dark:text-white">
            {message}{dots}
          </span>
        </div>
        
        {submessage && (
          <p className="text-sm text-black/60 dark:text-white/60 text-center max-w-xs">
            {submessage}
          </p>
        )}
      </div>

      {progress !== undefined && (
        <div className="w-48 space-y-2">
          <div className="h-1.5 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-black dark:bg-white rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-xs text-center text-black/60 dark:text-white/60">
            {Math.round(progress)}%
          </p>
        </div>
      )}
    </div>
  );

  if (variant === 'inline') {
    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn("py-12", className)}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={cn(
            "fixed inset-0 z-[9999] flex items-center justify-center",
            variant === 'fullscreen' 
              ? "bg-white dark:bg-black" 
              : "bg-black/50 dark:bg-black/70 backdrop-blur-sm",
            className
          )}
          data-testid="loading-overlay"
        >
          {content}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface MobileSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function MobileSpinner({ size = 'md', className }: MobileSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <Loader2 
      className={cn(
        "animate-spin text-black dark:text-white",
        sizeClasses[size],
        className
      )} 
    />
  );
}

interface PulsingDotProps {
  className?: string;
}

export function PulsingDot({ className }: PulsingDotProps) {
  return (
    <span className={cn("relative flex h-3 w-3", className)}>
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-black dark:bg-white opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-black dark:bg-white" />
    </span>
  );
}

interface LoadingButtonContentProps {
  isLoading: boolean;
  children: React.ReactNode;
  loadingText?: string;
}

export function LoadingButtonContent({ 
  isLoading, 
  children, 
  loadingText = 'Please wait...' 
}: LoadingButtonContentProps) {
  if (!isLoading) return <>{children}</>;

  return (
    <span className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin" />
      {loadingText}
    </span>
  );
}
