import React, { useMemo, useState, useEffect, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowLeft, 
  AlertTriangle, 
  Layers, 
  Minimize2, 
  Maximize2, 
  Filter,
  User,
  MapPin,
  Clock,
  ExternalLink,
  X,
  FileText,
  Building2,
  Calendar,
  Activity,
  ChevronRight
} from 'lucide-react';
import { useUser } from '@/context/user/UserContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { getUserStatus } from '@/utils/userStatusUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import ErrorBoundary from '@/components/ErrorBoundary';
import { format, formatDistanceToNow } from 'date-fns';

const DynamicMap = React.lazy(() => import('@/components/map/ReactLeafletMap'));

const MapErrorFallback = ({ height = '500px' }) => (
  <Card className="w-full">
    <CardContent className="p-6">
      <div style={{ height }} className="flex flex-col items-center justify-center bg-red-50 dark:bg-red-950/20 rounded-lg">
        <AlertTriangle className="h-12 w-12 text-red-500 mb-4" />
        <h3 className="text-lg font-medium">Map failed to load</h3>
        <p className="text-muted-foreground text-center mt-2">
          There was an error loading the map. Please try refreshing the page.
        </p>
      </div>
    </CardContent>
  </Card>
);

const MapLoading = ({ height = '500px' }) => (
  <Card className="w-full">
    <CardContent className="p-6">
      <Skeleton className="w-full" style={{ height }} />
    </CardContent>
  </Card>
);

interface SelectedLocation {
  id: string;
  type: 'user' | 'site';
  name: string;
  status: string;
  latitude: number;
  longitude: number;
  lastUpdated?: string;
  role?: string;
  email?: string;
  phone?: string;
  state?: string;
  locality?: string;
  siteCode?: string;
  dueDate?: string;
  mmpId?: string;
  mmpName?: string;
  projectId?: string;
  projectName?: string;
  assignedTo?: string;
  assignedToName?: string;
}

