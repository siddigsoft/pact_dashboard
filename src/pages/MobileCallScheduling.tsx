import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  RefreshCw
} from 'lucide-react';

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
      toast({ title: 'Reminder sent', description: 'Reminder notification sent to participants.' });
    },
  });

  const filteredCalls = scheduledCalls.filter((c: ScheduledCall) =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.organizer_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const upcomingCalls = filteredCalls.filter((c: ScheduledCall) => 
    c.status === 'scheduled' && new Date(c.scheduled_time) > new Date()
  );
  const pastCalls = filteredCalls.filter((c: ScheduledCall) => 
    c.status === 'completed' || new Date(c.scheduled_time) <= new Date()
  );

  const getCallTypeIcon = (type: string) => {
    switch (type) {
      case 'video': return <Video className="w-4 h-4" />;
      case 'group': return <Users className="w-4 h-4" />;
      default: return <Phone className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500';
      case 'in_progress': return 'bg-green-500';
      case 'completed': return 'bg-gray-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const stats = {
    total: scheduledCalls.length,
    upcoming: scheduledCalls.filter((c: ScheduledCall) => c.status === 'scheduled').length,
    completed: scheduledCalls.filter((c: ScheduledCall) => c.status === 'completed').length,
    cancelled: scheduledCalls.filter((c: ScheduledCall) => c.status === 'cancelled').length,
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="mobile-call-scheduling-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Call Scheduling</h1>
          <p className="text-muted-foreground">Manage scheduled calls from mobile app</p>
        </div>
        <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total">
          <CardContent className="p-4 flex items-center gap-4">
            <Calendar className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">Total Calls</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-upcoming">
          <CardContent className="p-4 flex items-center gap-4">
            <Clock className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{stats.upcoming}</p>
              <p className="text-sm text-muted-foreground">Upcoming</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-completed">
          <CardContent className="p-4 flex items-center gap-4">
            <CheckCircle className="w-8 h-8 text-gray-500" />
            <div>
              <p className="text-2xl font-bold">{stats.completed}</p>
              <p className="text-sm text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card data-testid="card-stat-cancelled">
          <CardContent className="p-4 flex items-center gap-4">
            <XCircle className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{stats.cancelled}</p>
              <p className="text-sm text-muted-foreground">Cancelled</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search calls..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
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

      {isLoading ? (
        <p>Loading scheduled calls...</p>
      ) : filteredCalls.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No scheduled calls found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {upcomingCalls.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Upcoming Calls</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {upcomingCalls.map((call: ScheduledCall) => (
                  <Card key={call.id} data-testid={`card-call-${call.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getCallTypeIcon(call.call_type)}
                          <CardTitle className="text-base">{call.title}</CardTitle>
                        </div>
                        <Badge className={getStatusColor(call.status)} variant="secondary">
                          {call.status}
                        </Badge>
                      </div>
                      <CardDescription className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Organized by {call.organizer_name}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>{new Date(call.scheduled_time).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>{new Date(call.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Duration: {formatDuration(call.duration_minutes)}
                      </div>
                      {call.participants && call.participants.length > 0 && (
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm">{call.participants.length} participants</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-2">
                        {!call.reminder_sent && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => sendReminderMutation.mutate(call.id)}
                            disabled={sendReminderMutation.isPending}
                            data-testid={`button-remind-${call.id}`}
                          >
                            <Bell className="w-3 h-3 mr-1" />
                            Send Reminder
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => updateStatusMutation.mutate({ callId: call.id, status: 'cancelled' })}
                          disabled={updateStatusMutation.isPending}
                          data-testid={`button-cancel-${call.id}`}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Cancel
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {pastCalls.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3">Past Calls</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pastCalls.map((call: ScheduledCall) => (
                  <Card key={call.id} className="opacity-75" data-testid={`card-past-call-${call.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {getCallTypeIcon(call.call_type)}
                          <CardTitle className="text-base">{call.title}</CardTitle>
                        </div>
                        <Badge className={getStatusColor(call.status)} variant="secondary">
                          {call.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>{new Date(call.scheduled_time).toLocaleDateString()}</span>
                        <span>{formatDuration(call.duration_minutes)}</span>
                        {call.participants && (
                          <span>{call.participants.length} participants</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
