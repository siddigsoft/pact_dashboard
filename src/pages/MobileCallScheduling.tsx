import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { 
  Phone, 
  Video, 
  Calendar, 
  Clock, 
  User, 
  Users,
  CheckCircle,
  XCircle,
  Bell,
  Search,
  RefreshCw,
  PhoneCall,
  PhoneOff,
  PlayCircle,
  Timer,
  MapPin,
  MessageSquare,
  MoreVertical,
  CalendarClock,
  AlertCircle
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ScheduledCall {
  id: string;
  organizer_id: string;
  title: string;
  description?: string;
  call_type: 'audio' | 'video' | 'group';
  scheduled_time: string;
  duration_minutes: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  reminder_sent: boolean;
  created_at: string;
  organizer_name?: string;
  participants?: CallParticipant[];
}

interface CallParticipant {
  id: string;
  call_id: string;
  user_id: string;
  status: 'pending' | 'accepted' | 'declined';
  user_name?: string;
}

export default function MobileCallScheduling() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('upcoming');
  const [selectedCall, setSelectedCall] = useState<ScheduledCall | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: scheduledCalls = [], isLoading, refetch } = useQuery({
    queryKey: ['scheduled-calls', statusFilter, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('scheduled_calls')
        .select(`
          *,
          profiles:organizer_id (full_name),
          call_participants (
            id,
            user_id,
            status,
            profiles:user_id (full_name)
          )
        `)
        .order('scheduled_time', { ascending: true });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (typeFilter !== 'all') {
        query = query.eq('call_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((c: any) => ({
        ...c,
        organizer_name: c.profiles?.full_name || 'Unknown',
        participants: (c.call_participants || []).map((p: any) => ({
          ...p,
          user_name: p.profiles?.full_name || 'Unknown',
        })),
      }));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ callId, status }: { callId: string; status: string }) => {
      const { error } = await supabase
        .from('scheduled_calls')
        .update({ status })
        .eq('id', callId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] });
      toast({ title: 'Call updated', description: 'Call status has been updated.' });
      setIsDetailOpen(false);
    },
  });

  const sendReminderMutation = useMutation({
    mutationFn: async (callId: string) => {
      const { error } = await supabase
        .from('scheduled_calls')
        .update({ reminder_sent: true })
        .eq('id', callId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled-calls'] });
      toast({ title: 'Reminder sent', description: 'Reminder notification sent to all participants.' });
    },
  });

  const getFilteredCalls = () => {
    let filtered = scheduledCalls.filter((c: ScheduledCall) =>
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.organizer_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    const now = new Date();
    if (activeTab === 'upcoming') {
      filtered = filtered.filter((c: ScheduledCall) => 
        c.status === 'scheduled' && new Date(c.scheduled_time) > now
      );
    } else if (activeTab === 'past') {
      filtered = filtered.filter((c: ScheduledCall) => 
        c.status === 'completed' || c.status === 'cancelled' || new Date(c.scheduled_time) <= now
      );
    }
    
    return filtered;
  };

  const filteredCalls = getFilteredCalls();

  const getCallTypeConfig = (type: string) => {
    switch (type) {
      case 'video': return { icon: Video, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20', label: 'Video Call' };
      case 'group': return { icon: Users, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20', label: 'Group Call' };
      default: return { icon: Phone, color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', label: 'Audio Call' };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'scheduled': return { icon: CalendarClock, color: 'bg-blue-500', label: 'Scheduled' };
      case 'in_progress': return { icon: PlayCircle, color: 'bg-emerald-500', label: 'In Progress' };
      case 'completed': return { icon: CheckCircle, color: 'bg-gray-500', label: 'Completed' };
      case 'cancelled': return { icon: XCircle, color: 'bg-red-500', label: 'Cancelled' };
      default: return { icon: Clock, color: 'bg-gray-500', label: status };
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getTimeUntil = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = then.getTime() - now.getTime();
    
    if (diffMs < 0) return 'Past';
    
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `In ${diffMins}m`;
    if (diffHours < 24) return `In ${diffHours}h`;
    return `In ${diffDays}d`;
  };

  const stats = {
    total: scheduledCalls.length,
    upcoming: scheduledCalls.filter((c: ScheduledCall) => c.status === 'scheduled' && new Date(c.scheduled_time) > new Date()).length,
    completed: scheduledCalls.filter((c: ScheduledCall) => c.status === 'completed').length,
    cancelled: scheduledCalls.filter((c: ScheduledCall) => c.status === 'cancelled').length,
    todayCalls: scheduledCalls.filter((c: ScheduledCall) => {
      const callDate = new Date(c.scheduled_time).toDateString();
      return callDate === new Date().toDateString() && c.status === 'scheduled';
    }).length,
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20" data-testid="mobile-call-scheduling-page">
      <div className="bg-gradient-to-r from-cyan-600 via-teal-700 to-emerald-800 text-white">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                  <PhoneCall className="w-6 h-6" />
                </div>
                <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Call Scheduling</h1>
              </div>
              <p className="text-cyan-100">Manage and monitor scheduled calls from mobile app</p>
            </div>
            <Button onClick={() => refetch()} variant="secondary" className="bg-white/10 hover:bg-white/20 text-white border-0" data-testid="button-refresh">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-lg">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-cyan-100">Total Calls</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.todayCalls}</p>
                  <p className="text-sm text-cyan-100">Today</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <CalendarClock className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.upcoming}</p>
                  <p className="text-sm text-cyan-100">Upcoming</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.completed}</p>
                  <p className="text-sm text-cyan-100">Completed</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 rounded-lg">
                  <XCircle className="w-5 h-5 text-red-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.cancelled}</p>
                  <p className="text-sm text-cyan-100">Cancelled</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex-1 min-w-[280px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search calls by title or organizer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
                data-testid="input-search"
              />
            </div>
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[150px] h-11" data-testid="select-type-filter">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="video">Video</SelectItem>
              <SelectItem value="group">Group</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="all" className="data-[state=active]:bg-background">
              All ({scheduledCalls.length})
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="data-[state=active]:bg-background">
              Upcoming ({stats.upcoming})
            </TabsTrigger>
            <TabsTrigger value="past" className="data-[state=active]:bg-background">
              Past ({stats.completed + stats.cancelled})
            </TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Card key={i} className="p-4">
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                </Card>
              ))}
            </div>
          ) : filteredCalls.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="p-16 text-center text-muted-foreground">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 opacity-50" />
                </div>
                <p className="font-medium mb-1">No scheduled calls found</p>
                <p className="text-sm">Calls scheduled from mobile app will appear here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCalls.map((call: ScheduledCall) => {
                const typeConfig = getCallTypeConfig(call.call_type);
                const statusConfig = getStatusConfig(call.status);
                const TypeIcon = typeConfig.icon;
                const StatusIcon = statusConfig.icon;
                const isUpcoming = call.status === 'scheduled' && new Date(call.scheduled_time) > new Date();
                
                return (
                  <Card 
                    key={call.id} 
                    className={`group hover:shadow-lg transition-all cursor-pointer ${!isUpcoming ? 'opacity-75' : ''}`}
                    onClick={() => {
                      setSelectedCall(call);
                      setIsDetailOpen(true);
                    }}
                    data-testid={`card-call-${call.id}`}
                  >
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <div className={`p-2 rounded-lg ${typeConfig.color.split(' ')[0]}`}>
                            <TypeIcon className={`w-4 h-4 ${typeConfig.color.split(' ')[1]}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base line-clamp-1">{call.title}</CardTitle>
                            <CardDescription className="flex items-center gap-1 text-xs">
                              <User className="w-3 h-3" />
                              {call.organizer_name}
                            </CardDescription>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {isUpcoming && !call.reminder_sent && (
                              <DropdownMenuItem onClick={(e) => {
                                e.stopPropagation();
                                sendReminderMutation.mutate(call.id);
                              }}>
                                <Bell className="w-4 h-4 mr-2" />
                                Send Reminder
                              </DropdownMenuItem>
                            )}
                            {isUpcoming && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-destructive"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    updateStatusMutation.mutate({ callId: call.id, status: 'cancelled' });
                                  }}
                                >
                                  <XCircle className="w-4 h-4 mr-2" />
                                  Cancel Call
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            {new Date(call.scheduled_time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(call.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' • '}{formatDuration(call.duration_minutes)}
                          </p>
                        </div>
                        {isUpcoming && (
                          <Badge variant="outline" className="text-xs bg-primary/5">
                            {getTimeUntil(call.scheduled_time)}
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Badge className={statusConfig.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {statusConfig.label}
                        </Badge>
                        
                        {call.participants && call.participants.length > 0 && (
                          <div className="flex items-center gap-1">
                            <div className="flex -space-x-2">
                              {call.participants.slice(0, 3).map((p, i) => (
                                <Avatar key={p.id} className="h-6 w-6 border-2 border-background">
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                    {p.user_name?.charAt(0) || '?'}
                                  </AvatarFallback>
                                </Avatar>
                              ))}
                            </div>
                            {call.participants.length > 3 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                +{call.participants.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {call.reminder_sent && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Bell className="w-3 h-3" />
                          Reminder sent
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </Tabs>
      </div>

      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PhoneCall className="w-5 h-5" />
              Call Details
            </DialogTitle>
          </DialogHeader>
          
          {selectedCall && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{selectedCall.title}</h3>
                {selectedCall.description && (
                  <p className="text-sm text-muted-foreground mt-1">{selectedCall.description}</p>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    <p className="text-sm font-medium">{new Date(selectedCall.scheduled_time).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="text-sm font-medium">{new Date(selectedCall.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Timer className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="text-sm font-medium">{formatDuration(selectedCall.duration_minutes)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Organizer</p>
                    <p className="text-sm font-medium">{selectedCall.organizer_name}</p>
                  </div>
                </div>
              </div>
              
              {selectedCall.participants && selectedCall.participants.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Participants ({selectedCall.participants.length})</p>
                  <div className="space-y-2">
                    {selectedCall.participants.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="text-xs">{p.user_name?.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{p.user_name}</span>
                        </div>
                        <Badge variant="outline" className={
                          p.status === 'accepted' ? 'bg-emerald-500/10 text-emerald-600' :
                          p.status === 'declined' ? 'bg-red-500/10 text-red-600' :
                          'bg-amber-500/10 text-amber-600'
                        }>
                          {p.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              <DialogFooter>
                {selectedCall.status === 'scheduled' && new Date(selectedCall.scheduled_time) > new Date() && (
                  <>
                    {!selectedCall.reminder_sent && (
                      <Button
                        variant="outline"
                        onClick={() => sendReminderMutation.mutate(selectedCall.id)}
                        disabled={sendReminderMutation.isPending}
                      >
                        <Bell className="w-4 h-4 mr-2" />
                        Send Reminder
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      onClick={() => updateStatusMutation.mutate({ callId: selectedCall.id, status: 'cancelled' })}
                      disabled={updateStatusMutation.isPending}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
