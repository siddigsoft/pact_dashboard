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
  loaderStyle?: 'spinner' | 'dots' | 'uber' | 'pulse';
  className?: string;
}

export function MobileLoadingOverlay({
  isVisible,
  message = 'Loading...',
  submessage,
  progress,
  showLogo = true,
  variant = 'fullscreen',
  loaderStyle = 'uber',
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

  const renderLoader = () => {
    switch (loaderStyle) {
      case 'uber':
        return <UberDotsLoader />;
      case 'dots':
        return <BouncingDotsLoader />;
      case 'pulse':
        return <PulseRingLoader />;
      default:
        return <Loader2 className="h-8 w-8 animate-spin text-black dark:text-white" />;
    }
  };

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

      {renderLoader()}

      <div className="flex flex-col items-center gap-2">
        <span className="text-base font-medium text-black dark:text-white">
          {message}{dots}
        </span>
        
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

// Uber-style diamond dots loader - matches the image reference
export function UberDotsLoader({ 
  size = 'md',
  color = 'default' 
}: { 
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'primary' | 'white';
}) {
  // Size config with scaled offsets for proper diamond geometry
  const sizeConfig = {
    sm: { dot: 'w-2.5 h-2.5', container: 'w-12 h-12', offset: 8 },
    md: { dot: 'w-3 h-3', container: 'w-16 h-16', offset: 12 },
    lg: { dot: 'w-4 h-4', container: 'w-20 h-20', offset: 16 },
  };

  const colorConfig = {
    default: 'bg-black dark:bg-white',
    primary: 'bg-primary',
    white: 'bg-white',
  };

  const config = sizeConfig[size];
  const dotColor = colorConfig[color];

  // Diamond pattern: top, left, right, bottom
  const dotPositions = [
    { x: 0, y: -1 },   // top
    { x: -1, y: 0 },   // left  
    { x: 1, y: 0 },    // right
    { x: 0, y: 1 },    // bottom
  ];

  return (
    <div className={cn("relative flex items-center justify-center", config.container)}>
      {dotPositions.map((pos, index) => (
        <motion.div
          key={index}
          className={cn(
            "absolute rounded-full",
            config.dot,
            dotColor
          )}
          style={{
            left: '50%',
            top: '50%',
            marginLeft: `${pos.x * config.offset}px`,
            marginTop: `${pos.y * config.offset}px`,
            transform: 'translate(-50%, -50%)',
          }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: index * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// Alternative bouncing dots in a row
export function BouncingDotsLoader({ 
  size = 'md',
  color = 'default' 
}: { 
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'primary' | 'white';
}) {
  const sizeConfig = {
    sm: { dot: 'w-2 h-2', gap: 'gap-1' },
    md: { dot: 'w-3 h-3', gap: 'gap-1.5' },
    lg: { dot: 'w-4 h-4', gap: 'gap-2' },
  };

  const colorConfig = {
    default: 'bg-black dark:bg-white',
    primary: 'bg-primary',
    white: 'bg-white',
  };

  const config = sizeConfig[size];
  const dotColor = colorConfig[color];

  return (
    <div className={cn("flex items-center", config.gap)}>
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          className={cn("rounded-full", config.dot, dotColor)}
          animate={{
            y: [-4, 4, -4],
            scale: [1, 1.2, 1],
          }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: index * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// Pulse ring loader
export function PulseRingLoader({ 
  size = 'md',
  color = 'default' 
}: { 
  size?: 'sm' | 'md' | 'lg';
  color?: 'default' | 'primary';
}) {
  const sizeConfig = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const colorConfig = {
    default: 'border-black dark:border-white',
    primary: 'border-primary',
  };

  return (
    <div className={cn("relative", sizeConfig[size])}>
      <motion.div
        className={cn(
          "absolute inset-0 rounded-full border-2",
          colorConfig[color]
        )}
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.8, 0, 0.8],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          ease: "easeOut",
        }}
      />
      <motion.div
        className={cn(
          "absolute inset-0 rounded-full border-2",
          colorConfig[color]
        )}
        animate={{
          scale: [1, 1.5, 1],
          opacity: [0.8, 0, 0.8],
        }}
        transition={{
          duration: 1.2,
          repeat: Infinity,
          delay: 0.4,
          ease: "easeOut",
        }}
      />
      <div 
        className={cn(
          "absolute inset-2 rounded-full",
          color === 'default' ? 'bg-black dark:bg-white' : 'bg-primary'
        )} 
      />
    </div>
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
      <BouncingDotsLoader size="sm" />
      {loadingText}
    </span>
  );
}

// Page transition loader - minimalist full screen
export function PageTransitionLoader({ message }: { message?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white dark:bg-black"
      data-testid="page-transition-loader"
    >
      <div className="flex flex-col items-center gap-6">
        <UberDotsLoader size="lg" />
        {message && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-sm font-medium text-black/70 dark:text-white/70"
          >
            {message}
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

// Inline skeleton loader for cards/lists
export function InlineDotsLoader({ 
  className,
  size = 'sm'
}: { 
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  return (
    <div className={cn("flex items-center justify-center py-8", className)}>
      <UberDotsLoader size={size} />
    </div>
  );
}

// Button loading state with dots
export function ButtonDotsLoader() {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          className="w-1.5 h-1.5 rounded-full bg-current"
          animate={{
            opacity: [0.3, 1, 0.3],
          }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: index * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}
