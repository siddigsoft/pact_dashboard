import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Navigation, 
  MapPin, 
  Locate, 
  Layers, 
  ZoomIn, 
  ZoomOut,
  Compass,
  Route,
  Target,
  Circle,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { hapticPresets } from '@/lib/haptics';

interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title?: string;
  description?: string;
  type?: 'default' | 'user' | 'destination' | 'site' | 'warning';
  icon?: React.ReactNode;
  onPress?: () => void;
}

interface Geofence {
  id: string;
  latitude: number;
  longitude: number;
  radius: number;
  color?: string;
  fillOpacity?: number;
}

interface RoutePoint {
  latitude: number;
  longitude: number;
}

interface MobileMapViewProps {
  markers?: MapMarker[];
  geofences?: Geofence[];
  route?: RoutePoint[];
  userLocation?: { latitude: number; longitude: number; accuracy?: number; heading?: number };
  initialCenter?: { latitude: number; longitude: number };
  initialZoom?: number;
  showUserLocation?: boolean;
  showCompass?: boolean;
  showZoomControls?: boolean;
  showLayerControl?: boolean;
  showCenterButton?: boolean;
  onMarkerPress?: (marker: MapMarker) => void;
  onMapPress?: (coords: { latitude: number; longitude: number }) => void;
  onLocationUpdate?: (location: { latitude: number; longitude: number }) => void;
  onGeofenceEnter?: (geofence: Geofence) => void;
  onGeofenceExit?: (geofence: Geofence) => void;
  className?: string;
  children?: React.ReactNode;
}

type MapLayer = 'standard' | 'satellite' | 'terrain';

