import { forwardRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MobileInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const MobileInput = forwardRef<HTMLInputElement, MobileInputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
    
    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <Label 
            htmlFor={inputId} 
            className="text-sm font-medium"
          >
            {label}
          </Label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {leftIcon}
            </div>
          )}
          <Input
            ref={ref}
            id={inputId}
            className={cn(
              'min-h-[48px] text-base px-4 py-3',
              'touch-manipulation',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error && 'border-destructive focus-visible:ring-destructive',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    );
  }
);

MobileInput.displayName = 'MobileInput';

interface MobilePasswordInputProps extends Omit<MobileInputProps, 'type'> {
  showStrength?: boolean;
}

export const MobilePasswordInput = forwardRef<HTMLInputElement, MobilePasswordInputProps>(
  ({ className, showStrength, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    
    return (
      <MobileInput
        ref={ref}
        type={showPassword ? 'text' : 'password'}
        rightIcon={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 p-0"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </Button>
        }
        className={className}
        {...props}
      />
    );
  }
);

MobilePasswordInput.displayName = 'MobilePasswordInput';

interface MobileTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  maxLength?: number;
  showCount?: boolean;
}

export const MobileTextarea = forwardRef<HTMLTextAreaElement, MobileTextareaProps>(
  ({ className, label, error, helperText, maxLength, showCount, value, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, '-');
    const charCount = typeof value === 'string' ? value.length : 0;
    
    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <Label 
            htmlFor={inputId} 
            className="text-sm font-medium"
          >
            {label}
          </Label>
        )}
        <Textarea
          ref={ref}
          id={inputId}
          value={value}
          maxLength={maxLength}
          className={cn(
            'min-h-[120px] text-base px-4 py-3',
            'touch-manipulation resize-none',
            error && 'border-destructive focus-visible:ring-destructive',
            className
          )}
          {...props}
        />
        <div className="flex justify-between items-center">
          {error ? (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          ) : helperText ? (
            <p className="text-xs text-muted-foreground">{helperText}</p>
          ) : (
            <span />
          )}
          {showCount && maxLength && (
            <p className={cn(
              'text-xs',
              charCount > maxLength * 0.9 ? 'text-amber-500' : 'text-muted-foreground'
            )}>
              {charCount}/{maxLength}
            </p>
          )}
        </div>
      </div>
    );
  }
);

MobileTextarea.displayName = 'MobileTextarea';

interface MobileNumericInputProps extends Omit<MobileInputProps, 'type'> {
  allowDecimals?: boolean;
  min?: number;
  max?: number;
}

export const MobileNumericInput = forwardRef<HTMLInputElement, MobileNumericInputProps>(
  ({ className, allowDecimals = false, ...props }, ref) => {
    return (
      <MobileInput
        ref={ref}
        type="text"
        inputMode={allowDecimals ? 'decimal' : 'numeric'}
        pattern={allowDecimals ? '[0-9]*[.]?[0-9]*' : '[0-9]*'}
        className={className}
        {...props}
      />
    );
  }
);

MobileNumericInput.displayName = 'MobileNumericInput';

interface MobileFormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}

export function MobileFormSection({ 
  title, 
  description, 
  children, 
  className,
  sticky = false 
}: MobileFormSectionProps) {
  return (
    <div className={cn('space-y-4', className)}>
      <div className={cn(
        'py-2',
        sticky && 'sticky top-0 bg-background/95 backdrop-blur-sm z-10 border-b'
      )}>
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

interface MobileFormProgressProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
  className?: string;
}

export function MobileFormProgress({ 
  currentStep, 
  totalSteps, 
  stepLabels,
  className 
}: MobileFormProgressProps) {
  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-sm text-muted-foreground">
          {Math.round((currentStep / totalSteps) * 100)}%
        </span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300 rounded-full"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>
      {stepLabels && stepLabels[currentStep - 1] && (
        <p className="text-xs text-muted-foreground mt-1.5">
          {stepLabels[currentStep - 1]}
        </p>
      )}
    </div>
  );
}

interface MobileSuccessStateProps {
  title: string;
  message?: string;
  onAction?: () => void;
  actionLabel?: string;
  className?: string;
}

export function MobileSuccessState({
  title,
  message,
  onAction,
  actionLabel = 'Continue',
  className
}: MobileSuccessStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center p-6 space-y-4',
      className
    )}>
      <div className="h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
        <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h2 className="text-xl font-semibold">{title}</h2>
      {message && (
        <p className="text-sm text-muted-foreground max-w-xs">{message}</p>
      )}
      {onAction && (
        <Button 
          onClick={onAction}
          className="min-h-[44px] min-w-[120px] mt-4"
          data-testid="button-success-action"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
