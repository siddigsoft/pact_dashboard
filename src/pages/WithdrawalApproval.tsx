import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useWallet } from '@/context/wallet/WalletContext';
import { useUser } from '@/context/user/UserContext';
import { useAppContext } from '@/context/AppContext';
import { useToast } from '@/hooks/use-toast';
import { useWithdrawalRealtime } from '@/hooks/useWithdrawalRealtime';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  User, 
  Calendar, 
  ArrowRight, 
  Send, 
  Info, 
  RefreshCw, 
  FileText, 
  Building2,
  Wallet,
  TrendingUp,
  Shield,
  AlertTriangle,
  Zap,
  Timer,
  CheckCheck,
  Flame
} from 'lucide-react';
import { format, differenceInHours, differenceInDays } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { WithdrawalRequest } from '@/types/wallet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SupervisedRequest extends WithdrawalRequest {
  requesterName?: string;
  requesterEmail?: string;
  requesterHub?: string;
  requesterState?: string;
  requesterRole?: string;
}

export default function WithdrawalApproval() {
  const { 
    supervisedWithdrawalRequests, 
    refreshSupervisedWithdrawalRequests,
    approveWithdrawalRequest, 
    rejectWithdrawalRequest,
    loading 
  } = useWallet();
  const { users } = useUser();
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<SupervisedRequest | null>(null);
  const [dialogType, setDialogType] = useState<'approve' | 'reject' | 'batch_approve' | null>(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hubName, setHubName] = useState<string | null>(null);
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set());

  const handleRealtimeUpdate = useCallback(() => {
    refreshSupervisedWithdrawalRequests();
  }, [refreshSupervisedWithdrawalRequests]);

  useWithdrawalRealtime({
    role: 'supervisor',
    onUpdate: handleRealtimeUpdate,
  });
  
  const getRequestUrgency = (createdAt: string) => {
    const hoursAgo = differenceInHours(new Date(), new Date(createdAt));
    const daysAgo = differenceInDays(new Date(), new Date(createdAt));
    
    if (hoursAgo < 24) {
      return { level: 'normal', label: 'New', color: 'text-muted-foreground', bgColor: '', icon: null };
    } else if (hoursAgo < 48) {
      return { level: 'medium', label: '1+ day', color: 'text-amber-600 dark:text-amber-400', bgColor: 'bg-amber-500/10', icon: Timer };
    } else if (hoursAgo < 72) {
      return { level: 'high', label: '2+ days', color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-500/10', icon: AlertTriangle };
    } else {
      return { level: 'critical', label: `${daysAgo}+ days`, color: 'text-red-600 dark:text-red-400', bgColor: 'bg-red-500/10', icon: Flame };
    }
  };
  
  const toggleRequestSelection = (requestId: string) => {
    setSelectedRequestIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(requestId)) {
        newSet.delete(requestId);
      } else {
        newSet.add(requestId);
      }
      return newSet;
    });
  };
  
  const toggleAllPendingSelection = () => {
    if (selectedRequestIds.size === pendingRequests.length) {
      setSelectedRequestIds(new Set());
    } else {
      setSelectedRequestIds(new Set(pendingRequests.map(r => r.id)));
    }
  };
  
  const handleBatchApprove = async () => {
    if (selectedRequestIds.size === 0) return;
    
    setProcessing(true);
    
    try {
      const batchNotes = notes || 'Batch approved by supervisor';
      
      const results = await Promise.allSettled(
        Array.from(selectedRequestIds).map(requestId => 
          approveWithdrawalRequest(requestId, batchNotes)
        )
      );
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.filter(r => r.status === 'rejected').length;
      
      toast({
        title: 'Batch Approval Complete',
        description: `${successCount} request(s) approved${failCount > 0 ? `, ${failCount} failed` : ''}`,
        variant: failCount > 0 ? 'destructive' : 'default',
      });
      
      await refreshSupervisedWithdrawalRequests();
      setSelectedRequestIds(new Set());
      setDialogType(null);
      setNotes('');
    } finally {
      setProcessing(false);
    }
  };

  const isSupervisor = useMemo(() => {
    if (!currentUser) return false;
    const role = (currentUser.role || '').toLowerCase();
    const adminRoles = ['admin', 'ict', 'financialadmin', 'finance', 'fom', 'super_admin', 'superadmin'];
    const isAdmin = adminRoles.includes(role);
    const isSupervisorRole = role === 'supervisor' || role === 'hubsupervisor';
    return isSupervisorRole && !isAdmin;
  }, [currentUser?.role]);

  const supervisorHubId = currentUser?.hubId;

  useEffect(() => {
    if (!isSupervisor || !supervisorHubId) {
      setHubName(null);
      return;
    }
    const fetchHubName = async () => {
      const { data } = await supabase
        .from('hubs')
        .select('name')
        .eq('id', supervisorHubId)
        .maybeSingle();
      if (data) setHubName(data.name);
    };
    fetchHubName();
  }, [isSupervisor, supervisorHubId]);

  useEffect(() => {
    refreshSupervisedWithdrawalRequests();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSupervisedWithdrawalRequests();
    setRefreshing(false);
  };

  const filteredRequests = useMemo(() => {
    if (!isSupervisor || !supervisorHubId) {
      return supervisedWithdrawalRequests as SupervisedRequest[];
    }
    return (supervisedWithdrawalRequests as SupervisedRequest[]).filter(r => 
      r.requesterHub && r.requesterHub === supervisorHubId
    );
  }, [supervisedWithdrawalRequests, isSupervisor, supervisorHubId]);

  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const forwardedRequests = filteredRequests.filter(r => r.status === 'supervisor_approved' || r.status === 'processing');
  const approvedRequests = filteredRequests.filter(r => r.status === 'approved');
  const rejectedRequests = filteredRequests.filter(r => r.status === 'rejected');

  const totalPendingAmount = pendingRequests.reduce((sum, r) => sum + r.amount, 0);

  const getUserName = (userId: string, request?: SupervisedRequest) => {
    if (request?.requesterName) {
      return request.requesterName;
    }
    const user = users.find(u => u.id === userId);
    return user?.name || 'Unknown User';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatCurrency = (amount: number, currency: string = 'SDG') => {
    return new Intl.NumberFormat('en-SD', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return format(new Date(dateString), 'HH:mm');
    } catch {
      return '';
    }
  };

  const handleApprove = (request: SupervisedRequest) => {
    setSelectedRequest(request);
    setDialogType('approve');
    setNotes('');
  };

  const handleReject = (request: SupervisedRequest) => {
    setSelectedRequest(request);
    setDialogType('reject');
    setNotes('');
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest) return;

    setProcessing(true);
    try {
      if (dialogType === 'approve') {
        await approveWithdrawalRequest(selectedRequest.id, notes);
      } else if (dialogType === 'reject') {
        await rejectWithdrawalRequest(selectedRequest.id, notes);
      }
      await refreshSupervisedWithdrawalRequests();
      setDialogType(null);
      setSelectedRequest(null);
      setNotes('');
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'supervisor_approved':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"><Send className="w-3 h-3 mr-1" />With Finance</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30"><ArrowRight className="w-3 h-3 mr-1" />Processing</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const EmptyState = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
    </div>
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return { border: 'border-l-amber-500', avatar: 'border-amber-500/20', avatarBg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' };
      case 'supervisor_approved': return { border: 'border-l-blue-500', avatar: 'border-blue-500/20', avatarBg: 'bg-blue-500/10 text-blue-700 dark:text-blue-400' };
      case 'processing': return { border: 'border-l-purple-500', avatar: 'border-purple-500/20', avatarBg: 'bg-purple-500/10 text-purple-700 dark:text-purple-400' };
      case 'approved': return { border: 'border-l-emerald-500', avatar: 'border-emerald-500/20', avatarBg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' };
      case 'rejected': return { border: 'border-l-red-500', avatar: 'border-red-500/20', avatarBg: 'bg-red-500/10 text-red-700 dark:text-red-400' };
      default: return { border: 'border-l-muted', avatar: 'border-muted', avatarBg: 'bg-muted' };
    }
  };

  const WorkflowTimeline = ({ request }: { request: SupervisedRequest }) => {
    const steps = [
      { key: 'submitted', label: 'Submitted', done: true },
      { key: 'supervisor', label: 'Supervisor', done: request.status !== 'pending' },
      { key: 'finance', label: 'Finance', done: request.status === 'processing' || request.status === 'approved' },
      { key: 'complete', label: 'Complete', done: request.status === 'approved' },
    ];
    
    const rejectedStep = request.status === 'rejected' 
      ? ((request as any).adminNotes ? 2 : 1)
      : -1;
    
    return (
      <div className="flex items-center gap-1 text-xs">
        {steps.map((step, idx) => (
          <div key={step.key} className="flex items-center">
            <div className={`w-2 h-2 rounded-full ${
              rejectedStep === idx 
                ? 'bg-red-500' 
                : step.done 
                  ? 'bg-emerald-500' 
                  : 'bg-muted-foreground/30'
            }`} />
            {idx < steps.length - 1 && (
              <div className={`w-4 h-0.5 ${
                step.done && steps[idx + 1]?.done 
                  ? 'bg-emerald-500' 
                  : 'bg-muted-foreground/30'
              }`} />
            )}
          </div>
        ))}
        <span className="ml-1 text-muted-foreground">{
          request.status === 'rejected' ? 'Rejected' :
          request.status === 'approved' ? 'Completed' :
          request.status === 'processing' ? 'Processing' :
          request.status === 'supervisor_approved' ? 'With Finance' :
          'Pending'
        }</span>
      </div>
    );
  };

  const RequestCard = ({ request, showSelection = false }: { request: SupervisedRequest, showSelection?: boolean }) => {
    const userName = getUserName(request.userId, request);
    const colors = getStatusColor(request.status);
    const urgency = request.status === 'pending' ? getRequestUrgency(request.createdAt) : null;
    const UrgencyIcon = urgency?.icon;
    
    return (
      <Card className={`group transition-all duration-200 hover:shadow-md border-l-4 ${colors.border} ${
        selectedRequestIds.has(request.id) ? 'ring-2 ring-primary ring-offset-2' : ''
      }`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              {showSelection && request.status === 'pending' && (
                <Checkbox
                  checked={selectedRequestIds.has(request.id)}
                  onCheckedChange={() => toggleRequestSelection(request.id)}
                  className="mt-1"
                  data-testid={`checkbox-select-${request.id}`}
                />
              )}
              <Avatar className={`h-10 w-10 border-2 ${colors.avatar}`}>
                <AvatarFallback className={`${colors.avatarBg} text-sm font-medium`}>
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-foreground truncate">{userName}</h4>
                  {getStatusBadge(request.status)}
                  {urgency && urgency.level !== 'normal' && UrgencyIcon && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className={`${urgency.bgColor} ${urgency.color} border-0 gap-1`}>
                          <UrgencyIcon className="w-3 h-3" />
                          {urgency.label}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Request waiting for {urgency.label}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(request.createdAt)}
                  </span>
                  <span>{formatTime(request.createdAt)}</span>
                </div>
                <div className="mt-2">
                  <WorkflowTimeline request={request} />
                </div>
                {request.requestReason && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2 italic">
                    "{request.requestReason}"
                  </p>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {formatCurrency(request.amount, request.currency)}
              </p>
              <Badge variant="secondary" className="mt-1 capitalize text-xs">
                {request.paymentMethod || 'Not specified'}
              </Badge>
            </div>
          </div>
          {request.status === 'pending' && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Button
                size="sm"
                onClick={() => handleApprove(request)}
                className="flex-1 bg-emerald-600 text-white"
                data-testid={`button-approve-${request.id}`}
              >
                <Send className="w-4 h-4 mr-1.5" />
                Forward to Finance
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReject(request)}
                className="flex-1 border-red-500/30 text-red-600"
                data-testid={`button-reject-${request.id}`}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Reject
              </Button>
            </div>
          )}
          {request.status !== 'pending' && request.supervisorNotes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="italic">"{request.supervisorNotes}"</span>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  const hasMobileSelection = selectedRequestIds.size > 0;

  return (
    <div className={`p-6 space-y-6 max-w-7xl mx-auto ${hasMobileSelection ? 'pb-24 sm:pb-6' : ''}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Shield className="w-6 h-6 text-amber-600" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Supervisor Approval</h1>
            </div>
            {isSupervisor && hubName && (
              <Badge variant="outline" className="flex items-center gap-1.5 px-3 py-1">
                <Building2 className="w-3.5 h-3.5" />
                {hubName}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1">
            Review and verify withdrawal requests from your team
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh} 
          disabled={refreshing}
          className="self-start sm:self-auto"
          data-testid="button-refresh-requests"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-amber-500/5 via-amber-500/10 to-orange-500/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">Pending Review</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{pendingRequests.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(totalPendingAmount)} total
                </p>
              </div>
              <div className="p-3 rounded-full bg-amber-500/10">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/5 via-blue-500/10 to-indigo-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">With Finance</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{forwardedRequests.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
              </div>
              <div className="p-3 rounded-full bg-blue-500/10">
                <Send className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/5 via-emerald-500/10 to-green-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Completed</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{approvedRequests.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Successfully paid</p>
              </div>
              <div className="p-3 rounded-full bg-emerald-500/10">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-red-500/5 via-red-500/10 to-rose-500/5 border-red-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">Rejected</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{rejectedRequests.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Declined requests</p>
              </div>
              <div className="p-3 rounded-full bg-red-500/10">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {pendingRequests.length > 0 && (
        <Alert className="bg-amber-500/5 border-amber-500/30">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-amber-700 dark:text-amber-400">
            <strong>{pendingRequests.length} request{pendingRequests.length !== 1 ? 's' : ''}</strong> awaiting your review. 
            Total amount: <strong>{formatCurrency(totalPendingAmount)}</strong>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            <CardTitle className="text-base">Two-Step Approval Process</CardTitle>
          </div>
          <CardDescription>
            After you approve a request, it will be forwarded to Finance for final payment processing.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex">
          <TabsTrigger value="pending" className="gap-1.5" data-testid="tab-pending">
            <Clock className="w-4 h-4 hidden sm:inline" />
            Pending
            {pendingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{pendingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="forwarded" className="gap-1.5" data-testid="tab-forwarded">
            <Send className="w-4 h-4 hidden sm:inline" />
            Forwarded
            {forwardedRequests.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{forwardedRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-1.5" data-testid="tab-approved">
            <CheckCircle2 className="w-4 h-4 hidden sm:inline" />
            Completed
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-1.5" data-testid="tab-rejected">
            <XCircle className="w-4 h-4 hidden sm:inline" />
            Rejected
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-3">
          {pendingRequests.length === 0 ? (
            <Card>
              <EmptyState 
                icon={CheckCircle2}
                title="All caught up!"
                description="No pending withdrawal requests to review at this time."
              />
            </Card>
          ) : (
            <>
              {pendingRequests.length > 1 && (
                <div className="flex items-center justify-between gap-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedRequestIds.size === pendingRequests.length}
                      onCheckedChange={toggleAllPendingSelection}
                      data-testid="checkbox-select-all"
                    />
                    <span className="text-sm font-medium">
                      {selectedRequestIds.size > 0 
                        ? `${selectedRequestIds.size} selected`
                        : 'Select all'
                      }
                    </span>
                  </div>
                  {selectedRequestIds.size > 0 && (
                    <Button
                      size="sm"
                      onClick={() => setDialogType('batch_approve')}
                      className="bg-emerald-600 text-white"
                      data-testid="button-batch-approve"
                    >
                      <CheckCheck className="w-4 h-4 mr-1.5" />
                      Approve Selected ({selectedRequestIds.size})
                    </Button>
                  )}
                </div>
              )}
              <div className="grid gap-3">
                {pendingRequests.map((request) => (
                  <RequestCard key={request.id} request={request} showSelection={pendingRequests.length > 1} />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="forwarded" className="space-y-3">
          {forwardedRequests.length === 0 ? (
            <Card>
              <EmptyState 
                icon={Send}
                title="No forwarded requests"
                description="Requests you approve will appear here while awaiting Finance processing."
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {forwardedRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-3">
          {approvedRequests.length === 0 ? (
            <Card>
              <EmptyState 
                icon={Wallet}
                title="No completed requests"
                description="Successfully processed withdrawals will appear here."
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {approvedRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-3">
          {rejectedRequests.length === 0 ? (
            <Card>
              <EmptyState 
                icon={XCircle}
                title="No rejected requests"
                description="Requests that were declined will appear here."
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {rejectedRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogType !== null && dialogType !== 'batch_approve'} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType === 'approve' ? (
                <>
                  <div className="p-2 rounded-full bg-emerald-500/10">
                    <Send className="w-5 h-5 text-emerald-600" />
                  </div>
                  Forward to Finance
                </>
              ) : (
                <>
                  <div className="p-2 rounded-full bg-red-500/10">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  Reject Request
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <div className="mt-4 p-4 rounded-lg bg-muted/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Enumerator</span>
                    <span className="font-medium text-foreground">{getUserName(selectedRequest.userId, selectedRequest)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="font-bold text-foreground tabular-nums">{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Payment Method</span>
                    <span className="font-medium text-foreground capitalize">{selectedRequest.paymentMethod}</span>
                  </div>
                  {selectedRequest.requestReason && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Reason</p>
                      <p className="text-sm text-foreground italic">"{selectedRequest.requestReason}"</p>
                    </div>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="notes">
              Notes {dialogType === 'reject' && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="notes"
              placeholder={dialogType === 'approve' ? 'Add optional notes for Finance team...' : 'Explain the reason for rejection...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="input-supervisor-notes"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogType(null)} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={processing || (dialogType === 'reject' && !notes.trim())}
              className={dialogType === 'approve' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}
              data-testid="button-confirm-action"
            >
              {processing ? 'Processing...' : dialogType === 'approve' ? 'Forward to Finance' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={dialogType === 'batch_approve'} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="p-2 rounded-full bg-emerald-500/10">
                <CheckCheck className="w-5 h-5 text-emerald-600" />
              </div>
              Batch Approval
            </DialogTitle>
            <DialogDescription>
              <div className="mt-4 p-4 rounded-lg bg-muted/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Requests Selected</span>
                  <span className="font-bold text-foreground tabular-nums">{selectedRequestIds.size}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-bold text-foreground tabular-nums">
                    {formatCurrency(
                      pendingRequests
                        .filter(r => selectedRequestIds.has(r.id))
                        .reduce((sum, r) => sum + r.amount, 0),
                      'SDG'
                    )}
                  </span>
                </div>
              </div>
              <p className="mt-4 text-sm">
                All selected requests will be forwarded to Finance for payment processing.
              </p>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="batch-notes">Notes (Optional)</Label>
            <Textarea
              id="batch-notes"
              placeholder="Add optional notes for Finance team..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              data-testid="input-batch-notes"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogType(null)} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handleBatchApprove}
              disabled={processing}
              className="bg-emerald-600 text-white"
              data-testid="button-confirm-batch"
            >
              {processing ? 'Processing...' : `Approve ${selectedRequestIds.size} Requests`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedRequest !== null && dialogType === null} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <div className="mt-4 space-y-4">
                  <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Enumerator</span>
                      <span className="font-medium text-foreground">{getUserName(selectedRequest.userId, selectedRequest)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-bold text-foreground tabular-nums">{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Status</span>
                      {getStatusBadge(selectedRequest.status)}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium text-foreground">{formatDate(selectedRequest.createdAt)}</span>
                    </div>
                  </div>
                  {selectedRequest.requestReason && (
                    <div className="p-3 rounded-lg bg-muted/30">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Request Reason</p>
                      <p className="text-sm text-foreground">"{selectedRequest.requestReason}"</p>
                    </div>
                  )}
                  {selectedRequest.supervisorNotes && (
                    <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Supervisor Notes</p>
                      <p className="text-sm text-foreground">"{selectedRequest.supervisorNotes}"</p>
                    </div>
                  )}
                  {selectedRequest.adminNotes && (
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1">Finance Notes</p>
                      <p className="text-sm text-foreground">"{selectedRequest.adminNotes}"</p>
                    </div>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedRequest(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedRequestIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background/95 backdrop-blur-sm border-t shadow-lg sm:hidden" data-testid="mobile-action-bar">
          <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10">
                <span className="text-sm font-bold text-amber-600">{selectedRequestIds.size}</span>
              </div>
              <div className="text-sm">
                <p className="font-medium">Selected</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(
                    pendingRequests
                      .filter(r => selectedRequestIds.has(r.id))
                      .reduce((sum, r) => sum + r.amount, 0)
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedRequestIds(new Set())}
                data-testid="button-mobile-clear-selection"
              >
                Clear
              </Button>
              <Button
                size="sm"
                onClick={() => setDialogType('batch_approve')}
                className="bg-emerald-600 text-white"
                data-testid="button-mobile-batch-approve"
              >
                <Send className="w-4 h-4 mr-1.5" />
                Approve
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
