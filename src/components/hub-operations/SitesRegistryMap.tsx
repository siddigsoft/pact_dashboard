import { useState, useEffect, lazy, Suspense } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MapPin, Loader2, Map, Building2, Navigation, Maximize2, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

interface SiteWithGPS {
  id: string;
  site_code: string | null;
  site_name: string;
  state_name: string;
  locality_name: string | null;
  hub_name?: string | null;
  cp_name?: string | null;
  gps_latitude: number;
  gps_longitude: number;
  gps_altitude?: number | null;
  gps_precision?: number | null;
  residence_latitude?: number | null;
  residence_longitude?: number | null;
  residence_altitude?: number | null;
  residence_precision?: number | null;
  source?: string;
  activity_type?: string | null;
  last_visit_date?: string | null;
  mmp_count?: number | null;
}

interface SitesRegistryMapProps {
  sites: SiteWithGPS[];
  height?: string;
}

const MapPlaceholder = () => (
  <div className="h-full w-full flex items-center justify-center bg-muted/30">
    <div className="text-center p-4">
      <Loader2 className="h-10 w-10 mx-auto mb-2 text-muted-foreground animate-spin" />
      <p className="text-sm text-muted-foreground">Loading map...</p>
    </div>
  </div>
);

const LazySitesMap = lazy(() => import('./SitesMapRenderer'));

export default function SitesRegistryMap({ sites, height = '400px' }: SitesRegistryMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const sitesWithGPS = sites.filter(s => 
    s.gps_latitude !== null && 
    s.gps_longitude !== null &&
    !isNaN(s.gps_latitude) &&
    !isNaN(s.gps_longitude)
  );

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (sitesWithGPS.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center text-center py-8">
            <Map className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No sites with GPS coordinates to display</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload GPS data to see sites on the map
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="flex items-center gap-2 text-base">
              <Map className="h-4 w-4" />
              Sites Map
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <MapPin className="h-3 w-3" />
                {sitesWithGPS.length} sites with GPS
              </Badge>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setIsFullscreen(true)}
                title="View fullscreen"
                data-testid="button-fullscreen-map"
              >
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div style={{ height }} className="rounded-b-lg overflow-hidden">
            {!isClient ? (
              <MapPlaceholder />
            ) : (
              <Suspense fallback={<MapPlaceholder />}>
                <LazySitesMap sites={sitesWithGPS} height={height} />
              </Suspense>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fullscreen Map Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-2 flex flex-row items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Map className="h-5 w-5" />
              Sites Map
              <Badge variant="secondary" className="ml-2 gap-1">
                <MapPin className="h-3 w-3" />
                {sitesWithGPS.length} sites
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 h-[calc(90vh-60px)]">
            {isClient && (
              <Suspense fallback={<MapPlaceholder />}>
                <LazySitesMap sites={sitesWithGPS} height="100%" />
              </Suspense>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
