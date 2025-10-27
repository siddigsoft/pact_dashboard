import React, { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import HubHighlight from './HubHighlight';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Clock, MapPin, Briefcase } from "lucide-react";
import { hubs, sudanStates } from '@/data/sudanStates';
import 'leaflet/dist/leaflet.css';

// Delete L.Icon.Default markers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

// Hub colors mapping
const hubColors = {
  'kassala-hub': '#9b87f5',      // Primary Purple
  'kosti-hub': '#F97316',        // Bright Orange
  'forchana-hub': '#D946EF',     // Magenta Pink
  'dongola-hub': '#0EA5E9',      // Ocean Blue
  'country-office': '#8B5CF6',   // Vivid Purple
};

interface LeafletMapContainerProps {
  locations?: Array<{
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
}

// This component will adjust the map bounds to fit all locations
const MapBoundsHandler = ({ locations }: { locations: LeafletMapContainerProps['locations'] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (!locations || locations.length === 0) {
      return;
    }
    
    const allPoints = locations
      .filter(loc => loc.latitude && loc.longitude)
      .map(loc => [loc.latitude, loc.longitude]);
      
    if (allPoints.length > 0) {
      try {
        const bounds = L.latLngBounds(allPoints as [number, number][]);
        map.fitBounds(bounds, { padding: [50, 50] });
      } catch (error) {
        console.error("Error setting map bounds:", error);
      }
    }
  }, [map, locations]);
  
  return null;
};

const createMarkerIcon = (type: 'user' | 'site', status?: string) => {
  const color = type === 'user'
    ? (status === 'online' ? '#10b981' : status === 'busy' ? '#f59e0b' : '#6b7280')
    : (status === 'completed' ? '#10b981' : status === 'inProgress' ? '#6366f1' :
       status === 'assigned' ? '#f59e0b' : '#ef4444');

  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${color};
        width: 16px;
        height: 16px;
        border-radius: ${type === 'user' ? '50%' : '2px'};
        border: 2px solid white;
        box-shadow: 0 0 0 2px ${color}40;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 8px;
        color: white;
        font-weight: bold;
      ">${type === 'user' ? '👤' : '🏢'}</div>
    `,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
};

const HubsLayer = () => {
  const map = useMap();

  useEffect(() => {
    hubs.forEach(hub => {
      const hubStates = hub.states.map(stateId => 
        sudanStates.find(state => state.id === stateId)
      ).filter(Boolean);

      hubStates.forEach(state => {
        if (state) {
          const stateCoordinates = getStateCoordinates(state.id);
          if (stateCoordinates) {
            const circle = L.circle(stateCoordinates, {
              color: hubColors[hub.id as keyof typeof hubColors] || '#6b7280',
              fillColor: hubColors[hub.id as keyof typeof hubColors] || '#6b7280',
              fillOpacity: 0.2,
              weight: 2,
              radius: 50000
            }).addTo(map);

            circle.bindPopup(`
              <div class="p-2">
                <strong>${hub.name}</strong>
                <br />
                State: ${state.name}
              </div>
            `);
          }
        }
      });
    });
  }, [map]);

  return null;
};

const getStateCoordinates = (stateId: string): [number, number] | null => {
  const coordinates: { [key: string]: [number, number] } = {
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
    'north-darfur': [15.6, 24.9],
    'south-darfur': [11.7, 24.9],
    'west-darfur': [12.9, 23.5],
    'east-darfur': [11.5, 26.1],
    'central-darfur': [12.9, 23.5],
    'river-nile': [18.5, 33.9],
    'northern': [19.6, 30.4],
    'west-kordofan': [12.7, 29.2],
  };
  
  return coordinates[stateId] || null;
};

const LeafletMapContainer: React.FC<LeafletMapContainerProps> = ({ 
  locations = [], 
  height = '500px',
  onLocationClick,
  mapType = 'standard',
  defaultCenter = [15.5007, 32.5599],
  defaultZoom = 6
}) => {
  const formatLastActive = (lastActive?: string) => {
    if (!lastActive) return 'Never';
    const date = new Date(lastActive);
    return date.toLocaleString();
  };

  return (
    <div style={{ height: '100%', width: '100%' }} className="rounded-lg">
      <MapContainer 
        center={defaultCenter} 
        zoom={defaultZoom}
        style={{ height: '100%', width: '100%' }}
        className="rounded-lg"
        minZoom={5}
        maxBounds={[
          [8.5, 21.8], // Southwest coordinates
          [22.5, 39.0]  // Northeast coordinates
        ]}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* Add Hub Highlights */}
        {hubs.map(hub => (
          <HubHighlight
            key={hub.id}
            hub={hub}
            color={hubColors[hub.id as keyof typeof hubColors] || '#6b7280'}
          />
        ))}
        
        {locations && locations.map(location => (
          <Marker 
            key={location.id}
            position={[location.latitude, location.longitude]}
            icon={createMarkerIcon(location.type, location.status)}
            eventHandlers={{
              click: () => onLocationClick && onLocationClick(location.id)
            }}
          >
            <Popup>
              <Card className="w-[300px] border-none shadow-none">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={location.avatar} />
                      <AvatarFallback>{location.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <h3 className="font-semibold text-base">{location.name}</h3>
                      <div className="flex items-center gap-1 mt-1">
                        <Badge variant={location.status === 'online' ? 'default' : 'secondary'}>
                          {location.status}
                        </Badge>
                        {location.workload !== undefined && (
                          <Badge variant="outline">
                            {location.workload} tasks
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {location.type === 'user' && location.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{location.phone}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>
                        [{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}]
                      </span>
                    </div>
                    {location.type === 'user' && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        <span>Last active: {formatLastActive(location.lastActive)}</span>
                      </div>
                    )}
                    {location.type === 'user' && location.workload !== undefined && (
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        <span>Workload: {location.workload} tasks</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Popup>
          </Marker>
        ))}
        
        <MapBoundsHandler locations={locations} />
      </MapContainer>
    </div>
  );
};

export default LeafletMapContainer;
