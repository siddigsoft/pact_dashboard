import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
import { PageInfoBanner } from '@/components/financial/PageInfoBanner';
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
  ArrowUpRight,
  MoreVertical,
  Star,
  Mail,
  Calendar,
  Timer,
  Flag,
  Archive,
  Trash2,
  Download,
  Filter,
  BarChart3,
  UserCheck,
  Globe,
  Loader2,
  CheckCheck,
  XCircle,
  Plus
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format, differenceInHours, differenceInMinutes } from 'date-fns';

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
  resolved_at?: string;
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

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'technical', label: 'Technical Issue' },
  { value: 'login', label: 'Login / Access' },
  { value: 'sync', label: 'Data Sync' },
  { value: 'gps', label: 'GPS / Location' },
  { value: 'offline', label: 'Offline Mode' },
  { value: 'payment', label: 'Payment / Wallet' },
  { value: 'site_visit', label: 'Site Visit' },
  { value: 'mmp', label: 'MMP / Planning' },
  { value: 'feature_request', label: 'Feature Request' },
  { value: 'other', label: 'Other' },
];

export default function MobileSupportTickets() {
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState('all');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [ticketToDelete, setTicketToDelete] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentUser, users } = useUser();

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

  const replyMessages = useMemo(() => {
    if (!selectedTicket || !ticketMessages.length) return ticketMessages;
    const useFirstAsOriginal = !selectedTicket.description?.trim() && ticketMessages.some((m: TicketMessage) => !m.is_admin);
    if (!useFirstAsOriginal) return ticketMessages;
    const firstUserMsgId = ticketMessages.find((m: TicketMessage) => !m.is_admin)?.id;
    return firstUserMsgId ? ticketMessages.filter((m: TicketMessage) => m.id !== firstUserMsgId) : ticketMessages;
  }, [selectedTicket, ticketMessages]);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      const updateData: any = { status, updated_at: new Date().toISOString() };
      if (status === 'resolved' || status === 'closed') {
        updateData.resolved_at = new Date().toISOString();
      }
      const { error } = await supabase
        .from('support_tickets')
        .update(updateData)
        .eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast({ title: 'Status updated', description: 'Ticket status has been updated.' });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ ticketId, category }: { ticketId: string; category: string }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ category, updated_at: new Date().toISOString() })
        .eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast({ title: 'Category updated' });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ ticketId, priority }: { ticketId: string; priority: string }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ priority, updated_at: new Date().toISOString() })
        .eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast({ title: 'Priority updated' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async ({ ticketId, userId }: { ticketId: string; userId: string | null }) => {
      const { error } = await supabase
        .from('support_tickets')
        .update({ assigned_to: userId, updated_at: new Date().toISOString() })
        .eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast({ title: 'Ticket assigned' });
    },
  });

  const deleteTicketMutation = useMutation({
    mutationFn: async (ticketId: string) => {
      await supabase.from('ticket_messages').delete().eq('ticket_id', ticketId);
      const { error } = await supabase.from('support_tickets').delete().eq('id', ticketId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      setSelectedTicket(null);
      setShowDeleteDialog(false);
      toast({ title: 'Ticket deleted' });
    },
  });

  const sendReplyMutation = useMutation({
    mutationFn: async ({ ticketId, message }: { ticketId: string; message: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('ticket_messages').insert({
        ticket_id: ticketId,
        sender_id: user?.id,
        sender_name: currentUser?.name || 'Support Team',
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
      t.user_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.user_email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    if (activeTab !== 'all') {
      filtered = filtered.filter((t: SupportTicket) => t.status === activeTab);
    }
    if (categoryFilter !== 'all') {
      filtered = filtered.filter((t: SupportTicket) => t.category === categoryFilter);
    }
    if (sourceFilter !== 'all') {
      filtered = filtered.filter((t: SupportTicket) => t.source === sourceFilter);
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

  const getResponseTime = (ticket: SupportTicket) => {
    if (!ticket.resolved_at) return null;
    const created = new Date(ticket.created_at);
    const resolved = new Date(ticket.resolved_at);
    const hours = differenceInHours(resolved, created);
    const mins = differenceInMinutes(resolved, created) % 60;
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t: SupportTicket) => t.status === 'open').length;
    const inProgress = tickets.filter((t: SupportTicket) => t.status === 'in_progress').length;
    const resolved = tickets.filter((t: SupportTicket) => t.status === 'resolved').length;
    const closed = tickets.filter((t: SupportTicket) => t.status === 'closed').length;
    const urgent = tickets.filter((t: SupportTicket) => t.priority === 'urgent' && t.status !== 'resolved' && t.status !== 'closed').length;
    const mobileTickets = tickets.filter((t: SupportTicket) => t.source === 'mobile').length;
    const webTickets = tickets.filter((t: SupportTicket) => t.source === 'web').length;

    const resolvedTickets = tickets.filter((t: SupportTicket) => t.resolved_at);
    let avgResponseHours = 0;
    if (resolvedTickets.length > 0) {
      const totalHours = resolvedTickets.reduce((sum: number, t: SupportTicket) => {
        return sum + differenceInHours(new Date(t.resolved_at!), new Date(t.created_at));
      }, 0);
      avgResponseHours = totalHours / resolvedTickets.length;
    }

    const categoryBreakdown: Record<string, number> = {};
    tickets.forEach((t: SupportTicket) => {
      categoryBreakdown[t.category || 'general'] = (categoryBreakdown[t.category || 'general'] || 0) + 1;
    });

    return { total, open, inProgress, resolved, closed, urgent, mobileTickets, webTickets, avgResponseHours, categoryBreakdown };
  }, [tickets]);

  const adminUsers = useMemo(() => {
    return users.filter(u => 
      u.role === 'admin' || u.role === 'superadmin' || u.role === 'super_admin' || 
      u.role === 'SuperAdmin' || u.role === 'ict'
    );
  }, [users]);

  const exportTicketsCSV = () => {
    const headers = ['ID', 'Subject', 'User', 'Email', 'Category', 'Priority', 'Status', 'Source', 'Created', 'Resolved', 'Response Time'];
    const rows = filteredTickets.map((t: SupportTicket) => [
      t.id.substring(0, 8),
      `"${t.subject.replace(/"/g, '""')}"`,
      t.user_name,
      t.user_email,
      t.category || 'general',
      t.priority,
      t.status,
      t.source,
      format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
      t.resolved_at ? format(new Date(t.resolved_at), 'yyyy-MM-dd HH:mm') : '',
      getResponseTime(t) || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `support-tickets-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Export complete', description: `${filteredTickets.length} tickets exported to CSV.` });
  };

  const formatAvgResponse = (hours: number) => {
    if (hours === 0) return 'N/A';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20" data-testid="mobile-support-tickets-page">
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white">
        <div className="container mx-auto px-4 md:px-6 py-6 md:py-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                  <Smartphone className="w-6 h-6" />
                </div>
                <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">Mobile Support Tickets</h1>
              </div>
              <p className="text-blue-100">Manage and respond to support requests from mobile app users</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button onClick={exportTicketsCSV} variant="secondary" className="bg-white/10 text-white border-0" data-testid="button-export">
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={() => refetch()} variant="secondary" className="bg-white/10 text-white border-0" data-testid="button-refresh">
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 opacity-70" />
                <div>
                  <p className="text-xl font-bold">{stats.total}</p>
                  <p className="text-xs text-blue-100">Total</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-orange-300" />
                <div>
                  <p className="text-xl font-bold">{stats.open}</p>
                  <p className="text-xs text-blue-100">Open</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-300" />
                <div>
                  <p className="text-xl font-bold">{stats.inProgress}</p>
                  <p className="text-xs text-blue-100">In Progress</p>
                </div>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-300" />
                <div>
                  <p className="text-xl font-bold">{stats.resolved}</p>
                  <p className="text-xs text-blue-100">Resolved</p>
                </div>
              </div>
            </div>
            {stats.urgent > 0 && (
              <div className="bg-red-500/20 backdrop-blur-sm rounded-xl p-3 border border-red-400/30">
                <div className="flex items-center gap-2">
                  <Flag className="w-5 h-5 text-red-300" />
                  <div>
                    <p className="text-xl font-bold">{stats.urgent}</p>
                    <p className="text-xs text-red-200">Urgent</p>
                  </div>
                </div>
              </div>
            )}
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10">
              <div className="flex items-center gap-2">
                <Timer className="w-5 h-5 text-purple-300" />
                <div>
                  <p className="text-xl font-bold">{formatAvgResponse(stats.avgResponseHours)}</p>
                  <p className="text-xs text-blue-100">Avg Response</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-4 md:py-6">
        <PageInfoBanner
          title="Mobile Support Tickets"
          description="This page manages support tickets submitted from the mobile app and web. Admins can view, reply, assign, categorize, and resolve tickets. Use filters to find specific issues and export data for reporting."
          descriptionAr="تدير هذه الصفحة تذاكر الدعم المقدمة من تطبيق الجوال والويب. يمكن للمسؤولين عرض التذاكر والرد عليها وتعيينها وتصنيفها وحلها. استخدم الفلاتر للعثور على مشاكل محددة وتصدير البيانات للتقارير."
          workflowSteps={[
            { step: 1, role: 'Mobile User', action: 'Submits ticket', description: 'User creates a support ticket from the mobile app describing their issue.' },
            { step: 2, role: 'Admin', action: 'Reviews & assigns', description: 'Admin reviews the ticket, sets priority/category, and assigns it to a team member.' },
            { step: 3, role: 'Support Team', action: 'Responds & resolves', description: 'Support team communicates with the user and resolves the issue.' },
            { step: 4, role: 'System', action: 'Tracks metrics', description: 'Response times, resolution rates, and category trends are tracked automatically.' },
          ]}
          workflowStepsAr={[
            { step: 1, role: 'مستخدم الجوال', action: 'يقدم تذكرة', description: 'ينشئ المستخدم تذكرة دعم من تطبيق الجوال يصف فيها مشكلته.' },
            { step: 2, role: 'المسؤول', action: 'يراجع ويعين', description: 'يراجع المسؤول التذكرة ويحدد الأولوية والفئة ويعينها لعضو في الفريق.' },
            { step: 3, role: 'فريق الدعم', action: 'يرد ويحل', description: 'يتواصل فريق الدعم مع المستخدم ويحل المشكلة.' },
            { step: 4, role: 'النظام', action: 'يتتبع المقاييس', description: 'يتم تتبع أوقات الاستجابة ومعدلات الحل واتجاهات الفئات تلقائياً.' },
          ]}
        />

        <div className="flex flex-wrap gap-3 mb-4 mt-4">
          <div className="flex-1 min-w-[220px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by subject, user, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </div>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-priority-filter">
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
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-category-filter">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[130px]" data-testid="select-source-filter">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="web">Web</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="bg-muted/50 p-1 flex-wrap h-auto gap-1">
            <TabsTrigger value="all" className="data-[state=active]:bg-background" data-testid="tab-all">
              All ({tickets.length})
            </TabsTrigger>
            <TabsTrigger value="open" className="data-[state=active]:bg-background" data-testid="tab-open">
              Open ({stats.open})
            </TabsTrigger>
            <TabsTrigger value="in_progress" className="data-[state=active]:bg-background" data-testid="tab-in-progress">
              In Progress ({stats.inProgress})
            </TabsTrigger>
            <TabsTrigger value="resolved" className="data-[state=active]:bg-background" data-testid="tab-resolved">
              Resolved ({stats.resolved})
            </TabsTrigger>
            <TabsTrigger value="closed" className="data-[state=active]:bg-background" data-testid="tab-closed">
              Closed ({stats.closed})
            </TabsTrigger>
            <TabsTrigger value="analytics" className="data-[state=active]:bg-background" data-testid="tab-analytics">
              <BarChart3 className="w-4 h-4 mr-1" />
              Analytics
            </TabsTrigger>
          </TabsList>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Category Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(stats.categoryBreakdown)
                      .sort(([, a], [, b]) => (b as number) - (a as number))
                      .map(([cat, count]) => {
                        const pct = stats.total > 0 ? ((count as number) / stats.total * 100) : 0;
                        const label = CATEGORIES.find(c => c.value === cat)?.label || cat;
                        return (
                          <div key={cat}>
                            <div className="flex items-center justify-between text-sm mb-1">
                              <span className="capitalize">{label}</span>
                              <span className="font-medium">{count as number} ({pct.toFixed(0)}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Globe className="w-5 h-5 text-primary" />
                    Source Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-5 h-5 text-blue-500" />
                        <span>Mobile App</span>
                      </div>
                      <Badge variant="secondary">{stats.mobileTickets}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <Globe className="w-5 h-5 text-green-500" />
                        <span>Web</span>
                      </div>
                      <Badge variant="secondary">{stats.webTickets}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Timer className="w-5 h-5 text-primary" />
                    Performance Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">Avg Response Time</span>
                      <span className="font-bold text-lg">{formatAvgResponse(stats.avgResponseHours)}</span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">Resolution Rate</span>
                      <span className="font-bold text-lg">
                        {stats.total > 0 ? ((stats.resolved + stats.closed) / stats.total * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <span className="text-sm">Open Rate</span>
                      <span className="font-bold text-lg">
                        {stats.total > 0 ? (stats.open / stats.total * 100).toFixed(0) : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* All Tickets Table */}
              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader>
                  <CardTitle className="text-base">All Tickets Summary</CardTitle>
                  <CardDescription>Full list of support tickets with details</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Subject</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Response Time</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tickets.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                              No tickets found
                            </TableCell>
                          </TableRow>
                        ) : tickets.map((t: SupportTicket) => (
                          <TableRow key={t.id} className="cursor-pointer" onClick={() => { setSelectedTicket(t); setActiveTab('all'); }} data-testid={`row-ticket-${t.id}`}>
                            <TableCell className="font-medium max-w-[200px] truncate">{t.subject}</TableCell>
                            <TableCell className="text-sm">{t.user_name}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="capitalize text-xs">
                                {CATEGORIES.find(c => c.value === t.category)?.label || t.category || 'general'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getPriorityConfig(t.priority).color}>
                                {t.priority}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getStatusColor(t.status)}>
                                {t.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {t.source === 'mobile' ? <Smartphone className="w-4 h-4 text-blue-500" /> : <Globe className="w-4 h-4 text-green-500" />}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{format(new Date(t.created_at), 'MMM d, yyyy')}</TableCell>
                            <TableCell className="text-sm">{getResponseTime(t) || '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Main ticket view for all other tabs */}
          {activeTab !== 'analytics' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                  <ScrollArea className="h-[calc(100vh-500px)]">
                    <div className="space-y-2 pr-4">
                      {filteredTickets.map((ticket: SupportTicket) => {
                        const priorityConfig = getPriorityConfig(ticket.priority);
                        const PriorityIcon = priorityConfig.icon;
                        const categoryLabel = CATEGORIES.find(c => c.value === ticket.category)?.label || ticket.category;
                        
                        return (
                          <Card
                            key={ticket.id}
                            className={`cursor-pointer transition-all hover:shadow-md ${selectedTicket?.id === ticket.id ? 'ring-2 ring-primary shadow-md' : 'hover:border-primary/50'}`}
                            onClick={() => setSelectedTicket(ticket)}
                            data-testid={`card-ticket-${ticket.id}`}
                          >
                            <CardContent className="p-3">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate text-sm">{ticket.subject}</p>
                                </div>
                                <Badge variant="outline" className={priorityConfig.color}>
                                  <PriorityIcon className="w-3 h-3 mr-1" />
                                  {priorityConfig.label}
                                </Badge>
                              </div>
                              
                              <div className="flex items-center gap-2 mb-2">
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                    {ticket.user_name?.charAt(0) || 'U'}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground truncate">{ticket.user_name}</span>
                              </div>
                              
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className={getStatusColor(ticket.status)}>
                                    {ticket.status.replace('_', ' ')}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs capitalize">{categoryLabel}</Badge>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  {ticket.source === 'mobile' ? <Smartphone className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
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
                  <Card className="h-[calc(100vh-500px)] flex flex-col" data-testid="card-ticket-detail">
                    <CardHeader className="border-b bg-muted/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg mb-2">{selectedTicket.subject}</CardTitle>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
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
                              {format(new Date(selectedTicket.created_at), 'MMM d, yyyy h:mm a')}
                            </div>
                            {selectedTicket.source === 'mobile' ? (
                              <Badge variant="outline" className="text-xs"><Smartphone className="w-3 h-3 mr-1" />Mobile</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs"><Globe className="w-3 h-3 mr-1" />Web</Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Select
                            value={selectedTicket.status}
                            onValueChange={(value) => {
                              updateStatusMutation.mutate({ ticketId: selectedTicket.id, status: value });
                              setSelectedTicket({ ...selectedTicket, status: value as any });
                            }}
                          >
                            <SelectTrigger className="w-[130px]" data-testid="select-update-status">
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
                              <DropdownMenuItem className="font-medium text-xs text-muted-foreground" disabled>
                                Category
                              </DropdownMenuItem>
                              {CATEGORIES.map(cat => (
                                <DropdownMenuItem
                                  key={cat.value}
                                  onClick={() => {
                                    updateCategoryMutation.mutate({ ticketId: selectedTicket.id, category: cat.value });
                                    setSelectedTicket({ ...selectedTicket, category: cat.value });
                                  }}
                                >
                                  {selectedTicket.category === cat.value && <CheckCheck className="w-4 h-4 mr-2 text-primary" />}
                                  {cat.label}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="font-medium text-xs text-muted-foreground" disabled>
                                Priority
                              </DropdownMenuItem>
                              {['low', 'medium', 'high', 'urgent'].map(p => (
                                <DropdownMenuItem
                                  key={p}
                                  onClick={() => {
                                    updatePriorityMutation.mutate({ ticketId: selectedTicket.id, priority: p });
                                    setSelectedTicket({ ...selectedTicket, priority: p as any });
                                  }}
                                >
                                  {selectedTicket.priority === p && <CheckCheck className="w-4 h-4 mr-2 text-primary" />}
                                  <span className="capitalize">{p}</span>
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="font-medium text-xs text-muted-foreground" disabled>
                                Assign To
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => assignMutation.mutate({ ticketId: selectedTicket.id, userId: null })}>
                                <XCircle className="w-4 h-4 mr-2" />
                                Unassign
                              </DropdownMenuItem>
                              {adminUsers.map(u => (
                                <DropdownMenuItem
                                  key={u.id}
                                  onClick={() => assignMutation.mutate({ ticketId: selectedTicket.id, userId: u.id })}
                                >
                                  {selectedTicket.assigned_to === u.id && <CheckCheck className="w-4 h-4 mr-2 text-primary" />}
                                  <UserCheck className="w-4 h-4 mr-2" />
                                  {u.name}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  setTicketToDelete(selectedTicket.id);
                                  setShowDeleteDialog(true);
                                }}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Delete Ticket
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="capitalize text-xs">
                          {CATEGORIES.find(c => c.value === selectedTicket.category)?.label || selectedTicket.category || 'general'}
                        </Badge>
                        <Badge variant="outline" className={getPriorityConfig(selectedTicket.priority).color}>
                          {selectedTicket.priority}
                        </Badge>
                        {selectedTicket.assigned_to && (
                          <Badge variant="outline" className="text-xs">
                            <UserCheck className="w-3 h-3 mr-1" />
                            {adminUsers.find(u => u.id === selectedTicket.assigned_to)?.name || 'Assigned'}
                          </Badge>
                        )}
                        {selectedTicket.resolved_at && (
                          <Badge variant="outline" className="text-xs text-emerald-600">
                            <Timer className="w-3 h-3 mr-1" />
                            Resolved in {getResponseTime(selectedTicket)}
                          </Badge>
                        )}
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
                                      {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                                    </span>
                                  </div>
                                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
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
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && replyMessage.trim()) {
                                sendReplyMutation.mutate({ ticketId: selectedTicket.id, message: replyMessage });
                              }
                            }}
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
                            {sendReplyMutation.isPending ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="w-4 h-4 mr-2" />
                            )}
                            Send
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Press Ctrl+Enter to send</p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="h-[calc(100vh-500px)] flex items-center justify-center border-dashed">
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
          )}
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Ticket</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this ticket and all its messages? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} data-testid="button-cancel-delete">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => ticketToDelete && deleteTicketMutation.mutate(ticketToDelete)}
              disabled={deleteTicketMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteTicketMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
