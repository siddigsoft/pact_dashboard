import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Loader2 } from 'lucide-react';
import { dynamic } from '@/lib/utils';
import 'leaflet/dist/leaflet.css';

interface ReactLeafletMapProps {
  locations: Array<{
    id: string;
    name: string;
    latitude: number;
    longitude: number;
    type: 'user' | 'site';
    status?: string;
  }>;
  height?: string;
  onLocationClick?: (id: string) => void;
  mapType?: 'standard' | 'satellite' | 'terrain';
  defaultCenter?: [number, number];
  defaultZoom?: number;
}

// Dynamically import the map component with no SSR to avoid server-side rendering issues
const LeafletMapComponent = () => {
  const [loading, setLoading] = useState(true);
  
  const MapContainer = dynamic(
    () => import('./LeafletMapContainer').then((mod) => mod.default),
    { 
      ssr: false, 
      loading: () => (
        <div className="h-full w-full flex items-center justify-center bg-slate-100/50 backdrop-blur-sm">
          <div className="text-center p-4">
            <Loader2 className="h-12 w-12 mx-auto mb-2 text-primary animate-spin" />
            <p className="text-muted-foreground">Loading map data...</p>
          </div>
        </div>
      )
    }
  );
  
  return <MapContainer />;
};

const ReactLeafletMap: React.FC<ReactLeafletMapProps> = ({ 
  locations = [], 
  height = '500px', 
  onLocationClick,
  mapType = 'standard',
  defaultCenter = [20, 0], // Global default
  defaultZoom = 3  // Global zoom
}) => {
  const [isClient, setIsClient] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const MapPlaceholder = () => (
    <div className="h-full w-full flex items-center justify-center bg-slate-100/50 backdrop-blur-sm">
      <div className="text-center p-4">
        <Loader2 className="h-12 w-12 mx-auto mb-2 text-primary animate-spin" />
        <p className="text-muted-foreground">Loading map data...</p>
      </div>
    </div>
  );

  const MapError = () => (
    <div className="h-full w-full flex items-center justify-center bg-slate-100/50 backdrop-blur-sm">
      <div className="text-center p-4">
        <MapPin className="h-12 w-12 mx-auto mb-2 text-destructive/70" />
        <p className="text-muted-foreground">{error || "Failed to load map component"}</p>
      </div>
    </div>
  );

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        <div style={{ height, width: '100%' }} className="rounded-lg">
          {!isClient ? (
            <MapPlaceholder />
          ) : error ? (
            <MapError />
          ) : (
            <div className="h-full w-full">
              {/* Use the regular MapComponent from MapComponent.tsx instead */}
              <MapPlaceholder />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ReactLeafletMap;
