import { useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';

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
      if (handled === true) {
        return;
      }
    }

    if (location.pathname === '/' || location.pathname === '/dashboard') {
      if (exitOnBack) {
        if (exitConfirmRef.current) {
          await CapacitorApp.exitApp();
        } else {
          exitConfirmRef.current = true;
          
          if (exitTimeoutRef.current) {
            clearTimeout(exitTimeoutRef.current);
          }
          exitTimeoutRef.current = setTimeout(() => {
            exitConfirmRef.current = false;
          }, 2000);
          
          return 'exit_confirm';
        }
      }
    } else {
      window.history.back();
    }

    return 'navigated';
  }, [onBack, location.pathname, exitOnBack]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const backButtonListener = CapacitorApp.addListener('backButton', async ({ canGoBack }) => {
      await handleBackButton();
    });

    return () => {
      backButtonListener.then(listener => listener.remove());
      if (exitTimeoutRef.current) {
        clearTimeout(exitTimeoutRef.current);
      }
    };
  }, [handleBackButton]);

  return { handleBackButton };
}

export function useModalBackHandler(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !isOpen) {
      return;
    }

    const handleBack = async () => {
      onClose();
    };

    const backButtonListener = CapacitorApp.addListener('backButton', handleBack);

    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, [isOpen, onClose]);
}

export function useDrawerBackHandler(isOpen: boolean, onClose: () => void) {
  return useModalBackHandler(isOpen, onClose);
}
