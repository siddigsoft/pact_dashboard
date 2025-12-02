
import React from 'react';
import { MapPin, Navigation, Clock, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { User } from '@/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface TeamMemberLocationProps {
  user: User;
}

const TeamMemberLocation: React.FC<TeamMemberLocationProps> = ({ user }) => {
  const getLastActiveTime = (lastActive: string) => {
    const lastActiveDate = new Date(lastActive);
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - lastActiveDate.getTime()) / 1000 / 60);
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return `${Math.floor(diffMinutes / 1440)}d ago`;
  };

  const getAvailabilityColor = () => {
    switch (user.availability) {
      case 'online':
        return 'bg-green-50 border-green-200 text-green-700';
      case 'busy':
        return 'bg-amber-50 border-amber-200 text-amber-700';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  };

  const getWorkloadStatus = () => {
    if (!user.performance?.currentWorkload) return null;
    
    let color = 'bg-green-500';
    if (user.performance.currentWorkload >= 20) {
      color = 'bg-red-500';
    } else if (user.performance.currentWorkload >= 15) {
      color = 'bg-amber-500';
    }
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-gray-500" />
              <div className="w-12 h-1.5 bg-gray-200 rounded-full">
                <div 
                  className={`h-1.5 ${color} rounded-full`} 
                  style={{ width: `${Math.min((user.performance.currentWorkload / 20) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">Workload: {user.performance.currentWorkload}/20 tasks</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  const pulseAnimation = user.availability === 'online' ? 'animate-pulse' : '';

  return (
    <Card className={`hover:shadow-md transition-shadow ${getAvailabilityColor()}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">{user.name}</span>
            <Badge variant="outline" className="bg-background/80">
              {user.role === 'coordinator' ? 'Coordinator' : 'Data Collector'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${
              user.availability === 'online'
                ? 'bg-green-500 ' + pulseAnimation
                : user.availability === 'busy'
                ? 'bg-amber-500'
                : 'bg-gray-500'
            }`}></span>
            <Badge
              variant="outline"
              className={`${getAvailabilityColor()} bg-background/80`}
            >
              {user.availability === 'online'
                ? 'Available'
                : user.availability === 'busy'
                ? 'Busy'
                : 'Offline'}
            </Badge>
          </div>
        </div>
        
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="truncate">
              {user.location?.region || 'Location not available'}
            </div>
            {user.location?.latitude && user.location?.longitude && (
              <div className="flex items-center gap-1 mt-1 text-xs">
                <Navigation className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {user.location.latitude.toFixed(6)}, {user.location.longitude.toFixed(6)}
                </span>
                {user.location.accuracy !== undefined && (
                  <span className={`ml-1 ${
                    user.location.accuracy <= 10 ? 'text-green-600' : 
                    user.location.accuracy <= 30 ? 'text-yellow-600' : 
                    'text-orange-600'
                  }`}>
                    ({'\u00B1'}{user.location.accuracy.toFixed(0)}m)
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center justify-between mt-1 text-xs">
              {user.lastActive && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  <span>Active {getLastActiveTime(user.lastActive)}</span>
                </div>
              )}
              {getWorkloadStatus()}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default TeamMemberLocation;
