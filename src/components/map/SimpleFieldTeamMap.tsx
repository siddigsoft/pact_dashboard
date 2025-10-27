
import React, { useEffect, useState } from 'react';
import { User, SiteVisit } from '@/types';
import { MapPin, Users, Navigation, ChevronRight, Globe2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';
import TeamMemberLocation from '../field-team/TeamMemberLocation';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { CollectorMatch } from '@/utils/gpsMatchingUtils';
import LeafletMapContainer from './LeafletMapContainer';
import { getSiteCoordinates, isValidLocation } from '@/utils/locationUtils';
import 'leaflet/dist/leaflet.css';

interface SimpleFieldTeamMapProps {
  users: User[];
  siteVisits: SiteVisit[];
  filteredUsers?: User[];
  dataCollectors?: User[];
  collectorRecommendations?: CollectorMatch[];
  activeTab?: string;
  setActiveTab?: (tab: string) => void;
  searchTerm?: string;
  setSearchTerm?: (term: string) => void;
  roleFilter?: string;
  setRoleFilter?: (role: string) => void;
  statusFilter?: string;
  setStatusFilter?: (status: string) => void;
  onAssign?: (siteVisitId: string) => void;
  height?: string;
}

const SimpleFieldTeamMap: React.FC<SimpleFieldTeamMapProps> = ({ 
  users, 
  siteVisits,
  filteredUsers,
  dataCollectors,
  collectorRecommendations,
  activeTab,
  setActiveTab,
  searchTerm,
  setSearchTerm,
  roleFilter,
  setRoleFilter,
  statusFilter,
  setStatusFilter,
  onAssign,
  height = '600px'
}) => {
  const navigate = useNavigate();
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Filter users with valid location data
  const usersWithLocation = users.filter(user => 
    isValidLocation(user.location)
  );
  
  // Filter site visits with valid location data (including fallback coordinates)
  const siteVisitsWithLocation = siteVisits.filter(visit => 
    getSiteCoordinates(visit) !== null
  );
  
  // Convert users to map locations format
  const userLocations = usersWithLocation.map(user => ({
    id: user.id,
    name: user.name || user.fullName || 'Unknown',
    latitude: user.location!.latitude!,
    longitude: user.location!.longitude!,
    type: 'user' as const,
    status: user.availability || 'offline',
    phone: user.phone,
    lastActive: user.lastActive,
    workload: user.performance?.currentWorkload,
    avatar: user.avatar,
  }));
  
  // Convert site visits to map locations format
  const siteLocations = siteVisitsWithLocation.map(visit => {
    const coordinates = getSiteCoordinates(visit);
    if (!coordinates) return null;
    
    return {
      id: visit.id,
      name: visit.siteName,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      type: 'site' as const,
      status: visit.status,
      isFallbackLocation: !isValidLocation(visit.location),
      locality: visit.locality,
      state: visit.state
    };
  }).filter(Boolean);
  
  // Combine all locations
  const allLocations = [...userLocations, ...siteLocations];

  if (allLocations.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 flex flex-col items-center justify-center min-h-[600px]">
          <Globe2 className="h-16 w-16 mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">No Location Data Available</p>
          <p className="text-muted-foreground text-center max-w-md">
            There is no location data available for team members or site visits.
            Ask team members to share their location to see them here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Field Team & Site Locations
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-background">
              {usersWithLocation.length} Team Members
            </Badge>
            <Badge variant="outline" className="bg-background">
              {siteVisitsWithLocation.length} Sites
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div style={{ height }} className="w-full">
          {isClient && (
            <LeafletMapContainer
              locations={allLocations}
              height={height}
              defaultCenter={[15.5007, 32.5599]} // Sudan's center
              defaultZoom={6}
              onLocationClick={(id) => {
                console.log('Location clicked:', id);
                // You can add navigation or modal logic here
              }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default SimpleFieldTeamMap;
