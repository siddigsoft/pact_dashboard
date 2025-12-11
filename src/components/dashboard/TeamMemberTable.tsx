import React, { useState } from 'react';
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
import { Circle, MapPin, Clock, MessageSquare } from 'lucide-react';
import { User } from '@/types/user';
import { formatDistanceToNow, format } from 'date-fns';
import { getUserStatus } from '@/utils/userStatusUtils';
import { TeamMemberActions } from '@/components/team/TeamMemberActions';
import { useNavigate } from 'react-router-dom';
import { useChat } from '@/context/chat/ChatContextSupabase';
import { useToast } from '@/hooks/use-toast';

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
  const navigate = useNavigate();
  const { createChat } = useChat();
  const { toast } = useToast();
  const [creatingChatFor, setCreatingChatFor] = useState<string | null>(null);

  const handleDirectMessage = async (e: React.MouseEvent, user: User) => {
    e.stopPropagation();
    setCreatingChatFor(user.id);
    
    try {
      const chat = await createChat([user.id], undefined, 'private');
      if (chat) {
        navigate('/chat');
        toast({
          title: 'Chat Opened',
          description: `Opening conversation with ${user.name}`,
          variant: 'success',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to open chat. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error creating chat:', error);
      toast({
        title: 'Error',
        description: 'Failed to open chat. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setCreatingChatFor(null);
    }
  };

  const getInitials = (name: string) => {
    return name
      ?.split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '??';
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
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 border-b">
            <TableHead className="w-8 px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"></TableHead>
            <TableHead className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Member</TableHead>
            <TableHead className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Role</TableHead>
            <TableHead className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden md:table-cell">Last Seen</TableHead>
            <TableHead className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden lg:table-cell">Location</TableHead>
            <TableHead className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">Tasks</TableHead>
            <TableHead className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center hidden sm:table-cell">Done</TableHead>
            <TableHead className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right">Load</TableHead>
            <TableHead className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-right w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const workload = workloads.get(user.id) || { active: 0, completed: 0, pending: 0, overdue: 0 };
            const totalTasks = workload.active + workload.pending;
            const workloadPercentage = Math.min(Math.round((totalTasks / 20) * 100), 100);
            const userStatus = getUserStatus(user);
            const primaryRole = user.roles?.[0] || user.role;
            const isCreatingChat = creatingChatFor === user.id;

            return (
              <TableRow
                key={user.id}
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => onRowClick(user)}
                data-testid={`row-team-member-${user.id}`}
              >
                <TableCell className="px-2 py-1.5">
                  <Circle 
                    className={`h-2.5 w-2.5 ${userStatus.color.replace('bg-', 'text-')}`}
                    fill="currentColor"
                    data-testid={`status-indicator-${user.id}`}
                  />
                </TableCell>
                
                <TableCell className="px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-7 w-7 border border-border flex-shrink-0">
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback className="text-[10px] font-semibold bg-primary/10">
                        {getInitials(user.name || '')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <button
                        onClick={(e) => handleDirectMessage(e, user)}
                        disabled={isCreatingChat}
                        className="font-medium text-xs text-left hover:text-primary hover:underline transition-colors flex items-center gap-1 group"
                        data-testid={`button-dm-${user.id}`}
                      >
                        <span className="truncate">{user.name}</span>
                        <MessageSquare className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </button>
                      <Badge variant={userStatus.badgeVariant} className="w-fit text-[9px] h-3.5 px-1 mt-0.5">
                        {userStatus.label}
                      </Badge>
                    </div>
                  </div>
                </TableCell>
                
                <TableCell className="px-2 py-1.5">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {primaryRole}
                  </Badge>
                </TableCell>
                
                <TableCell className="px-2 py-1.5 hidden md:table-cell">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    <span>{getLastLogin(user)}</span>
                  </div>
                </TableCell>
                
                <TableCell className="px-2 py-1.5 hidden lg:table-cell">
                  {user.location?.isSharing && user.location?.address ? (
                    <div className="flex items-center gap-1 text-[11px]">
                      <MapPin className="h-2.5 w-2.5 text-blue-500 flex-shrink-0" />
                      <span className="truncate max-w-[140px]">{user.location.address}</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">-</span>
                  )}
                </TableCell>
                
                <TableCell className="px-2 py-1.5 text-center">
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 tabular-nums">{workload.active}</span>
                    {workload.overdue > 0 && (
                      <span className="text-[10px] text-red-500 tabular-nums">+{workload.overdue}</span>
                    )}
                  </div>
                </TableCell>
                
                <TableCell className="px-2 py-1.5 text-center hidden sm:table-cell">
                  <span className="text-[11px] font-medium text-green-600 dark:text-green-400 tabular-nums">{workload.completed}</span>
                </TableCell>
                
                <TableCell className="px-2 py-1.5 text-right">
                  <span className={`font-semibold tabular-nums text-[11px] ${
                    workloadPercentage >= 80 ? 'text-red-600 dark:text-red-400' :
                    workloadPercentage >= 50 ? 'text-orange-600 dark:text-orange-400' :
                    'text-green-600 dark:text-green-400'
                  }`}>
                    {workloadPercentage}%
                  </span>
                </TableCell>
                
                <TableCell className="px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                  <TeamMemberActions user={user} variant="dropdown" />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
