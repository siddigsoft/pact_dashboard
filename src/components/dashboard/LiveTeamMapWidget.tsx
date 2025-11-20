
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Users } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUser } from '@/context/user/UserContext';
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import StaticTeamMap from '@/components/map/StaticTeamMap';

// Placeholder when map is disabled
const MapDisabled = () => (
  <div className="h-[300px] w-full rounded-md overflow-hidden border flex items-center justify-center bg-gray-50">
    <div className="text-center p-4">
      <MapPin className="h-12 w-12 mx-auto mb-2 text-muted-foreground" />
      <p className="text-muted-foreground">Map view has been disabled</p>
      <p className="text-xs text-muted-foreground mt-1">Check the Field Team page for location details</p>
    </div>
  </div>
);

const LiveTeamMapWidget = () => {
  const navigate = useNavigate();
  const { users } = useUser();
  const { siteVisits } = useSiteVisitContext();
  const [mapEnabled, setMapEnabled] = useState(true);
  
  // Users with location data (regardless of role or account status)
  const collectorsWithLocation = users?.filter(
    user => !!(user?.location?.latitude && user?.location?.longitude)
  ) || [];

  const siteVisitsWithLocation = siteVisits?.filter(
    visit => (
      (visit as any)?.coordinates?.latitude && (visit as any)?.coordinates?.longitude
    ) || (
      (visit as any)?.location?.latitude && (visit as any)?.location?.longitude
    )
  ) || [];

  return (
    <Card className="col-span-12 md:col-span-8 lg:col-span-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">
          Team Locations
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setMapEnabled(!mapEnabled)}
            className="text-xs"
          >
            {mapEnabled ? 'Disable Map' : 'Enable Map'}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => navigate('/field-team')}
            className="text-xs"
          >
            View Team Details
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span>{collectorsWithLocation.length} Active Members</span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>Team Status</span>
            </div>
          </div>
          
          <div className="h-[300px] w-full rounded-md overflow-hidden">
            {!mapEnabled ? <MapDisabled /> : (
              <StaticTeamMap 
                users={collectorsWithLocation.slice(0, 5)} 
                siteVisits={siteVisitsWithLocation.slice(0, 5)} 
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LiveTeamMapWidget;
