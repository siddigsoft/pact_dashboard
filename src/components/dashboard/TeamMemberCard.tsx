import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  Circle, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  BarChart3,
  MapPin
} from 'lucide-react';
import { User } from '@/types/user';
import { formatDistanceToNow } from 'date-fns';

interface TeamMemberCardProps {
  user: User;
  workload: {
    active: number;
    completed: number;
    pending: number;
    overdue: number;
  };
  onClick: () => void;
}

export const TeamMemberCard: React.FC<TeamMemberCardProps> = ({ user, workload, onClick }) => {
  // Determine online status
  const isOnline = user.availability === 'online' || (user.location?.isSharing && user.location?.latitude && user.location?.longitude);
  const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600';
  
  // Calculate last seen time
  const lastSeenTime = user.location?.lastUpdated || user.lastActive;
  const lastSeenText = lastSeenTime 
    ? formatDistanceToNow(new Date(lastSeenTime), { addSuffix: true })
    : 'Never';

  // Get user initials for avatar
  const initials = user.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

  // Get primary role
  const primaryRole = user.roles?.[0] || user.role;

  // Calculate workload percentage (assume max 20 tasks is 100%)
  const totalTasks = workload.active + workload.pending;
  const workloadPercentage = Math.min(Math.round((totalTasks / 20) * 100), 100);
  
  // Determine workload color
  const getWorkloadColor = () => {
    if (workloadPercentage >= 80) return 'text-red-600 dark:text-red-400';
    if (workloadPercentage >= 50) return 'text-orange-600 dark:text-orange-400';
    return 'text-green-600 dark:text-green-400';
  };

  return (
    <Card 
      className="relative overflow-hidden hover-elevate cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]"
      onClick={onClick}
      data-testid={`card-team-member-${user.id}`}
    >
      <CardContent className="p-3">
        {/* Header with Avatar and Status */}
        <div className="flex items-start gap-3 mb-3">
          <div className="relative">
            <Avatar className="h-12 w-12 border-2 border-background">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="text-sm font-semibold bg-primary/10">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-0.5 -right-0.5">
              <Circle 
                className={`h-4 w-4 ${statusColor} border-2 border-background rounded-full`}
                fill="currentColor"
                data-testid={`status-indicator-${user.id}`}
              />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm truncate">{user.name}</h4>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {primaryRole}
                </p>
              </div>
              <Badge 
                variant={isOnline ? "default" : "outline"} 
                className="text-[10px] h-5 px-1.5"
              >
                {isOnline ? 'Online' : 'Offline'}
              </Badge>
            </div>

            {/* Last Seen */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last seen {lastSeenText}</span>
            </div>
          </div>
        </div>

        {/* Location Badge */}
        {user.location?.isSharing && user.location?.address && (
          <div className="flex items-center gap-1 mb-2 px-2 py-1 bg-blue-500/5 border border-blue-500/10 rounded text-[10px] text-blue-600 dark:text-blue-400">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{user.location.address}</span>
          </div>
        )}

        {/* Workload Metrics */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Workload
            </span>
            <span className={`text-xs font-bold tabular-nums ${getWorkloadColor()}`}>
              {workloadPercentage}%
            </span>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-4 gap-1">
            {/* Active Tasks */}
            <div className="flex flex-col items-center p-1.5 bg-blue-500/5 border border-blue-500/10 rounded">
              <BarChart3 className="h-3 w-3 text-blue-600 dark:text-blue-400 mb-0.5" />
              <span className="text-xs font-bold tabular-nums text-blue-600 dark:text-blue-400">
                {workload.active}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase">Active</span>
            </div>

            {/* Completed Tasks */}
            <div className="flex flex-col items-center p-1.5 bg-green-500/5 border border-green-500/10 rounded">
              <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400 mb-0.5" />
              <span className="text-xs font-bold tabular-nums text-green-600 dark:text-green-400">
                {workload.completed}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase">Done</span>
            </div>

            {/* Pending Tasks */}
            <div className="flex flex-col items-center p-1.5 bg-orange-500/5 border border-orange-500/10 rounded">
              <Clock className="h-3 w-3 text-orange-600 dark:text-orange-400 mb-0.5" />
              <span className="text-xs font-bold tabular-nums text-orange-600 dark:text-orange-400">
                {workload.pending}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase">Queue</span>
            </div>

            {/* Overdue Tasks */}
            <div className="flex flex-col items-center p-1.5 bg-red-500/5 border border-red-500/10 rounded">
              <AlertCircle className="h-3 w-3 text-red-600 dark:text-red-400 mb-0.5" />
              <span className="text-xs font-bold tabular-nums text-red-600 dark:text-red-400">
                {workload.overdue}
              </span>
              <span className="text-[9px] text-muted-foreground uppercase">Late</span>
            </div>
          </div>
        </div>

        {/* Performance Badge (if available) */}
        {user.performance && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground uppercase tracking-wide">Performance</span>
              <div className="flex items-center gap-1">
                <div className="flex">
                  {[...Array(5)].map((_, i) => (
                    <Circle
                      key={i}
                      className={`h-2 w-2 ${
                        i < Math.round(user.performance!.rating) 
                          ? 'text-yellow-500 fill-yellow-500' 
                          : 'text-gray-300 dark:text-gray-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="font-semibold ml-1">{user.performance.rating.toFixed(1)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
