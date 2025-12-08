import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { AnimatePresence } from 'framer-motion';
import { PageTransitionLoader, UberDotsLoader, InlineDotsLoader } from '@/components/mobile/MobileLoadingOverlay';

interface LoadingState {
  isLoading: boolean;
  message?: string;
}

interface LoadingContextType {
  isPageLoading: boolean;
  loadingMessage?: string;
  startPageLoading: (message?: string) => void;
  stopPageLoading: () => void;
  withLoading: <T>(promise: Promise<T>, message?: string) => Promise<T>;
}

const LoadingContext = createContext<LoadingContextType | null>(null);

export function LoadingProvider({ children }: { children: ReactNode }) {
  const [loadingState, setLoadingState] = useState<LoadingState>({
    isLoading: false,
    message: undefined,
  });

  const startPageLoading = useCallback((message?: string) => {
    setLoadingState({ isLoading: true, message });
  }, []);

  const stopPageLoading = useCallback(() => {
    setLoadingState({ isLoading: false, message: undefined });
  }, []);

  const withLoading = useCallback(async <T,>(promise: Promise<T>, message?: string): Promise<T> => {
    startPageLoading(message);
    try {
      const result = await promise;
      return result;
    } finally {
      stopPageLoading();
    }
  }, [startPageLoading, stopPageLoading]);

  return (
    <LoadingContext.Provider
      value={{
        isPageLoading: loadingState.isLoading,
        loadingMessage: loadingState.message,
        startPageLoading,
        stopPageLoading,
        withLoading,
      }}
    >
      {children}
      <AnimatePresence>
        {loadingState.isLoading && (
          <PageTransitionLoader message={loadingState.message} />
        )}
      </AnimatePresence>
    </LoadingContext.Provider>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within a LoadingProvider');
  }
  return context;
}

// Optional hook for safe use (returns noop if outside provider)
export function useLoadingSafe() {
  const context = useContext(LoadingContext);
  return context || {
    isPageLoading: false,
    loadingMessage: undefined,
    startPageLoading: () => {},
    stopPageLoading: () => {},
    withLoading: async <T,>(promise: Promise<T>) => promise,
  };
}

// Re-export loader components for convenience
export { UberDotsLoader, InlineDotsLoader };
