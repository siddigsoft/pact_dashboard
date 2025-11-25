import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, LatLngBounds } from 'leaflet';
import { MapPin, Calendar, User as UserIcon, Navigation, Briefcase } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SiteVisit } from '@/types/siteVisit';
import { User } from '@/types/user';
import { format } from 'date-fns';
import { getUserStatus } from '@/utils/userStatusUtils';
import 'leaflet/dist/leaflet.css';

interface PlanningSiteVisitsMapProps {
  siteVisits: SiteVisit[];
  teamMembers?: User[];
}

const FitBounds: React.FC<{ visits: SiteVisit[], teamMembers: User[] }> = ({ visits, teamMembers }) => {
  const map = useMap();

  React.useEffect(() => {
    const allPoints: [number, number][] = [];
    
    // Add site visit locations
    visits
      .filter(v => v.coordinates?.latitude && v.coordinates?.longitude)
      .forEach(v => allPoints.push([v.coordinates.latitude, v.coordinates.longitude]));
    
    // Add team member locations
    teamMembers
      .filter(u => u.location?.latitude && u.location?.longitude)
      .forEach(u => allPoints.push([u.location!.latitude, u.location!.longitude]));
    
    if (allPoints.length > 0) {
      const bounds = new LatLngBounds(allPoints);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }
    }
  }, [visits, teamMembers, map]);

  return null;
};

const createSiteIcon = (status: string, priority: string) => {
  let color = '#3b82f6';
  
  if (status === 'pending') color = '#f97316';
  else if (status === 'assigned') color = '#06b6d4';
  else if (status === 'completed') color = '#10b981';
  else if (priority === 'high') color = '#ef4444';
  
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    `)}`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
};

const createTeamMemberIcon = (role: string, statusType: 'online' | 'same-day' | 'offline') => {
  // Color based on status
  let borderColor = '#22c55e'; // green for online
  if (statusType === 'same-day') borderColor = '#f97316'; // orange for active today
  if (statusType === 'offline') borderColor = '#9ca3af'; // gray for offline
  
  // Icon shape based on role
  let roleSymbol = 'E'; // Enumerator/DataCollector
  if (role.toLowerCase().includes('coordinator')) roleSymbol = 'C';
  if (role.toLowerCase().includes('supervisor') || role.toLowerCase().includes('fom')) roleSymbol = 'S';
  
  return new Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="${borderColor}" stroke="white" stroke-width="2"/>
        <text x="16" y="21" text-anchor="middle" font-size="16" font-weight="bold" fill="white">${roleSymbol}</text>
      </svg>
    `)}`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  });
};

