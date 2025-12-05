import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, LogOut, AlertCircle, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import { useCallback, useEffect } from 'react';

type DialogVariant = 'default' | 'destructive' | 'warning' | 'info';

interface MobileConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  icon?: React.ReactNode;
  isLoading?: boolean;
}

const variantConfig: Record<DialogVariant, { icon: React.ReactNode; iconBg: string; iconColor: string }> = {
  default: {
    icon: <HelpCircle className="h-6 w-6" />,
    iconBg: 'bg-black/10 dark:bg-white/10',
    iconColor: 'text-black dark:text-white',
  },
  destructive: {
    icon: <Trash2 className="h-6 w-6" />,
    iconBg: 'bg-destructive/10',
    iconColor: 'text-destructive',
  },
  warning: {
    icon: <AlertTriangle className="h-6 w-6" />,
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  info: {
    icon: <AlertCircle className="h-6 w-6" />,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
};

export function MobileConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  icon,
  isLoading = false,
}: MobileConfirmDialogProps) {
  const config = variantConfig[variant];

  const handleConfirm = useCallback(async () => {
    hapticPresets.buttonPress();
    await onConfirm();
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    hapticPresets.buttonPress();
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      hapticPresets.warning();
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, isLoading, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-[9998] bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isLoading ? undefined : handleCancel}
            data-testid="confirm-dialog-backdrop"
          />

          <motion.div
            className="fixed left-4 right-4 bottom-8 z-[9999] safe-area-bottom"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div 
              className="bg-white dark:bg-neutral-900 rounded-3xl overflow-hidden shadow-2xl"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="dialog-title"
              aria-describedby={description ? 'dialog-description' : undefined}
              data-testid="mobile-confirm-dialog"
            >
              <div className="p-6 space-y-4">
                <div className="flex flex-col items-center text-center gap-4">
                  <div className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center",
                    config.iconBg
                  )}>
                    <div className={config.iconColor}>
                      {icon || config.icon}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h2 
                      id="dialog-title" 
                      className="text-lg font-bold text-black dark:text-white"
                    >
                      {title}
                    </h2>
                    {description && (
                      <p 
                        id="dialog-description" 
                        className="text-sm text-black/60 dark:text-white/60"
                      >
                        {description}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <Button
                    onClick={handleConfirm}
                    disabled={isLoading}
                    className={cn(
                      "w-full h-12 rounded-full font-bold text-sm touch-manipulation active:scale-[0.98] transition-transform",
                      variant === 'destructive' && "bg-destructive hover:bg-destructive/90"
                    )}
                    data-testid="button-confirm"
                  >
                    {isLoading ? 'Please wait...' : confirmLabel}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    onClick={handleCancel}
                    disabled={isLoading}
                    className="w-full h-12 rounded-full font-semibold text-sm text-black/60 dark:text-white/60 touch-manipulation"
                    data-testid="button-cancel"
                  >
                    {cancelLabel}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  itemName?: string;
  isLoading?: boolean;
}

export function DeleteConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  isLoading,
}: DeleteConfirmDialogProps) {
  return (
    <MobileConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={`Delete ${itemName || 'this item'}?`}
      description="This action cannot be undone. This will permanently delete the item."
      confirmLabel="Delete"
      cancelLabel="Keep it"
      variant="destructive"
      isLoading={isLoading}
    />
  );
}

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  hasPendingSync?: boolean;
  isLoading?: boolean;
}

export function LogoutConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  hasPendingSync,
  isLoading,
}: LogoutConfirmDialogProps) {
  return (
    <MobileConfirmDialog
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title="Sign out?"
      description={
        hasPendingSync 
          ? "You have unsynced data. Signing out may cause data loss."
          : "You'll need to sign in again to access your account."
      }
      confirmLabel="Sign Out"
      cancelLabel="Stay signed in"
      variant={hasPendingSync ? 'warning' : 'default'}
      icon={<LogOut className="h-6 w-6" />}
      isLoading={isLoading}
    />
  );
}
