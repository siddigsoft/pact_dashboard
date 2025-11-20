import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Navigation, MapPin, Clock, ClipboardList, AlertCircle } from 'lucide-react';
import { CollectorMatch, MAX_WORKLOAD } from '@/utils/gpsMatchingUtils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import UserCalendarAvailability from '@/components/project/team/UserCalendarAvailability';
import UserProjectHistory from '@/components/project/team/UserProjectHistory';

interface CollectorCardProps {
  collector: CollectorMatch;
  isSelected: boolean;
  onSelect: () => void;
}

const CollectorCard: React.FC<CollectorCardProps> = ({ collector, isSelected, onSelect }) => {
  const { user, distance, workload, isOverloaded, isNearby, isLocalityMatch } = collector;

  const getWorkloadVariant = (workload: number): "default" | "secondary" | "destructive" | "outline" => {
    if (isOverloaded) return "destructive";
    if (workload > 15) return "secondary";
    return "default";
  };

  const formatDistance = (distance: number): string => {
    if (distance < 1) return `${Math.round(distance * 1000)}m`;
    return `${distance.toFixed(1)}km`;
  };

  return (
    <Card 
      className={`hover:shadow-md transition-shadow cursor-pointer ${
        isSelected ? 'ring-2 ring-primary' : ''
      } ${isOverloaded ? 'bg-red-50 border-red-200' : isNearby ? 'bg-green-50 border-green-200' : ''}`}
      onClick={onSelect}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{user.name}</span>
            <Badge variant="outline">
              {user.role === 'coordinator' ? 'Coordinator' : 'Data Collector'}
            </Badge>
          </div>
          <Badge
            variant={getWorkloadVariant(workload)}
          >
            {workload} tasks
          </Badge>
        </div>
        
        <div className="flex gap-2 mb-2">
          <UserProjectHistory userId={user.id} />
          <UserCalendarAvailability userId={user.id} busy={workload > 15} />
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Navigation className="h-4 w-4" />
            <span className={isNearby ? 'text-green-600 font-medium' : ''}>
              {formatDistance(distance)} {isNearby && '(Nearby)'}
            </span>
            {isLocalityMatch && (
              <Badge variant="outline" className="ml-auto text-xs bg-blue-50 text-blue-700 border-blue-200">
                Location Match
              </Badge>
            )}
          </div>
          
          {user.location?.region && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span>{user.location.region}</span>
            </div>
          )}
          
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        isOverloaded ? 'bg-red-500' :
                        workload > 15 ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min((workload / MAX_WORKLOAD) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Workload: {workload}/{MAX_WORKLOAD} tasks</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {isOverloaded && (
            <div className="flex items-center gap-2 text-red-600 mt-1 bg-red-50 p-2 rounded-md">
              <AlertCircle className="h-4 w-4" />
              <span className="text-xs">Warning: Collector is overloaded</span>
            </div>
          )}
          
          {user.lastActive && (
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>
                Last active: {new Date(user.lastActive).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default CollectorCard;