const PlanningSiteVisitsMap: React.FC<PlanningSiteVisitsMapProps> = ({ siteVisits, teamMembers = [] }) => {
  const visitsWithCoords = useMemo(() => {
    return siteVisits.filter(visit => 
      visit.coordinates?.latitude && visit.coordinates?.longitude
    );
  }, [siteVisits]);

  const teamWithLocation = useMemo(() => {
    return teamMembers.filter(member =>
      member.location?.latitude && member.location?.longitude
    );
  }, [teamMembers]);

  // Group team members by role
  const teamByRole = useMemo(() => {
    const dataCollectors = teamWithLocation.filter(m => 
      m.roles?.some(r => r.toLowerCase().includes('datacollector') || r.toLowerCase().includes('enumerator'))
    );
    const coordinators = teamWithLocation.filter(m => 
      m.roles?.some(r => r.toLowerCase().includes('coordinator'))
    );
    const supervisors = teamWithLocation.filter(m => 
      m.roles?.some(r => r.toLowerCase().includes('supervisor') || r.toLowerCase().includes('fom'))
    );
    return { dataCollectors, coordinators, supervisors };
  }, [teamWithLocation]);

  const hasAnyData = visitsWithCoords.length > 0 || teamWithLocation.length > 0;

  const defaultCenter: [number, number] = visitsWithCoords.length > 0
    ? [visitsWithCoords[0].coordinates.latitude, visitsWithCoords[0].coordinates.longitude]
    : teamWithLocation.length > 0
    ? [teamWithLocation[0].location!.latitude, teamWithLocation[0].location!.longitude]
    : [12.8628, 30.2176];

  if (!hasAnyData) {
    return (
      <div className="h-[500px] w-full rounded-lg border flex items-center justify-center bg-muted/20">
        <div className="text-center p-6">
          <MapPin className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
          <h3 className="font-semibold text-lg mb-2">No Location Data Available</h3>
          <p className="text-sm text-muted-foreground">
            Site visits and team members will appear once location data is available
          </p>
        </div>
      </div>
    );
  }

  // Helper to find assigned team members for a site visit
  const getAssignedTeamMembers = (visit: SiteVisit) => {
    // Build set of all possible assignment identifiers
    const assignedIds = new Set<string>();
    
    // Primary assignment - could be ID, name, or email
    if (visit.assignedTo) {
      assignedIds.add(visit.assignedTo);
    }
    
    // Team assignments if they exist (could be IDs or names)
    if (visit.team?.coordinator) assignedIds.add(visit.team.coordinator);
    if (visit.team?.supervisor) assignedIds.add(visit.team.supervisor);
    if (visit.team?.fieldOfficer) assignedIds.add(visit.team.fieldOfficer);
    
    if (assignedIds.size === 0) return [];
    
    // Match against user ID, email, or full name
    return teamWithLocation.filter(member => {
      // Check if any assigned ID matches user's ID, email, or name
      return member.id && assignedIds.has(member.id) ||
             member.email && assignedIds.has(member.email) ||
             member.fullName && assignedIds.has(member.fullName);
    });
  };

  return (
    <div className="space-y-3">
      {/* Map Legend */}
      <div className="flex flex-wrap gap-3 items-center justify-between p-3 rounded-lg border bg-card">
        <div className="flex items-center gap-4 text-xs flex-wrap">
          <div className="font-semibold text-foreground">Sites:</div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-orange-500" />
            <span>Pending ({visitsWithCoords.filter(v => v.status === 'pending').length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-cyan-500" />
            <span>Assigned ({visitsWithCoords.filter(v => v.status === 'assigned').length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-green-500" />
            <span>Completed ({visitsWithCoords.filter(v => v.status === 'completed').length})</span>
          </div>
          <div className="h-4 border-l mx-1" />
          <div className="font-semibold text-foreground">Team:</div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">D</div>
            <span>Data Collectors ({teamByRole.dataCollectors.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">C</div>
            <span>Coordinators ({teamByRole.coordinators.length})</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-green-500 border-2 border-white flex items-center justify-center text-[10px] font-bold text-white">S</div>
            <span>Supervisors ({teamByRole.supervisors.length})</span>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {visitsWithCoords.length} sites | {teamWithLocation.length} team members
        </div>
      </div>

      {/* Map Container */}
      <div className="h-[500px] w-full rounded-lg overflow-hidden border shadow-sm">
        <MapContainer
          center={defaultCenter}
          zoom={6}
          scrollWheelZoom={true}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds visits={visitsWithCoords} teamMembers={teamWithLocation} />
          
          {/* Site Visit Markers */}
          {visitsWithCoords.map((visit) => {
            const assignedMembers = getAssignedTeamMembers(visit);
            
            return (
              <Marker
                key={`site-${visit.id}`}
                position={[visit.coordinates.latitude, visit.coordinates.longitude]}
                icon={createSiteIcon(visit.status, visit.priority)}
              >
                <Popup>
                  <div className="p-2 min-w-[280px] max-w-[350px]">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {visit.siteName}
                    </h4>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Site Code:</span>
                        <span className="font-mono font-medium">{visit.siteCode}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant={
                          visit.status === 'completed' ? 'default' :
                          visit.status === 'assigned' ? 'secondary' :
                          'outline'
                        } className="text-xs h-5">
                          {visit.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Priority:</span>
                        <Badge variant={
                          visit.priority === 'high' ? 'destructive' :
                          visit.priority === 'medium' ? 'default' :
                          'outline'
                        } className="text-xs h-5">
                          {visit.priority}
                        </Badge>
                      </div>
                      {visit.scheduledDate && (
                        <div className="flex items-center justify-between gap-2 pt-1 border-t">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Scheduled:
                          </span>
                          <span className="font-medium">
                            {format(new Date(visit.scheduledDate), 'MMM dd, yyyy')}
                          </span>
                        </div>
                      )}
                      
                      {/* Assigned Team Members with GPS */}
                      {assignedMembers.length > 0 && (
                        <div className="pt-2 border-t space-y-2">
                          <div className="font-semibold text-xs flex items-center gap-1">
                            <UserIcon className="h-3 w-3" />
                            Assigned Team ({assignedMembers.length}):
                          </div>
                          {assignedMembers.map(member => {
                            const status = getUserStatus(member);
                            return (
                              <div key={member.id} className="pl-4 space-y-1 border-l-2 border-primary/20">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-medium">{member.fullName}</span>
                                  <Badge 
                                    variant="outline"
                                    className={`text-[10px] h-4 ${
                                      status.type === 'online' ? 'bg-green-500/10 border-green-500' :
                                      status.type === 'same-day' ? 'bg-orange-500/10 border-orange-500' :
                                      ''
                                    }`}
                                  >
                                    {status.label}
                                  </Badge>
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                  <Briefcase className="h-3 w-3 inline mr-1" />
                                  {member.roles?.[0] || 'Team Member'}
                                </div>
                                {member.location?.address && (
                                  <div className="text-[10px] flex items-start gap-1">
                                    <Navigation className="h-3 w-3 flex-shrink-0 mt-0.5" />
                                    <span className="text-muted-foreground">GPS: {member.location.address}</span>
                                  </div>
                                )}
                                {member.location && (
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    {member.location.latitude?.toFixed(6)}, {member.location.longitude?.toFixed(6)}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      
                      {visit.location?.address && (
                        <div className="pt-1 border-t">
                          <span className="text-muted-foreground">Site Location:</span>
                          <p className="text-xs mt-0.5">{visit.location.address}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* Team Member Markers */}
          {teamWithLocation.map((member) => {
            // Safely get user status, handle missing fields
            let status;
            try {
              status = getUserStatus(member);
            } catch (error) {
              // Fallback if user status fails
              status = {
                type: 'offline' as const,
                color: 'bg-gray-400 dark:bg-gray-600',
                badgeVariant: 'outline' as const,
                label: 'Offline'
              };
            }
            const role = member.roles?.[0] || 'Team Member';
            return (
              <Marker
                key={`team-${member.id}`}
                position={[member.location!.latitude, member.location!.longitude]}
                icon={createTeamMemberIcon(role, status.type)}
              >
                <Popup>
                  <div className="p-2 min-w-[250px]">
                    <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                      <UserIcon className="h-4 w-4" />
                      {member.fullName}
                    </h4>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Role:</span>
                        <Badge variant="outline" className="text-xs h-5">
                          {role}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge 
                          variant={status.type === 'online' ? 'default' : 'outline'}
                          className={`text-xs h-5 ${
                            status.type === 'online' ? 'bg-green-500 hover:bg-green-600' :
                            status.type === 'same-day' ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                            ''
                          }`}
                        >
                          {status.label}
                        </Badge>
                      </div>
                      {member.email && (
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground">Email:</span>
                          <span className="font-mono text-[10px]">{member.email}</span>
                        </div>
                      )}
                      {member.location?.address && (
                        <div className="pt-1 border-t">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Navigation className="h-3 w-3" />
                            GPS Location:
                          </span>
                          <p className="text-xs mt-0.5">{member.location.address}</p>
                          <p className="text-[10px] text-muted-foreground font-mono mt-1">
                            {member.location.latitude?.toFixed(6)}, {member.location.longitude?.toFixed(6)}
                          </p>
                        </div>
                      )}
                      {member.location && typeof member.location.isSharing === 'boolean' && (
                        <div className="flex items-center justify-between gap-2 pt-1 border-t">
                          <span className="text-muted-foreground">Location Sharing:</span>
                          <Badge 
                            variant={member.location.isSharing ? 'default' : 'outline'}
                            className="text-xs h-5"
                          >
                            {member.location.isSharing ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
};

export default PlanningSiteVisitsMap;
