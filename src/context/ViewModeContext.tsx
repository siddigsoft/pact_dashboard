
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';

type ViewMode = 'web' | 'mobile';

interface ViewModeContextType {
  viewMode: ViewMode;
  toggleViewMode: () => void;
  isAutoDetect: boolean;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const isMobileViewport = useIsMobile();
  const [forceMode, setForceMode] = useState<ViewMode | null>(null);
  
  const viewMode = forceMode || (isMobileViewport ? 'mobile' : 'web');
  const isAutoDetect = forceMode === null;

  const toggleViewMode = () => {
    setForceMode(prev => {
      if (prev === null) {
        return isMobileViewport ? 'web' : 'mobile';
      }
      return null;
    });
  };

  useEffect(() => {
    if (isAutoDetect) {
      console.log(`View mode auto-detected: ${viewMode} (viewport: ${isMobileViewport ? 'mobile' : 'desktop'})`);
    } else {
      console.log(`View mode forced: ${viewMode} (override active)`);
    }
  }, [viewMode, isAutoDetect, isMobileViewport]);

  return (
    <ViewModeContext.Provider value={{ viewMode, toggleViewMode, isAutoDetect }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
}