const AdvancedMap = () => {
  const navigate = useNavigate();
  const { users } = useUser();
  const { siteVisits } = useSiteVisitContext();
  const [hasError, setHasError] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mapView, setMapView] = useState<'standard' | 'satellite' | 'terrain'>('standard');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'online' | 'offline' | 'busy'>('all');
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);

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
        const userStatus = getUserStatus(user);
        setSelectedLocation({
          id: user.id,
          type: 'user',
          name: user.name,
          status: userStatus.type,
          latitude: user.location?.latitude || 0,
          longitude: user.location?.longitude || 0,
          lastUpdated: user.location?.lastUpdated || user.lastActive,
          role: user.role,
          email: user.email,
          phone: user.phone,
          state: user.stateId,
          locality: user.localityId
        });
      } else if (siteVisit) {
        const assignedUser = siteVisit.assignedTo ? users.find(u => u.id === siteVisit.assignedTo) : null;
        setSelectedLocation({
          id: siteVisit.id,
          type: 'site',
          name: siteVisit.siteName,
          status: siteVisit.status,
          latitude: siteVisit.coordinates?.latitude || 0,
          longitude: siteVisit.coordinates?.longitude || 0,
          lastUpdated: siteVisit.createdAt,
          state: siteVisit.state,
          locality: siteVisit.locality,
          siteCode: siteVisit.siteCode,
          dueDate: siteVisit.dueDate,
          mmpId: siteVisit.mmpDetails?.mmpId,
          mmpName: siteVisit.mmpDetails?.projectName,
          projectId: siteVisit.mmpDetails?.projectId,
          projectName: siteVisit.mmpDetails?.projectName,
          assignedTo: siteVisit.assignedTo,
          assignedToName: assignedUser?.name
        });
      }
    } catch (error) {
      console.error("Error handling location click:", error);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'online': return 'bg-green-500';
      case 'busy': case 'same-day': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-400';
      case 'completed': return 'bg-green-500';
      case 'ongoing': case 'in_progress': return 'bg-blue-500';
      case 'dispatched': return 'bg-purple-500';
      case 'assigned': case 'accepted': return 'bg-amber-500';
      case 'pending': return 'bg-gray-400';
      default: return 'bg-gray-400';
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Unknown';
    try {
      const date = new Date(timestamp);
      return formatDistanceToNow(date, { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  const stats = useMemo(() => {
    const userCount = filteredMapLocations.filter(l => l.type === 'user').length;
    const siteCount = filteredMapLocations.filter(l => l.type === 'site').length;
    const onlineUsers = filteredMapLocations.filter(l => l.type === 'user' && l.status === 'online').length;
    return { userCount, siteCount, onlineUsers };
  }, [filteredMapLocations]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            className="gap-2" 
            asChild
            data-testid="button-back-team"
          >
            <Link to="/field-team">
              <ArrowLeft className="h-4 w-4" />
              Back to Team View
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            data-testid="link-site-visits"
          >
            <Link to="/site-visits">
              <MapPin className="h-4 w-4 mr-1" />
              Site Visits
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            data-testid="link-documents"
          >
            <Link to="/documents">
              <FileText className="h-4 w-4 mr-1" />
              Documents
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            data-testid="link-wallet-reports"
          >
            <Link to="/wallet-reports">
              <Activity className="h-4 w-4 mr-1" />
              Wallet Reports
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            asChild
            data-testid="link-audit-logs"
          >
            <Link to="/audit-logs">
              <Activity className="h-4 w-4 mr-1" />
              Audit Logs
            </Link>
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" data-testid="button-map-layers">
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

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" data-testid="button-map-filter">
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

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  size="icon" 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  data-testid="button-fullscreen"
                >
                  {isFullScreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isFullScreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
      
      <div className={`flex gap-4 transition-all duration-300 ${isFullScreen ? 'fixed inset-0 z-50 bg-background p-4' : ''}`}>
        <div className={`flex-1 ${selectedLocation ? 'w-2/3' : 'w-full'} h-[calc(100vh-200px)] transition-all`}>
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

        {selectedLocation && (
          <Card className="w-80 h-[calc(100vh-200px)] flex flex-col">
            <CardHeader className="pb-2 flex-shrink-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {selectedLocation.type === 'user' ? (
                    <User className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  )}
                  <CardTitle className="text-base truncate">{selectedLocation.name}</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedLocation(null)}
                  data-testid="button-close-panel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(selectedLocation.status)}`} />
                <span className="text-sm text-muted-foreground capitalize">{selectedLocation.status}</span>
              </div>
            </CardHeader>
            <Separator />
            <ScrollArea className="flex-1">
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Last Updated</p>
                      <p className="text-sm font-medium">{formatTimestamp(selectedLocation.lastUpdated)}</p>
                      {selectedLocation.lastUpdated && (
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(selectedLocation.lastUpdated), 'PPpp')}
                        </p>
                      )}
                    </div>
                  </div>

                  {selectedLocation.type === 'user' && (
                    <>
                      {selectedLocation.role && (
                        <div className="flex items-start gap-2">
                          <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Role</p>
                            <Badge variant="outline" className="text-xs">{selectedLocation.role}</Badge>
                          </div>
                        </div>
                      )}
                      {selectedLocation.state && (
                        <div className="flex items-start gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Location</p>
                            <p className="text-sm">{selectedLocation.locality || ''}{selectedLocation.locality && selectedLocation.state ? ', ' : ''}{selectedLocation.state}</p>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {selectedLocation.type === 'site' && (
                    <>
                      {selectedLocation.siteCode && (
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Site Code</p>
                            <p className="text-sm font-mono">{selectedLocation.siteCode}</p>
                          </div>
                        </div>
                      )}
                      {selectedLocation.state && (
                        <div className="flex items-start gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Location</p>
                            <p className="text-sm">{selectedLocation.locality || ''}{selectedLocation.locality && selectedLocation.state ? ', ' : ''}{selectedLocation.state}</p>
                          </div>
                        </div>
                      )}
                      {selectedLocation.dueDate && (
                        <div className="flex items-start gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Due Date</p>
                            <p className="text-sm">{format(new Date(selectedLocation.dueDate), 'PPP')}</p>
                          </div>
                        </div>
                      )}
                      {selectedLocation.assignedToName && (
                        <div className="flex items-start gap-2">
                          <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div>
                            <p className="text-xs text-muted-foreground">Assigned To</p>
                            <Link 
                              to={`/users/${selectedLocation.assignedTo}`}
                              className="text-sm text-primary hover:underline flex items-center gap-1"
                              data-testid="link-assigned-user"
                            >
                              {selectedLocation.assignedToName}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-xs text-muted-foreground">Coordinates</p>
                      <p className="text-sm font-mono text-xs">
                        {selectedLocation.latitude.toFixed(6)}, {selectedLocation.longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">Quick Links</p>
                  
                  {selectedLocation.type === 'user' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-between"
                      onClick={() => navigate(`/users/${selectedLocation.id}`)}
                      data-testid="button-view-user"
                    >
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        View User Profile
                      </span>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}

                  {selectedLocation.type === 'site' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-between"
                        onClick={() => navigate(`/site-visits/${selectedLocation.id}`)}
                        data-testid="button-view-site-visit"
                      >
                        <span className="flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          View Site Visit
                        </span>
                        <ChevronRight className="h-4 w-4" />
                      </Button>

                      {selectedLocation.mmpId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-between"
                          onClick={() => navigate(`/mmp/${selectedLocation.mmpId}/view`)}
                          data-testid="button-view-mmp"
                        >
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            View MMP
                          </span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}

                      {selectedLocation.projectId && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full justify-between"
                          onClick={() => navigate(`/projects/${selectedLocation.projectId}`)}
                          data-testid="button-view-project"
                        >
                          <span className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            View Project
                          </span>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between text-muted-foreground"
                    onClick={() => navigate('/audit-logs')}
                    data-testid="button-view-audit"
                  >
                    <span className="flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      View Audit Logs
                    </span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </ScrollArea>
          </Card>
        )}
      </div>

      <div className="flex flex-wrap justify-between items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" data-testid="badge-total-locations">
            Total Locations: {filteredMapLocations.length}
          </Badge>
          <Badge variant="secondary" data-testid="badge-users">
            <User className="h-3 w-3 mr-1" />
            Users: {stats.userCount} ({stats.onlineUsers} online)
          </Badge>
          <Badge variant="secondary" data-testid="badge-sites">
            <MapPin className="h-3 w-3 mr-1" />
            Sites: {stats.siteCount}
          </Badge>
          <Badge variant="outline" data-testid="badge-view">
            View: {mapView.charAt(0).toUpperCase() + mapView.slice(1)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Click on a marker to view details and navigate to related pages
        </p>
      </div>
    </div>
  );
};

export default AdvancedMap;
