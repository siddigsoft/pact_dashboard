import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Loader2 } from 'lucide-react';
import type { MapViewportId } from '@/data/mapViewports';
import 'leaflet/dist/leaflet.css';

interface ReactLeafletMapProps {
  locations: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    type: 'user' | 'site';
    status?: string;
    phone?: string;
    lastActive?: string;
    workload?: number;
    avatar?: string;
  }>;
  height?: string;
  onLocationClick?: (id: string) => void;
  mapType?: 'standard' | 'satellite' | 'terrain';
  defaultCenter?: [number, number];
  defaultZoom?: number;
  viewportId?: MapViewportId;
  fitLocationsRevision?: number;
  initialFitToMarkers?: boolean;
  fillContainer?: boolean;
}

const MapPlaceholder = () => (
  <div className="h-full w-full flex items-center justify-center bg-slate-100/50 dark:bg-slate-900/50 backdrop-blur-sm">
    <div className="text-center p-4">
      <Loader2 className="h-12 w-12 mx-auto mb-2 text-black dark:text-white animate-spin" />
      <p className="text-muted-foreground">Loading map...</p>
    </div>
  </div>
);

const LazyLeafletMapContainer = lazy(() => import('./LeafletMapContainer'));

const ReactLeafletMap: React.FC<ReactLeafletMapProps> = ({
  locations = [],
  height = '500px',
  onLocationClick,
  mapType = 'standard',
  defaultCenter = [15.5, 32.5],
  defaultZoom = 6,
  viewportId,
  fitLocationsRevision = 0,
  initialFitToMarkers = false,
  fillContainer = false,
}) => {
  const [isClient, setIsClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const MapError = () => (
    <div className="h-full w-full flex items-center justify-center bg-slate-100/50 dark:bg-slate-900/50 backdrop-blur-sm">
      <div className="text-center p-4">
        <MapPin className="h-12 w-12 mx-auto mb-2 text-destructive/70" />
        <p className="text-muted-foreground">{error || 'Failed to load map'}</p>
      </div>
    </div>
  );

  const mapInner = (
    <div
      style={{ height, width: '100%', minHeight: fillContainer ? 400 : undefined }}
      className={fillContainer ? 'h-full w-full min-h-[400px]' : 'rounded-lg overflow-hidden'}
    >
      {!isClient ? (
        <MapPlaceholder />
      ) : error ? (
        <MapError />
      ) : (
        <Suspense fallback={<MapPlaceholder />}>
          <LazyLeafletMapContainer
            locations={locations}
            height={height}
            onLocationClick={onLocationClick}
            mapType={mapType}
            defaultCenter={defaultCenter}
            defaultZoom={defaultZoom}
            viewportId={viewportId}
            fitLocationsRevision={fitLocationsRevision}
            initialFitToMarkers={initialFitToMarkers}
          />
        </Suspense>
      )}
    </div>
  );

  if (fillContainer) {
    return <div className="h-full w-full">{mapInner}</div>;
  }

  return (
    <Card className="w-full h-full">
      <CardContent className="p-0 h-full">
        {mapInner}
      </CardContent>
    </Card>
  );
};

export default ReactLeafletMap;

