
import React, { useEffect, useState } from 'react';
import { User, SiteVisit } from '@/types';
import { MapPin, Users, Navigation, ChevronRight, Globe2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNavigate } from 'react-router-dom';
import TeamMemberLocation from '../field-team/TeamMemberLocation';
import CollectorCard from '@/components/site-visit/CollectorCard';
import { CollectorMatch } from '@/utils/gpsMatchingUtils';
import LeafletMapContainer from '@/components/map/LeafletMapContainer';
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
  onAssign 
}) => {
  const navigate = useNavigate();
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);
  
  // Filter users with valid location data
  const usersWithLocation = users.filter(user => 
    user.location?.latitude && 
    user.location?.longitude &&
    !isNaN(user.location.latitude) &&
    !isNaN(user.location.longitude)
  );
  
  // Convert users to map locations format
  const mapLocations = usersWithLocation.map(user => ({
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

  if (usersWithLocation.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 flex flex-col items-center justify-center min-h-[600px]">
          <Globe2 className="h-16 w-16 mb-4 text-muted-foreground" />
          <p className="text-lg font-medium mb-2">No Location Data Available</p>
          <p className="text-muted-foreground text-center max-w-md">
            There is no location data available for team members.
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
            Field Team Locations
          </CardTitle>
          <Badge variant="outline" className="bg-background">
            {usersWithLocation.length} Team Members
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="h-[600px] w-full">
          {isClient && (
            <LeafletMapContainer
              locations={mapLocations}
              height="600px"
              defaultCenter={[20, 0]} // Global default
              defaultZoom={3}
              onLocationClick={(userId) => {
                console.log('User clicked:', userId);
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
