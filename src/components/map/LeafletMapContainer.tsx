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

const escapeHtml = (str: string): string => {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };
  return str.replace(/[&<>"'`=/]/g, (char) => htmlEntities[char] || char);
};

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
  showHubs?: boolean;
}

// This component will adjust the map bounds to fit all locations or fall back to provided center/zoom
const MapBoundsHandler = ({ 
  locations, 
  defaultCenter, 
  defaultZoom 
}: { 
  locations: LeafletMapContainerProps['locations'];
  defaultCenter: [number, number];
  defaultZoom: number;
}) => {
  const map = useMap();
  
  useEffect(() => {
    if (!locations || locations.length === 0) {
      try {
        map.setView(defaultCenter, defaultZoom);
      } catch (error) {
        // ignore
      }
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
  }, [map, locations, defaultCenter, defaultZoom]);
  
  return null;
};

const createMarkerIcon = (type: 'user' | 'site', status?: string, avatar?: string, name?: string) => {
  const statusColor = type === 'user'
    ? (status === 'online' ? '#10b981' : status === 'busy' ? '#f59e0b' : '#6b7280')
    : (status === 'completed' ? '#10b981' : status === 'inProgress' ? '#6366f1' :
       status === 'assigned' ? '#f59e0b' : '#ef4444');

  if (type === 'site') {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div style="
          background-color: ${statusColor};
          width: 20px;
          height: 20px;
          border-radius: 4px;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }

  const safeName = name ? escapeHtml(name) : '';
  const safeAvatar = avatar ? escapeHtml(avatar) : '';
  const initials = name ? escapeHtml(name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()) : '?';
  const statusRingColor = status === 'online' ? '#10b981' : status === 'busy' ? '#f59e0b' : '#6b7280';
  const pulseAnimation = status === 'online' ? 'animation: pulse 2s infinite;' : '';
  
  if (avatar) {
    return L.divIcon({
      className: 'custom-user-marker',
      html: `
        <style>
          @keyframes pulse {
            0%, 100% { box-shadow: 0 0 0 0 ${statusRingColor}80; }
            50% { box-shadow: 0 0 0 6px ${statusRingColor}00; }
          }
        </style>
        <div style="
          position: relative;
          width: 44px;
          height: 44px;
          ${pulseAnimation}
        ">
          <div style="
            position: absolute;
            top: 0;
            left: 0;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            border: 3px solid ${statusRingColor};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            overflow: hidden;
            background: white;
          ">
            <img 
              src="${safeAvatar}" 
              alt="${safeName || 'User'}"
              style="width: 100%; height: 100%; object-fit: cover;"
              onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
            />
            <div style="
              display: none;
              width: 100%;
              height: 100%;
              background: linear-gradient(135deg, ${statusRingColor}90, ${statusRingColor});
              color: white;
              font-size: 14px;
              font-weight: bold;
              align-items: center;
              justify-content: center;
            ">${initials}</div>
          </div>
          <div style="
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: ${statusRingColor};
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          "></div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
      popupAnchor: [0, -22],
    });
  }

  return L.divIcon({
    className: 'custom-user-marker',
    html: `
      <style>
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 ${statusRingColor}80; }
          50% { box-shadow: 0 0 0 6px ${statusRingColor}00; }
        }
      </style>
      <div style="
        position: relative;
        width: 44px;
        height: 44px;
        ${pulseAnimation}
      ">
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 3px solid ${statusRingColor};
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
          overflow: hidden;
          background: linear-gradient(135deg, ${statusRingColor}90, ${statusRingColor});
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <span style="
            color: white;
            font-size: 14px;
            font-weight: bold;
            text-shadow: 0 1px 2px rgba(0,0,0,0.3);
          ">${initials}</span>
        </div>
        <div style="
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${statusRingColor};
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        "></div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
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
  defaultCenter = [20, 0],
  defaultZoom = 3,
  showHubs = false
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
        minZoom={2}
        maxBounds={[
          [-90, -180], // Southwest coordinates
          [90, 180]  // Northeast coordinates
        ]}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        
        {/* Add Hub Highlights */}
        {showHubs && hubs.map(hub => (
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
            icon={createMarkerIcon(location.type, location.status, location.avatar, location.name)}
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
        
        <MapBoundsHandler locations={locations} defaultCenter={defaultCenter} defaultZoom={defaultZoom} />
      </MapContainer>
    </div>
  );
};

export default LeafletMapContainer;
