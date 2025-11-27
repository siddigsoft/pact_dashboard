import React, { useState, useEffect } from 'react';
import { User, SiteVisit } from '@/types';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { calculateDistance, calculateUserWorkload } from '@/utils/collectorUtils';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Loader2, Search, AlertTriangle, Circle, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  const [workloadCounts, setWorkloadCounts] = useState<Record<string, number>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showOnlineOnly, setShowOnlineOnly] = useState<boolean>(true);
  const [offlineWarningUser, setOfflineWarningUser] = useState<EnhancedUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: activeVisits } = await supabase
          .from('mmp_site_entries')
          .select('additional_data, status');
        const counts: Record<string, number> = {};
        (activeVisits || []).forEach((r: any) => {
          const assignedTo = r.additional_data?.assigned_to;
          if (assignedTo && (r.status === 'Dispatched' || r.status === 'Assigned' || r.status === 'In Progress')) {
            counts[assignedTo] = (counts[assignedTo] || 0) + 1;
          }
        });
        if (!cancelled) setWorkloadCounts(counts);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [allSiteVisits]);

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

      const workload = typeof workloadCounts[user.id] === 'number'
        ? workloadCounts[user.id]
        : calculateUserWorkload(user.id, allSiteVisits);
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

    // Sort by: online status -> hub match -> state match -> locality match -> distance (coords)
    enhancedUsers.sort((a, b) => {
      const aOnline = a.availability === 'online';
      const bOnline = b.availability === 'online';
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      if (a.isHubMatch !== b.isHubMatch) return a.isHubMatch ? -1 : 1;
      if (a.isStateMatch !== b.isStateMatch) return a.isStateMatch ? -1 : 1;
      if (a.isLocalityMatch !== b.isLocalityMatch) return a.isLocalityMatch ? -1 : 1;
      return (a.distance || 0) - (b.distance || 0);
    });

    setSortedUsers(enhancedUsers);
  }, [users, siteVisit, allSiteVisits, workloadCounts]);

  const handleAssignClick = async (user: EnhancedUser) => {
    if (user.availability !== 'online') {
      setOfflineWarningUser(user);
    } else {
      setAssigningUserId(user.id);
      try {
        await onAssign(user.id);
      } finally {
        setAssigningUserId(null);
      }
    }
  };

  const confirmOfflineAssignment = async () => {
    if (!offlineWarningUser) return;
    setAssigningUserId(offlineWarningUser.id);
    try {
      await onAssign(offlineWarningUser.id);
    } finally {
      setAssigningUserId(null);
      setOfflineWarningUser(null);
    }
  };

  if (isOpen !== undefined) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
    const allUsers: EnhancedUser[] = sortedUsers.length > 0 ? sortedUsers : fallbackCollectors;
    
    // Filter users based on search query and availability filter
    let displayUsers: EnhancedUser[] = searchQuery.trim() === '' 
      ? allUsers
      : allUsers.filter(user => 
          user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.email?.toLowerCase().includes(searchQuery.toLowerCase())
        );
    
    // Apply availability filter
    if (showOnlineOnly) {
      displayUsers = displayUsers.filter(user => user.availability === 'online');
    }

    const onlineCount = allUsers.filter(u => u.availability === 'online').length;
    const offlineCount = allUsers.length - onlineCount;

    return (
      <div className="p-4">
        <AlertDialog open={!!offlineWarningUser} onOpenChange={(open) => !open && setOfflineWarningUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Assign to Offline Collector?
              </AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{offlineWarningUser?.name}</strong> is currently marked as <strong>offline</strong> and may not receive this assignment notification immediately.
                <br /><br />
                Are you sure you want to proceed?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmOfflineAssignment} className="bg-amber-500 hover:bg-amber-600">
                Assign Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <h2 className="text-xl font-semibold mb-4">Smart Collector Assignment</h2>
        <p className="text-sm text-muted-foreground mb-4">
          The system prioritizes online collectors, then by hub, state, locality, and distance.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder="Search collectors by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-collectors"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-md">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Switch
              id="show-online-only"
              checked={showOnlineOnly}
              onCheckedChange={setShowOnlineOnly}
              data-testid="switch-online-filter"
            />
            <Label htmlFor="show-online-only" className="text-sm cursor-pointer">
              Online only
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Circle className="h-3 w-3 fill-green-500 text-green-500" />
            <span>{onlineCount} online</span>
          </div>
          <div className="flex items-center gap-1">
            <Circle className="h-3 w-3 fill-gray-400 text-gray-400" />
            <span>{offlineCount} offline</span>
          </div>
        </div>
        <div className="mb-3 flex justify-end">
          <Button
            onClick={async () => {
              if (autoAssigning) return;
              const withWorkload = displayUsers.map(u => ({
                u,
                workload: typeof workloadCounts[u.id] === 'number'
                  ? workloadCounts[u.id]
                  : calculateUserWorkload(u.id, allSiteVisits)
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

        <ScrollArea className="h-[300px] pr-4">
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
                        onClick={() => handleAssignClick(user)}
                        disabled={assigningUserId !== null || autoAssigning}
                        data-testid={`button-assign-${user.id}`}
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
