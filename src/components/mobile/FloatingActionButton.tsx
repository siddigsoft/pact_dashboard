import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, MapPin, Camera, FileText, Phone, MessageSquare, QrCode } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useNavigate } from 'react-router-dom';

export interface FABAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  color?: string;
  onClick?: () => void;
  href?: string;
}

interface FloatingActionButtonProps {
  actions?: FABAction[];
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  className?: string;
  mainIcon?: React.ReactNode;
  mainColor?: string;
  disabled?: boolean;
}

const defaultActions: FABAction[] = [
  { id: 'visit', icon: <MapPin className="h-5 w-5" />, label: 'New Visit', href: '/site-visits/new' },
  { id: 'camera', icon: <Camera className="h-5 w-5" />, label: 'Take Photo', color: 'bg-blue-500' },
  { id: 'report', icon: <FileText className="h-5 w-5" />, label: 'Quick Report', href: '/reports/new' },
  { id: 'scan', icon: <QrCode className="h-5 w-5" />, label: 'Scan QR', color: 'bg-purple-500' },
];

export function FloatingActionButton({
  actions = defaultActions,
  position = 'bottom-right',
  className,
  mainIcon = <Plus className="h-6 w-6" />,
  mainColor = 'bg-black dark:bg-white',
  disabled = false,
}: FloatingActionButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const positionClasses = {
    'bottom-right': 'right-4 bottom-20',
    'bottom-left': 'left-4 bottom-20',
    'bottom-center': 'left-1/2 -translate-x-1/2 bottom-20',
  };

  const handleToggle = useCallback(() => {
    hapticPresets.buttonPress();
    setIsOpen(prev => !prev);
  }, []);

  const handleActionClick = useCallback((action: FABAction) => {
    hapticPresets.success();
    setIsOpen(false);
    
    if (action.onClick) {
      action.onClick();
    } else if (action.href) {
      navigate(action.href);
    }
  }, [navigate]);

  const handleBackdropClick = useCallback(() => {
    hapticPresets.selection();
    setIsOpen(false);
  }, []);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[998]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleBackdropClick}
            data-testid="fab-backdrop"
          />
        )}
      </AnimatePresence>

      <div 
        className={cn(
          "fixed z-[999]",
          positionClasses[position],
          className
        )}
      >
        <AnimatePresence>
          {isOpen && (
            <div className="absolute bottom-16 right-0 flex flex-col-reverse gap-3 items-end mb-3">
              {actions.map((action, index) => (
                <motion.div
                  key={action.id}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  transition={{ 
                    delay: index * 0.05,
                    type: 'spring',
                    stiffness: 300,
                    damping: 20
                  }}
                >
                  <motion.span 
                    className="px-3 py-1.5 rounded-full bg-white dark:bg-neutral-800 text-sm font-medium text-black dark:text-white shadow-lg whitespace-nowrap"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 + 0.1 }}
                  >
                    {action.label}
                  </motion.span>
                  <button
                    onClick={() => handleActionClick(action)}
                    className={cn(
                      "w-12 h-12 rounded-full flex items-center justify-center shadow-lg",
                      "active:scale-95 transition-transform touch-manipulation",
                      action.color || "bg-white dark:bg-neutral-800",
                      action.color ? "text-white" : "text-black dark:text-white"
                    )}
                    data-testid={`fab-action-${action.id}`}
                  >
                    {action.icon}
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </AnimatePresence>

        <motion.button
          onClick={handleToggle}
          disabled={disabled}
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center shadow-xl",
            "active:scale-95 transition-all touch-manipulation",
            mainColor,
            isOpen ? "rotate-45" : "",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          data-testid="fab-main-button"
        >
          <span className={cn(
            isOpen ? "text-white dark:text-black" : "text-white dark:text-black"
          )}>
            {isOpen ? <X className="h-6 w-6" /> : mainIcon}
          </span>
        </motion.button>
      </div>
    </>
  );
}

export function MiniFAB({
  icon,
  onClick,
  className,
  color = 'bg-black dark:bg-white',
  label,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
  color?: string;
  label?: string;
}) {
  const handleClick = useCallback(() => {
    hapticPresets.buttonPress();
    onClick();
  }, [onClick]);

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-12 h-12 rounded-full flex items-center justify-center shadow-lg",
        "active:scale-95 transition-transform touch-manipulation",
        color,
        "text-white dark:text-black",
        className
      )}
      aria-label={label}
      data-testid="mini-fab"
    >
      {icon}
    </button>
  );
}

export default FloatingActionButton;