export function MobileMapView({
  markers = [],
  geofences = [],
  route = [],
  userLocation,
  initialCenter = { latitude: 15.5007, longitude: 32.5599 },
  initialZoom = 12,
  showUserLocation = true,
  showCompass = true,
  showZoomControls = true,
  showLayerControl = true,
  showCenterButton = true,
  onMarkerPress,
  onMapPress,
  onLocationUpdate,
  onGeofenceEnter,
  onGeofenceExit,
  className,
  children,
}: MobileMapViewProps) {
  const [center, setCenter] = useState(initialCenter);
  const [zoom, setZoom] = useState(initialZoom);
  const [heading, setHeading] = useState(0);
  const [layer, setLayer] = useState<MapLayer>('standard');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [selectedMarker, setSelectedMarker] = useState<MapMarker | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);

  const handleZoomIn = useCallback(() => {
    hapticPresets.buttonPress();
    setZoom(prev => Math.min(prev + 1, 20));
  }, []);

  const handleZoomOut = useCallback(() => {
    hapticPresets.buttonPress();
    setZoom(prev => Math.max(prev - 1, 1));
  }, []);

  const handleCenterOnUser = useCallback(() => {
    hapticPresets.buttonPress();
    if (userLocation) {
      setCenter({ latitude: userLocation.latitude, longitude: userLocation.longitude });
      setIsTracking(true);
    }
  }, [userLocation]);

  const handleLayerChange = useCallback((newLayer: MapLayer) => {
    hapticPresets.selection();
    setLayer(newLayer);
    setShowLayerPicker(false);
  }, []);

  const handleMarkerPress = useCallback((marker: MapMarker) => {
    hapticPresets.buttonPress();
    setSelectedMarker(marker);
    onMarkerPress?.(marker);
    marker.onPress?.();
  }, [onMarkerPress]);

  const handleMapPress = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (selectedMarker) {
      setSelectedMarker(null);
      return;
    }
    
    const rect = mapRef.current?.getBoundingClientRect();
    if (!rect) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    
    const latRange = 0.1 / (zoom / 10);
    const lngRange = 0.1 / (zoom / 10);
    
    const latitude = center.latitude + (0.5 - y) * latRange;
    const longitude = center.longitude + (x - 0.5) * lngRange;
    
    onMapPress?.({ latitude, longitude });
  }, [center, zoom, selectedMarker, onMapPress]);

  useEffect(() => {
    if (isTracking && userLocation) {
      setCenter({ latitude: userLocation.latitude, longitude: userLocation.longitude });
      if (userLocation.heading !== undefined) {
        setHeading(userLocation.heading);
      }
    }
  }, [isTracking, userLocation]);

  useEffect(() => {
    if (!userLocation || geofences.length === 0) return;

    geofences.forEach(geofence => {
      const distance = calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        geofence.latitude,
        geofence.longitude
      );

      if (distance <= geofence.radius) {
        onGeofenceEnter?.(geofence);
      } else {
        onGeofenceExit?.(geofence);
      }
    });
  }, [userLocation, geofences, onGeofenceEnter, onGeofenceExit]);

  const getMarkerIcon = (type: MapMarker['type']) => {
    const baseClasses = "h-6 w-6";
    switch (type) {
      case 'user':
        return <Navigation className={cn(baseClasses, "text-white")} />;
      case 'destination':
        return <Target className={cn(baseClasses, "text-white")} />;
      case 'site':
        return <MapPin className={cn(baseClasses, "text-white")} />;
      case 'warning':
        return <AlertCircle className={cn(baseClasses, "text-white")} />;
      default:
        return <MapPin className={cn(baseClasses, "text-white")} />;
    }
  };

  const getMarkerColor = (type: MapMarker['type']) => {
    switch (type) {
      case 'user':
        return 'bg-black dark:bg-white';
      case 'destination':
        return 'bg-black dark:bg-white';
      case 'site':
        return 'bg-black/80 dark:bg-white/80';
      case 'warning':
        return 'bg-destructive';
      default:
        return 'bg-black dark:bg-white';
    }
  };

  const layerBackgrounds = {
    standard: 'bg-neutral-100 dark:bg-neutral-900',
    satellite: 'bg-neutral-800',
    terrain: 'bg-amber-50 dark:bg-amber-950',
  };

  return (
    <div 
      ref={mapRef}
      className={cn(
        "relative w-full h-full overflow-hidden rounded-xl",
        layerBackgrounds[layer],
        className
      )}
      onClick={handleMapPress}
      data-testid="mobile-map-view"
    >
      <div className="absolute inset-0 grid-pattern opacity-20" />

      {geofences.map((geofence) => (
        <GeofenceCircle
          key={geofence.id}
          geofence={geofence}
          center={center}
          zoom={zoom}
        />
      ))}

      {route.length > 1 && (
        <RouteLine route={route} center={center} zoom={zoom} />
      )}

      {markers.map((marker) => (
        <MarkerPin
          key={marker.id}
          marker={marker}
          center={center}
          zoom={zoom}
          isSelected={selectedMarker?.id === marker.id}
          onPress={() => handleMarkerPress(marker)}
          icon={marker.icon || getMarkerIcon(marker.type)}
          color={getMarkerColor(marker.type)}
        />
      ))}

      {showUserLocation && userLocation && (
        <UserLocationMarker
          location={userLocation}
          center={center}
          zoom={zoom}
          heading={heading}
          isTracking={isTracking}
        />
      )}

      <AnimatePresence>
        {selectedMarker && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 left-4 right-4 bg-white dark:bg-neutral-900 rounded-2xl shadow-xl p-4 z-20"
            data-testid="marker-callout"
          >
            <h3 className="text-base font-semibold text-black dark:text-white">
              {selectedMarker.title || 'Location'}
            </h3>
            {selectedMarker.description && (
              <p className="text-sm text-black/60 dark:text-white/60 mt-1">
                {selectedMarker.description}
              </p>
            )}
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                variant="default"
                className="flex-1 bg-black dark:bg-white text-white dark:text-black rounded-full"
                onClick={() => {
                  hapticPresets.buttonPress();
                }}
                data-testid="button-directions"
              >
                <Route className="h-4 w-4 mr-2" />
                Directions
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => setSelectedMarker(null)}
                data-testid="button-close-callout"
              >
                Close
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        {showCompass && (
          <motion.button
            className="w-10 h-10 bg-white dark:bg-neutral-900 rounded-full shadow-lg flex items-center justify-center"
            style={{ rotate: -heading }}
            onClick={() => {
              hapticPresets.buttonPress();
              setHeading(0);
            }}
            data-testid="button-compass"
          >
            <Compass className="h-5 w-5 text-black dark:text-white" />
          </motion.button>
        )}

        {showZoomControls && (
          <div className="flex flex-col bg-white dark:bg-neutral-900 rounded-full shadow-lg overflow-hidden">
            <button
              className="w-10 h-10 flex items-center justify-center border-b border-black/10 dark:border-white/10"
              onClick={handleZoomIn}
              data-testid="button-zoom-in"
            >
              <ZoomIn className="h-5 w-5 text-black dark:text-white" />
            </button>
            <button
              className="w-10 h-10 flex items-center justify-center"
              onClick={handleZoomOut}
              data-testid="button-zoom-out"
            >
              <ZoomOut className="h-5 w-5 text-black dark:text-white" />
            </button>
          </div>
        )}

        {showLayerControl && (
          <div className="relative">
            <button
              className="w-10 h-10 bg-white dark:bg-neutral-900 rounded-full shadow-lg flex items-center justify-center"
              onClick={() => {
                hapticPresets.buttonPress();
                setShowLayerPicker(!showLayerPicker);
              }}
              data-testid="button-layers"
            >
              <Layers className="h-5 w-5 text-black dark:text-white" />
            </button>

            <AnimatePresence>
              {showLayerPicker && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, x: 10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: 10 }}
                  className="absolute right-12 top-0 bg-white dark:bg-neutral-900 rounded-xl shadow-xl overflow-hidden min-w-[120px]"
                  data-testid="layer-picker"
                >
                  {(['standard', 'satellite', 'terrain'] as MapLayer[]).map((l) => (
                    <button
                      key={l}
                      className={cn(
                        "w-full px-4 py-2.5 text-left text-sm font-medium capitalize",
                        layer === l
                          ? "bg-black dark:bg-white text-white dark:text-black"
                          : "text-black dark:text-white hover:bg-black/5 dark:hover:bg-white/5"
                      )}
                      onClick={() => handleLayerChange(l)}
                      data-testid={`button-layer-${l}`}
                    >
                      {l}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {showCenterButton && userLocation && (
        <button
          className={cn(
            "absolute bottom-4 right-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center z-10",
            isTracking
              ? "bg-black dark:bg-white"
              : "bg-white dark:bg-neutral-900"
          )}
          onClick={handleCenterOnUser}
          data-testid="button-center-location"
        >
          <Locate className={cn(
            "h-6 w-6",
            isTracking
              ? "text-white dark:text-black"
              : "text-black dark:text-white"
          )} />
        </button>
      )}

      <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-sm rounded-lg px-3 py-1.5 z-10">
        <span className="text-xs font-medium text-black/60 dark:text-white/60">
          Zoom: {zoom}x
        </span>
      </div>

      {children}
    </div>
  );
}

interface MarkerPinProps {
  marker: MapMarker;
  center: { latitude: number; longitude: number };
  zoom: number;
  isSelected: boolean;
  onPress: () => void;
  icon: React.ReactNode;
  color: string;
}

function MarkerPin({ marker, center, zoom, isSelected, onPress, icon, color }: MarkerPinProps) {
  const position = latLngToPosition(marker.latitude, marker.longitude, center, zoom);
  
  if (position.x < -50 || position.x > 150 || position.y < -50 || position.y > 150) {
    return null;
  }

  return (
    <motion.button
      className={cn(
        "absolute z-10 -translate-x-1/2 -translate-y-full",
        isSelected && "z-20"
      )}
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      initial={{ scale: 0, y: 20 }}
      animate={{ scale: isSelected ? 1.2 : 1, y: 0 }}
      whileTap={{ scale: 0.9 }}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      data-testid={`marker-${marker.id}`}
    >
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center shadow-lg",
        color
      )}>
        {icon}
      </div>
      <div className={cn(
        "absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45",
        color
      )} />
    </motion.button>
  );
}

interface UserLocationMarkerProps {
  location: { latitude: number; longitude: number; accuracy?: number; heading?: number };
  center: { latitude: number; longitude: number };
  zoom: number;
  heading: number;
  isTracking: boolean;
}

function UserLocationMarker({ location, center, zoom, heading, isTracking }: UserLocationMarkerProps) {
  const position = latLngToPosition(location.latitude, location.longitude, center, zoom);
  
  if (position.x < -10 || position.x > 110 || position.y < -10 || position.y > 110) {
    return null;
  }

  const accuracyRadius = location.accuracy ? Math.min(location.accuracy * zoom / 10, 100) : 20;

  return (
    <div
      className="absolute z-15 -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${position.x}%`, top: `${position.y}%` }}
      data-testid="user-location-marker"
    >
      <motion.div
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/10 dark:bg-white/10"
        style={{ width: accuracyRadius * 2, height: accuracyRadius * 2 }}
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
      />
      
      <motion.div
        className="relative w-6 h-6 -translate-x-1/2 -translate-y-1/2"
        style={{ rotate: location.heading || 0 }}
      >
        <div className="absolute inset-0 rounded-full bg-black dark:bg-white shadow-lg" />
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-black dark:border-b-white" />
      </motion.div>
    </div>
  );
}

interface GeofenceCircleProps {
  geofence: Geofence;
  center: { latitude: number; longitude: number };
  zoom: number;
}

function GeofenceCircle({ geofence, center, zoom }: GeofenceCircleProps) {
  const position = latLngToPosition(geofence.latitude, geofence.longitude, center, zoom);
  const radiusPixels = geofence.radius * zoom / 5;

  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/40 dark:border-white/40"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        width: radiusPixels * 2,
        height: radiusPixels * 2,
        backgroundColor: geofence.color || 'rgba(0, 0, 0, 0.1)',
        opacity: geofence.fillOpacity || 0.3,
      }}
      data-testid={`geofence-${geofence.id}`}
    />
  );
}

