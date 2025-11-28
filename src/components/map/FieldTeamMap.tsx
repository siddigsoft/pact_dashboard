import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '@/context/user/UserContext';
import { Clock, Navigation, CheckCircle, Clock3, AlertTriangle, MapPin, UserCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { calculateDistance } from '@/utils/collectorUtils';
import { User, SiteVisit } from '@/types';
import 'leaflet/dist/leaflet.css';

interface FieldTeamMapProps {
  siteVisits?: SiteVisit[];
  height?: string;
  showControls?: boolean;
  onAssign?: (siteVisitId: string) => void;
  eligibleCollectors?: User[];
  selectedUserId?: string | null;
  onUserSelect?: (userId: string) => void;
}

const MapPlaceholder = () => (
  <div className="h-full w-full flex items-center justify-center bg-slate-100">
    <div className="text-center p-4">
      <MapPin className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
      <p className="text-muted-foreground">Map loading...</p>
    </div>
  </div>
);

const FieldTeamMap: React.FC<FieldTeamMapProps> = ({ 
  siteVisits = [], 
  height = "500px",
  showControls = true,
  onAssign,
  eligibleCollectors = [],
  selectedUserId = null,
  onUserSelect
}) => {
  const { users, currentUser } = useUser();
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'online' | 'offline' | 'busy'>('all');
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [isClient, setIsClient] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const [leafletLoaded, setLeafletLoaded] = useState(false);
  const [leafletModule, setLeafletModule] = useState<any>(null);
  const [reactLeafletModule, setReactLeafletModule] = useState<any>(null);
  const [map, setMap] = useState<any>(null);
  const [routeLayer, setRouteLayer] = useState<any>(null);

  useEffect(() => {
    setIsClient(true);
    
    const loadLeafletLibraries = async () => {
      try {
        const L = await import('leaflet');
        const ReactLeaflet = await import('react-leaflet');
        
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
        });
        
        setLeafletModule(L);
        setReactLeafletModule(ReactLeaflet);
        setLeafletLoaded(true);
      } catch (error) {
        console.error("Error loading map libraries:", error);
        setMapError("Failed to load map libraries");
      }
    };
    
    if (typeof window !== 'undefined') {
      loadLeafletLibraries();
    }
    
    return () => {
      setLeafletLoaded(false);
      setLeafletModule(null);
      setReactLeafletModule(null);
      setIsClient(false);
      
      if (routeLayer && map) {
        routeLayer.remove();
      }
    };
  }, []);
  
  useEffect(() => {
    if (eligibleCollectors && eligibleCollectors.length > 0) {
      setActiveUsers(eligibleCollectors);
      return;
    }
    
    if (!users) return;
    
    const usersWithLocation = users.filter(user => 
      user?.location?.latitude && 
      user?.location?.longitude &&
      (selectedFilter === 'all' || user.availability === selectedFilter) &&
      (selectedRegion === 'all' || user.location.region === selectedRegion || user?.stateId === selectedRegion)
    );
    setActiveUsers(usersWithLocation);
  }, [users, selectedFilter, selectedRegion, eligibleCollectors]);

  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const createUserIcon = (status: string, isSelected: boolean = false, avatar?: string, name?: string) => {
    if (!leafletModule || !isClient) return null;
    
    const statusColor = 
      status === 'online' ? '#10b981' : 
      status === 'busy' ? '#f59e0b' : 
      '#6b7280';
    
    const borderColor = isSelected ? '#3b82f6' : statusColor;
    const size = isSelected ? 48 : 44;
    const initials = name ? escapeHtml(name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()) : '?';
    const safeAvatar = avatar ? escapeHtml(avatar) : '';
    const pulseAnimation = status === 'online' ? 'animation: pulse 2s infinite;' : '';
    
    if (avatar) {
      return leafletModule.divIcon({
        className: 'custom-user-marker',
        html: `
          <style>
            @keyframes pulse {
              0%, 100% { box-shadow: 0 0 0 0 ${statusColor}80; }
              50% { box-shadow: 0 0 0 6px ${statusColor}00; }
            }
          </style>
          <div style="
            position: relative;
            width: ${size}px;
            height: ${size}px;
            ${pulseAnimation}
          ">
            <div style="
              position: absolute;
              top: 0;
              left: 0;
              width: ${size}px;
              height: ${size}px;
              border-radius: 50%;
              border: 3px solid ${borderColor};
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
              overflow: hidden;
              background: white;
            ">
              <img 
                src="${safeAvatar}" 
                alt="${escapeHtml(name || 'User')}"
                style="width: 100%; height: 100%; object-fit: cover;"
                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
              />
              <div style="
                display: none;
                width: 100%;
                height: 100%;
                background: linear-gradient(135deg, ${statusColor}90, ${statusColor});
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
              background: ${statusColor};
              border: 2px solid white;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            "></div>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -size / 2],
      });
    }
    
    // Fallback to initials icon when no avatar
    return leafletModule.divIcon({
      className: 'custom-user-marker',
      html: `
        <div style="
          position: relative;
          width: ${size}px;
          height: ${size}px;
        ">
          <div style="
            position: absolute;
            top: 0;
            left: 0;
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            border: 3px solid ${borderColor};
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            background: linear-gradient(135deg, ${statusColor}90, ${statusColor});
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 14px;
            font-weight: bold;
          ">${initials}</div>
          <div style="
            position: absolute;
            bottom: -2px;
            right: -2px;
            width: 14px;
            height: 14px;
            border-radius: 50%;
            background: ${statusColor};
            border: 2px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          "></div>
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2],
    });
  };

  const createSiteVisitIcon = (status: string) => {
    if (!leafletModule || !isClient) return null;
    
    const color = 
      status === 'completed' ? '#10b981' : 
      status === 'inProgress' ? '#6366f1' : 
      status === 'assigned' ? '#f59e0b' : 
      '#ef4444';
    
    return new leafletModule.Icon({
      iconUrl: `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="36" height="36">
          <rect x="2" y="2" width="20" height="18" rx="2" stroke="white" stroke-width="1.5" fill="none" />
          <rect x="6" y="6" width="3" height="3" fill="white" />
          <rect x="11" y="6" width="3" height="3" fill="white" />
          <rect x="16" y="6" width="3" height="3" fill="white" />
          <rect x="6" y="11" width="3" height="3" fill="white" />
          <rect x="11" y="11" width="3" height="3" fill="white" />
          <rect x="16" y="11" width="3" height="3" fill="white" />
        </svg>
      `)}`,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -36]
    });
  };

  const userLocations = useMemo(() => 
    activeUsers
      .filter(user => user.location?.latitude !== undefined && user.location?.longitude !== undefined)
      .map(user => [user.location.latitude, user.location.longitude] as [number, number]),
    [activeUsers]
  );
  
  const siteLocations = useMemo(() => 
    siteVisits
      .filter(site => site.coordinates?.latitude !== undefined && site.coordinates?.longitude !== undefined)
      .map(site => [site.coordinates.latitude, site.coordinates.longitude] as [number, number]),
    [siteVisits]
  );

  const drawRoute = (map: any, siteLocation: [number, number], userLocation: [number, number]) => {
    if (!leafletModule || !map) return null;
    
    if (routeLayer) {
      routeLayer.remove();
    }
    
    const route = leafletModule.polyline(
      [siteLocation, userLocation],
      { 
        color: '#3b82f6',
        weight: 4,
        opacity: 0.8,
        dashArray: '10, 10',
        lineCap: 'round',
        lineJoin: 'round'
      }
    );
    
    route.addTo(map);
    setRouteLayer(route);
    
    return route;
  };

  const drawEligibleRoutes = (map: any, siteLocation: [number, number], eligibleUsers: User[]) => {
    if (!leafletModule || !map) return null;
    
    const layers: any[] = [];
    
    eligibleUsers.forEach(user => {
      if (!user.location?.latitude || !user.location?.longitude) return;
      
      const userLocation: [number, number] = [user.location.latitude, user.location.longitude];
      
      if (user.id === selectedUserId) return;
      
      const route = leafletModule.polyline(
        [siteLocation, userLocation],
        { 
          color: '#6b7280',
          weight: 2,
          opacity: 0.3,
          dashArray: '5, 10'
        }
      );
      
      route.addTo(map);
      layers.push(route);
    });
    
    return layers;
  };

  const getUserStatusIndicator = (user: User) => {
    if (user.availability === 'online') {
      return (
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-green-500"></span>
          <span className="text-xs">Available</span>
        </div>
      );
    } else if (user.availability === 'busy') {
      return (
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-500"></span>
          <span className="text-xs">Busy</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gray-500"></span>
          <span className="text-xs">Offline</span>
        </div>
      );
    }
  };

  const calculateETA = (userLat: number, userLng: number, siteLat: number, siteLng: number) => {
    const distanceKm = calculateDistance(userLat, userLng, siteLat, siteLng);
    const timeHours = distanceKm / 30;
    
    if (timeHours < 1) {
      return `~${Math.round(timeHours * 60)} mins`;
    }
    return `~${Math.round(timeHours * 10) / 10} hours`;
  };

  const renderControls = () => {
    if (!showControls) return null;
    
    return (
      <div className="p-2 bg-muted/20 border-b flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button 
            size="sm" 
            variant={selectedFilter === 'all' ? 'default' : 'outline'} 
            onClick={() => setSelectedFilter('all')}
          >
            All Staff
          </Button>
          <Button 
            size="sm" 
            variant={selectedFilter === 'online' ? 'default' : 'outline'} 
            onClick={() => setSelectedFilter('online')}
            className="text-green-600"
          >
            <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
            Available
          </Button>
          <Button 
            size="sm" 
            variant={selectedFilter === 'busy' ? 'default' : 'outline'} 
            onClick={() => setSelectedFilter('busy')}
            className="text-amber-600"
          >
            <span className="h-2 w-2 rounded-full bg-amber-500 mr-1"></span>
            Busy
          </Button>
          <Button 
            size="sm" 
            variant={selectedFilter === 'offline' ? 'default' : 'outline'} 
            onClick={() => setSelectedFilter('offline')}
            className="text-gray-600"
          >
            <span className="h-2 w-2 rounded-full bg-gray-500 mr-1"></span>
            Offline
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            <MapPin className="h-3 w-3 text-primary" />
            <span>Sites:</span>
          </div>
          <Badge variant="success" className="text-xs">
            <span className="h-2 w-2 rounded-full bg-green-500 mr-1"></span>
            Completed
          </Badge>
          <Badge variant="secondary" className="text-xs">
            <span className="h-2 w-2 rounded-full bg-indigo-500 mr-1"></span>
            In Progress
          </Badge>
          <Badge variant="warning" className="text-xs">
            <span className="h-2 w-2 rounded-full bg-amber-500 mr-1"></span>
            Assigned
          </Badge>
          <Badge variant="destructive" className="text-xs">
            <span className="h-2 w-2 rounded-full bg-red-500 mr-1"></span>
            Pending
          </Badge>
        </div>
      </div>
    );
  };

  if (!isClient || mapError || !leafletLoaded) {
    return (
      <Card className="w-full">
        <CardContent className="p-0">
          {renderControls()}
          <div style={{ height, width: '100%' }}>
            <MapPlaceholder />
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderMap = () => {
    if (!reactLeafletModule || !leafletLoaded) return <MapPlaceholder />;

    const { MapContainer, TileLayer, Marker, Popup, Circle, useMap } = reactLeafletModule;
    const defaultCenter: [number, number] = [20, 0];
    
    const MapBoundsComponent = () => {
      const map = useMap();
      
      useEffect(() => {
        if (!leafletModule || (userLocations.length === 0 && siteLocations.length === 0)) return;
        
        setMap(map);
        
        const allPoints = [...userLocations, ...siteLocations];
        if (allPoints.length > 0) {
          try {
            const bounds = new leafletModule.LatLngBounds(allPoints);
            map.fitBounds(bounds, { padding: [50, 50] });
          } catch (error) {
            console.error("Error setting map bounds:", error);
          }
        }
      }, [map]);
      
      useEffect(() => {
        if (!map || !selectedUserId || siteVisits.length === 0) return;
        
        const site = siteVisits[0];
        if (!site.coordinates?.latitude || !site.coordinates?.longitude) return;
        
        const selectedUser = activeUsers.find(user => user.id === selectedUserId);
        if (!selectedUser?.location?.latitude || !selectedUser?.location?.longitude) return;
        
        const siteLocation: [number, number] = [
          site.coordinates.latitude,
          site.coordinates.longitude
        ];
        
        const userLocation: [number, number] = [
          selectedUser.location.latitude,
          selectedUser.location.longitude
        ];
        
        drawRoute(map, siteLocation, userLocation);
        
        drawEligibleRoutes(map, siteLocation, activeUsers);
      }, [selectedUserId, map]);
      
      return null;
    };
    
    return (
      <div style={{ height, width: '100%' }}>
        <MapContainer 
          key={`map-${userLocations.length}-${siteLocations.length}-${selectedUserId}`}
          center={defaultCenter} 
          zoom={3} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          {activeUsers.map(user => {
            if (!user.location?.latitude || !user.location?.longitude) return null;
            
            const isSelected = user.id === selectedUserId;
            const userIcon = createUserIcon(user.availability || 'offline', isSelected, user.avatar, user.name);
            if (!userIcon) return null;
            
            const position: [number, number] = [user.location.latitude, user.location.longitude];
            
            return (
              <React.Fragment key={`user-${user.id}`}>
                <Marker 
                  position={position} 
                  icon={userIcon}
                  eventHandlers={{
                    click: () => {
                      if (onUserSelect) {
                        onUserSelect(user.id);
                      }
                    }
                  }}
                >
                  <Popup>
                    <div className="p-1">
                      <div className="font-medium">{user.name}</div>
                      <div className="text-sm">{user.role}</div>
                      <div className="flex items-center justify-between mt-1">
                        {getUserStatusIndicator(user)}
                        <Button 
                          size="sm" 
                          variant="link" 
                          className="p-0 h-auto text-xs"
                          onClick={() => navigate(`/users/${user.id}`)}
                        >
                          View Profile
                        </Button>
                      </div>
                      
                      <div className="mt-2 text-xs">
                        <span className="text-muted-foreground">Current workload:</span>{' '}
                        <Badge variant="outline" className="ml-1">
                          {user.performance?.currentWorkload || 0}/30
                        </Badge>
                      </div>
                      
                      {siteVisits.length === 1 && onUserSelect && (
                        <Button 
                          size="sm" 
                          variant={isSelected ? "default" : "outline"}
                          className="w-full mt-2"
                          onClick={() => onUserSelect(user.id)}
                        >
                          {isSelected ? 'Selected' : 'Select Collector'}
                        </Button>
                      )}
                      
                      {user.availability === 'online' && (
                        <div className="text-xs mt-1">
                          <span className="text-muted-foreground">Last active:</span> {
                            user.lastActive ? new Date(user.lastActive).toLocaleTimeString() : 'Unknown'
                          }
                        </div>
                      )}
                      
                      {siteVisits.length === 1 && siteVisits[0].coordinates?.latitude && (
                        <div className="text-xs mt-1 pt-1 border-t">
                          <span className="text-muted-foreground">ETA to site:</span> {
                            calculateETA(
                              user.location.latitude,
                              user.location.longitude,
                              siteVisits[0].coordinates.latitude,
                              siteVisits[0].coordinates.longitude
                            )
                          }
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
                
                {(isSelected || user.id === currentUser?.id) && (
                  <Circle
                    center={position}
                    radius={isSelected ? 1000 : 500}
                    pathOptions={{
                      fillColor: isSelected ? '#3b82f6' : '#6b7280',
                      fillOpacity: 0.1,
                      color: isSelected ? '#3b82f6' : '#6b7280',
                      weight: isSelected ? 2 : 1
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
          
          {siteVisits.map(site => {
            if (!site.coordinates?.latitude || !site.coordinates?.longitude) return null;
            
            const siteIcon = createSiteVisitIcon(site.status);
            if (!siteIcon) return null;
            
            const position: [number, number] = [site.coordinates.latitude, site.coordinates.longitude];
            
            return (
              <Marker
                key={`site-${site.id}`}
                position={position}
                icon={siteIcon}
              >
                <Popup>
                  <div className="p-1">
                    <div className="font-medium">{site.siteName}</div>
                    <div className="text-xs text-muted-foreground">{site.location?.address}</div>
                    <Badge 
                      className="mt-1" 
                      variant={
                        site.status === 'completed' ? 'success' : 
                        site.status === 'inProgress' ? 'secondary' : 
                        site.status === 'assigned' ? 'warning' : 
                        'destructive'
                      }
                    >
                      {site.status === 'inProgress' ? 'In Progress' : 
                      site.status.charAt(0).toUpperCase() + site.status.slice(1)}
                    </Badge>
                    
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1 text-xs">
                        <Clock3 className="h-3 w-3" />
                        <span>Due: {new Date(site.dueDate).toLocaleDateString()}</span>
                      </div>
                      
                      {site.status === 'pending' && onAssign && (
                        <Button 
                          size="sm" 
                          variant="default" 
                          className="text-xs"
                          onClick={() => onAssign(site.id)}
                        >
                          Assign
                        </Button>
                      )}
                      
                      {site.status !== 'pending' && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => navigate(`/site-visits/${site.id}`)}
                        >
                          Details
                        </Button>
                      )}
                    </div>
                    
                    {activeUsers.length > 0 && site.status !== 'completed' && (
                      <div className="mt-2 border-t pt-1">
                        <div className="text-xs font-medium mb-1">Nearby collectors:</div>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {activeUsers
                            .filter(user => user.availability === 'online')
                            .map(user => {
                              if (!user.location?.latitude || !user.location?.longitude) return null;
                              
                              const distance = calculateDistance(
                                user.location.latitude, 
                                user.location.longitude, 
                                site.coordinates.latitude, 
                                site.coordinates.longitude
                              );
                              
                              const eta = calculateETA(
                                user.location.latitude, 
                                user.location.longitude, 
                                site.coordinates.latitude, 
                                site.coordinates.longitude
                              );
                              
                              if (distance > 50) return null;
                              
                              return (
                                <div key={user.id} className="flex justify-between items-center text-xs">
                                  <div>{user.name}</div>
                                  <div className="flex items-center gap-1">
                                    <span>{distance.toFixed(1)}km</span>
                                    <span className="text-muted-foreground">({eta})</span>
                                  </div>
                                </div>
                              );
                            }).filter(Boolean)}
                        </div>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
          
          <MapBoundsComponent />
        </MapContainer>
      </div>
    );
  };

  return (
    <Card className="w-full">
      <CardContent className="p-0">
        {renderControls()}
        {renderMap()}
      </CardContent>
    </Card>
  );
};

export default FieldTeamMap;
