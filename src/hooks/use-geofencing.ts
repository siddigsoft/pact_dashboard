import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation, Position } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useToast } from '@/hooks/use-toast';
import { addDiagnosticLog } from '@/components/mobile/MobileAppShell';

interface GeofenceRegion {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  metadata?: Record<string, any>;
}

interface GeofenceEvent {
  region: GeofenceRegion;
  type: 'enter' | 'exit' | 'dwell';
  timestamp: Date;
  position: Position;
}

interface UseGeofencingOptions {
  regions: GeofenceRegion[];
  onEnter?: (event: GeofenceEvent) => void;
  onExit?: (event: GeofenceEvent) => void;
  onDwell?: (event: GeofenceEvent) => void;
  dwellTime?: number;
  checkInterval?: number;
  enableNotifications?: boolean;
}

interface UseGeofencingReturn {
  isMonitoring: boolean;
  currentPosition: Position | null;
  insideRegions: GeofenceRegion[];
  nearbyRegions: { region: GeofenceRegion; distance: number }[];
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => void;
  checkProximity: (latitude: number, longitude: number) => GeofenceRegion[];
  getDistanceToRegion: (region: GeofenceRegion) => number | null;
}

function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function useGeofencing({
  regions,
  onEnter,
  onExit,
  onDwell,
  dwellTime = 60000,
  checkInterval = 10000,
  enableNotifications = true,
}: UseGeofencingOptions): UseGeofencingReturn {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<Position | null>(null);
  const [insideRegions, setInsideRegions] = useState<GeofenceRegion[]>([]);
  const [nearbyRegions, setNearbyRegions] = useState<{ region: GeofenceRegion; distance: number }[]>([]);
  
  const { toast } = useToast();
  const watchIdRef = useRef<string | null>(null);
  const regionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const previousInsideRegions = useRef<Set<string>>(new Set());
  const isNative = Capacitor.isNativePlatform();

  const sendNotification = useCallback(async (title: string, body: string, data?: Record<string, any>) => {
    if (!enableNotifications) return;

    try {
      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 100000),
            title,
            body,
            schedule: { at: new Date() },
            sound: 'beep.wav',
            smallIcon: 'ic_stat_icon_config_sample',
            iconColor: '#1e40af',
            extra: data,
          },
        ],
      });
    } catch (error) {
      addDiagnosticLog('error', 'Failed to send geofence notification', error);
    }
  }, [enableNotifications]);

  const checkGeofences = useCallback((position: Position) => {
    const { latitude, longitude } = position.coords;
    const now = new Date();
    const currentlyInside: GeofenceRegion[] = [];
    const nearby: { region: GeofenceRegion; distance: number }[] = [];

    for (const region of regions) {
      const distance = calculateHaversineDistance(
        latitude,
        longitude,
        region.latitude,
        region.longitude
      );

      if (distance <= region.radius) {
        currentlyInside.push(region);
      } else if (distance <= region.radius * 2) {
        nearby.push({ region, distance });
      }
    }

    const currentInsideIds = new Set(currentlyInside.map(r => r.id));
    const previousIds = previousInsideRegions.current;

    for (const region of currentlyInside) {
      if (!previousIds.has(region.id)) {
        const event: GeofenceEvent = { region, type: 'enter', timestamp: now, position };
        addDiagnosticLog('info', `Entered geofence: ${region.name}`, { regionId: region.id });
        onEnter?.(event);

        if (enableNotifications) {
          sendNotification(
            'Site Nearby',
            `You've arrived at ${region.name}`,
            { regionId: region.id, type: 'geofence_enter' }
          );
        }

        if (onDwell && dwellTime > 0) {
          const timer = setTimeout(() => {
            const dwellEvent: GeofenceEvent = { region, type: 'dwell', timestamp: new Date(), position };
            addDiagnosticLog('info', `Dwelling in geofence: ${region.name}`, { regionId: region.id });
            onDwell(dwellEvent);
          }, dwellTime);
          regionTimers.current.set(region.id, timer);
        }
      }
    }

    for (const regionId of previousIds) {
      if (!currentInsideIds.has(regionId)) {
        const region = regions.find(r => r.id === regionId);
        if (region) {
          const event: GeofenceEvent = { region, type: 'exit', timestamp: now, position };
          addDiagnosticLog('info', `Exited geofence: ${region.name}`, { regionId: region.id });
          onExit?.(event);

          const timer = regionTimers.current.get(regionId);
          if (timer) {
            clearTimeout(timer);
            regionTimers.current.delete(regionId);
          }
        }
      }
    }

    previousInsideRegions.current = currentInsideIds;
    setInsideRegions(currentlyInside);
    setNearbyRegions(nearby.sort((a, b) => a.distance - b.distance));
  }, [regions, onEnter, onExit, onDwell, dwellTime, enableNotifications, sendNotification]);

  const startMonitoring = useCallback(async () => {
    if (!isNative) {
      addDiagnosticLog('warn', 'Geofencing only available on native platforms');
      return;
    }

    try {
      const permissions = await Geolocation.checkPermissions();
      if (permissions.location !== 'granted') {
        const requested = await Geolocation.requestPermissions();
        if (requested.location !== 'granted') {
          toast({
            title: 'Location Required',
            description: 'Enable location access for site proximity alerts',
            variant: 'destructive',
          });
          return;
        }
      }

      watchIdRef.current = await Geolocation.watchPosition(
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        },
        (position, err) => {
          if (err) {
            addDiagnosticLog('error', 'Geofencing position error', err);
            return;
          }
          if (position) {
            setCurrentPosition(position);
            checkGeofences(position);
          }
        }
      );

      setIsMonitoring(true);
      addDiagnosticLog('info', 'Geofencing monitoring started', { regionCount: regions.length });

      toast({
        title: 'Site Monitoring Active',
        description: `Tracking ${regions.length} site locations`,
      });
    } catch (error) {
      addDiagnosticLog('error', 'Failed to start geofencing', error);
      toast({
        title: 'Monitoring Failed',
        description: 'Could not start site proximity tracking',
        variant: 'destructive',
      });
    }
  }, [isNative, regions.length, checkGeofences, toast]);

  const stopMonitoring = useCallback(() => {
    if (watchIdRef.current) {
      Geolocation.clearWatch({ id: watchIdRef.current });
      watchIdRef.current = null;
    }

    regionTimers.current.forEach(timer => clearTimeout(timer));
    regionTimers.current.clear();
    previousInsideRegions.current.clear();

    setIsMonitoring(false);
    setInsideRegions([]);
    setNearbyRegions([]);

    addDiagnosticLog('info', 'Geofencing monitoring stopped');
  }, []);

  const checkProximity = useCallback((latitude: number, longitude: number): GeofenceRegion[] => {
    return regions.filter(region => {
      const distance = calculateHaversineDistance(latitude, longitude, region.latitude, region.longitude);
      return distance <= region.radius;
    });
  }, [regions]);

  const getDistanceToRegion = useCallback((region: GeofenceRegion): number | null => {
    if (!currentPosition) return null;
    const { latitude, longitude } = currentPosition.coords;
    return calculateHaversineDistance(latitude, longitude, region.latitude, region.longitude);
  }, [currentPosition]);

  useEffect(() => {
    return () => {
      stopMonitoring();
    };
  }, [stopMonitoring]);

  return {
    isMonitoring,
    currentPosition,
    insideRegions,
    nearbyRegions,
    startMonitoring,
    stopMonitoring,
    checkProximity,
    getDistanceToRegion,
  };
}

export function useSiteProximity(sites: Array<{ id: string; name: string; latitude?: number; longitude?: number }>) {
  const regions: GeofenceRegion[] = sites
    .filter(site => site.latitude != null && site.longitude != null)
    .map(site => ({
      id: site.id,
      name: site.name,
      latitude: site.latitude!,
      longitude: site.longitude!,
      radius: 100,
      metadata: { siteId: site.id },
    }));

  const { toast } = useToast();

  return useGeofencing({
    regions,
    onEnter: (event) => {
      toast({
        title: 'Site Nearby',
        description: `You're near ${event.region.name}. Ready to start visit?`,
      });
    },
    onDwell: (event) => {
      toast({
        title: 'Still at Site',
        description: `You've been at ${event.region.name} for a while. Don't forget to log your visit!`,
      });
    },
    dwellTime: 300000,
    enableNotifications: true,
  });
}

export { calculateHaversineDistance };
