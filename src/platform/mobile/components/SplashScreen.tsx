import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PactLogo from '@/assets/logo.png';
import { cn } from '@/lib/utils';

interface SplashScreenProps {
  onComplete?: () => void;
  duration?: number;
  className?: string;
}

export function SplashScreen({ 
  onComplete, 
  duration = 2500,
  className 
}: SplashScreenProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [phase, setPhase] = useState<'logo' | 'text' | 'exit'>('logo');

  useEffect(() => {
    const logoTimer = setTimeout(() => setPhase('text'), 800);
    const exitTimer = setTimeout(() => setPhase('exit'), duration - 500);
    const completeTimer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, duration);

    return () => {
      clearTimeout(logoTimer);
      clearTimeout(exitTimer);
      clearTimeout(completeTimer);
    };
  }, [duration, onComplete]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className={cn(
            "fixed inset-0 z-[99999] flex flex-col items-center justify-center bg-black",
            className
          )}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          data-testid="splash-screen"
        >
          <div className="relative flex flex-col items-center">
            <motion.div
              className="relative"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ 
                type: 'spring', 
                stiffness: 200, 
                damping: 15,
                delay: 0.2 
              }}
            >
              <motion.div 
                className="w-28 h-28 rounded-full bg-white flex items-center justify-center shadow-2xl"
                animate={phase === 'exit' ? { scale: 0.8, opacity: 0 } : {}}
                transition={{ duration: 0.3 }}
              >
                <img 
                  src={PactLogo} 
                  alt="PACT" 
                  className="w-16 h-16 object-contain"
                />
              </motion.div>
              
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-white/30"
                initial={{ scale: 1, opacity: 0 }}
                animate={{ 
                  scale: [1, 1.5, 2],
                  opacity: [0, 0.5, 0]
                }}
                transition={{ 
                  duration: 1.5, 
                  repeat: Infinity,
                  delay: 0.5
                }}
              />
              
              <motion.div
                className="absolute inset-0 rounded-full border border-white/20"
                initial={{ scale: 1, opacity: 0 }}
                animate={{ 
                  scale: [1, 2, 3],
                  opacity: [0, 0.3, 0]
                }}
                transition={{ 
                  duration: 2, 
                  repeat: Infinity,
                  delay: 0.8
                }}
              />
            </motion.div>

            <AnimatePresence>
              {phase !== 'logo' && (
                <motion.div
                  className="mt-8 text-center"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.4 }}
                >
                  <motion.h1 
                    className="text-4xl font-bold text-white tracking-tight"
                    initial={{ opacity: 0, letterSpacing: '0.2em' }}
                    animate={{ opacity: 1, letterSpacing: '0.05em' }}
                    transition={{ duration: 0.6 }}
                  >
                    PACT
                  </motion.h1>
                  <motion.p 
                    className="text-white/50 text-sm mt-2 font-medium"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    Field Operations Platform
                  </motion.p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <motion.div 
            className="absolute bottom-12 flex flex-col items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-white/40"
                  animate={{ 
                    opacity: [0.4, 1, 0.4],
                    scale: [1, 1.2, 1]
                  }}
                  transition={{ 
                    duration: 0.8, 
                    repeat: Infinity,
                    delay: i * 0.2
                  }}
                />
              ))}
            </div>
            <p className="text-white/30 text-xs">Loading...</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function useSplashScreen(duration = 2500) {
  const [showSplash, setShowSplash] = useState(true);
  const [isFirstLoad, setIsFirstLoad] = useState(() => {
    const hasLoaded = sessionStorage.getItem('pact_splash_shown');
    return !hasLoaded;
  });

  const handleComplete = () => {
    setShowSplash(false);
    sessionStorage.setItem('pact_splash_shown', 'true');
  };

  return {
    showSplash: showSplash && isFirstLoad,
    SplashComponent: () => 
      showSplash && isFirstLoad ? (
        <SplashScreen duration={duration} onComplete={handleComplete} />
      ) : null
  };
}

export default SplashScreen;
