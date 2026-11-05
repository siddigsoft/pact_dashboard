import { useState, useEffect, useCallback, useRef } from 'react';
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
  position: GeolocationPosition;
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
  currentPosition: GeolocationPosition | null;
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
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function useGeofencing({
  regions,
  onEnter,
  onExit,
  onDwell,
  dwellTime = 60000,
  enableNotifications = true,
}: UseGeofencingOptions): UseGeofencingReturn {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<GeolocationPosition | null>(null);
  const [insideRegions, setInsideRegions] = useState<GeofenceRegion[]>([]);
  const [nearbyRegions, setNearbyRegions] = useState<{ region: GeofenceRegion; distance: number }[]>([]);

  const { toast } = useToast();
  const watchIdRef = useRef<number | null>(null);
  const regionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const previousInsideRegions = useRef<Set<string>>(new Set());

  const sendNotification = useCallback(async (title: string, body: string, data?: Record<string, any>) => {
    if (!enableNotifications) return;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body, data });
      }
    } catch (error) {
      addDiagnosticLog('error', 'Failed to send geofence notification', error);
    }
  }, [enableNotifications]);

  const checkGeofences = useCallback((position: GeolocationPosition) => {
    const { latitude, longitude } = position.coords;
    const now = new Date();
    const currentlyInside: GeofenceRegion[] = [];
    const nearby: { region: GeofenceRegion; distance: number }[] = [];

    for (const region of regions) {
      const distance = calculateHaversineDistance(latitude, longitude, region.latitude, region.longitude);
      if (distance <= region.radius) currentlyInside.push(region);
      else if (distance <= region.radius * 2) nearby.push({ region, distance });
    }

    const currentInsideIds = new Set(currentlyInside.map(r => r.id));
    const previousIds = previousInsideRegions.current;

    for (const region of currentlyInside) {
      if (!previousIds.has(region.id)) {
        const event: GeofenceEvent = { region, type: 'enter', timestamp: now, position };
        addDiagnosticLog('info', `Entered geofence: ${region.name}`, { regionId: region.id });
        onEnter?.(event);
        if (enableNotifications) {
          sendNotification('Site Nearby', `You've arrived at ${region.name}`, { regionId: region.id, type: 'geofence_enter' });
        }
        if (onDwell && dwellTime > 0) {
          const timer = setTimeout(() => {
            onDwell({ region, type: 'dwell', timestamp: new Date(), position });
          }, dwellTime);
          regionTimers.current.set(region.id, timer);
        }
      }
    }

    for (const regionId of previousIds) {
      if (!currentInsideIds.has(regionId)) {
        const region = regions.find(r => r.id === regionId);
        if (region) {
          onExit?.({ region, type: 'exit', timestamp: now, position });
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
    if (!navigator.geolocation) {
      addDiagnosticLog('warn', 'Geolocation not available');
      return;
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentPosition(position);
          checkGeofences(position);
        },
        (err) => addDiagnosticLog('error', 'Geofencing position error', err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
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
  }, [regions.length, checkGeofences, toast]);

  const stopMonitoring = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
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

  useEffect(() => () => stopMonitoring(), [stopMonitoring]);

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
