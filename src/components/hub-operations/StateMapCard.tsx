import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, Building2, Navigation, ChevronRight, Globe } from 'lucide-react';
import { MapContainer, TileLayer, Circle, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface StateMapCardProps {
  stateId: string;
  stateName: string;
  stateCode: string;
  localities: { id: string; name: string; nameAr?: string }[];
  siteCount: number;
  hubName?: string;
  coordinates: [number, number];
  onViewDetails?: () => void;
  isSelected?: boolean;
}

const stateCoordinates: { [key: string]: [number, number] } = {
  'khartoum': [15.5007, 32.5599],
  'gezira': [14.4, 33.5],
  'red-sea': [19.6, 37.2],
  'kassala': [15.45, 36.4],
  'gedaref': [14.0, 35.4],
  'white-nile': [13.2, 32.5],
  'blue-nile': [11.8, 34.2],
  'sennar': [13.5, 33.6],
  'north-kordofan': [13.9, 30.8],
  'south-kordofan': [11.2, 29.9],
  'west-kordofan': [12.7, 29.2],
  'north-darfur': [15.6, 24.9],
  'south-darfur': [11.7, 24.9],
  'west-darfur': [12.9, 22.5],
  'east-darfur': [11.5, 26.1],
  'central-darfur': [12.9, 23.5],
  'river-nile': [18.5, 33.9],
  'northern': [19.6, 30.4],
};

const stateColors: { [key: string]: string } = {
  'khartoum': '#8B5CF6',
  'gezira': '#10B981',
  'red-sea': '#EF4444',
  'kassala': '#F59E0B',
  'gedaref': '#6366F1',
  'white-nile': '#06B6D4',
  'blue-nile': '#3B82F6',
  'sennar': '#EC4899',
  'north-kordofan': '#84CC16',
  'south-kordofan': '#F97316',
  'west-kordofan': '#A855F7',
  'north-darfur': '#14B8A6',
  'south-darfur': '#F43F5E',
  'west-darfur': '#8B5CF6',
  'east-darfur': '#EAB308',
  'central-darfur': '#22C55E',
  'river-nile': '#0EA5E9',
  'northern': '#D946EF',
};

export function getStateCoords(stateId: string): [number, number] {
  return stateCoordinates[stateId] || [15.5, 32.5];
}

export function getStateColor(stateId: string): string {
  return stateColors[stateId] || '#6B7280';
}

const createStateMarker = (color: string) => {
  return L.divIcon({
    className: 'custom-state-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

export default function StateMapCard({
  stateId,
  stateName,
  stateCode,
  localities,
  siteCount,
  hubName,
  coordinates,
  onViewDetails,
  isSelected = false,
}: StateMapCardProps) {
  const stateColor = getStateColor(stateId);
  const stateCoords = coordinates || getStateCoords(stateId);

  return (
    <Card 
      className={`overflow-hidden transition-all duration-300 hover:shadow-lg ${isSelected ? 'ring-2 ring-primary' : ''}`}
      data-testid={`card-state-${stateId}`}
    >
      <div className="h-32 relative">
        <MapContainer
          center={stateCoords}
          zoom={7}
          style={{ height: '100%', width: '100%' }}
          zoomControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Circle
            center={stateCoords}
            radius={80000}
            pathOptions={{
              color: stateColor,
              fillColor: stateColor,
              fillOpacity: 0.2,
              weight: 2,
            }}
          />
          <Marker 
            position={stateCoords} 
            icon={createStateMarker(stateColor)}
          />
        </MapContainer>
        <div className="absolute top-2 left-2 z-[1000]">
          <Badge 
            className="text-white border-0"
            style={{ backgroundColor: stateColor }}
          >
            {stateCode}
          </Badge>
        </div>
      </div>
      
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center justify-between gap-2">
          <span className="truncate">{stateName}</span>
          <div 
            className="w-3 h-3 rounded-full flex-shrink-0" 
            style={{ backgroundColor: stateColor }}
          />
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Globe className="h-4 w-4" />
            <span>{localities.length} Localities</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Navigation className="h-4 w-4" />
            <span>{siteCount} Sites</span>
          </div>
        </div>
        
        {hubName && (
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Hub:</span>
            <Badge variant="outline" className="text-xs">
              {hubName}
            </Badge>
          </div>
        )}
        
        <Button 
          variant="outline" 
          size="sm" 
          className="w-full"
          onClick={onViewDetails}
          data-testid={`button-view-state-${stateId}`}
        >
          View Details
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </CardContent>
    </Card>
  );
}
