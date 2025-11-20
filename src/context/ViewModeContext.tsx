
import React, { createContext, useContext, useState } from 'react';

type ViewMode = 'web' | 'mobile';

interface ViewModeContextType {
  viewMode: ViewMode;
  toggleViewMode: () => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('web');

  const toggleViewMode = () => {
    setViewMode(prev => prev === 'web' ? 'mobile' : 'web');
  };

  return (
    <ViewModeContext.Provider value={{ viewMode, toggleViewMode }}>
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
