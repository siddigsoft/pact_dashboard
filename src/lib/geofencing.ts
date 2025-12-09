import { Geolocation, Position } from '@capacitor/geolocation';
import { LocalNotifications } from '@capacitor/local-notifications';
import { hapticPresets } from './haptics';

interface GeofenceRegion {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEntry?: boolean;
  notifyOnExit?: boolean;
  metadata?: Record<string, any>;
}

interface GeofenceEvent {
  type: 'enter' | 'exit' | 'dwell';
  region: GeofenceRegion;
  timestamp: Date;
  position: Position;
}

type GeofenceCallback = (event: GeofenceEvent) => void;

const GEOFENCE_STORAGE_KEY = 'pact_geofences';
const GEOFENCE_CHECK_INTERVAL = 15000;
const DWELL_TIME_THRESHOLD = 60000;

class GeofenceManager {
  private regions: Map<string, GeofenceRegion> = new Map();
  private activeRegions: Set<string> = new Set();
  private entryTimes: Map<string, number> = new Map();
  private watchId: string | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private lastPosition: Position | null = null;
  private listeners: Set<GeofenceCallback> = new Set();
  private isMonitoring = false;

  constructor() {
    this.loadStoredRegions();
  }

  private loadStoredRegions(): void {
    try {
      const stored = localStorage.getItem(GEOFENCE_STORAGE_KEY);
      if (stored) {
        const regions: GeofenceRegion[] = JSON.parse(stored);
        regions.forEach(region => this.regions.set(region.id, region));
      }
    } catch (error) {
      console.error('Failed to load stored geofences:', error);
    }
  }

  private saveRegions(): void {
    try {
      const regions = Array.from(this.regions.values());
      localStorage.setItem(GEOFENCE_STORAGE_KEY, JSON.stringify(regions));
    } catch (error) {
      console.error('Failed to save geofences:', error);
    }
  }

  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  addRegion(region: GeofenceRegion): void {
    this.regions.set(region.id, {
      ...region,
      notifyOnEntry: region.notifyOnEntry ?? true,
      notifyOnExit: region.notifyOnExit ?? true,
    });
    this.saveRegions();
    console.log(`[Geofence] Added region: ${region.name}`);
  }

  removeRegion(regionId: string): void {
    this.regions.delete(regionId);
    this.activeRegions.delete(regionId);
    this.entryTimes.delete(regionId);
    this.saveRegions();
    console.log(`[Geofence] Removed region: ${regionId}`);
  }

  getRegion(regionId: string): GeofenceRegion | undefined {
    return this.regions.get(regionId);
  }

  getAllRegions(): GeofenceRegion[] {
    return Array.from(this.regions.values());
  }

  getActiveRegions(): GeofenceRegion[] {
    return Array.from(this.activeRegions)
      .map(id => this.regions.get(id))
      .filter((r): r is GeofenceRegion => r !== undefined);
  }

  clearAllRegions(): void {
    this.regions.clear();
    this.activeRegions.clear();
    this.entryTimes.clear();
    this.saveRegions();
  }

