import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface Hub {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
}

export interface State {
  id: string;
  name: string;
  code: string;
}

export interface Locality {
  id: string;
  name: string;
  state_id: string;
}

export interface HubState {
  hub_id: string;
  state_id: string;
  state_name: string;
  state_code: string;
}

interface LocationContextType {
  hubs: Hub[];
  states: State[];
  localities: Locality[];
  hubStates: HubState[];
  loading: boolean;
  error: string | null;
  refreshLocationData: () => Promise<void>;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const useLocationProvider = () => {
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [states, setStates] = useState<State[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [hubStates, setHubStates] = useState<HubState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const refreshLocationData = useCallback(async () => {
    try {
      // Check if user is authenticated before loading data
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Not authenticated - don't load location data
        if (!hasLoadedOnce) {
          setLoading(false);
        }
        return;
      }

      // Fetch hubs
      const { data: hubsData, error: hubsError } = await supabase
        .from('hubs')
        .select('id, name, description, is_active')
        .eq('is_active', true)
        .order('name');
      
      if (hubsError) throw hubsError;
      setHubs(hubsData || []);

      // Fetch hub_states for hub-state relationships
      const { data: hubStatesData, error: hubStatesError } = await supabase
        .from('hub_states')
        .select('hub_id, state_id, state_name, state_code')
        .order('state_name');
      
      if (hubStatesError) throw hubStatesError;
      setHubStates(hubStatesData || []);

      // Fetch localities from sites_registry table (distinct localities)
      const { data: localitiesData, error: localitiesError } = await supabase
        .from('sites_registry')
        .select('locality_id, locality_name, state_id')
        .order('locality_name');
      
      if (localitiesError) throw localitiesError;
      
      // Convert to Locality interface format and remove duplicates
      const uniqueLocalities: Locality[] = [];
      const seen = new Set<string>();
      
      (localitiesData || []).forEach(loc => {
        const key = `${loc.locality_id}-${loc.state_id}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueLocalities.push({
            id: loc.locality_id,
            name: loc.locality_name,
            state_id: loc.state_id
          });
        }
      });
      
      setLocalities(uniqueLocalities);

      // Extract unique states from hubStates
      const uniqueStatesMap = new Map<string, State>();
      hubStatesData?.forEach(hs => {
        if (!uniqueStatesMap.has(hs.state_id)) {
          uniqueStatesMap.set(hs.state_id, {
            id: hs.state_id,
            name: hs.state_name,
            code: hs.state_code
          });
        }
      });
      setStates(Array.from(uniqueStatesMap.values()));

      setError(null); // Clear any previous errors on successful refresh
      if (!hasLoadedOnce) {
        setHasLoadedOnce(true);
      }
    } catch (err) {
      console.error('Error loading location data:', err);
      setError('Failed to load location data');
      // Keep existing data instead of clearing it
    } finally {
      if (!hasLoadedOnce) {
        setLoading(false);
      }
    }
  }, [hasLoadedOnce]);

  // Initial load
  useEffect(() => {
    refreshLocationData();
  }, [refreshLocationData]);

  // Automatic background refresh when app becomes visible
  useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null;
    let visibilityTimeout: NodeJS.Timeout | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (visibilityTimeout) {
          clearTimeout(visibilityTimeout);
        }
        visibilityTimeout = setTimeout(() => {
          if (navigator.onLine) {
            refreshLocationData();
          }
        }, 500);
      }
    };

    const handleOnline = () => {
      refreshLocationData();
    };

    // Set up periodic background refresh (every 60 seconds when app is visible)
    const startPeriodicRefresh = () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      
      intervalId = setInterval(() => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          refreshLocationData();
        }
      }, 60000); // 60 seconds (location data changes less frequently)
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    startPeriodicRefresh();

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      if (visibilityTimeout) {
        clearTimeout(visibilityTimeout);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [refreshLocationData]);

  // Real-time subscriptions for location data changes
  useEffect(() => {
    let channel: any = null;

    const setupSubscription = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return;
      }

      channel = supabase
        .channel('location_context_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'hubs' },
          () => {
            refreshLocationData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'hub_states' },
          () => {
            refreshLocationData();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sites_registry' },
          () => {
            refreshLocationData();
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('✅ Location context real-time subscription active');
          } else if (status === 'CHANNEL_ERROR') {
            console.error('❌ Location context real-time subscription error');
          }
        });
    };

    setupSubscription();

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [refreshLocationData]);

  return {
    hubs,
    states,
    localities,
    hubStates,
    loading,
    error,
    refreshLocationData
  };
};

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const locationContext = useLocationProvider();

  return (
    <LocationContext.Provider value={locationContext}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = (): LocationContextType => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};