interface RouteLineProps {
  route: RoutePoint[];
  center: { latitude: number; longitude: number };
  zoom: number;
}

function RouteLine({ route, center, zoom }: RouteLineProps) {
  const points = route.map(point => {
    const pos = latLngToPosition(point.latitude, point.longitude, center, zoom);
    return `${pos.x}% ${pos.y}%`;
  });

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none z-5">
      <polyline
        points={points.join(', ').replace(/%/g, '')}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-black dark:text-white"
        strokeDasharray="8 4"
      />
    </svg>
  );
}

function latLngToPosition(lat: number, lng: number, center: { latitude: number; longitude: number }, zoom: number) {
  const scale = zoom / 10;
  const x = 50 + (lng - center.longitude) * 1000 * scale;
  const y = 50 - (lat - center.latitude) * 1000 * scale;
  return { x, y };
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function MiniMapPreview({
  latitude,
  longitude,
  className,
}: {
  latitude: number;
  longitude: number;
  className?: string;
}) {
  return (
    <div 
      className={cn(
        "relative w-full h-32 bg-neutral-100 dark:bg-neutral-900 rounded-xl overflow-hidden",
        className
      )}
      data-testid="mini-map-preview"
    >
      <div className="absolute inset-0 grid-pattern opacity-20" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full bg-black dark:bg-white flex items-center justify-center shadow-lg">
          <MapPin className="h-4 w-4 text-white dark:text-black" />
        </div>
      </div>
      <div className="absolute bottom-2 left-2 right-2 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm rounded-lg px-2 py-1">
        <p className="text-xs font-mono text-black/60 dark:text-white/60 truncate">
          {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </p>
      </div>
    </div>
  );
}