  async startMonitoring(): Promise<boolean> {
    if (this.isMonitoring) return true;

    try {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== 'granted') {
        const request = await Geolocation.requestPermissions();
        if (request.location !== 'granted') {
          console.warn('[Geofence] Location permission denied');
          return false;
        }
      }

      this.watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000 },
        (position, err) => {
          if (position) {
            this.handlePositionUpdate(position);
          }
          if (err) {
            console.error('[Geofence] Position error:', err);
          }
        }
      );

      this.checkInterval = setInterval(() => {
        if (this.lastPosition) {
          this.checkGeofences(this.lastPosition);
        }
      }, GEOFENCE_CHECK_INTERVAL);

      this.isMonitoring = true;
      console.log('[Geofence] Started monitoring');
      return true;
    } catch (error) {
      console.error('[Geofence] Failed to start monitoring:', error);
      return false;
    }
  }

  async stopMonitoring(): Promise<void> {
    if (this.watchId) {
      await Geolocation.clearWatch({ id: this.watchId });
      this.watchId = null;
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.isMonitoring = false;
    console.log('[Geofence] Stopped monitoring');
  }

  private handlePositionUpdate(position: Position): void {
    this.lastPosition = position;
    this.checkGeofences(position);
  }

  private checkGeofences(position: Position): void {
    const { latitude, longitude } = position.coords;
    const now = Date.now();

    this.regions.forEach((region, id) => {
      const distance = this.calculateDistance(
        latitude,
        longitude,
        region.latitude,
        region.longitude
      );

      const isInside = distance <= region.radius;
      const wasInside = this.activeRegions.has(id);

      if (isInside && !wasInside) {
        this.activeRegions.add(id);
        this.entryTimes.set(id, now);
        this.handleEvent('enter', region, position);
      } else if (!isInside && wasInside) {
        this.activeRegions.delete(id);
        this.entryTimes.delete(id);
        this.handleEvent('exit', region, position);
      } else if (isInside && wasInside) {
        const entryTime = this.entryTimes.get(id);
        if (entryTime && now - entryTime >= DWELL_TIME_THRESHOLD) {
          this.handleEvent('dwell', region, position);
          this.entryTimes.set(id, now);
        }
      }
    });
  }

  private async handleEvent(
    type: GeofenceEvent['type'],
    region: GeofenceRegion,
    position: Position
  ): Promise<void> {
    const event: GeofenceEvent = {
      type,
      region,
      timestamp: new Date(),
      position,
    };

    console.log(`[Geofence] ${type.toUpperCase()}: ${region.name}`);

    if (type === 'enter') {
      hapticPresets.notification();
    } else if (type === 'exit') {
      hapticPresets.warning();
    }

    const shouldNotify =
      (type === 'enter' && region.notifyOnEntry) ||
      (type === 'exit' && region.notifyOnExit);

    if (shouldNotify) {
      await this.sendNotification(event);
    }

    this.listeners.forEach(callback => callback(event));
  }

  private async sendNotification(event: GeofenceEvent): Promise<void> {
    try {
      const title = event.type === 'enter' 
        ? `Arrived at ${event.region.name}` 
        : `Left ${event.region.name}`;

      const body = event.type === 'enter'
        ? 'Tap to start your site visit'
        : 'Visit tracking has been paused';

      await LocalNotifications.schedule({
        notifications: [
          {
            id: Math.floor(Math.random() * 100000),
            title,
            body,
            largeBody: body,
            channelId: 'pact_notifications',
            schedule: { at: new Date() },
            extra: {
              type: 'geofence',
              event: event.type,
              regionId: event.region.id,
              regionName: event.region.name,
            },
          },
        ],
      });
    } catch (error) {
      console.error('[Geofence] Failed to send notification:', error);
    }
  }

  onGeofenceEvent(callback: GeofenceCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  isInsideRegion(regionId: string): boolean {
    return this.activeRegions.has(regionId);
  }

  getDistanceToRegion(regionId: string): number | null {
    const region = this.regions.get(regionId);
    if (!region || !this.lastPosition) return null;

    return this.calculateDistance(
      this.lastPosition.coords.latitude,
      this.lastPosition.coords.longitude,
      region.latitude,
      region.longitude
    );
  }

  getNearbyRegions(maxDistance = 5000): Array<{ region: GeofenceRegion; distance: number }> {
    if (!this.lastPosition) return [];

    return Array.from(this.regions.values())
      .map(region => ({
        region,
        distance: this.calculateDistance(
          this.lastPosition!.coords.latitude,
          this.lastPosition!.coords.longitude,
          region.latitude,
          region.longitude
        ),
      }))
      .filter(item => item.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance);
  }

  createSiteRegion(
    siteId: string,
    siteName: string,
    latitude: number,
    longitude: number,
    radius = 100
  ): GeofenceRegion {
    const region: GeofenceRegion = {
      id: `site_${siteId}`,
      name: siteName,
      latitude,
      longitude,
      radius,
      notifyOnEntry: true,
      notifyOnExit: true,
      metadata: { siteId, type: 'site' },
    };

    this.addRegion(region);
    return region;
  }
}

export const geofenceManager = new GeofenceManager();

export function useGeofence() {
  const React = require('react');
  const [activeRegions, setActiveRegions] = React.useState([] as GeofenceRegion[]);
  const [isMonitoring, setIsMonitoring] = React.useState(false);

  React.useEffect(() => {
    const unsubscribe = geofenceManager.onGeofenceEvent(() => {
      setActiveRegions(geofenceManager.getActiveRegions());
    });

    setActiveRegions(geofenceManager.getActiveRegions());

    return unsubscribe;
  }, []);

  const startMonitoring = React.useCallback(async () => {
    const success = await geofenceManager.startMonitoring();
    setIsMonitoring(success);
    return success;
  }, []);

  const stopMonitoring = React.useCallback(async () => {
    await geofenceManager.stopMonitoring();
    setIsMonitoring(false);
  }, []);

  return {
    activeRegions,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    getAllRegions: geofenceManager.getAllRegions.bind(geofenceManager),
    addRegion: geofenceManager.addRegion.bind(geofenceManager),
    removeRegion: geofenceManager.removeRegion.bind(geofenceManager),
    getNearbyRegions: geofenceManager.getNearbyRegions.bind(geofenceManager),
    getDistanceToRegion: geofenceManager.getDistanceToRegion.bind(geofenceManager),
  };
}

export type { GeofenceRegion, GeofenceEvent };
