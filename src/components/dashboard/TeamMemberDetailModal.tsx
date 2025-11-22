import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Circle,
  Clock,
  CheckCircle2,
  AlertCircle,
  MapPin,
  Mail,
  Phone,
  Calendar,
  TrendingUp,
  Activity,
  Target,
  Award,
  BarChart3,
} from 'lucide-react';
import { User } from '@/types/user';
import { SiteVisit } from '@/types/siteVisit';
import { format, formatDistanceToNow } from 'date-fns';

interface TeamMemberDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
  userTasks: SiteVisit[];
}

export const TeamMemberDetailModal: React.FC<TeamMemberDetailModalProps> = ({
  open,
  onOpenChange,
  user,
  userTasks,
}) => {
  if (!user) return null;

  // Calculate metrics
  const metrics = useMemo(() => {
    const now = new Date();
    const completed = userTasks.filter(t => t.status === 'completed');
    const active = userTasks.filter(t => t.status === 'assigned' || t.status === 'inProgress');
    const pending = userTasks.filter(t => t.status === 'pending' || t.status === 'permitVerified');
    const overdue = userTasks.filter(t => {
      const dueDate = new Date(t.dueDate);
      return dueDate < now && t.status !== 'completed';
    });
    
    const onTime = completed.filter(t => {
      if (!t.completedAt) return false;
      const completedAtDate = new Date(t.completedAt);
      const dueAt = new Date(t.dueDate);
      return completedAtDate <= dueAt;
    });

    const completionRate = userTasks.length > 0 
      ? Math.round((completed.length / userTasks.length) * 100) 
      : 0;
    
    const onTimeRate = completed.length > 0 
      ? Math.round((onTime.length / completed.length) * 100) 
      : 0;

    return {
      total: userTasks.length,
      completed: completed.length,
      active: active.length,
      pending: pending.length,
      overdue: overdue.length,
      onTime: onTime.length,
      completionRate,
      onTimeRate,
    };
  }, [userTasks]);

  // Status calculations
  const isOnline = user.availability === 'online' || (user.location?.isSharing && user.location?.latitude && user.location?.longitude);
  const statusColor = isOnline ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600';
  const lastSeenTime = user.location?.lastUpdated || user.lastActive;
  const lastSeenText = lastSeenTime 
    ? formatDistanceToNow(new Date(lastSeenTime), { addSuffix: true })
    : 'Never';

  const initials = user.name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??';

  // Sort tasks by due date (most recent first)
  const sortedTasks = useMemo(() => {
    return [...userTasks].sort((a, b) => 
      new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime()
    );
  }, [userTasks]);

  // Get recent activity (last 30 days)
  const recentActivity = useMemo(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    return userTasks
      .filter(t => {
        const taskDate = new Date(t.createdAt || t.dueDate);
        return taskDate >= thirtyDaysAgo;
      })
      .sort((a, b) => {
        const aDate = new Date(a.completedAt || a.createdAt || a.dueDate);
        const bDate = new Date(b.completedAt || b.createdAt || b.dueDate);
        return bDate.getTime() - aDate.getTime();
      })
      .slice(0, 10);
  }, [userTasks]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="relative">
              <Avatar className="h-16 w-16 border-2 border-background">
                <AvatarImage src={user.avatar} alt={user.name} />
                <AvatarFallback className="text-lg font-semibold bg-primary/10">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1">
                <Circle 
                  className={`h-5 w-5 ${statusColor} border-2 border-background rounded-full`}
                  fill="currentColor"
                />
              </div>
            </div>

            <div className="flex-1">
              <DialogTitle className="text-xl">{user.name}</DialogTitle>
              <DialogDescription className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs">
                    {user.roles?.[0] || user.role}
                  </Badge>
                  <Badge variant={isOnline ? "default" : "outline"} className="text-xs">
                    {isOnline ? 'Online' : 'Offline'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Last seen {lastSeenText}
                  </span>
                </div>
                
                <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                  {user.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      <span>{user.email}</span>
                    </div>
                  )}
                  {user.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      <span>{user.phone}</span>
                    </div>
                  )}
                  {user.employeeId && (
                    <div className="flex items-center gap-1">
                      <span className="font-semibold">ID:</span>
                      <span>{user.employeeId}</span>
                    </div>
                  )}
                </div>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Performance Overview Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 py-3 border-y">
          <div className="flex flex-col items-center p-2 bg-blue-500/5 border border-blue-500/10 rounded">
            <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400 mb-1" />
            <span className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
              {metrics.total}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Tasks</span>
          </div>

          <div className="flex flex-col items-center p-2 bg-green-500/5 border border-green-500/10 rounded">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mb-1" />
            <span className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
              {metrics.completionRate}%
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Completion</span>
          </div>

          <div className="flex flex-col items-center p-2 bg-purple-500/5 border border-purple-500/10 rounded">
            <Target className="h-5 w-5 text-purple-600 dark:text-purple-400 mb-1" />
            <span className="text-2xl font-bold tabular-nums text-purple-600 dark:text-purple-400">
              {metrics.onTimeRate}%
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">On-Time</span>
          </div>

          <div className="flex flex-col items-center p-2 bg-orange-500/5 border border-orange-500/10 rounded">
            <Activity className="h-5 w-5 text-orange-600 dark:text-orange-400 mb-1" />
            <span className="text-2xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
              {metrics.active}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Active</span>
          </div>
        </div>

        {/* Detailed Tabs */}
        <Tabs defaultValue="tasks" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tasks" className="text-xs">
              All Tasks ({metrics.total})
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-xs">
              Recent Activity
            </TabsTrigger>
            <TabsTrigger value="performance" className="text-xs">
              Performance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks" className="flex-1 overflow-auto mt-3">
            {sortedTasks.length > 0 ? (
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-[200px]">Site Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTasks.map((task) => {
                    const dueDate = new Date(task.dueDate);
                    const isOverdue = dueDate < new Date() && task.status !== 'completed';
                    
                    return (
                      <TableRow key={task.id}>
                        <TableCell className="font-medium">
                          <div className="flex flex-col">
                            <span className="text-sm">{task.siteName}</span>
                            {task.siteCode && (
                              <span className="text-xs text-muted-foreground">{task.siteCode}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs">{task.locality}, {task.state}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className={`text-xs ${isOverdue ? 'text-red-600 dark:text-red-400 font-semibold' : ''}`}>
                              {format(dueDate, 'MMM dd, yyyy')}
                            </span>
                            {isOverdue && (
                              <span className="text-[10px] text-red-600 dark:text-red-400">Overdue</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              task.status === 'completed' ? 'default' : 
                              task.status === 'assigned' || task.status === 'inProgress' ? 'secondary' : 
                              'outline'
                            }
                            className="text-[10px]"
                          >
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              task.priority === 'high' ? 'destructive' : 
                              task.priority === 'medium' ? 'secondary' : 
                              'outline'
                            }
                            className="text-[10px]"
                          >
                            {task.priority}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Activity className="h-12 w-12 mb-3 opacity-50" />
                <p>No tasks assigned to this team member</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="activity" className="flex-1 overflow-auto mt-3">
            <div className="space-y-2">
              {recentActivity.length > 0 ? (
                recentActivity.map((task) => (
                  <Card key={task.id} className="hover-elevate">
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {task.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />}
                            {task.status === 'assigned' && <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                            {task.status === 'pending' && <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />}
                            <span className="font-medium text-sm">{task.siteName}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>{format(new Date(task.completedAt || task.createdAt || task.dueDate), 'MMM dd, yyyy HH:mm')}</span>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          {task.status}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mb-3 opacity-50" />
                  <p>No recent activity in the last 30 days</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="performance" className="flex-1 overflow-auto mt-3">
            <div className="space-y-4">
              {/* Performance Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Completion Rate</span>
                      <span className="text-sm font-semibold tabular-nums">{metrics.completionRate}%</span>
                    </div>
                    <Progress value={metrics.completionRate} className="h-2" />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">On-Time Delivery</span>
                      <span className="text-sm font-semibold tabular-nums">{metrics.onTimeRate}%</span>
                    </div>
                    <Progress value={metrics.onTimeRate} className="h-2" />
                  </div>

                  {user.performance && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-muted-foreground">Overall Rating</span>
                        <span className="text-sm font-semibold tabular-nums">{user.performance.rating.toFixed(1)}/5.0</span>
                      </div>
                      <Progress value={(user.performance.rating / 5) * 100} className="h-2" />
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Task Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Award className="h-4 w-4" />
                    Task Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-2 bg-green-500/5 border border-green-500/10 rounded">
                      <span className="text-xs text-muted-foreground">Completed</span>
                      <span className="text-lg font-bold tabular-nums text-green-600 dark:text-green-400">
                        {metrics.completed}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-blue-500/5 border border-blue-500/10 rounded">
                      <span className="text-xs text-muted-foreground">Active</span>
                      <span className="text-lg font-bold tabular-nums text-blue-600 dark:text-blue-400">
                        {metrics.active}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-orange-500/5 border border-orange-500/10 rounded">
                      <span className="text-xs text-muted-foreground">Pending</span>
                      <span className="text-lg font-bold tabular-nums text-orange-600 dark:text-orange-400">
                        {metrics.pending}
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-red-500/5 border border-red-500/10 rounded">
                      <span className="text-xs text-muted-foreground">Overdue</span>
                      <span className="text-lg font-bold tabular-nums text-red-600 dark:text-red-400">
                        {metrics.overdue}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Historical Summary */}
              {user.performance && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Historical Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total Completed Tasks</span>
                      <span className="font-semibold tabular-nums">{user.performance.totalCompletedTasks || metrics.completed}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">On-Time Completions</span>
                      <span className="font-semibold tabular-nums">{user.performance.onTimeCompletion || metrics.onTime}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Current Workload</span>
                      <span className="font-semibold tabular-nums">{user.performance.currentWorkload || metrics.active + metrics.pending}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
