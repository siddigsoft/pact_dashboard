import { useState, useEffect, useCallback, useRef } from 'react';
import { useOffline } from './use-offline';

interface LocationData {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

interface UseBackgroundLocationOptions {
  enableHighAccuracy?: boolean;
  updateInterval?: number;
  minimumDistance?: number;
  saveOffline?: boolean;
}

interface UseBackgroundLocationReturn {
  currentLocation: LocationData | null;
  isTracking: boolean;
  error: string | null;
  startTracking: () => Promise<void>;
  stopTracking: () => void;
  getCurrentPosition: () => Promise<LocationData | null>;
  lastUpdate: Date | null;
}

export function useBackgroundLocation(
  options: UseBackgroundLocationOptions = {}
): UseBackgroundLocationReturn {
  const {
    enableHighAccuracy = true,
    updateInterval = 30000,
    minimumDistance = 10,
    saveOffline = true,
  } = options;

  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const watchId = useRef<number | null>(null);
  const intervalId = useRef<NodeJS.Timeout | null>(null);
  const lastPosition = useRef<LocationData | null>(null);

  const { saveLocation, isOnline } = useOffline();

  const calculateDistance = (
    lat1: number, lng1: number, lat2: number, lng2: number
  ): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const processPosition = useCallback(
    async (position: GeolocationPosition) => {
      const newLocation: LocationData = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };

      if (lastPosition.current) {
        const distance = calculateDistance(
          lastPosition.current.lat,
          lastPosition.current.lng,
          newLocation.lat,
          newLocation.lng
        );
        if (distance < minimumDistance) return;
      }

      lastPosition.current = newLocation;
      setCurrentLocation(newLocation);
      setLastUpdate(new Date());

      if (saveOffline || !isOnline) {
        await saveLocation({
          lat: newLocation.lat,
          lng: newLocation.lng,
          accuracy: newLocation.accuracy,
        });
      }
    },
    [minimumDistance, saveOffline, isOnline, saveLocation]
  );

  const getCurrentPosition = useCallback(async (): Promise<LocationData | null> => {
    try {
      setError(null);
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const location: LocationData = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
            };
            setCurrentLocation(location);
            setLastUpdate(new Date());
            lastPosition.current = location;
            resolve(location);
          },
          (err) => {
            setError(err.message);
            reject(err);
          },
          { enableHighAccuracy, timeout: 15000, maximumAge: 0 }
        );
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get location';
      setError(message);
      return null;
    }
  }, [enableHighAccuracy]);

  const startTracking = useCallback(async () => {
    if (isTracking) return;
    try {
      setError(null);
      setIsTracking(true);
      await getCurrentPosition();

      watchId.current = navigator.geolocation.watchPosition(
        (position) => processPosition(position),
        (err) => console.error('[BackgroundLocation] Watch error:', err),
        { enableHighAccuracy, timeout: 15000, maximumAge: 0 }
      );

      intervalId.current = setInterval(() => {
        getCurrentPosition().catch(console.error);
      }, updateInterval);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tracking');
      setIsTracking(false);
    }
  }, [isTracking, getCurrentPosition, enableHighAccuracy, processPosition, updateInterval]);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }
    setIsTracking(false);
  }, []);

  useEffect(() => () => stopTracking(), [stopTracking]);

  return {
    currentLocation,
    isTracking,
    error,
    startTracking,
    stopTracking,
    getCurrentPosition,
    lastUpdate,
  };
}

export function useSimpleLocation() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getLocation = useCallback(async (): Promise<LocationData | null> => {
    setLoading(true);
    setError(null);
    try {
      return await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            const loc: LocationData = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
              timestamp: position.timestamp,
            };
            setLocation(loc);
            resolve(loc);
          },
          (err) => {
            setError(err.message);
            reject(err);
          },
          { enableHighAccuracy: true, timeout: 15000 }
        );
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get location');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { location, loading, error, getLocation };
}
