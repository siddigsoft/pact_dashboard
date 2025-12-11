import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Info, 
  X,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss?: () => void;
}

interface MobileToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

function MobileToastItem({ toast, onDismiss }: MobileToastProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (toast.type === 'loading') return;

    const duration = toast.duration || 4000;
    const interval = 50;
    const decrement = (interval / duration) * 100;

    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          handleDismiss();
          return 0;
        }
        return prev - decrement;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [toast.duration, toast.type]);

  const handleDismiss = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => {
      onDismiss(toast.id);
      toast.onDismiss?.();
    }, 200);
  }, [toast, onDismiss]);

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (Math.abs(info.offset.x) > 100 || Math.abs(info.velocity.x) > 500) {
      hapticPresets.swipe();
      handleDismiss();
    }
  }, [handleDismiss]);

  const handleAction = useCallback(() => {
    hapticPresets.buttonPress();
    toast.action?.onClick();
    handleDismiss();
  }, [toast.action, handleDismiss]);

  const icons = {
    success: <CheckCircle2 className="h-5 w-5" />,
    error: <XCircle className="h-5 w-5" />,
    warning: <AlertCircle className="h-5 w-5" />,
    info: <Info className="h-5 w-5" />,
    loading: <Loader2 className="h-5 w-5 animate-spin" />,
  };

  const colors = {
    success: 'bg-black dark:bg-white text-white dark:text-black',
    error: 'bg-destructive text-white',
    warning: 'bg-black dark:bg-white text-white dark:text-black',
    info: 'bg-black dark:bg-white text-white dark:text-black',
    loading: 'bg-black dark:bg-white text-white dark:text-black',
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -50, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.5}
          onDragEnd={handleDragEnd}
          className={cn(
            "relative overflow-hidden rounded-2xl shadow-xl mx-4",
            colors[toast.type]
          )}
          data-testid={`toast-${toast.id}`}
        >
          <div className="flex items-start gap-3 p-4">
            <div className="flex-shrink-0 mt-0.5">
              {icons[toast.type]}
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{toast.title}</p>
              {toast.description && (
                <p className="text-sm opacity-80 mt-0.5">{toast.description}</p>
              )}
            </div>

            {toast.action && (
              <button
                onClick={handleAction}
                className="flex-shrink-0 text-sm font-semibold underline underline-offset-2 touch-manipulation"
                data-testid="toast-action"
              >
                {toast.action.label}
              </button>
            )}

            {toast.type !== 'loading' && (
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 rounded-full hover:bg-white/20 dark:hover:bg-black/20 touch-manipulation"
                data-testid="toast-dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {toast.type !== 'loading' && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 dark:bg-black/20">
              <motion.div
                className="h-full bg-white/40 dark:bg-black/40"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
  dismissAll: () => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  loading: (title: string, description?: string) => string;
  updateToast: (id: string, updates: Partial<Toast>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function MobileToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    
    if (toast.type === 'success') {
      hapticPresets.success();
    } else if (toast.type === 'error') {
      hapticPresets.error();
    } else if (toast.type === 'warning') {
      hapticPresets.warning();
    } else {
      hapticPresets.notification();
    }

    setToasts(prev => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const success = useCallback((title: string, description?: string) => {
    return showToast({ type: 'success', title, description });
  }, [showToast]);

  const error = useCallback((title: string, description?: string) => {
    return showToast({ type: 'error', title, description });
  }, [showToast]);

  const warning = useCallback((title: string, description?: string) => {
    return showToast({ type: 'warning', title, description });
  }, [showToast]);

  const info = useCallback((title: string, description?: string) => {
    return showToast({ type: 'info', title, description });
  }, [showToast]);

  const loading = useCallback((title: string, description?: string) => {
    return showToast({ type: 'loading', title, description });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{
      toasts,
      showToast,
      dismissToast,
      dismissAll,
      success,
      error,
      warning,
      info,
      loading,
      updateToast,
    }}>
      {children}
      <div 
        className="fixed top-0 left-0 right-0 z-[9999] space-y-2 pt-safe pointer-events-none"
        data-testid="toast-container"
      >
        <AnimatePresence>
          {toasts.map(toast => (
            <div key={toast.id} className="pointer-events-auto">
              <MobileToastItem toast={toast} onDismiss={dismissToast} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useMobileToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useMobileToast must be used within MobileToastProvider');
  }
  return context;
}

export function showMobileToast(type: ToastType, title: string, description?: string) {
  const event = new CustomEvent('mobile-toast', {
    detail: { type, title, description }
  });
  window.dispatchEvent(event);
}
