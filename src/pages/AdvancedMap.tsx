import React, { useMemo, useState, useEffect, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  AlertTriangle, 
  Layers, 
  ZoomIn,  
  ZoomOut, 
  Minimize2, 
  Maximize2, 
  Filter 
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { getUserStatus } from '@/utils/userStatusUtils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from '@/components/ui/tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuLabel, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import ErrorBoundary from '@/components/ErrorBoundary';

// Dynamically import the map component
const DynamicMap = React.lazy(() => import('@/components/map/ReactLeafletMap'));

// Error fallback component
const MapErrorFallback = ({ height = '500px' }) => (
  <Card className="w-full">
    <CardContent className="p-6">
      <div style={{ height }} className="flex flex-col items-center justify-center bg-red-50 rounded-lg">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-medium">Map failed to load</h3>
        <p className="text-muted-foreground text-center mt-2">
          There was an error loading the map. Please try refreshing the page.
        </p>
      </div>
    </CardContent>
  </Card>
);

// Loading fallback
const MapLoading = ({ height = '500px' }) => (
  <Card className="w-full">
    <CardContent className="p-6">
      <Skeleton className="w-full" style={{ height }} />
    </CardContent>
  </Card>
);

const AdvancedMap = () => {
  const navigate = useNavigate();
  const { users } = useUser();
  const { siteVisits } = useSiteVisitContext();
  const [hasError, setHasError] = useState(false);
  
  // New state for map interactions
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mapView, setMapView] = useState<'standard' | 'satellite' | 'terrain'>('standard');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'online' | 'offline' | 'busy'>('all');

  // Reset error state on component mount
  useEffect(() => {
    setHasError(false);
  }, []);

  const filteredMapLocations = useMemo(() => {
    try {
      const userLocations = users
        .filter(user => {
          const hasLocation = user.location?.latitude && user.location?.longitude;
          if (!hasLocation) return false;
          
          const userStatus = getUserStatus(user);
          const matchesFilter = selectedFilter === 'all' || 
            (selectedFilter === 'online' && userStatus.type === 'online') ||
            (selectedFilter === 'offline' && userStatus.type === 'offline') ||
            (selectedFilter === 'busy' && userStatus.type === 'same-day');
          return matchesFilter;
        })
        .map(user => {
          const userStatus = getUserStatus(user);
          return {
            id: user.id,
            name: user.name,
            latitude: user.location.latitude!,
            longitude: user.location.longitude!,
            type: 'user' as const,
            status: userStatus.type === 'online' ? 'online' : 
                    userStatus.type === 'same-day' ? 'busy' : 'offline'
          };
        });

      const siteLocations = siteVisits
        .filter(site => site.coordinates?.latitude && site.coordinates?.longitude)
        .map(site => ({
          id: site.id,
          name: site.siteName,
          latitude: site.coordinates.latitude,
          longitude: site.coordinates.longitude,
          type: 'site' as const,
          status: site.status
        }));

      return [...userLocations, ...siteLocations];
    } catch (error) {
      console.error("Error processing map locations:", error);
      setHasError(true);
      return [];
    }
  }, [users, siteVisits, selectedFilter]);

  const handleLocationClick = (id: string) => {
    try {
      const user = users.find(u => u.id === id);
      const siteVisit = siteVisits.find(sv => sv.id === id);

      if (user) {
        navigate(`/users/${id}`);
      } else if (siteVisit) {
        navigate(`/site-visits/${id}`);
      }
    } catch (error) {
      console.error("Error handling location click:", error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button 
          variant="outline" 
          className="gap-2" 
          onClick={() => navigate('/field-team')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Team View
        </Button>
        <div className="flex items-center gap-2">
          {/* Map View Dropdown */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <Layers className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Map View</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => setMapView('standard')}
                      className={mapView === 'standard' ? 'bg-accent' : ''}
                    >
                      Standard
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setMapView('satellite')}
                      className={mapView === 'satellite' ? 'bg-accent' : ''}
                    >
                      Satellite
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setMapView('terrain')}
                      className={mapView === 'terrain' ? 'bg-accent' : ''}
                    >
                      Terrain
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent>Change Map View</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Filter Dropdown */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon">
                      <Filter className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuLabel>Filter Locations</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => setSelectedFilter('all')}
                      className={selectedFilter === 'all' ? 'bg-accent' : ''}
                    >
                      All Staff
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedFilter('online')}
                      className={selectedFilter === 'online' ? 'bg-accent' : ''}
                    >
                      Online
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedFilter('busy')}
                      className={selectedFilter === 'busy' ? 'bg-accent' : ''}
                    >
                      Busy
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setSelectedFilter('offline')}
                      className={selectedFilter === 'offline' ? 'bg-accent' : ''}
                    >
                      Offline
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TooltipTrigger>
              <TooltipContent>Filter Locations</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Fullscreen Toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                >
                  {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullScreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      <div className={`h-[calc(100vh-200px)] transition-all duration-300 ${isFullScreen ? 'fixed inset-0 z-50 bg-white p-4' : ''}`}>
        {hasError ? (
          <MapErrorFallback height="100%" />
        ) : (
          <Suspense fallback={<MapLoading height="100%" />}>
            <ErrorBoundary fallback={<MapErrorFallback height="100%" />}>
              <DynamicMap 
                locations={filteredMapLocations}
                height="100%"
                onLocationClick={handleLocationClick}
                mapType={mapView}
              />
            </ErrorBoundary>
          </Suspense>
        )}
      </div>

      {/* Location Summary */}
      <div className="mt-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Badge variant="outline">
            Total Locations: {filteredMapLocations.length}
          </Badge>
          <Badge variant="secondary">
            View: {mapView.charAt(0).toUpperCase() + mapView.slice(1)}
          </Badge>
        </div>
      </div>
    </div>
  );
};

export default AdvancedMap;
