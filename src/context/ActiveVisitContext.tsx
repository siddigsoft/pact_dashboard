import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export interface ActiveVisitData {
  id: string;
  siteCode: string;
  siteName: string;
  state: string;
  locality: string;
  activity?: string;
  startedAt: string;
  coordinates?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  targetCoordinates?: {
    latitude: number;
    longitude: number;
  };
  photoCount: number;
  notes: string;
  status: 'active' | 'paused';
}

interface ActiveVisitContextType {
  activeVisit: ActiveVisitData | null;
  isMinimized: boolean;
  elapsedTime: number;
  gpsAccuracy: number | null;
  isGpsActive: boolean;
  startVisit: (visitData: Omit<ActiveVisitData, 'startedAt' | 'photoCount' | 'notes' | 'status'>) => void;
  updateVisit: (updates: Partial<ActiveVisitData>) => void;
  addPhoto: () => void;
  updateNotes: (notes: string) => void;
  updateLocation: (coords: { latitude: number; longitude: number; accuracy?: number }) => void;
  setGpsInactive: () => void;
  toggleMinimize: () => void;
  completeVisit: () => Promise<boolean>;
  pauseVisit: () => void;
  resumeVisit: () => void;
}

const ActiveVisitContext = createContext<ActiveVisitContextType | undefined>(undefined);

const STORAGE_KEY = 'pact_active_visit';

export function ActiveVisitProvider({ children }: { children: ReactNode }) {
  const [activeVisit, setActiveVisit] = useState<ActiveVisitData | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [isGpsActive, setIsGpsActive] = useState(false);
  const [watchId, setWatchId] = useState<number | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setActiveVisit(parsed);
        const startTime = new Date(parsed.startedAt).getTime();
        const now = Date.now();
        setElapsedTime(Math.floor((now - startTime) / 1000));
      } catch (e) {
        console.error('Failed to restore active visit:', e);
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (activeVisit) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(activeVisit));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeVisit]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeVisit && activeVisit.status === 'active') {
      interval = setInterval(() => {
        const startTime = new Date(activeVisit.startedAt).getTime();
        const now = Date.now();
        setElapsedTime(Math.floor((now - startTime) / 1000));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeVisit]);

  useEffect(() => {
    if (activeVisit && activeVisit.status === 'active' && navigator.geolocation) {
      const id = navigator.geolocation.watchPosition(
        (position) => {
          setGpsAccuracy(position.coords.accuracy);
          setIsGpsActive(true);
          setActiveVisit(prev => prev ? {
            ...prev,
            coordinates: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy
            }
          } : null);
        },
        (error) => {
          console.error('GPS error:', error);
          setIsGpsActive(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
      setWatchId(id);

      return () => {
        navigator.geolocation.clearWatch(id);
      };
    } else {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
      }
    }
  }, [activeVisit?.status]);

  const startVisit = useCallback((visitData: Omit<ActiveVisitData, 'startedAt' | 'photoCount' | 'notes' | 'status'>) => {
    const newVisit: ActiveVisitData = {
      ...visitData,
      startedAt: new Date().toISOString(),
      photoCount: 0,
      notes: '',
      status: 'active'
    };
    setActiveVisit(newVisit);
    setElapsedTime(0);
    setIsMinimized(false);
    
    toast({
      title: t('notifications.siteVisit.started'),
      description: t('notifications.siteVisit.startedDesc'),
    });
  }, [toast, t]);

  const updateVisit = useCallback((updates: Partial<ActiveVisitData>) => {
    setActiveVisit(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  const addPhoto = useCallback(() => {
    setActiveVisit(prev => prev ? { ...prev, photoCount: prev.photoCount + 1 } : null);
  }, []);

  const updateNotes = useCallback((notes: string) => {
    setActiveVisit(prev => prev ? { ...prev, notes } : null);
  }, []);

  const updateLocation = useCallback((coords: { latitude: number; longitude: number; accuracy?: number }) => {
    setActiveVisit(prev => prev ? { ...prev, coordinates: coords } : null);
    if (coords.accuracy !== undefined) {
      setGpsAccuracy(coords.accuracy);
    }
    setIsGpsActive(true);
  }, []);

  const setGpsInactive = useCallback(() => {
    setIsGpsActive(false);
    setGpsAccuracy(null);
  }, []);

  const toggleMinimize = useCallback(() => {
    setIsMinimized(prev => !prev);
  }, []);

  const completeVisit = useCallback(async (): Promise<boolean> => {
    if (!activeVisit) return false;
    
    try {
      setActiveVisit(null);
      setIsMinimized(false);
      setElapsedTime(0);
      setGpsAccuracy(null);
      setIsGpsActive(false);
      
      toast({
        title: t('notifications.siteVisit.completed'),
        description: t('notifications.siteVisit.completedDesc'),
      });
      
      return true;
    } catch (error) {
      console.error('Failed to complete visit:', error);
      toast({
        title: t('notifications.error.generic'),
        description: t('notifications.error.genericDesc'),
        variant: 'destructive',
      });
      return false;
    }
  }, [activeVisit, toast, t]);

  const pauseVisit = useCallback(() => {
    setActiveVisit(prev => prev ? { ...prev, status: 'paused' } : null);
  }, []);

  const resumeVisit = useCallback(() => {
    setActiveVisit(prev => prev ? { ...prev, status: 'active' } : null);
  }, []);

  return (
    <ActiveVisitContext.Provider value={{
      activeVisit,
      isMinimized,
      elapsedTime,
      gpsAccuracy,
      isGpsActive,
      startVisit,
      updateVisit,
      addPhoto,
      updateNotes,
      updateLocation,
      setGpsInactive,
      toggleMinimize,
      completeVisit,
      pauseVisit,
      resumeVisit,
    }}>
      {children}
    </ActiveVisitContext.Provider>
  );
}

export function useActiveVisit() {
  const context = useContext(ActiveVisitContext);
  if (context === undefined) {
    throw new Error('useActiveVisit must be used within an ActiveVisitProvider');
  }
  return context;
}
