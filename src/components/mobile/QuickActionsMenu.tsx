import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface QuickAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'destructive';
  disabled?: boolean;
}

interface QuickActionsMenuProps {
  actions: QuickAction[];
  children: React.ReactNode;
  disabled?: boolean;
  longPressDelay?: number;
  className?: string;
}

export function QuickActionsMenu({
  actions,
  children,
  disabled = false,
  longPressDelay = 500,
  className,
}: QuickActionsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const longPressTimerRef = useRef<NodeJS.Timeout>();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;

    const touch = 'touches' in e ? e.touches[0] : e;
    const rect = containerRef.current?.getBoundingClientRect();
    
    if (rect) {
      setPosition({
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
      });
    }

    longPressTimerRef.current = setTimeout(() => {
      hapticPresets.warning();
      setIsOpen(true);
    }, longPressDelay);
  }, [disabled, longPressDelay]);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  }, []);

  const handleTouchMove = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
  }, []);

  const handleActionClick = useCallback((action: QuickAction) => {
    if (action.disabled) return;
    hapticPresets.buttonPress();
    action.onClick();
    setIsOpen(false);
  }, []);

  const handleClose = useCallback(() => {
    hapticPresets.selection();
    setIsOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      const handleClickOutside = () => setIsOpen(false);
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div 
      ref={containerRef}
      className={cn("relative touch-manipulation select-none", className)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!disabled) {
          hapticPresets.warning();
          setIsOpen(true);
        }
      }}
    >
      {children}

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9998]"
              onClick={handleClose}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute z-[9999] min-w-[200px] bg-white dark:bg-neutral-900 rounded-xl shadow-2xl overflow-hidden border border-black/10 dark:border-white/10"
              style={{
                left: position.x,
                top: position.y,
                transform: 'translate(-50%, -100%) translateY(-8px)',
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid="quick-actions-menu"
            >
              {actions.map((action, index) => (
                <button
                  key={action.id}
                  onClick={() => handleActionClick(action)}
                  disabled={action.disabled}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors",
                    "active:bg-black/5 dark:active:bg-white/5",
                    index !== actions.length - 1 && "border-b border-black/5 dark:border-white/5",
                    action.variant === 'destructive' 
                      ? "text-destructive" 
                      : "text-black dark:text-white",
                    action.disabled && "opacity-40 cursor-not-allowed"
                  )}
                  data-testid={`action-${action.id}`}
                >
                  {action.icon && (
                    <span className="flex-shrink-0">{action.icon}</span>
                  )}
                  <span className="text-sm font-medium">{action.label}</span>
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ContextMenuTriggerProps {
  onLongPress: () => void;
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export function ContextMenuTrigger({
  onLongPress,
  children,
  delay = 500,
  className,
}: ContextMenuTriggerProps) {
  const timerRef = useRef<NodeJS.Timeout>();
  const [isPressed, setIsPressed] = useState(false);

  const handleStart = useCallback(() => {
    setIsPressed(true);
    timerRef.current = setTimeout(() => {
      hapticPresets.warning();
      onLongPress();
    }, delay);
  }, [delay, onLongPress]);

  const handleEnd = useCallback(() => {
    setIsPressed(false);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div
      className={cn(
        "touch-manipulation select-none transition-transform",
        isPressed && "scale-[0.98]",
        className
      )}
      onTouchStart={handleStart}
      onTouchEnd={handleEnd}
      onTouchMove={handleEnd}
      onMouseDown={handleStart}
      onMouseUp={handleEnd}
      onMouseLeave={handleEnd}
      onContextMenu={(e) => {
        e.preventDefault();
        hapticPresets.warning();
        onLongPress();
      }}
    >
      {children}
    </div>
  );
}
