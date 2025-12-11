import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronUp, 
  ChevronDown, 
  X, 
  Check,
  Keyboard
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MobileInputAccessoryProps {
  onDone?: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  showNavigation?: boolean;
  hasPrevious?: boolean;
  hasNext?: boolean;
  rightContent?: React.ReactNode;
  className?: string;
}

export function MobileInputAccessory({
  onDone,
  onPrevious,
  onNext,
  showNavigation = true,
  hasPrevious = false,
  hasNext = false,
  rightContent,
  className,
}: MobileInputAccessoryProps) {
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const handleFocus = () => setIsKeyboardVisible(true);
    const handleBlur = () => {
      setTimeout(() => setIsKeyboardVisible(false), 100);
    };

    document.addEventListener('focusin', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || 
          (e.target as HTMLElement).tagName === 'TEXTAREA') {
        handleFocus();
      }
    });
    
    document.addEventListener('focusout', handleBlur);

    return () => {
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
    };
  }, []);

  const handleDone = useCallback(() => {
    hapticPresets.buttonPress();
    document.activeElement instanceof HTMLElement && document.activeElement.blur();
    onDone?.();
  }, [onDone]);

  const handlePrevious = useCallback(() => {
    if (hasPrevious) {
      hapticPresets.selection();
      onPrevious?.();
    }
  }, [hasPrevious, onPrevious]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      hapticPresets.selection();
      onNext?.();
    }
  }, [hasNext, onNext]);

  return (
    <AnimatePresence>
      {isKeyboardVisible && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          className={cn(
            "fixed left-0 right-0 bottom-0 z-[9998] bg-gray-100 dark:bg-neutral-800 border-t border-gray-200 dark:border-neutral-700",
            className
          )}
          data-testid="input-accessory"
        >
          <div className="flex items-center justify-between h-11 px-2">
            {showNavigation && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handlePrevious}
                  disabled={!hasPrevious}
                  className="h-9 w-9"
                  data-testid="button-prev-input"
                >
                  <ChevronUp className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleNext}
                  disabled={!hasNext}
                  className="h-9 w-9"
                  data-testid="button-next-input"
                >
                  <ChevronDown className="h-5 w-5" />
                </Button>
              </div>
            )}

            <div className="flex-1 flex justify-end items-center gap-2">
              {rightContent}
              <Button
                variant="ghost"
                onClick={handleDone}
                className="font-semibold text-black dark:text-white"
                data-testid="button-done-input"
              >
                Done
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface NumericKeypadProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  onComplete?: (value: string) => void;
  showDecimal?: boolean;
  className?: string;
}

export function NumericKeypad({
  value,
  onChange,
  maxLength = 10,
  onComplete,
  showDecimal = false,
  className,
}: NumericKeypadProps) {
  const handlePress = useCallback((digit: string) => {
    hapticPresets.buttonPress();
    if (digit === 'backspace') {
      onChange(value.slice(0, -1));
    } else if (digit === 'clear') {
      onChange('');
    } else if (digit === 'done') {
      onComplete?.(value);
    } else if (value.length < maxLength) {
      if (digit === '.' && value.includes('.')) return;
      onChange(value + digit);
    }
  }, [value, onChange, maxLength, onComplete]);

  const keys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    [showDecimal ? '.' : '', '0', 'backspace'],
  ];

  return (
    <div className={cn("grid grid-cols-3 gap-2 p-4 bg-gray-100 dark:bg-neutral-800", className)} data-testid="numeric-keypad">
      {keys.flat().map((key, index) => {
        if (key === '') return <div key={index} />;
        
        return (
          <button
            key={index}
            onClick={() => handlePress(key)}
            className={cn(
              "h-14 rounded-xl font-semibold text-xl transition-all touch-manipulation active:scale-95",
              key === 'backspace' 
                ? "bg-black/10 dark:bg-white/10 text-black dark:text-white"
                : "bg-white dark:bg-neutral-700 text-black dark:text-white shadow-sm"
            )}
            data-testid={`key-${key}`}
          >
            {key === 'backspace' ? <X className="h-6 w-6 mx-auto" /> : key}
          </button>
        );
      })}
    </div>
  );
}

interface PinInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  masked?: boolean;
  error?: boolean;
  className?: string;
}

export function PinInput({
  length = 4,
  value,
  onChange,
  onComplete,
  masked = true,
  error = false,
  className,
}: PinInputProps) {
  useEffect(() => {
    if (value.length === length && onComplete) {
      onComplete(value);
    }
  }, [value, length, onComplete]);

  return (
    <div className={cn("space-y-6", className)} data-testid="pin-input">
      <div className="flex justify-center gap-4">
        {Array.from({ length }).map((_, index) => {
          const isFilled = index < value.length;
          const isCurrent = index === value.length;
          
          return (
            <motion.div
              key={index}
              animate={error ? { x: [-5, 5, -5, 5, 0] } : {}}
              transition={{ duration: 0.3 }}
              className={cn(
                "w-14 h-14 rounded-xl border-2 flex items-center justify-center text-2xl font-bold transition-all",
                isFilled && !error && "bg-black dark:bg-white border-black dark:border-white",
                isCurrent && "border-black dark:border-white",
                !isFilled && !isCurrent && "border-black/20 dark:border-white/20",
                error && "border-destructive bg-destructive/10"
              )}
              data-testid={`pin-dot-${index}`}
            >
              {isFilled && (
                <span className={cn(
                  error ? "text-destructive" : "text-white dark:text-black"
                )}>
                  {masked ? '•' : value[index]}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      <NumericKeypad
        value={value}
        onChange={onChange}
        maxLength={length}
        onComplete={onComplete}
      />
    </div>
  );
}

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string;
  autoFocus?: boolean;
  className?: string;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  autoFocus = true,
  className,
}: OTPInputProps) {
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      const inputs = document.querySelectorAll('[data-otp-input]');
      (inputs[index - 1] as HTMLInputElement)?.focus();
    }
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const newValue = e.target.value.slice(-1);
    if (!/^\d*$/.test(newValue)) return;

    hapticPresets.selection();
    const newOtp = value.split('');
    newOtp[index] = newValue;
    const joined = newOtp.join('');
    onChange(joined);

    if (newValue && index < length - 1) {
      const inputs = document.querySelectorAll('[data-otp-input]');
      (inputs[index + 1] as HTMLInputElement)?.focus();
    }

    if (joined.length === length) {
      onComplete?.(joined);
    }
  }, [value, length, onChange, onComplete]);

  return (
    <div className={cn("space-y-3", className)} data-testid="otp-input">
      <div className="flex justify-center gap-3">
        {Array.from({ length }).map((_, index) => (
          <input
            key={index}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={value[index] || ''}
            onChange={(e) => handleChange(e, index)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            autoFocus={autoFocus && index === 0}
            data-otp-input
            className={cn(
              "w-12 h-14 text-center text-xl font-bold rounded-xl border-2 bg-transparent transition-all",
              "focus:border-black dark:focus:border-white focus:outline-none",
              error 
                ? "border-destructive" 
                : value[index] 
                  ? "border-black dark:border-white" 
                  : "border-black/20 dark:border-white/20"
            )}
            data-testid={`otp-${index}`}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
