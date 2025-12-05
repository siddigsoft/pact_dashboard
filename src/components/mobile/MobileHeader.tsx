import { useCallback } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, X, MoreVertical, Share2, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MobileHeaderProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  showClose?: boolean;
  onBack?: () => void;
  onClose?: () => void;
  leftAction?: React.ReactNode;
  rightActions?: React.ReactNode;
  centerContent?: React.ReactNode;
  transparent?: boolean;
  elevated?: boolean;
  className?: string;
}

export function MobileHeader({
  title,
  subtitle,
  showBack = false,
  showClose = false,
  onBack,
  onClose,
  leftAction,
  rightActions,
  centerContent,
  transparent = false,
  elevated = false,
  className,
}: MobileHeaderProps) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    hapticPresets.buttonPress();
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);

  const handleClose = useCallback(() => {
    hapticPresets.buttonPress();
    onClose?.();
  }, [onClose]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 safe-area-top",
        !transparent && "bg-white dark:bg-black",
        elevated && "shadow-sm border-b border-black/5 dark:border-white/5",
        className
      )}
      data-testid="mobile-header"
    >
      <div className="flex items-center justify-between h-14 px-2">
        <div className="flex items-center gap-1 min-w-[60px]">
          {showBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBack}
              data-testid="button-back"
              aria-label="Go back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          {showClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              data-testid="button-close"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
          {leftAction}
        </div>

        <div className="flex-1 text-center px-2">
          {centerContent || (
            <>
              {title && (
                <h1 className="text-base font-semibold text-black dark:text-white truncate">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-xs text-black/60 dark:text-white/60 truncate">
                  {subtitle}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-1 min-w-[60px] justify-end">
          {rightActions}
        </div>
      </div>
    </header>
  );
}

interface LargeHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  rightActions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function LargeHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  rightActions,
  children,
  className,
}: LargeHeaderProps) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    hapticPresets.buttonPress();
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);

  return (
    <header className={cn("bg-white dark:bg-black safe-area-top", className)} data-testid="large-header">
      <div className="flex items-center justify-between h-14 px-2">
        {showBack ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        ) : (
          <div className="w-10" />
        )}
        
        <div className="flex items-center gap-1">
          {rightActions}
        </div>
      </div>

      <div className="px-4 pb-4">
        <h1 className="text-2xl font-bold text-black dark:text-white">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </header>
  );
}

interface SearchHeaderProps {
  placeholder?: string;
  value?: string;
  onSearch: (query: string) => void;
  onBack?: () => void;
  showBack?: boolean;
  autoFocus?: boolean;
  className?: string;
}

export function SearchHeader({
  placeholder = 'Search...',
  value = '',
  onSearch,
  onBack,
  showBack = true,
  autoFocus = true,
  className,
}: SearchHeaderProps) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    hapticPresets.buttonPress();
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);

  return (
    <header
      className={cn("sticky top-0 z-40 bg-white dark:bg-black safe-area-top", className)}
      data-testid="search-header"
    >
      <div className="flex items-center gap-2 h-14 px-2">
        {showBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}

        <div className="flex-1 flex items-center gap-2 h-10 px-3 bg-black/5 dark:bg-white/5 rounded-full">
          <Search className="h-4 w-4 text-black/40 dark:text-white/40" />
          <input
            type="text"
            value={value}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className="flex-1 bg-transparent text-sm text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40 outline-none"
            data-testid="input-search"
          />
          {value && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onSearch('')}
              data-testid="button-clear"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

interface ModalHeaderProps {
  title: string;
  onClose: () => void;
  rightAction?: React.ReactNode;
  className?: string;
}

export function ModalHeader({
  title,
  onClose,
  rightAction,
  className,
}: ModalHeaderProps) {
  return (
    <header 
      className={cn("flex items-center justify-between h-14 px-4 border-b border-black/5 dark:border-white/5", className)}
      data-testid="modal-header"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          hapticPresets.buttonPress();
          onClose();
        }}
        data-testid="button-close"
      >
        <X className="h-5 w-5" />
      </Button>

      <h2 className="text-base font-semibold text-black dark:text-white">
        {title}
      </h2>

      <div className="min-w-10 flex justify-end">
        {rightAction}
      </div>
    </header>
  );
}

interface DetailHeaderProps {
  title: string;
  subtitle?: string;
  image?: string;
  onBack?: () => void;
  rightActions?: React.ReactNode;
  className?: string;
}

export function DetailHeader({
  title,
  subtitle,
  image,
  onBack,
  rightActions,
  className,
}: DetailHeaderProps) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    hapticPresets.buttonPress();
    if (onBack) {
      onBack();
    } else {
      navigate(-1);
    }
  }, [onBack, navigate]);

  return (
    <div className={cn("relative", className)} data-testid="detail-header">
      {image && (
        <div className="relative h-48 w-full overflow-hidden">
          <img
            src={image}
            alt=""
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        </div>
      )}

      <div className={cn(
        "absolute top-0 left-0 right-0 flex items-center justify-between h-14 px-2 safe-area-top",
        !image && "relative bg-white dark:bg-black"
      )}>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleBack}
          className={image ? "text-white hover:bg-white/20" : ""}
          data-testid="button-back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex items-center gap-1">
          {rightActions}
        </div>
      </div>

      {image && (
        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && (
            <p className="text-sm opacity-80 mt-1">{subtitle}</p>
          )}
        </div>
      )}

      {!image && (
        <div className="px-4 pb-4">
          <h1 className="text-xl font-bold text-black dark:text-white">{title}</h1>
          {subtitle && (
            <p className="text-sm text-black/60 dark:text-white/60 mt-1">{subtitle}</p>
          )}
        </div>
      )}
    </div>
  );
}
