import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { saveAppState, getAppState } from '@/lib/offline-db';

interface LowBandwidthContextType {
  isLowBandwidthMode: boolean;
  toggleLowBandwidthMode: () => void;
  setLowBandwidthMode: (enabled: boolean) => void;
  autoDetected: boolean;
  connectionType: string | null;
  effectiveType: string | null;
  downlink: number | null;
}

const LowBandwidthContext = createContext<LowBandwidthContextType | undefined>(undefined);

const LOW_BANDWIDTH_KEY = 'low_bandwidth_mode';

interface NetworkInfo {
  effectiveType?: '2g' | '3g' | '4g' | 'slow-2g';
  downlink?: number;
  type?: string;
  saveData?: boolean;
}

export function LowBandwidthProvider({ children }: { children: ReactNode }) {
  const [isLowBandwidthMode, setIsLowBandwidthMode] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [connectionType, setConnectionType] = useState<string | null>(null);
  const [effectiveType, setEffectiveType] = useState<string | null>(null);
  const [downlink, setDownlink] = useState<number | null>(null);

  useEffect(() => {
    const loadSavedState = async () => {
      const saved = await getAppState<boolean>(LOW_BANDWIDTH_KEY);
      if (saved !== null) {
        setIsLowBandwidthMode(saved);
      }
    };
    loadSavedState();
  }, []);

  useEffect(() => {
    const checkConnection = () => {
      const nav = navigator as Navigator & { connection?: NetworkInfo };
      const connection = nav.connection;

      if (connection) {
        setConnectionType(connection.type || null);
        setEffectiveType(connection.effectiveType || null);
        setDownlink(connection.downlink || null);

        // Auto-detect low bandwidth conditions
        const isSlowConnection = 
          connection.effectiveType === '2g' || 
          connection.effectiveType === 'slow-2g' ||
          (connection.downlink !== undefined && connection.downlink < 0.5) ||
          connection.saveData === true;

        if (isSlowConnection && !isLowBandwidthMode) {
          setAutoDetected(true);
          setIsLowBandwidthMode(true);
          saveAppState(LOW_BANDWIDTH_KEY, true);
          console.log('[LowBandwidth] Auto-enabled due to slow connection');
        }
      }
    };

    checkConnection();

    const nav = navigator as Navigator & { connection?: NetworkInfo & EventTarget };
    if (nav.connection && 'addEventListener' in nav.connection) {
      nav.connection.addEventListener('change', checkConnection);
      return () => {
        nav.connection?.removeEventListener('change', checkConnection);
      };
    }
  }, [isLowBandwidthMode]);

  const toggleLowBandwidthMode = useCallback(() => {
    setIsLowBandwidthMode(prev => {
      const newValue = !prev;
      saveAppState(LOW_BANDWIDTH_KEY, newValue);
      setAutoDetected(false);
      return newValue;
    });
  }, []);

  const setLowBandwidthMode = useCallback((enabled: boolean) => {
    setIsLowBandwidthMode(enabled);
    saveAppState(LOW_BANDWIDTH_KEY, enabled);
    setAutoDetected(false);
  }, []);

  return (
    <LowBandwidthContext.Provider 
      value={{ 
        isLowBandwidthMode, 
        toggleLowBandwidthMode, 
        setLowBandwidthMode,
        autoDetected,
        connectionType,
        effectiveType,
        downlink,
      }}
    >
      {children}
    </LowBandwidthContext.Provider>
  );
}

export function useLowBandwidth() {
  const context = useContext(LowBandwidthContext);
  if (context === undefined) {
    throw new Error('useLowBandwidth must be used within a LowBandwidthProvider');
  }
  return context;
}
