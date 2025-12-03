
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useDeviceType, DeviceType } from '@/hooks/use-mobile';

type ViewMode = 'web' | 'mobile' | 'tablet';

interface ViewModeContextType {
  viewMode: ViewMode;
  deviceType: DeviceType;
  previousViewMode: ViewMode | null;
  isTransitioning: boolean;
  toggleViewMode: () => void;
  isAutoDetect: boolean;
  forceViewMode: (mode: ViewMode | null) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const deviceType = useDeviceType();
  const [forceMode, setForceMode] = useState<ViewMode | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [previousViewMode, setPreviousViewMode] = useState<ViewMode | null>(null);

  // Map device types to view modes
  const getDefaultViewMode = (device: DeviceType): ViewMode => {
    switch (device) {
      case 'mobile': return 'mobile';
      case 'tablet': return 'tablet';
      case 'desktop': return 'web';
      default: return 'web';
    }
  };

  const viewMode = forceMode || getDefaultViewMode(deviceType);
  const isAutoDetect = forceMode === null;

  const forceViewMode = useCallback((mode: ViewMode | null) => {
    if (mode !== viewMode) {
      setPreviousViewMode(viewMode);
      setIsTransitioning(true);
      setForceMode(mode);

      // Reset transition state after animation completes
      setTimeout(() => {
        setIsTransitioning(false);
      }, 300);
    }
  }, [viewMode]);

  const toggleViewMode = useCallback(() => {
    const newMode = viewMode === 'web' ? 'mobile' : viewMode === 'mobile' ? 'tablet' : 'web';
    forceViewMode(newMode);
  }, [viewMode, forceViewMode]);

  useEffect(() => {
    if (isAutoDetect && previousViewMode !== viewMode) {
      setPreviousViewMode(previousViewMode);
      setIsTransitioning(true);

      const timer = setTimeout(() => {
        setIsTransitioning(false);
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [viewMode, isAutoDetect, previousViewMode]);

  useEffect(() => {
    if (isAutoDetect) {
      console.log(`View mode auto-detected: ${viewMode} (device: ${deviceType})`);
    } else {
      console.log(`View mode forced: ${viewMode} (override active)`);
    }
  }, [viewMode, isAutoDetect, deviceType]);

  return (
    <ViewModeContext.Provider value={{
      viewMode,
      deviceType,
      previousViewMode,
      isTransitioning,
      toggleViewMode,
      isAutoDetect,
      forceViewMode
    }}>
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