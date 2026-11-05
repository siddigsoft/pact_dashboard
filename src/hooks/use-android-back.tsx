import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';

interface UseAndroidBackOptions {
  onBack?: () => boolean | void;
  exitOnBack?: boolean;
}

export function useAndroidBack(options: UseAndroidBackOptions = {}) {
  const { onBack, exitOnBack = false } = options;
  const location = useLocation();
  const exitConfirmRef = useRef(false);
  const exitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleBackButton = useCallback(async () => {
    if (onBack) {
      const handled = onBack();
      if (handled === true) return;
    }

    if (location.pathname === '/' || location.pathname === '/dashboard') {
      if (exitOnBack) {
        if (exitConfirmRef.current) {
          return 'exit';
        }
        exitConfirmRef.current = true;
        if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
        exitTimeoutRef.current = setTimeout(() => {
          exitConfirmRef.current = false;
        }, 2000);
        return 'exit_confirm';
      }
    } else {
      window.history.back();
    }

    return 'navigated';
  }, [onBack, location.pathname, exitOnBack]);

  useEffect(() => {
    return () => {
      if (exitTimeoutRef.current) clearTimeout(exitTimeoutRef.current);
    };
  }, []);

  return { handleBackButton };
}

export function useModalBackHandler(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);
}

export function useDrawerBackHandler(isOpen: boolean, onClose: () => void) {
  return useModalBackHandler(isOpen, onClose);
}
