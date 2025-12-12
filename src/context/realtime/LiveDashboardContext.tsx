/**
 * Live Dashboard Context
 * Provides centralized realtime subscriptions to prevent duplicate listeners
 */

import { createContext, useContext, ReactNode } from 'react';
import { useLiveDashboardCore } from '@/hooks/useLiveDashboardCore';

interface LiveDashboardContextValue {
  isConnected: boolean;
  channels: number;
  totalEvents: number;
  lastUpdate: Date | null;
  forceRefresh: () => Promise<void>;
  subscriptionStatus: {
    projects: boolean;
    mmp: boolean;
    visits: boolean;
  };
}

const LiveDashboardContext = createContext<LiveDashboardContextValue | null>(null);

interface LiveDashboardProviderProps {
  children: ReactNode;
  enableToasts?: boolean;
  toastBatchWindow?: number;
}

export function LiveDashboardProvider({
  children,
  enableToasts = true,
  toastBatchWindow = 2000,
}: LiveDashboardProviderProps) {
  const dashboardState = useLiveDashboardCore({ enableToasts, toastBatchWindow });

  return (
    <LiveDashboardContext.Provider value={dashboardState}>
      {children}
    </LiveDashboardContext.Provider>
  );
}

export function useLiveDashboard(): LiveDashboardContextValue {
  const context = useContext(LiveDashboardContext);
  
  if (!context) {
    console.warn('[useLiveDashboard] Used outside of LiveDashboardProvider, returning defaults');
    return {
      isConnected: false,
      channels: 0,
      totalEvents: 0,
      lastUpdate: null,
      forceRefresh: async () => {},
      subscriptionStatus: {
        projects: false,
        mmp: false,
        visits: false,
      },
    };
  }
  
  return context;
}
