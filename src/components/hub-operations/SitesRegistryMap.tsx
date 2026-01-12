import { useState, useEffect, lazy, Suspense, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MapPin, Loader2, Map, Building2, Navigation, Maximize2, X, Search, Filter, Layers, RotateCcw, Calendar } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [activityFilter, setActivityFilter] = useState<string>('all');
  
  const sitesWithGPS = sites.filter(s => 
    s.gps_latitude !== null && 
    s.gps_longitude !== null &&
    !isNaN(s.gps_latitude) &&
    !isNaN(s.gps_longitude)
  );

  // Get unique states and activity types for filters
  const uniqueStates = useMemo(() => {
    const states = [...new Set(sitesWithGPS.map(s => s.state_name).filter(Boolean))];
    return states.sort();
  }, [sitesWithGPS]);

  const uniqueActivities = useMemo(() => {
    const activities = [...new Set(sitesWithGPS.map(s => s.activity_type).filter(Boolean))];
    return activities.sort();
  }, [sitesWithGPS]);

  // Filter sites for fullscreen view
  const filteredSites = useMemo(() => {
    return sitesWithGPS.filter(site => {
      const matchesSearch = searchQuery === '' || 
        site.site_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.site_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.locality_name?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesState = stateFilter === 'all' || site.state_name === stateFilter;
      const matchesActivity = activityFilter === 'all' || site.activity_type === activityFilter;
      
      return matchesSearch && matchesState && matchesActivity;
    });
  }, [sitesWithGPS, searchQuery, stateFilter, activityFilter]);

  const resetFilters = () => {
    setSearchQuery('');
    setStateFilter('all');
    setActivityFilter('all');
  };

  const hasActiveFilters = searchQuery !== '' || stateFilter !== 'all' || activityFilter !== 'all';

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
      <Dialog open={isFullscreen} onOpenChange={(open) => {
        setIsFullscreen(open);
        if (!open) resetFilters();
      }}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] p-0 overflow-hidden">
          {/* Enhanced Header */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-lg">
                  <Map className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">PACT Sites Map</h2>
                  <p className="text-white/80 text-sm">Interactive field operations map</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-white/20 text-white border-white/30 gap-1">
                  <MapPin className="h-3 w-3" />
                  {filteredSites.length} / {sitesWithGPS.length} sites
                </Badge>
                {hasActiveFilters && (
                  <Badge className="bg-yellow-500/80 text-white border-yellow-400 gap-1">
                    <Filter className="h-3 w-3" />
                    Filtered
                  </Badge>
                )}
              </div>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="p-3 bg-muted/50 border-b flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search sites..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
                data-testid="input-search-sites"
              />
            </div>
            
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-[180px] h-9" data-testid="select-state-filter">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {uniqueStates.map(state => (
                  <SelectItem key={state} value={state}>{state}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={activityFilter} onValueChange={setActivityFilter}>
              <SelectTrigger className="w-[180px] h-9" data-testid="select-activity-filter">
                <SelectValue placeholder="All Activities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Activities</SelectItem>
                {uniqueActivities.map(activity => (
                  <SelectItem key={activity} value={activity}>{activity}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="gap-1"
                data-testid="button-reset-filters"
              >
                <RotateCcw className="h-3 w-3" />
                Reset
              </Button>
            )}

            {/* Legend */}
            <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span>Site Location</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span>Residence</span>
              </div>
            </div>
          </div>

          {/* Map Container */}
          <div className="flex-1 h-[calc(95vh-140px)]">
            {isClient && (
              <Suspense fallback={<MapPlaceholder />}>
                <LazySitesMap sites={filteredSites} height="100%" isVisible={isFullscreen} />
              </Suspense>
            )}
          </div>

          {/* Footer Stats */}
          <div className="bg-muted/30 border-t p-2 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>{uniqueStates.length} states</span>
              <span>{uniqueActivities.length} activity types</span>
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Click markers for site details</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
