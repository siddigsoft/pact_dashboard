import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Navigation, 
  MapPin, 
  Clock, 
  Users, 
  AlertCircle, 
  Wifi,
  WifiOff,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { SiteVisit, User } from "@/types";
import { calculateDistance, getEstimatedTimeToArrival } from "@/utils/collectorUtils";
import { getEnumeratorsByProximity } from "@/utils/gpsMatchingUtils";
import { formatDistanceToNow } from "date-fns";

interface NearestEnumeratorsCardProps {
  siteVisit: SiteVisit;
  allUsers: User[];
  onAssign?: (userId: string) => void;
  isAssigning?: boolean;
  maxResults?: number;
  showAssignButton?: boolean;
}

interface EnumeratorWithDistance {
  user: User;
  distance: number;
  estimatedTime: string;
  isLocationFresh: boolean;
  lastLocationUpdate: string | null;
}

export function NearestEnumeratorsCard({ 
  siteVisit, 
  allUsers, 
  onAssign,
  isAssigning = false,
  maxResults = 5,
  showAssignButton = true
}: NearestEnumeratorsCardProps) {
  const nearestEnumerators = useMemo((): EnumeratorWithDistance[] => {
    if (!siteVisit?.coordinates?.latitude || !siteVisit?.coordinates?.longitude) {
      return [];
    }

    const siteCoords = siteVisit.coordinates;
    const thirtyMinutesAgo = Date.now() - (30 * 60 * 1000);

    return allUsers
      .filter(user => {
        const isDataCollector = user.role === 'dataCollector' || 
                                user.role === 'datacollector' ||
                                user.role === 'DataCollector';
        const isActive = user.status === 'active';
        const hasLocation = user.location?.latitude && user.location?.longitude;
        
        return isDataCollector && isActive && hasLocation;
      })
      .map(user => {
        const distance = calculateDistance(
          user.location!.latitude!,
          user.location!.longitude!,
          siteCoords.latitude,
          siteCoords.longitude
        );

        const estimatedTime = getEstimatedTimeToArrival(
          user.location!.latitude!,
          user.location!.longitude!,
          siteCoords.latitude,
          siteCoords.longitude
        );

        const lastUpdated = user.location?.lastUpdated 
          ? new Date(user.location.lastUpdated).getTime() 
          : 0;
        const isLocationFresh = lastUpdated > thirtyMinutesAgo;

        return {
          user,
          distance,
          estimatedTime,
          isLocationFresh,
          lastLocationUpdate: user.location?.lastUpdated || null
        };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxResults);
  }, [siteVisit, allUsers, maxResults]);

  const hasSiteCoordinates = siteVisit?.coordinates?.latitude && siteVisit?.coordinates?.longitude;

  if (!hasSiteCoordinates) {
    return (
      <Card data-testid="card-nearest-enumerators">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Navigation className="h-4 w-4 text-primary" />
            Nearest Available Enumerators
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 text-amber-500" />
            <span>Site coordinates not available for proximity search.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-nearest-enumerators">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4 text-primary" />
            Nearest Available Enumerators
          </div>
          <Badge variant="secondary" className="text-xs">
            <MapPin className="h-3 w-3 mr-1" />
            {siteVisit.coordinates.latitude.toFixed(4)}, {siteVisit.coordinates.longitude.toFixed(4)}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {nearestEnumerators.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Users className="h-10 w-10 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              No enumerators with GPS location data available.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Enumerators must enable location sharing to appear here.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[280px] pr-4">
            <div className="space-y-3">
              {nearestEnumerators.map((item, index) => (
                <div 
                  key={item.user.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                  data-testid={`enumerator-item-${item.user.id}`}
                >
                  <div className="relative">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={item.user.avatar} alt={item.user.name} />
                      <AvatarFallback className="text-xs">
                        {item.user.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </AvatarFallback>
                    </Avatar>
                    {index === 0 && (
                      <div className="absolute -top-1 -right-1 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-bold">
                        1
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {item.user.name}
                      </span>
                      {item.isLocationFresh ? (
                        <Wifi className="h-3 w-3 text-green-500 shrink-0" />
                      ) : (
                        <WifiOff className="h-3 w-3 text-amber-500 shrink-0" />
                      )}
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <Badge 
                        variant={item.distance < 15 ? "default" : "secondary"} 
                        className="text-xs"
                      >
                        <Navigation className="h-3 w-3 mr-1" />
                        {item.distance.toFixed(1)} km
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        <Clock className="h-3 w-3 mr-1" />
                        {item.estimatedTime}
                      </Badge>
                    </div>
                    
                    {item.lastLocationUpdate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Location updated {formatDistanceToNow(new Date(item.lastLocationUpdate), { addSuffix: true })}
                      </p>
                    )}
                  </div>
                  
                  {showAssignButton && onAssign && (
                    <Button
                      size="sm"
                      variant={index === 0 ? "default" : "outline"}
                      onClick={() => onAssign(item.user.id)}
                      disabled={isAssigning}
                      className="shrink-0"
                      data-testid={`button-assign-${item.user.id}`}
                    >
                      {isAssigning ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Assign
                        </>
                      )}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
        
        {nearestEnumerators.length > 0 && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Showing {nearestEnumerators.length} nearest enumerators based on GPS proximity
          </div>
        )}
      </CardContent>
    </Card>
  );
}
