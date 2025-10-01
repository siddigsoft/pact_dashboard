
import React, { useEffect, useState } from 'react';
import { User, SiteVisit } from '@/types';
import { MapPin, Users, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import LeafletMapContainer from './LeafletMapContainer';
import 'leaflet/dist/leaflet.css';

interface StaticTeamMapProps {
  users: User[];
  siteVisits: SiteVisit[];
}

const StaticTeamMap: React.FC<StaticTeamMapProps> = ({ users, siteVisits }) => {
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
  
  // Filter site visits with valid location data
  const siteVisitsWithLocation = siteVisits.filter(visit => 
    visit.coordinates?.latitude && 
    visit.coordinates?.longitude &&
    !isNaN(visit.coordinates.latitude) &&
    !isNaN(visit.coordinates.longitude)
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
  const siteLocations = siteVisitsWithLocation.map(visit => ({
    id: visit.id,
    name: visit.siteName,
    latitude: visit.coordinates!.latitude!,
    longitude: visit.coordinates!.longitude!,
    type: 'site' as const,
    status: visit.status,
  }));
  
  // Combine all locations
  const allLocations = [...userLocations, ...siteLocations];
  
  // If there's no data to display, show a placeholder
  if (allLocations.length === 0) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-slate-100">
        <MapPin className="h-16 w-16 mb-2 text-muted-foreground" />
        <p className="text-muted-foreground">No location data available</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      {isClient && (
        <LeafletMapContainer
          locations={allLocations}
          height="100%"
          defaultCenter={[15.5007, 32.5599]} // Sudan's center
          defaultZoom={6}
          onLocationClick={(id) => {
            console.log('Location clicked:', id);
          }}
        />
      )}
    </div>
  );
};

export default StaticTeamMap;
