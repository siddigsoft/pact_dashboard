import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Badge } from '@/components/ui/badge';
import { MapPin, Building2, Navigation, Crosshair } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface SiteWithGPS {
  id: string;
  site_code: string | null;
  site_name: string;
  state_name: string;
  locality_name: string | null;
  gps_latitude: number;
  gps_longitude: number;
  gps_altitude?: number | null;
  gps_precision?: number | null;
  source?: string;
}

interface SitesMapRendererProps {
  sites: SiteWithGPS[];
  height?: string;
}

const siteIcon = L.divIcon({
  className: 'custom-site-marker',
  html: `
    <div style="
      background-color: hsl(222, 47%, 50%);
      width: 24px;
      height: 24px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 24],
  popupAnchor: [0, -20],
});

function MapBoundsHandler({ sites }: { sites: SiteWithGPS[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (sites.length === 0) {
      map.setView([15.5, 32.5], 6);
      return;
    }
    
    const points = sites.map(s => [s.gps_latitude, s.gps_longitude] as [number, number]);
    
    if (points.length === 1) {
      map.setView(points[0], 12);
    } else {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, sites]);
  
  return null;
}

export default function SitesMapRenderer({ sites, height = '400px' }: SitesMapRendererProps) {
  const defaultCenter: [number, number] = [15.5, 32.5];
  
  return (
    <MapContainer
      center={defaultCenter}
      zoom={6}
      style={{ height, width: '100%' }}
      scrollWheelZoom={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapBoundsHandler sites={sites} />
      
      {sites.map((site) => (
        <Marker
          key={site.id}
          position={[site.gps_latitude, site.gps_longitude]}
          icon={siteIcon}
        >
          <Popup className="site-popup" minWidth={220} maxWidth={280}>
            <div className="p-1">
              <div className="font-semibold text-sm mb-2 flex items-start gap-2">
                <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
                <span>{site.site_name}</span>
              </div>
              
              <div className="space-y-1.5 text-xs">
                {site.site_code && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Code:</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {site.site_code}
                    </Badge>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16">State:</span>
                  <span className="font-medium">{site.state_name}</span>
                </div>
                
                {site.locality_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Locality:</span>
                    <span>{site.locality_name}</span>
                  </div>
                )}
                
                <div className="pt-1.5 mt-1.5 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Navigation className="h-3 w-3" />
                    <span className="font-mono text-[10px]">
                      {site.gps_latitude.toFixed(5)}, {site.gps_longitude.toFixed(5)}
                    </span>
                  </div>
                  
                  {(site.gps_altitude || site.gps_precision) && (
                    <div className="flex items-center gap-3 mt-1 text-muted-foreground">
                      {site.gps_altitude && (
                        <span className="text-[10px]">Alt: {site.gps_altitude.toFixed(1)}m</span>
                      )}
                      {site.gps_precision && (
                        <span className="flex items-center gap-0.5 text-[10px]">
                          <Crosshair className="h-2.5 w-2.5" />
                          {site.gps_precision.toFixed(1)}m
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
