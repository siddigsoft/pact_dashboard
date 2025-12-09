import { forwardRef } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface MobileActionButtonProps extends ButtonProps {
  isLoading?: boolean;
  icon?: React.ReactNode;
  label: string;
  fullWidth?: boolean;
}


const MobileActionButton = forwardRef<HTMLButtonElement, MobileActionButtonProps>(
  ({ className, isLoading, icon, label, fullWidth = false, disabled, children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        className={cn(
          'min-h-[44px] min-w-[44px] px-4 py-3 text-base font-medium',
          'touch-manipulation select-none',
          'transition-all duration-150 active:scale-[0.98]',
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin mr-2" data-testid="icon-loading" />
        ) : icon ? (
          <span className="mr-2">{icon}</span>
        ) : null}
        {children || label}
      </Button>
    );
  }
);

MobileActionButton.displayName = 'MobileActionButton';

interface MobileIconButtonProps extends ButtonProps {
  isLoading?: boolean;
  icon: React.ReactNode;
  'aria-label': string;
}

const MobileIconButton = forwardRef<HTMLButtonElement, MobileIconButtonProps>(
  ({ className, isLoading, icon, disabled, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        size="icon"
        className={cn(
          'min-h-[44px] min-w-[44px] h-11 w-11',
          'touch-manipulation select-none',
          'transition-all duration-150 active:scale-[0.95]',
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" data-testid="icon-loading" />
        ) : (
          icon
        )}
      </Button>
    );
  }
);

MobileIconButton.displayName = 'MobileIconButton';

interface MobileFABProps extends ButtonProps {
  icon: React.ReactNode;
  position?: 'bottom-right' | 'bottom-center' | 'bottom-left';
  'aria-label': string;
}

const MobileFAB = forwardRef<HTMLButtonElement, MobileFABProps>(
  ({ className, icon, position = 'bottom-right', ...props }, ref) => {
    const positionClasses = {
      'bottom-right': 'right-4 bottom-20',
      'bottom-center': 'left-1/2 -translate-x-1/2 bottom-20',
      'bottom-left': 'left-4 bottom-20',
    };

    return (
      <Button
        ref={ref}
        size="icon"
        className={cn(
          'fixed z-40 h-12 w-12 rounded-full shadow-lg',
          'touch-manipulation select-none',
          'transition-all duration-200 active:scale-[0.95]',
          'bg-black hover:bg-black/90 dark:bg-white dark:hover:bg-white/90 text-white dark:text-black',
          positionClasses[position],
          'pb-safe',
          className
        )}
        {...props}
      >
        {icon}
      </Button>
    );
  }
);

MobileFAB.displayName = 'MobileFAB';

export { MobileActionButton, MobileIconButton, MobileFAB };
