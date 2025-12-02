import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
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
  
  const watchId = useRef<string | null>(null);
  const intervalId = useRef<NodeJS.Timeout | null>(null);
  const lastPosition = useRef<LocationData | null>(null);
  
  const { saveLocation, isOnline } = useOffline();

  const calculateDistance = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const processPosition = useCallback(
    async (position: Position) => {
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

        if (distance < minimumDistance) {
          return;
        }
      }

      lastPosition.current = newLocation;
      setCurrentLocation(newLocation);
      setLastUpdate(new Date());
      setError(null);

      if (saveOffline && !isOnline) {
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

      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          const request = await Geolocation.requestPermissions();
          if (request.location !== 'granted') {
            throw new Error('Location permission denied');
          }
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy,
          timeout: 15000,
          maximumAge: 0,
        });

        const location: LocationData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };

        setCurrentLocation(location);
        setLastUpdate(new Date());
        lastPosition.current = location;

        return location;
      } else {
        return new Promise((resolve, reject) => {
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
            {
              enableHighAccuracy,
              timeout: 15000,
              maximumAge: 0,
            }
          );
        });
      }
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

      if (Capacitor.isNativePlatform()) {
        watchId.current = await Geolocation.watchPosition(
          { enableHighAccuracy },
          (position, err) => {
            if (err) {
              console.error('[BackgroundLocation] Watch error:', err);
              return;
            }
            if (position) {
              processPosition(position);
            }
          }
        );
      } else {
        const webWatchId = navigator.geolocation.watchPosition(
          (position) => {
            processPosition({
              coords: position.coords,
              timestamp: position.timestamp,
            } as Position);
          },
          (err) => {
            console.error('[BackgroundLocation] Watch error:', err);
          },
          {
            enableHighAccuracy,
            timeout: 15000,
            maximumAge: 0,
          }
        );
        watchId.current = String(webWatchId);
      }

      intervalId.current = setInterval(() => {
        getCurrentPosition().catch(console.error);
      }, updateInterval);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start tracking';
      setError(message);
      setIsTracking(false);
    }
  }, [isTracking, getCurrentPosition, enableHighAccuracy, processPosition, updateInterval]);

  const stopTracking = useCallback(() => {
    if (watchId.current) {
      if (Capacitor.isNativePlatform()) {
        Geolocation.clearWatch({ id: watchId.current });
      } else {
        navigator.geolocation.clearWatch(Number(watchId.current));
      }
      watchId.current = null;
    }

    if (intervalId.current) {
      clearInterval(intervalId.current);
      intervalId.current = null;
    }

    setIsTracking(false);
  }, []);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, [stopTracking]);

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
      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.checkPermissions();
        if (permission.location !== 'granted') {
          const request = await Geolocation.requestPermissions();
          if (request.location !== 'granted') {
            throw new Error('Location permission denied');
          }
        }

        const position = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 15000,
        });

        const loc: LocationData = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp,
        };

        setLocation(loc);
        return loc;
      } else {
        return new Promise((resolve, reject) => {
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
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get location';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { location, loading, error, getLocation };
}
