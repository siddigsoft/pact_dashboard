import { motion } from 'framer-motion';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface Step {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

interface MobileStepperProps {
  steps: Step[];
  currentStep: number;
  onStepChange?: (step: number) => void;
  onComplete?: () => void;
  variant?: 'dots' | 'progress' | 'numbered' | 'icons';
  showLabels?: boolean;
  className?: string;
}

export function MobileStepper({
  steps,
  currentStep,
  onStepChange,
  onComplete,
  variant = 'dots',
  showLabels = false,
  className,
}: MobileStepperProps) {
  const isComplete = currentStep >= steps.length;
  const progress = (currentStep / steps.length) * 100;

  const handleStepClick = (index: number) => {
    if (onStepChange && index <= currentStep) {
      hapticPresets.selection();
      onStepChange(index);
    }
  };

  if (variant === 'progress') {
    return (
      <div className={cn("space-y-2", className)} data-testid="stepper-progress">
        <div className="flex items-center justify-between text-sm">
          <span className="text-black/60 dark:text-white/60">
            Step {Math.min(currentStep + 1, steps.length)} of {steps.length}
          </span>
          <span className="font-medium text-black dark:text-white">
            {Math.round(progress)}%
          </span>
        </div>
        <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-black dark:bg-white rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        {showLabels && currentStep < steps.length && (
          <p className="text-sm font-medium text-black dark:text-white">
            {steps[currentStep].title}
          </p>
        )}
      </div>
    );
  }

  if (variant === 'numbered') {
    return (
      <div className={cn("flex items-center justify-between", className)} data-testid="stepper-numbered">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          
          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => handleStepClick(index)}
                disabled={index > currentStep}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all touch-manipulation",
                  isCompleted && "bg-black dark:bg-white text-white dark:text-black",
                  isCurrent && "bg-black dark:bg-white text-white dark:text-black ring-4 ring-black/20 dark:ring-white/20",
                  !isCompleted && !isCurrent && "bg-black/10 dark:bg-white/10 text-black/40 dark:text-white/40"
                )}
                data-testid={`step-${index}`}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : index + 1}
              </button>
              
              {index < steps.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-2 min-w-8",
                  index < currentStep 
                    ? "bg-black dark:bg-white" 
                    : "bg-black/10 dark:bg-white/10"
                )} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (variant === 'icons') {
    return (
      <div className={cn("space-y-4", className)} data-testid="stepper-icons">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            
            return (
              <div key={step.id} className="flex items-center flex-1">
                <button
                  onClick={() => handleStepClick(index)}
                  disabled={index > currentStep}
                  className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center transition-all touch-manipulation",
                    isCompleted && "bg-black dark:bg-white text-white dark:text-black",
                    isCurrent && "bg-black dark:bg-white text-white dark:text-black ring-4 ring-black/20 dark:ring-white/20",
                    !isCompleted && !isCurrent && "bg-black/5 dark:bg-white/5 text-black/40 dark:text-white/40"
                  )}
                  data-testid={`step-${index}`}
                >
                  {isCompleted ? <Check className="h-5 w-5" /> : step.icon || index + 1}
                </button>
                
                {index < steps.length - 1 && (
                  <div className={cn(
                    "flex-1 h-0.5 mx-2",
                    index < currentStep 
                      ? "bg-black dark:bg-white" 
                      : "bg-black/10 dark:bg-white/10"
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {showLabels && currentStep < steps.length && (
          <div className="text-center">
            <p className="text-sm font-semibold text-black dark:text-white">
              {steps[currentStep].title}
            </p>
            {steps[currentStep].description && (
              <p className="text-xs text-black/60 dark:text-white/60 mt-1">
                {steps[currentStep].description}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center gap-2", className)} data-testid="stepper-dots">
      {steps.map((_, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        
        return (
          <button
            key={index}
            onClick={() => handleStepClick(index)}
            disabled={index > currentStep}
            className={cn(
              "h-2 rounded-full transition-all touch-manipulation",
              isCurrent && "w-8 bg-black dark:bg-white",
              isCompleted && "w-2 bg-black dark:bg-white",
              !isCompleted && !isCurrent && "w-2 bg-black/20 dark:bg-white/20"
            )}
            aria-label={`Step ${index + 1}`}
            data-testid={`step-${index}`}
          />
        );
      })}
    </div>
  );
}

interface StepperNavigationProps {
  currentStep: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onComplete?: () => void;
  previousLabel?: string;
  nextLabel?: string;
  completeLabel?: string;
  isNextDisabled?: boolean;
  className?: string;
}

export function StepperNavigation({
  currentStep,
  totalSteps,
  onPrevious,
  onNext,
  onComplete,
  previousLabel = 'Back',
  nextLabel = 'Next',
  completeLabel = 'Complete',
  isNextDisabled = false,
  className,
}: StepperNavigationProps) {
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const handlePrevious = () => {
    hapticPresets.selection();
    onPrevious();
  };

  const handleNext = () => {
    hapticPresets.buttonPress();
    if (isLastStep && onComplete) {
      onComplete();
    } else {
      onNext();
    }
  };

  return (
    <div className={cn("flex gap-3", className)} data-testid="stepper-navigation">
      <Button
        variant="outline"
        onClick={handlePrevious}
        disabled={isFirstStep}
        className="flex-1 h-12 rounded-full"
        data-testid="button-previous"
      >
        <ChevronLeft className="h-5 w-5 mr-1" />
        {previousLabel}
      </Button>
      
      <Button
        onClick={handleNext}
        disabled={isNextDisabled}
        className="flex-1 h-12 rounded-full font-bold"
        data-testid={isLastStep ? "button-complete" : "button-next"}
      >
        {isLastStep ? completeLabel : nextLabel}
        {!isLastStep && <ChevronRight className="h-5 w-5 ml-1" />}
        {isLastStep && <Check className="h-5 w-5 ml-1" />}
      </Button>
    </div>
  );
}

interface FormStepperProps {
  steps: Array<{
    id: string;
    title: string;
    content: React.ReactNode;
    isValid?: boolean;
  }>;
  onComplete: () => void;
  className?: string;
}

export function FormStepper({ steps, onComplete, className }: FormStepperProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const currentStepData = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className={cn("space-y-6", className)} data-testid="form-stepper">
      <MobileStepper
        steps={steps.map(s => ({ id: s.id, title: s.title }))}
        currentStep={currentStep}
        variant="progress"
        showLabels
      />

      <div className="min-h-[200px]">
        {currentStepData.content}
      </div>

      <StepperNavigation
        currentStep={currentStep}
        totalSteps={steps.length}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onComplete={onComplete}
        isNextDisabled={currentStepData.isValid === false}
      />
    </div>
  );
}

import { useState } from 'react';
