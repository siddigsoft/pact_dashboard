import { useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, PanInfo, useDragControls } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MobileBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  snapPoints?: ('min' | 'half' | 'full')[];
  defaultSnapPoint?: 'min' | 'half' | 'full';
  showHandle?: boolean;
  showCloseButton?: boolean;
  className?: string;
  contentClassName?: string;
  onSnapChange?: (snap: 'min' | 'half' | 'full') => void;
}

const snapHeights = {
  min: '25vh',
  half: '50vh',
  full: '90vh',
};

export function MobileBottomSheet({
  isOpen,
  onClose,
  children,
  title,
  subtitle,
  snapPoints = ['half', 'full'],
  defaultSnapPoint = 'half',
  showHandle = true,
  showCloseButton = true,
  className,
  contentClassName,
  onSnapChange,
}: MobileBottomSheetProps) {
  const dragControls = useDragControls();
  const sheetRef = useRef<HTMLDivElement>(null);
  
  const getValidSnapIndex = useCallback((snap: 'min' | 'half' | 'full', points: typeof snapPoints): number => {
    const index = points.indexOf(snap);
    return index >= 0 ? index : 0;
  }, []);
  
  const currentSnapIndex = useRef(getValidSnapIndex(defaultSnapPoint, snapPoints));

  const getSnapHeight = useCallback((snap: 'min' | 'half' | 'full' | undefined): string => {
    if (!snap || !snapHeights[snap]) {
      return snapHeights.half;
    }
    return snapHeights[snap];
  }, []);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    const velocity = info.velocity.y;
    const offset = info.offset.y;

    if (velocity > 500 || offset > 150) {
      if (currentSnapIndex.current > 0) {
        currentSnapIndex.current--;
        hapticPresets.swipe();
        onSnapChange?.(snapPoints[currentSnapIndex.current]);
      } else {
        hapticPresets.toggle();
        onClose();
      }
    } else if (velocity < -500 || offset < -150) {
      if (currentSnapIndex.current < snapPoints.length - 1) {
        currentSnapIndex.current++;
        hapticPresets.swipe();
        onSnapChange?.(snapPoints[currentSnapIndex.current]);
      }
    }
  }, [snapPoints, onClose, onSnapChange]);

  const handleClose = useCallback(() => {
    hapticPresets.buttonPress();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      currentSnapIndex.current = getValidSnapIndex(defaultSnapPoint, snapPoints);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, defaultSnapPoint, snapPoints, getValidSnapIndex]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[9998] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            data-testid="bottom-sheet-backdrop"
          />

          <motion.div
            ref={sheetRef}
            className={cn(
              "fixed left-0 right-0 bottom-0 z-[9999]",
              "bg-white dark:bg-black rounded-t-3xl",
              "shadow-[0_-10px_60px_-15px_rgba(0,0,0,0.3)]",
              className
            )}
            initial={{ y: '100%' }}
            animate={{ 
              y: 0,
              height: getSnapHeight(snapPoints[currentSnapIndex.current]),
            }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag="y"
            dragControls={dragControls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.1, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            data-testid="mobile-bottom-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? 'sheet-title' : undefined}
          >
            {showHandle && (
              <div 
                className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-manipulation"
                onPointerDown={(e) => dragControls.start(e)}
                role="slider"
                aria-label="Drag handle to resize sheet"
                aria-orientation="vertical"
                tabIndex={0}
                data-testid="sheet-drag-handle"
              >
                <div className="w-10 h-1 bg-black/20 dark:bg-white/20 rounded-full" />
              </div>
            )}

            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-5 pb-3">
                <div className="flex-1 min-w-0">
                  {title && (
                    <h2 
                      id="sheet-title" 
                      className="text-lg font-bold text-black dark:text-white truncate"
                    >
                      {title}
                    </h2>
                  )}
                  {subtitle && (
                    <p className="text-sm text-black/60 dark:text-white/60 truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
                
                {showCloseButton && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleClose}
                    className="flex-shrink-0"
                    data-testid="button-close-sheet"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                )}
              </div>
            )}

            <div 
              className={cn(
                "flex-1 overflow-y-auto overscroll-contain px-5 pb-safe",
                contentClassName
              )}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface MobileActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  actions: Array<{
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    variant?: 'default' | 'destructive';
    disabled?: boolean;
  }>;
  cancelLabel?: string;
}

export function MobileActionSheet({
  isOpen,
  onClose,
  title,
  actions,
  cancelLabel = 'Cancel',
}: MobileActionSheetProps) {
  const handleAction = useCallback((action: () => void) => {
    hapticPresets.buttonPress();
    action();
    onClose();
  }, [onClose]);

  const handleCancel = useCallback(() => {
    hapticPresets.buttonPress();
    onClose();
  }, [onClose]);

  return (
    <MobileBottomSheet
      isOpen={isOpen}
      onClose={onClose}
      snapPoints={['min']}
      defaultSnapPoint="min"
      showCloseButton={false}
    >
      <div className="space-y-2 pb-4">
        {title && (
          <p className="text-center text-sm text-black/60 dark:text-white/60 pb-2">
            {title}
          </p>
        )}

        <div className="space-y-1">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={() => handleAction(action.onClick)}
              disabled={action.disabled}
              className={cn(
                "w-full h-12 flex items-center justify-center gap-3 rounded-xl text-base font-medium",
                "touch-manipulation active:scale-[0.98] transition-all",
                action.variant === 'destructive'
                  ? "bg-destructive/10 text-destructive"
                  : "bg-black/5 dark:bg-white/5 text-black dark:text-white",
                action.disabled && "opacity-50 cursor-not-allowed"
              )}
              data-testid={`action-${action.label.toLowerCase().replace(/\s/g, '-')}`}
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>

        <button
          onClick={handleCancel}
          className="w-full h-12 flex items-center justify-center rounded-xl text-base font-bold bg-black dark:bg-white text-white dark:text-black touch-manipulation active:scale-[0.98] transition-all mt-2"
          data-testid="button-cancel"
        >
          {cancelLabel}
        </button>
      </div>
    </MobileBottomSheet>
  );
}
