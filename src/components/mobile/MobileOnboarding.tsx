import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  image?: string;
  icon?: React.ReactNode;
  backgroundColor?: string;
}

interface MobileOnboardingProps {
  steps: OnboardingStep[];
  onComplete: () => void;
  onSkip?: () => void;
  showSkip?: boolean;
  completeButtonText?: string;
  nextButtonText?: string;
  skipButtonText?: string;
}

export function MobileOnboarding({
  steps,
  onComplete,
  onSkip,
  showSkip = true,
  completeButtonText = 'Get Started',
  nextButtonText = 'Next',
  skipButtonText = 'Skip',
}: MobileOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const constraintsRef = useRef<HTMLDivElement>(null);

  const isLastStep = currentStep === steps.length - 1;
  const step = steps[currentStep];

  const handleNext = useCallback(() => {
    hapticPresets.buttonPress();
    if (isLastStep) {
      onComplete();
    } else {
      setDirection(1);
      setCurrentStep(prev => prev + 1);
    }
  }, [isLastStep, onComplete]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      hapticPresets.selection();
      setDirection(-1);
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    hapticPresets.buttonPress();
    onSkip?.();
    onComplete();
  }, [onSkip, onComplete]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    const threshold = 50;
    const velocity = 300;

    if (info.offset.x > threshold || info.velocity.x > velocity) {
      handlePrev();
    } else if (info.offset.x < -threshold || info.velocity.x < -velocity) {
      if (!isLastStep) {
        setDirection(1);
        setCurrentStep(prev => prev + 1);
        hapticPresets.swipe();
      }
    }
  }, [handlePrev, isLastStep]);

  const goToStep = useCallback((index: number) => {
    hapticPresets.selection();
    setDirection(index > currentStep ? 1 : -1);
    setCurrentStep(index);
  }, [currentStep]);

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? '100%' : '-100%',
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? '100%' : '-100%',
      opacity: 0,
    }),
  };

  return (
    <div 
      ref={constraintsRef}
      className="fixed inset-0 z-50 bg-white dark:bg-black flex flex-col"
      data-testid="mobile-onboarding"
    >
      <div className="safe-area-top" />

      {showSkip && !isLastStep && (
        <div className="absolute top-0 right-0 safe-area-top z-10">
          <Button
            variant="ghost"
            onClick={handleSkip}
            className="text-black/60 dark:text-white/60"
            data-testid="button-skip"
          >
            {skipButtonText}
          </Button>
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <AnimatePresence custom={direction} mode="wait">
          <motion.div
            key={step.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            drag="x"
            dragConstraints={constraintsRef}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            className="h-full flex flex-col items-center justify-center px-8 text-center"
          >
            {step.image ? (
              <div className="w-64 h-64 mb-8">
                <img
                  src={step.image}
                  alt={step.title}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : step.icon ? (
              <div 
                className={cn(
                  "w-32 h-32 rounded-full flex items-center justify-center mb-8",
                  step.backgroundColor || "bg-black/5 dark:bg-white/5"
                )}
              >
                <div className="text-black dark:text-white">
                  {step.icon}
                </div>
              </div>
            ) : null}

            <h2 className="text-2xl font-bold text-black dark:text-white mb-4">
              {step.title}
            </h2>
            
            <p className="text-base text-black/60 dark:text-white/60 max-w-sm">
              {step.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-8 pb-safe">
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((_, index) => (
            <button
              key={index}
              onClick={() => goToStep(index)}
              className={cn(
                "h-2 rounded-full transition-all duration-300",
                index === currentStep 
                  ? "w-8 bg-black dark:bg-white" 
                  : "w-2 bg-black/20 dark:bg-white/20"
              )}
              aria-label={`Go to step ${index + 1}`}
              data-testid={`step-indicator-${index}`}
            />
          ))}
        </div>

        <Button
          onClick={handleNext}
          className="w-full h-14 rounded-full font-bold text-base"
          data-testid={isLastStep ? "button-complete" : "button-next"}
        >
          {isLastStep ? (
            <>
              <Check className="h-5 w-5 mr-2" />
              {completeButtonText}
            </>
          ) : (
            <>
              {nextButtonText}
              <ChevronRight className="h-5 w-5 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export const defaultOnboardingSteps: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to PACT',
    description: 'Your comprehensive field operations platform for managing site visits, tracking, and coordination.',
  },
  {
    id: 'offline',
    title: 'Work Offline',
    description: 'Continue working even without internet. Your data syncs automatically when you reconnect.',
  },
  {
    id: 'location',
    title: 'Real-time Tracking',
    description: 'Share your location with your team and get directions to assigned sites.',
  },
  {
    id: 'ready',
    title: 'You are Ready',
    description: 'Start managing your field operations efficiently. Your first assignment awaits.',
  },
];
