import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Circle, MapPin, Clock } from 'lucide-react';
import { User } from '@/types/user';
import { formatDistanceToNow, format } from 'date-fns';

interface TeamMemberTableProps {
  users: User[];
  workloads: Map<string, {
    active: number;
    completed: number;
    pending: number;
    overdue: number;
  }>;
  onRowClick: (user: User) => void;
}

export const TeamMemberTable: React.FC<TeamMemberTableProps> = ({ 
  users, 
  workloads,
  onRowClick 
}) => {
  const getInitials = (name: string) => {
    return name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??';
  };

  const isOnline = (user: User) => {
    return user.availability === 'online' || 
      (user.location?.isSharing && user.location?.latitude && user.location?.longitude);
  };

  const getLastLogin = (user: User) => {
    const lastSeenTime = user.location?.lastUpdated || user.lastActive;
    if (!lastSeenTime) return 'Never';
    return formatDistanceToNow(new Date(lastSeenTime), { addSuffix: true });
  };

  const getLastLoginDate = (user: User) => {
    const lastSeenTime = user.location?.lastUpdated || user.lastActive;
    if (!lastSeenTime) return null;
    return format(new Date(lastSeenTime), 'MMM dd, yyyy HH:mm');
  };

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30">
            <TableHead className="w-12">Status</TableHead>
            <TableHead>Team Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-center">Active</TableHead>
            <TableHead className="text-center">Completed</TableHead>
            <TableHead className="text-center">Pending</TableHead>
            <TableHead className="text-center">Overdue</TableHead>
            <TableHead className="text-right">Workload</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const workload = workloads.get(user.id) || { active: 0, completed: 0, pending: 0, overdue: 0 };
            const totalTasks = workload.active + workload.pending;
            const workloadPercentage = Math.min(Math.round((totalTasks / 20) * 100), 100);
            const online = isOnline(user);
            const primaryRole = user.roles?.[0] || user.role;

            return (
              <TableRow
                key={user.id}
                className="cursor-pointer hover-elevate"
                onClick={() => onRowClick(user)}
                data-testid={`row-team-member-${user.id}`}
              >
                <TableCell>
                  <Circle 
                    className={`h-3 w-3 ${online ? 'text-green-500' : 'text-gray-400 dark:text-gray-600'}`}
                    fill="currentColor"
                    data-testid={`status-indicator-${user.id}`}
                  />
                </TableCell>
                
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8 border border-border">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback className="text-xs font-semibold bg-primary/10">
                        {getInitials(user.name || '')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{user.name}</span>
                      {online && (
                        <Badge variant="outline" className="w-fit text-[9px] h-4 px-1">
                          Online
                        </Badge>
                      )}
                    </div>
                  </div>
                </TableCell>
                
                <TableCell>
                  <Badge variant="secondary" className="text-xs">
                    {primaryRole}
                  </Badge>
                </TableCell>
                
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1 text-sm">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span>{getLastLogin(user)}</span>
                    </div>
                    {getLastLoginDate(user) && (
                      <span className="text-xs text-muted-foreground">
                        {getLastLoginDate(user)}
                      </span>
                    )}
                  </div>
                </TableCell>
                
                <TableCell>
                  {user.location?.isSharing && user.location?.address ? (
                    <div className="flex items-center gap-1 text-xs">
                      <MapPin className="h-3 w-3 text-blue-500" />
                      <span className="truncate max-w-[200px]">{user.location.address}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No location</span>
                  )}
                </TableCell>
                
                <TableCell className="text-center">
                  <Badge className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 text-blue-600 dark:text-blue-400 text-xs tabular-nums">
                    {workload.active}
                  </Badge>
                </TableCell>
                
                <TableCell className="text-center">
                  <Badge className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 text-green-600 dark:text-green-400 text-xs tabular-nums">
                    {workload.completed}
                  </Badge>
                </TableCell>
                
                <TableCell className="text-center">
                  <Badge className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20 text-orange-600 dark:text-orange-400 text-xs tabular-nums">
                    {workload.pending}
                  </Badge>
                </TableCell>
                
                <TableCell className="text-center">
                  <Badge className="bg-gradient-to-br from-red-500/10 to-red-600/5 border-red-500/20 text-red-600 dark:text-red-400 text-xs tabular-nums">
                    {workload.overdue}
                  </Badge>
                </TableCell>
                
                <TableCell className="text-right">
                  <span className={`font-bold tabular-nums text-sm ${
                    workloadPercentage >= 80 ? 'text-red-600 dark:text-red-400' :
                    workloadPercentage >= 50 ? 'text-orange-600 dark:text-orange-400' :
                    'text-green-600 dark:text-green-400'
                  }`}>
                    {workloadPercentage}%
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
