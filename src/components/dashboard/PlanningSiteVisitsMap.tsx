import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, LatLngBounds } from 'leaflet';
import { MapPin, Calendar, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SiteVisit } from '@/types/siteVisit';
import { format } from 'date-fns';
import 'leaflet/dist/leaflet.css';

interface PlanningSiteVisitsMapProps {
  siteVisits: SiteVisit[];
}

const FitBounds: React.FC<{ visits: SiteVisit[] }> = ({ visits }) => {
  const map = useMap();

  React.useEffect(() => {
    if (visits.length > 0) {
      const bounds = new LatLngBounds(
        visits
          .filter(v => v.coordinates?.latitude && v.coordinates?.longitude)
          .map(v => [v.coordinates.latitude, v.coordinates.longitude])
      );
      
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }
    }
  }, [visits, map]);

  return null;
};

const createSiteIcon = (status: string, priority: string) => {
  let color = '#3b82f6';
  
  if (status === 'pending') color = '#f97316';
  else if (status === 'assigned') color = '#06b6d4';
  else if (status === 'completed') color = '#10b981';
  else if (priority === 'high') color = '#ef4444';
  
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    `)}`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const PlanningSiteVisitsMap: React.FC<PlanningSiteVisitsMapProps> = ({ siteVisits }) => {
  const visitsWithCoords = useMemo(() => {
    return siteVisits.filter(visit => 
      visit.coordinates?.latitude && visit.coordinates?.longitude
    );
  }, [siteVisits]);

  const defaultCenter: [number, number] = visitsWithCoords.length > 0
    ? [visitsWithCoords[0].coordinates.latitude, visitsWithCoords[0].coordinates.longitude]
    : [12.8628, 30.2176];

  if (visitsWithCoords.length === 0) {
    return (
      <div className="h-[500px] w-full rounded-lg border flex items-center justify-center bg-muted/20">
        <div className="text-center p-6">
          <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-semibold text-lg mb-2">No Site Visits with Locations</h3>
          <p className="text-sm text-muted-foreground">
            Site visits will appear on the map once they have location data
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[500px] w-full rounded-lg overflow-hidden border shadow-sm">
      <MapContainer
        center={defaultCenter}
        zoom={6}
        scrollWheelZoom={true}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds visits={visitsWithCoords} />
        
        {visitsWithCoords.map((visit) => (
          <Marker
            key={visit.id}
            position={[visit.coordinates.latitude, visit.coordinates.longitude]}
            icon={createSiteIcon(visit.status, visit.priority)}
          >
            <Popup>
              <div className="p-2 min-w-[250px]">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  {visit.siteName}
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Site Code:</span>
                    <span className="font-mono font-medium">{visit.siteCode}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant={
                      visit.status === 'completed' ? 'default' :
                      visit.status === 'assigned' ? 'secondary' :
                      'outline'
                    } className="text-xs h-5">
                      {visit.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Priority:</span>
                    <Badge variant={
                      visit.priority === 'high' ? 'destructive' :
                      visit.priority === 'medium' ? 'default' :
                      'outline'
                    } className="text-xs h-5">
                      {visit.priority}
                    </Badge>
                  </div>
                  {visit.scheduledDate && (
                    <div className="flex items-center justify-between gap-2 pt-1 border-t">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Scheduled:
                      </span>
                      <span className="font-medium">
                        {format(new Date(visit.scheduledDate), 'MMM dd, yyyy')}
                      </span>
                    </div>
                  )}
                  {visit.location?.address && (
                    <div className="pt-1 border-t">
                      <span className="text-muted-foreground">Location:</span>
                      <p className="text-xs mt-0.5">{visit.location.address}</p>
                    </div>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default PlanningSiteVisitsMap;
