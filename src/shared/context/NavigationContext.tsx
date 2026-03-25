import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getNavigationItemByPath } from '@/config/navigation';

interface NavigationState {
  currentPath: string;
  previousPath: string | null;
  navigationHistory: string[];
  isNavigating: boolean;
  activeItem: any | null;
}

interface NavigationContextType extends NavigationState {
  navigateTo: (path: string, options?: { replace?: boolean; state?: any }) => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  clearHistory: () => void;
  setActiveItem: (item: any) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();

  const [navigationState, setNavigationState] = useState<NavigationState>({
    currentPath: location.pathname,
    previousPath: null,
    navigationHistory: [location.pathname],
    isNavigating: false,
    activeItem: getNavigationItemByPath(location.pathname)
  });

  const [historyStack, setHistoryStack] = useState<string[]>([location.pathname]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Update navigation state when location changes
  useEffect(() => {
    const newPath = location.pathname;

    setNavigationState(prev => {
      const isNewNavigation = prev.currentPath !== newPath;

      if (isNewNavigation) {
        // Update history stack
        setHistoryStack(current => {
          const newStack = current.slice(0, historyIndex + 1);
          newStack.push(newPath);
          setHistoryIndex(newStack.length - 1);
          return newStack;
        });

        return {
          currentPath: newPath,
          previousPath: prev.currentPath,
          navigationHistory: [...prev.navigationHistory.slice(-9), newPath], // Keep last 10 entries
          isNavigating: false,
          activeItem: getNavigationItemByPath(newPath)
        };
      }

      return prev;
    });
  }, [location.pathname, historyIndex]);

  const navigateTo = useCallback((path: string, options?: { replace?: boolean; state?: any }) => {
    setNavigationState(prev => ({ ...prev, isNavigating: true }));

    if (options?.replace) {
      navigate(path, { replace: true, state: options.state });
    } else {
      navigate(path, { state: options?.state });
    }
  }, [navigate]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const path = historyStack[newIndex];
      setHistoryIndex(newIndex);
      navigateTo(path, { replace: true });
    }
  }, [historyIndex, historyStack, navigateTo]);

  const goForward = useCallback(() => {
    if (historyIndex < historyStack.length - 1) {
      const newIndex = historyIndex + 1;
      const path = historyStack[newIndex];
      setHistoryIndex(newIndex);
      navigateTo(path, { replace: true });
    }
  }, [historyIndex, historyStack, navigateTo]);

  const clearHistory = useCallback(() => {
    setHistoryStack([navigationState.currentPath]);
    setHistoryIndex(0);
    setNavigationState(prev => ({
      ...prev,
      navigationHistory: [prev.currentPath],
      previousPath: null
    }));
  }, [navigationState.currentPath]);

  const setActiveItem = useCallback((item: any) => {
    setNavigationState(prev => ({ ...prev, activeItem: item }));
  }, []);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < historyStack.length - 1;

  const contextValue: NavigationContextType = {
    ...navigationState,
    navigateTo,
    goBack,
    goForward,
    canGoBack,
    canGoForward,
    clearHistory,
    setActiveItem
  };

  return (
    <NavigationContext.Provider value={contextValue}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}

// Hook for programmatic navigation with loading states
export function useNavigationState() {
  const { isNavigating, navigateTo, currentPath, activeItem } = useNavigation();

  const navigateWithLoading = useCallback(async (
    path: string,
    options?: { replace?: boolean; state?: any; delay?: number }
  ) => {
    navigateTo(path, options);

    if (options?.delay) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
    }
  }, [navigateTo]);

  return {
    isNavigating,
    currentPath,
    activeItem,
    navigateTo: navigateWithLoading
  };
}