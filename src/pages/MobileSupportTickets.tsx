import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { 
  MessageSquare, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Search,
  Send,
  User,
  Smartphone,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  MoreVertical,
  Star,
  Mail,
  Phone,
  Calendar,
  Timer,
  Flag,
  Archive,
  Trash2,
  ExternalLink
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  assigned_to?: string;
  user_name?: string;
  user_email?: string;
  source: 'mobile' | 'web';
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_name: string;
  message: string;
  is_admin: boolean;
  created_at: string;
}

export default function MobileSupportTickets() {
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: tickets = [], isLoading, refetch } = useQuery({
    queryKey: ['support-tickets', statusFilter, priorityFilter],
    queryFn: async () => {
      let query = supabase
        .from('support_tickets')
        .select(`
          id, user_id, subject, description, category, priority, status, source, assigned_to, created_at, updated_at, resolved_at,
          profiles:user_id (full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (priorityFilter !== 'all') {
        query = query.eq('priority', priorityFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((t: any) => ({
        ...t,
        user_name: t.profiles?.full_name || 'Unknown',
        user_email: t.profiles?.email || '',
      }));
    },
  });

  const { data: ticketMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ['ticket-messages', selectedTicket?.id],
    queryFn: async () => {
      if (!selectedTicket) return [];
      const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', selectedTicket.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedTicket,
  });

  // When ticket has no description, first user message is shown as "Original Message" so hide it from the reply thread
  const replyMessages = useMemo(() => {
    if (!selectedTicket || !ticketMessages.length) return ticketMessages;
    const useFirstAsOriginal = !selectedTicket.description?.trim() && ticketMessages.some((m: TicketMessage) => !m.is_admin);
    if (!useFirstAsOriginal) return ticketMessages;
    const firstUserMsgId = ticketMessages.find((m: TicketMessage) => !m.is_admin)?.id;
    return firstUserMsgId ? ticketMessages.filter((m: TicketMessage) => m.id !== firstUserMsgId) : ticketMessages;
  }, [selectedTicket, ticketMessages]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast({ title: 'Status updated', description: 'Ticket status has been updated.' });
    },
  });

  const sendReplyMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticketId,
        sender_id: user?.id,
        sender_name: 'Support Team',
        message,
        is_admin: true,
      });
      if (error) throw error;
      
      await supabase
        .from('support_tickets')
        .update({ status: 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', ticketId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket-messages'] });
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      setReplyMessage('');
      toast({ title: 'Reply sent', description: 'Your reply has been sent to the user.' });
    },
  });

  const getFilteredTickets = () => {
    let filtered = tickets.filter((t: SupportTicket) =>
      t.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.user_name?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (activeTab !== 'all') {
      filtered = filtered.filter((t: SupportTicket) => t.status === activeTab);
    }
    
    return filtered;
  };

  const filteredTickets = getFilteredTickets();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'in_progress': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'waiting': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'resolved': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'closed': return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/20';
    }
  };

  const getPriorityConfig = (priority: string) => {
    switch (priority) {
      case 'urgent': return { color: 'bg-red-500/10 text-red-600 border-red-500/20', icon: Flag, label: 'Urgent' };
      case 'high': return { color: 'bg-orange-500/10 text-orange-600 border-orange-500/20', icon: ArrowUpRight, label: 'High' };
      case 'medium': return { color: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Clock, label: 'Medium' };
      case 'low': return { color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: Clock, label: 'Low' };
      default: return { color: 'bg-gray-500/10 text-gray-600 border-gray-500/20', icon: Clock, label: priority };
    }
  };

  const getTimeAgo = (date: string) => {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const stats = {
    total: tickets.length,
    open: tickets.filter((t: SupportTicket) => t.status === 'open').length,
    inProgress: tickets.filter((t: SupportTicket) => t.status === 'in_progress').length,
    resolved: tickets.filter((t: SupportTicket) => t.status === 'resolved').length,
    avgResponseTime: '2.5h',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20" data-testid="mobile-support-tickets-page">
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h1 className="text-3xl font-bold" data-testid="text-page-title">Mobile Support Tickets</h1>
              </div>
              <p className="text-blue-100">Manage and respond to support requests from mobile app users</p>
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
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-sm text-blue-100">Total</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-orange-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.open}</p>
                  <p className="text-sm text-blue-100">Open</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Clock className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.inProgress}</p>
                  <p className="text-sm text-blue-100">In Progress</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/20 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.resolved}</p>
                  <p className="text-sm text-blue-100">Resolved</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Timer className="w-5 h-5 text-purple-300" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.avgResponseTime}</p>
                  <p className="text-sm text-blue-100">Avg Response</p>
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
                placeholder="Search tickets by subject or user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-11"
                data-testid="input-search"
              />
            </div>
          </div>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[160px] h-11" data-testid="select-priority-filter">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="all" className="data-[state=active]:bg-background">
              All ({tickets.length})
            </TabsTrigger>
            <TabsTrigger value="open" className="data-[state=active]:bg-background">
              Open ({stats.open})
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="data-[state=active]:bg-background">
              In Progress ({stats.inProgress})
            </TabsTrigger>
            <TabsTrigger value="resolved" className="data-[state=active]:bg-background">
              Resolved ({stats.resolved})
            </TabsTrigger>
          </TabsList>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Tickets ({filteredTickets.length})</h2>
              </div>
              
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="p-4">
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                        <div className="flex gap-2">
                          <Skeleton className="h-5 w-16" />
                          <Skeleton className="h-5 w-16" />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : filteredTickets.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">No tickets found</p>
                    <p className="text-sm">Try adjusting your filters</p>
                  </CardContent>
                </Card>
              ) : (
                <ScrollArea className="h-[calc(100vh-400px)]">
                  <div className="space-y-2 pr-4">
                    {filteredTickets.map((ticket: SupportTicket) => {
                      const priorityConfig = getPriorityConfig(ticket.priority);
                      const PriorityIcon = priorityConfig.icon;
                      
                      return (
                        <Card
                          key={ticket.id}
                          className={`cursor-pointer transition-all hover:shadow-md ${selectedTicket?.id === ticket.id ? 'ring-2 ring-primary shadow-md' : 'hover:border-primary/50'}`}
                          onClick={() => setSelectedTicket(ticket)}
                          data-testid={`card-ticket-${ticket.id}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-sm">{ticket.subject}</p>
                              </div>
                              <Badge variant="outline" className={priorityConfig.color}>
                                <PriorityIcon className="w-3 h-3 mr-1" />
                                {priorityConfig.label}
                              </Badge>
                            </div>
                            
                            <div className="flex items-center gap-2 mb-3">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                                  {ticket.user_name?.charAt(0) || 'U'}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm text-muted-foreground truncate">{ticket.user_name}</span>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className={getStatusColor(ticket.status)}>
                                {ticket.status.replace('_', ' ')}
                              </Badge>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Smartphone className="w-3 h-3" />
                                <span>{getTimeAgo(ticket.created_at)}</span>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </div>

            <div className="lg:col-span-2">
              {selectedTicket ? (
                <Card className="h-[calc(100vh-400px)] flex flex-col" data-testid="card-ticket-detail">
                  <CardHeader className="border-b bg-muted/30">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <CardTitle className="text-xl mb-2">{selectedTicket.subject}</CardTitle>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            {selectedTicket.user_name}
                          </div>
                          <div className="flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {selectedTicket.user_email}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(selectedTicket.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={selectedTicket.status}
                          onValueChange={(value) => {
                            updateStatusMutation.mutate({ ticketId: selectedTicket.id, status: value });
                            setSelectedTicket({ ...selectedTicket, status: value as any });
                          }}
                        >
                          <SelectTrigger className="w-[140px]" data-testid="select-update-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="in_progress">In Progress</SelectItem>
                            <SelectItem value="waiting">Waiting</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                          </SelectContent>
                        </Select>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>
                              <Star className="w-4 h-4 mr-2" />
                              Mark as Important
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <Archive className="w-4 h-4 mr-2" />
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive">
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="flex-1 overflow-hidden flex flex-col p-0">
                    <div className="p-4 bg-muted/20 border-b">
                      <p className="text-sm font-medium mb-2 text-muted-foreground">Original Message</p>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {selectedTicket.description?.trim() ||
                          (ticketMessages.length > 0
                            ? ticketMessages.find((m: TicketMessage) => !m.is_admin)?.message
                            : null) ||
                          '—'}
                      </p>
                    </div>

                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-4">
                        {messagesLoading ? (
                          <div className="space-y-3">
                            <Skeleton className="h-16 w-3/4" />
                            <Skeleton className="h-16 w-3/4 ml-auto" />
                          </div>
                        ) : replyMessages.length === 0 ? (
                          <div className="text-center text-muted-foreground py-8">
                            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No replies yet</p>
                          </div>
                        ) : (
                          replyMessages.map((msg: TicketMessage) => (
                            <div
                              key={msg.id}
                              className={`flex ${msg.is_admin ? 'justify-end' : 'justify-start'}`}
                            >
                              <div className={`max-w-[80%] ${msg.is_admin ? 'bg-primary text-primary-foreground' : 'bg-muted'} rounded-2xl px-4 py-3`}>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-medium opacity-80">{msg.sender_name}</span>
                                  <span className="text-xs opacity-60">
                                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-sm">{msg.message}</p>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>

                    <div className="p-4 border-t bg-background">
                      <div className="flex gap-3">
                        <Textarea
                          placeholder="Type your reply..."
                          value={replyMessage}
                          onChange={(e) => setReplyMessage(e.target.value)}
                          className="flex-1 min-h-[80px] resize-none"
                          data-testid="textarea-reply"
                        />
                        <Button
                          onClick={() => {
                            if (replyMessage.trim()) {
                              sendReplyMutation.mutate({ ticketId: selectedTicket.id, message: replyMessage });
                            }
                          }}
                          disabled={!replyMessage.trim() || sendReplyMutation.isPending}
                          className="self-end"
                          data-testid="button-send-reply"
                        >
                          <Send className="w-4 h-4 mr-2" />
                          Send
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card className="h-[calc(100vh-400px)] flex items-center justify-center border-dashed">
                  <CardContent className="text-center text-muted-foreground p-12">
                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                      <MessageSquare className="w-8 h-8 opacity-50" />
                    </div>
                    <p className="font-medium mb-1">Select a ticket</p>
                    <p className="text-sm">Choose a ticket from the list to view details and respond</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
