
import React, { useState, useMemo, useCallback } from 'react';
import { SiteVisit, User } from '@/types';
import { useUser } from '@/context/user/UserContext'; 
import { useSiteVisitContext } from '@/context/siteVisit/SiteVisitContext';
import { DynamicFieldTeamMap } from '@/components/map/DynamicFieldTeamMap';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { calculateDistance } from '@/utils/collectorUtils';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { MapPin, Clock, UserCircle, CheckCircle, AlertCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';

interface AssignmentMapProps {
  siteVisit: SiteVisit;
  onAssignSuccess?: () => void;
}

export const AssignmentMap: React.FC<AssignmentMapProps> = ({ 
  siteVisit,
  onAssignSuccess 
}) => {
  const { users } = useUser();
  const { assignSiteVisit, getNearbyDataCollectors } = useSiteVisitContext();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const { toast } = useToast();

  // Get all data collectors
  const eligibleCollectors = useMemo(() => {
    // Get all data collectors regardless of location
    const collectors = users.filter(user => 
      user.role === 'dataCollector' || user.role === 'datacollector'
    );
    
    // Sort by proximity (closest first) - collectors without location go to the end
    return collectors.sort((a, b) => {
      const hasLocationA = a.location?.latitude && a.location?.longitude;
      const hasLocationB = b.location?.latitude && b.location?.longitude;
      
      // Collectors without location go to the end
      if (!hasLocationA && !hasLocationB) return 0;
      if (!hasLocationA) return 1;
      if (!hasLocationB) return -1;
      
      const distanceA = calculateDistance(
        a.location.latitude, 
        a.location.longitude, 
        siteVisit.coordinates.latitude, 
        siteVisit.coordinates.longitude
      );
      
      const distanceB = calculateDistance(
        b.location.latitude, 
        b.location.longitude, 
        siteVisit.coordinates.latitude, 
        siteVisit.coordinates.longitude
      );
      
      return distanceA - distanceB;
    });
  }, [users, siteVisit.coordinates]);

  // Calculate collector statistics 
  const getCollectorStats = useCallback((user: User) => {
    // Current workload
    const workload = user.performance?.currentWorkload || 0;
    
    if (!user.location?.latitude || !user.location?.longitude) {
      return { distance: 0, eta: 'Unknown', workload };
    }
    
    const distance = calculateDistance(
      user.location.latitude,
      user.location.longitude,
      siteVisit.coordinates.latitude,
      siteVisit.coordinates.longitude
    );
    
    // Estimated time based on 30km/h average speed
    const timeHours = distance / 30;
    const eta = timeHours < 1 
      ? `${Math.round(timeHours * 60)} mins` 
      : `${Math.round(timeHours * 10) / 10} hours`;
    
    return { distance, eta, workload };
  }, [siteVisit]);

  const handleAssign = async (userId: string) => {
    setIsAssigning(true);
    setSelectedUserId(userId);
    
    try {
      const success = await assignSiteVisit(siteVisit.id, userId);
      
      if (success) {
        toast({
          title: "Assignment successful",
          description: "Site visit has been assigned",
          variant: "success",
        });
        
        if (onAssignSuccess) {
          onAssignSuccess();
        }
      } else {
        toast({
          title: "Assignment failed",
          description: "Failed to assign site visit",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An error occurred during assignment",
        variant: "destructive",
      });
    } finally {
      setIsAssigning(false);
    }
  };

  // Custom props to pass to the field team map
  const mapProps = {
    siteVisits: [siteVisit],
    height: "500px",
    showControls: true,
    eligibleCollectors,
    selectedUserId,
    onAssign: handleAssign
  };

  return (
    <Card className="mb-6 border-primary/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center">
          <MapPin className="h-5 w-5 mr-2 text-primary" />
          Assignment Map
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-0">
        <DynamicFieldTeamMap {...mapProps} />
      </CardContent>
      
      <CardFooter className="p-3 bg-muted/10">
        <div className="w-full">
          <h4 className="text-sm font-medium mb-2">All Data Collectors</h4>
          
          <ScrollArea className="h-[200px] w-full pr-4">
            <div className="space-y-2">
              {eligibleCollectors.length > 0 ? (
                eligibleCollectors.map(collector => {
                  const { distance, eta, workload } = getCollectorStats(collector);
                  
                  return (
                    <div
                      key={collector.id}
                      className={`flex items-center justify-between p-3 rounded-md ${
                        collector.id === selectedUserId
                          ? 'bg-primary/10 border border-primary/30'
                          : 'bg-background hover:bg-accent/30 border border-border'
                      } transition-colors`}
                    >
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <div className="flex items-center gap-3 cursor-pointer">
                            <Avatar className="h-8 w-8 border border-border">
                              <AvatarImage src={collector.avatar} alt={collector.name} />
                              <AvatarFallback>
                                <UserCircle className="h-5 w-5 text-muted-foreground" />
                              </AvatarFallback>
                            </Avatar>
                            
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{collector.name}</span>
                                <span className={`h-2 w-2 rounded-full ${
                                  collector.availability === 'online' 
                                    ? 'bg-green-500' 
                                    : 'bg-amber-500'
                                }`}></span>
                              </div>
                              
                              <div className="text-xs text-muted-foreground flex items-center gap-2">
                                {distance > 0 ? (
                                  <>
                                    <span>{distance.toFixed(1)}km</span>
                                    <span className="text-muted-foreground/60">•</span>
                                  </>
                                ) : null}
                                <span className="flex items-center">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {eta}
                                </span>
                              </div>
                            </div>
                          </div>
                        </HoverCardTrigger>
                        
                        <HoverCardContent className="w-64">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Avatar>
                                <AvatarImage src={collector.avatar} />
                                <AvatarFallback>{collector.name.substring(0, 2).toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <h4 className="font-semibold">{collector.name}</h4>
                                <p className="text-xs text-muted-foreground">{collector.role}</p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-1">
                              <div className="text-xs">
                                <span className="text-muted-foreground">Rating:</span>{' '}
                                <span className="font-medium">{collector.performance?.rating || 'N/A'}/5</span>
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground">Completed:</span>{' '}
                                <span className="font-medium">{collector.performance?.totalCompletedTasks || 0}</span>
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground">On-time:</span>{' '}
                                <span className="font-medium">{collector.performance?.onTimeCompletion || 0}%</span>
                              </div>
                              <div className="text-xs">
                                <span className="text-muted-foreground">Workload:</span>{' '}
                                <span className="font-medium">{workload}/30</span>
                              </div>
                            </div>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                      
                      <div className="flex items-center">
                        <Badge variant="outline" className="mr-3">
                          {workload}/30
                        </Badge>
                        
                        <Button
                          size="sm"
                          disabled={isAssigning}
                          onClick={() => handleAssign(collector.id)}
                          variant={collector.availability === 'online' ? 'default' : 'secondary'}
                        >
                          {isAssigning && collector.id === selectedUserId ? (
                            <span className="flex items-center">
                              Assigning...
                            </span>
                          ) : (
                            <span className="flex items-center">
                              {collector.id === selectedUserId ? (
                                <CheckCircle className="h-3 w-3 mr-1" />
                              ) : null}
                              {collector.id === selectedUserId ? 'Assigned' : 'Assign'}
                            </span>
                          )}
                        </Button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-8">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No data collectors found</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardFooter>
    </Card>
  );
};

export default AssignmentMap;
