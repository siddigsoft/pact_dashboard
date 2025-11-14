import React, { useState, useEffect } from 'react';
import { User, SiteVisit } from '@/types';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateDistance, calculateUserWorkload } from '@/utils/collectorUtils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';

interface SmartCollectorSelectorProps {
  siteVisit: SiteVisit;
  users: User[];
  onAssign: (userId: string) => void | Promise<void>;
  onClose: () => void;
  isOpen?: boolean;
  allSiteVisits?: SiteVisit[];
}

interface EnhancedUser extends User {
  distance?: number;
  overloaded?: boolean;
  isLocalityMatch?: boolean;
  isStateMatch?: boolean;
  isHubMatch?: boolean;
}

const SmartCollectorSelector: React.FC<SmartCollectorSelectorProps> = ({
  siteVisit,
  users,
  onAssign,
  onClose,
  isOpen,
  allSiteVisits = []
}) => {
  const [sortedUsers, setSortedUsers] = useState<EnhancedUser[]>([]);
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null);
  const [autoAssigning, setAutoAssigning] = useState<boolean>(false);

  const hasValidCoords = (coords?: { latitude?: number; longitude?: number }) => {
    if (!coords) return false;
    const { latitude, longitude } = coords;
    return (
      typeof latitude === 'number' && typeof longitude === 'number' &&
      Number.isFinite(latitude) && Number.isFinite(longitude) &&
      !(latitude === 0 && longitude === 0)
    );
  };

  const getSiteCoords = () => {
    if (hasValidCoords(siteVisit.coordinates)) {
      return siteVisit.coordinates as { latitude: number; longitude: number };
    }
    if (hasValidCoords(siteVisit.location)) {
      return siteVisit.location as { latitude: number; longitude: number };
    }
    return null;
  };

  useEffect(() => {
    // Show only data collectors (by role or roles[]). Do not filter by status.
    const consideredUsers = users.filter(user => {
      const roleVal = (user.role || '').toString();
      const direct = roleVal === 'dataCollector' || roleVal.toLowerCase() === 'datacollector';
      const inArray = Array.isArray(user.roles) && user.roles.some((r: any) => r === 'dataCollector' || (typeof r === 'string' && r.toLowerCase() === 'datacollector'));
      return direct || inArray;
    });

    const siteCoords = getSiteCoords();
    const normalize = (v?: string) => (v ?? '').toString().trim().toLowerCase();

    const enhancedUsers = consideredUsers.map(user => {
      const hasUserCoords = typeof user.location?.latitude === 'number' && typeof user.location?.longitude === 'number';

      const distance = siteCoords && hasUserCoords
        ? calculateDistance(
            user.location!.latitude!,
            user.location!.longitude!,
            siteCoords.latitude,
            siteCoords.longitude
          )
        : 999999;

      const isHubMatch = !!(user.hubId && siteVisit.hub && normalize(user.hubId) === normalize(siteVisit.hub));
      const isStateMatch = !!(user.stateId && siteVisit.state && normalize(user.stateId) === normalize(siteVisit.state));
      const isLocalityMatch = !!(user.localityId && siteVisit.locality && normalize(user.localityId) === normalize(siteVisit.locality));

      const workload = calculateUserWorkload(user.id, allSiteVisits);
      const overloaded = workload >= 20;

      return {
        ...user,
        distance,
        overloaded,
        isHubMatch,
        isStateMatch,
        isLocalityMatch
      };
    });

    // Sort by: hub match -> state match -> locality match -> distance (coords)
    enhancedUsers.sort((a, b) => {
      if (a.isHubMatch !== b.isHubMatch) return a.isHubMatch ? -1 : 1;
      if (a.isStateMatch !== b.isStateMatch) return a.isStateMatch ? -1 : 1;
      if (a.isLocalityMatch !== b.isLocalityMatch) return a.isLocalityMatch ? -1 : 1;
      return (a.distance || 0) - (b.distance || 0);
    });

    setSortedUsers(enhancedUsers);
  }, [users, siteVisit, allSiteVisits]);

  if (isOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[600px]">
          <div className="p-4">
            {renderContent()}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  return renderContent();
  
  function renderContent() {
    const fallbackCollectors = users.filter(user => {
      const roleVal = (user.role || '').toString();
      const direct = roleVal === 'dataCollector' || roleVal.toLowerCase() === 'datacollector';
      const inArray = Array.isArray(user.roles) && user.roles.some((r: any) => r === 'dataCollector' || (typeof r === 'string' && r.toLowerCase() === 'datacollector'));
      return direct || inArray;
    }) as EnhancedUser[];
    const displayUsers: EnhancedUser[] =
      sortedUsers.length > 0 ? sortedUsers : fallbackCollectors;
    return (
      <div className="p-4">
        <h2 className="text-xl font-semibold mb-4">Smart Collector Assignment</h2>
        <p className="text-sm text-gray-500 mb-6">
          The system prioritizes by hub, then state, then locality, then distance.
        </p>
        <div className="mb-3 flex justify-end">
          <Button
            onClick={async () => {
              if (autoAssigning) return;
              const withWorkload = displayUsers.map(u => ({
                u,
                workload: calculateUserWorkload(u.id, allSiteVisits)
              }));
              const perfect = withWorkload.filter(x => x.u.isStateMatch && x.u.isLocalityMatch);
              const stateOnly = withWorkload.filter(x => x.u.isStateMatch && !x.u.isLocalityMatch);
              const sortFn = (a: any, b: any) => {
                if (a.workload !== b.workload) return a.workload - b.workload;
                const ad = typeof a.u.distance === 'number' ? a.u.distance : 999999;
                const bd = typeof b.u.distance === 'number' ? b.u.distance : 999999;
                return ad - bd;
              };
              let candidate = null as any;
              if (perfect.length > 0) {
                perfect.sort(sortFn);
                candidate = perfect[0].u;
              } else if (stateOnly.length > 0) {
                stateOnly.sort(sortFn);
                candidate = stateOnly[0].u;
              }
              if (candidate) {
                setAutoAssigning(true);
                try {
                  await onAssign(candidate.id);
                } finally {
                  setAutoAssigning(false);
                }
              }
            }}
            disabled={autoAssigning || displayUsers.length === 0}
          >
            {autoAssigning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Assigning best...
              </>
            ) : (
              'Assign Best'
            )}
          </Button>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-3">
            {displayUsers.map(user => {
              const availabilityColor = 
                user.availability === 'online' ? 'bg-green-500' : 
                user.availability === 'busy' ? 'bg-amber-500' : 'bg-gray-500';
              
              return (
                <Card key={user.id} className="hover:shadow-md transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 border-2 border-muted">
                        <AvatarImage src={user.avatar} alt={user.name} />
                        <AvatarFallback>{user.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          <span className={`h-2 w-2 rounded-full ${availabilityColor}`}></span>
                          <span className="text-xs text-muted-foreground">
                            {user.availability === 'online' ? 'Available' : 
                             user.availability === 'busy' ? 'Busy' : 'Offline'}
                          </span>
                        </div>
                        
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {user.distance !== undefined && user.distance < 100000 && (
                            <Badge variant="outline" className="text-xs">
                              {user.distance.toFixed(1)}km away
                            </Badge>
                          )}
                          
                          {user.isHubMatch && (
                            <Badge variant="secondary" className="text-xs">
                              Hub match
                            </Badge>
                          )}

                          {user.isStateMatch && (
                            <Badge variant="secondary" className="text-xs">
                              State match
                            </Badge>
                          )}

                          {user.isLocalityMatch && (
                            <Badge variant="secondary" className="text-xs">
                              Locality match
                            </Badge>
                          )}
                          
                          {user.overloaded && (
                            <Badge variant="destructive" className="text-xs">
                              High workload
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <Button 
                        onClick={async () => {
                          setAssigningUserId(user.id);
                          try {
                            await onAssign(user.id);
                          } finally {
                            setAssigningUserId(null);
                          }
                        }}
                        disabled={assigningUserId !== null || autoAssigning}
                      >
                        {assigningUserId === user.id ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Assigning...
                          </>
                        ) : (
                          'Assign'
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {displayUsers.length === 0 && (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No available collectors found</p>
              </div>
            )}
          </div>
        </ScrollArea>
        
        <div className="mt-6 flex justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
};

export default SmartCollectorSelector;
