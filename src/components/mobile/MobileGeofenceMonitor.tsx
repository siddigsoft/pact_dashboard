import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Navigation,
  Bell,
  BellOff,
  Radar,
  Target,
  ChevronRight,
  Plus,
  Trash2,
  Play,
  Pause,
  LocateFixed,
  Circle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';
import {
  geofenceManager,
  useGeofence,
  type GeofenceRegion,
  type GeofenceEvent,
} from '@/lib/geofencing';

interface MobileGeofenceMonitorProps {
  onRegionEnter?: (region: GeofenceRegion) => void;
  onRegionExit?: (region: GeofenceRegion) => void;
  onStartVisit?: (region: GeofenceRegion) => void;
  className?: string;
}

export function MobileGeofenceMonitor({
  onRegionEnter,
  onRegionExit,
  onStartVisit,
  className,
}: MobileGeofenceMonitorProps) {
  const {
    activeRegions,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    getAllRegions,
    getNearbyRegions,
  } = useGeofence();

  const [nearbyRegions, setNearbyRegions] = useState<Array<{ region: GeofenceRegion; distance: number }>>([]);
  const [events, setEvents] = useState<GeofenceEvent[]>([]);
  const [showAllRegions, setShowAllRegions] = useState(false);

  useEffect(() => {
    const unsubscribe = geofenceManager.onGeofenceEvent((event) => {
      setEvents(prev => [event, ...prev].slice(0, 10));
      
      if (event.type === 'enter') {
        hapticPresets.notification();
        onRegionEnter?.(event.region);
      } else if (event.type === 'exit') {
        hapticPresets.warning();
        onRegionExit?.(event.region);
      }
    });

    return unsubscribe;
  }, [onRegionEnter, onRegionExit]);

  useEffect(() => {
    if (isMonitoring) {
      const interval = setInterval(() => {
        setNearbyRegions(getNearbyRegions(2000));
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [isMonitoring, getNearbyRegions]);

  const handleToggleMonitoring = async () => {
    hapticPresets.buttonPress();
    if (isMonitoring) {
      await stopMonitoring();
    } else {
      await startMonitoring();
      setNearbyRegions(getNearbyRegions(2000));
    }
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <div className={cn("space-y-4", className)} data-testid="geofence-monitor">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center",
              isMonitoring ? "bg-black dark:bg-white" : "bg-black/5 dark:bg-white/5"
            )}>
              <Radar className={cn(
                "w-5 h-5",
                isMonitoring ? "text-white dark:text-black" : "text-black/60 dark:text-white/60"
              )} />
            </div>
            <div>
              <p className="text-sm font-medium text-black dark:text-white">
                Geofence Monitoring
              </p>
              <p className="text-xs text-black/60 dark:text-white/60">
                {isMonitoring 
                  ? `${activeRegions.length} active region${activeRegions.length !== 1 ? 's' : ''}` 
                  : 'Disabled'}
              </p>
            </div>
          </div>
          <Switch
            checked={isMonitoring}
            onCheckedChange={handleToggleMonitoring}
            data-testid="switch-geofence-monitoring"
          />
        </div>
      </Card>

      {isMonitoring && activeRegions.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-medium text-black/60 dark:text-white/60 mb-3">
            CURRENTLY INSIDE
          </p>
          <div className="space-y-3">
            {activeRegions.map((region) => (
              <div 
                key={region.id}
                className="flex items-center gap-3 p-3 bg-black/5 dark:bg-white/5 rounded-xl"
                data-testid={`region-active-${region.id}`}
              >
                <div className="w-10 h-10 bg-black dark:bg-white rounded-full flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-white dark:text-black" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-black dark:text-white">
                    {region.name}
                  </p>
                  <p className="text-xs text-black/60 dark:text-white/60">
                    {region.radius}m radius
                  </p>
                </div>
                {onStartVisit && (
                  <Button
                    size="sm"
                    onClick={() => {
                      hapticPresets.success();
                      onStartVisit(region);
                    }}
                    className="rounded-full"
                    data-testid={`button-start-visit-${region.id}`}
                  >
                    Start Visit
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {isMonitoring && nearbyRegions.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-medium text-black/60 dark:text-white/60 mb-3">
            NEARBY SITES
          </p>
          <div className="space-y-2">
            {nearbyRegions
              .filter(n => !activeRegions.some(a => a.id === n.region.id))
              .slice(0, 5)
              .map(({ region, distance }) => (
                <div 
                  key={region.id}
                  className="flex items-center gap-3 p-2"
                >
                  <div className="w-8 h-8 bg-black/5 dark:bg-white/5 rounded-full flex items-center justify-center">
                    <Target className="w-4 h-4 text-black/60 dark:text-white/60" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-black dark:text-white">
                      {region.name}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {formatDistance(distance)}
                  </Badge>
                </div>
              ))}
          </div>
        </Card>
      )}

      {events.length > 0 && (
        <Card className="p-4">
          <p className="text-xs font-medium text-black/60 dark:text-white/60 mb-3">
            RECENT ACTIVITY
          </p>
          <div className="space-y-2">
            {events.slice(0, 5).map((event, index) => (
              <div 
                key={index}
                className="flex items-center gap-3 text-sm"
              >
                <div className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center",
                  event.type === 'enter' 
                    ? "bg-black dark:bg-white" 
                    : "bg-black/20 dark:bg-white/20"
                )}>
                  {event.type === 'enter' ? (
                    <Navigation className="w-3 h-3 text-white dark:text-black rotate-90" />
                  ) : (
                    <Navigation className="w-3 h-3 text-black dark:text-white -rotate-90" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-black dark:text-white">
                    {event.type === 'enter' ? 'Entered' : 'Left'} {event.region.name}
                  </span>
                </div>
                <span className="text-xs text-black/40 dark:text-white/40">
                  {formatTime(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <button
        onClick={() => {
          hapticPresets.selection();
          setShowAllRegions(!showAllRegions);
        }}
        className="flex items-center justify-center gap-2 w-full py-2 text-sm text-black/60 dark:text-white/60"
        data-testid="button-show-all-regions"
      >
        <span>
          {showAllRegions ? 'Hide' : 'Show'} all {getAllRegions().length} regions
        </span>
        <motion.div
          animate={{ rotate: showAllRegions ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronRight className="w-4 h-4" />
        </motion.div>
      </button>

      <AnimatePresence>
        {showAllRegions && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <Card className="p-4">
              <div className="space-y-2">
                {getAllRegions().map((region) => (
                  <div 
                    key={region.id}
                    className="flex items-center gap-3 p-2 bg-black/5 dark:bg-white/5 rounded-lg"
                  >
                    <Circle className="w-4 h-4 text-black/40 dark:text-white/40" />
                    <div className="flex-1">
                      <p className="text-sm text-black dark:text-white">{region.name}</p>
                      <p className="text-xs text-black/40 dark:text-white/40">
                        {region.latitude.toFixed(4)}, {region.longitude.toFixed(4)}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {region.radius}m
                    </Badge>
                  </div>
                ))}
                {getAllRegions().length === 0 && (
                  <p className="text-sm text-black/40 dark:text-white/40 text-center py-4">
                    No geofence regions configured
                  </p>
                )}
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString();
}

interface GeofenceStatusBadgeProps {
  isInside?: boolean;
  regionName?: string;
  className?: string;
}

export function GeofenceStatusBadge({ 
  isInside, 
  regionName,
  className 
}: GeofenceStatusBadgeProps) {
  const { activeRegions } = useGeofence();

  const currentlyInside = isInside ?? activeRegions.length > 0;
  const name = regionName ?? (activeRegions[0]?.name || 'Unknown');

  if (!currentlyInside) return null;

  return (
    <Badge 
      className={cn(
        "bg-black dark:bg-white text-white dark:text-black",
        className
      )}
      data-testid="geofence-status-badge"
    >
      <MapPin className="w-3 h-3 mr-1" />
      At {name}
    </Badge>
  );
}

interface ProximityAlertProps {
  siteId: string;
  siteName: string;
  distance: number;
  onApproach?: () => void;
  className?: string;
}

export function ProximityAlert({
  siteId,
  siteName,
  distance,
  onApproach,
  className,
}: ProximityAlertProps) {
  const isNear = distance <= 200;

  if (!isNear) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "flex items-center gap-3 p-4 bg-black/5 dark:bg-white/5 rounded-xl",
        className
      )}
      data-testid={`proximity-alert-${siteId}`}
    >
      <div className="w-10 h-10 bg-black dark:bg-white rounded-full flex items-center justify-center">
        <LocateFixed className="w-5 h-5 text-white dark:text-black animate-pulse" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-black dark:text-white">
          Approaching {siteName}
        </p>
        <p className="text-xs text-black/60 dark:text-white/60">
          {distance}m away
        </p>
      </div>
      {onApproach && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            hapticPresets.buttonPress();
            onApproach();
          }}
          className="rounded-full"
          data-testid="button-approach-action"
        >
          Navigate
        </Button>
      )}
    </motion.div>
  );
}
