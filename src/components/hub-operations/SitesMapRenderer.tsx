import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Badge } from '@/components/ui/badge';
import { MapPin, Building2, Navigation, Crosshair, Calendar } from 'lucide-react';
import { format } from 'date-fns';
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

interface SitesMapRendererProps {
  sites: SiteWithGPS[];
  height?: string;
}

// PACT brand colors: Primary blue #0077B6, accent teal #00B4D8
const siteIcon = L.divIcon({
  className: 'custom-site-marker',
  html: `
    <div style="
      background: linear-gradient(135deg, #0077B6 0%, #00B4D8 100%);
      width: 28px;
      height: 28px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 3px 10px rgba(0,119,182,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -24],
});

const residenceIcon = L.divIcon({
  className: 'custom-residence-marker',
  html: `
    <div style="
      background-color: hsl(142, 71%, 45%);
      width: 20px;
      height: 20px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="white" style="transform: rotate(45deg);" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
      </svg>
    </div>
  `,
  iconSize: [20, 20],
  iconAnchor: [10, 20],
  popupAnchor: [0, -16],
});

function MapBoundsHandler({ sites }: { sites: SiteWithGPS[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (sites.length === 0) {
      map.setView([15.5, 32.5], 6);
      return;
    }
    
    const points: [number, number][] = [];
    sites.forEach(s => {
      points.push([s.gps_latitude, s.gps_longitude]);
      if (s.residence_latitude && s.residence_longitude) {
        points.push([s.residence_latitude, s.residence_longitude]);
      }
    });
    
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
          <Popup className="site-popup" minWidth={240} maxWidth={300}>
            <div className="p-0">
              {/* PACT Header */}
              <div className="px-3 py-2 rounded-t" style={{ background: 'linear-gradient(135deg, #0077B6 0%, #00B4D8 100%)' }}>
                <div className="font-semibold text-sm flex items-start gap-2 text-white">
                  <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{site.site_name}</span>
                </div>
                {site.site_code && (
                  <div className="text-xs text-white/80 mt-0.5 ml-6 font-mono">{site.site_code}</div>
                )}
              </div>
              
              <div className="p-3 space-y-2 text-xs">
                {/* Hub & CP Info */}
                {(site.hub_name || site.cp_name) && (
                  <div className="space-y-1.5 pb-2 border-b border-border/50">
                    {site.hub_name && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-14">Hub:</span>
                        <span className="font-medium" style={{ color: '#0077B6' }}>{site.hub_name}</span>
                      </div>
                    )}
                    {site.cp_name && (
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-14">CP:</span>
                        <Badge variant="outline" className="text-xs" style={{ borderColor: '#00B4D8', color: '#0077B6' }}>
                          {site.cp_name}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
                
                {/* Location Info */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-14">State:</span>
                    <span className="font-medium">{site.state_name}</span>
                  </div>
                  
                  {site.locality_name && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-14">Locality:</span>
                      <span>{site.locality_name}</span>
                    </div>
                  )}
                  
                  {site.activity_type && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-14">Activity:</span>
                      <Badge variant="secondary" className="text-xs">
                        {site.activity_type}
                      </Badge>
                    </div>
                  )}
                  
                  {site.last_visit_date && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-14">Last Visit:</span>
                      <span className="flex items-center gap-1 font-medium" style={{ color: '#0077B6' }}>
                        <Calendar className="h-3 w-3" />
                        {format(new Date(site.last_visit_date), 'dd MMM yyyy')}
                      </span>
                    </div>
                  )}
                </div>
                
                {/* GPS Info */}
                <div className="pt-2 mt-2 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Navigation className="h-3 w-3" style={{ color: '#00B4D8' }} />
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
      
      {sites.filter(s => s.residence_latitude && s.residence_longitude).map((site) => (
        <Marker
          key={`${site.id}-residence`}
          position={[site.residence_latitude!, site.residence_longitude!]}
          icon={residenceIcon}
        >
          <Popup className="residence-popup" minWidth={200} maxWidth={260}>
            <div className="p-1">
              <div className="font-semibold text-sm mb-2 flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0 text-green-600" />
                <span>{site.site_name} - Residence</span>
              </div>
              
              <div className="space-y-1.5 text-xs">
                {site.site_code && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-16">Site:</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {site.site_code}
                    </Badge>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground w-16">State:</span>
                  <span className="font-medium">{site.state_name}</span>
                </div>
                
                <div className="pt-1.5 mt-1.5 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Navigation className="h-3 w-3" />
                    <span className="font-mono text-[10px]">
                      {site.residence_latitude!.toFixed(5)}, {site.residence_longitude!.toFixed(5)}
                    </span>
                  </div>
                  
                  {(site.residence_altitude || site.residence_precision) && (
                    <div className="flex items-center gap-3 mt-1 text-muted-foreground">
                      {site.residence_altitude && (
                        <span className="text-[10px]">Alt: {site.residence_altitude.toFixed(1)}m</span>
                      )}
                      {site.residence_precision && (
                        <span className="flex items-center gap-0.5 text-[10px]">
                          <Crosshair className="h-2.5 w-2.5" />
                          {site.residence_precision.toFixed(1)}m
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
