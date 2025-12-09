import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Shield,
  AlertTriangle,
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

interface SupervisedRequest extends WithdrawalRequest {
  requesterName?: string;
  requesterEmail?: string;
  requesterHub?: string;
  requesterState?: string;
  requesterRole?: string;
}

export default function SupervisorApprovals() {
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

  const userRole = currentUser?.role?.toLowerCase();
  const isSupervisor = userRole === 'supervisor' || userRole === 'hubsupervisor';
  const isAdmin = userRole === 'admin' || userRole === 'financialadmin' || userRole === 'ict';
  const isFOM = userRole === 'fom' || userRole === 'field operation manager';

  const supervisorHubId = currentUser?.hubId;

  useEffect(() => {
    if (!supervisorHubId) {
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
  }, [supervisorHubId]);

  useEffect(() => {
    refreshSupervisedWithdrawalRequests();
  }, []);

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
        description: `${successCount} request(s) approved and forwarded to Finance${failCount > 0 ? `, ${failCount} failed` : ''}`,
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSupervisedWithdrawalRequests();
    setRefreshing(false);
  };

  const filteredRequests = useMemo(() => {
    if (isSupervisor && supervisorHubId) {
      return (supervisedWithdrawalRequests as SupervisedRequest[]).filter(r => 
        r.requesterHub && r.requesterHub === supervisorHubId
      );
    }
    return supervisedWithdrawalRequests as SupervisedRequest[];
  }, [supervisedWithdrawalRequests, isSupervisor, supervisorHubId]);

  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const forwardedRequests = filteredRequests.filter(r => r.status === 'supervisor_approved' || r.status === 'processing');
  const completedRequests = filteredRequests.filter(r => r.status === 'approved');
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
        toast({
          title: 'Request Approved',
          description: 'Request forwarded to Finance for processing',
        });
      } else if (dialogType === 'reject') {
        await rejectWithdrawalRequest(selectedRequest.id, notes);
        toast({
          title: 'Request Rejected',
          description: 'The requester has been notified',
        });
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
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" />Pending Review</Badge>;
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

  if (!isSupervisor && !isAdmin && !isFOM) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
              <h2 className="text-xl font-semibold">Access Denied</h2>
              <p className="text-muted-foreground max-w-md">
                You don't have permission to access this page. Only supervisors, FOMs, and administrators can approve requests.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const WorkflowTimeline = ({ request }: { request: SupervisedRequest }) => {
    const steps = [
      { key: 'submitted', label: 'Submitted', done: true },
      { key: 'supervisor', label: 'Supervisor', done: request.status !== 'pending' },
      { key: 'finance', label: 'Finance', done: request.status === 'processing' || request.status === 'approved' },
      { key: 'complete', label: 'Complete', done: request.status === 'approved' },
    ];
    
    const rejectedStep = request.status === 'rejected' 
      ? (request.adminProcessedBy ? 2 : 1)
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

  const RequestCard = ({ request }: { request: SupervisedRequest }) => {
    const urgency = getRequestUrgency(request.createdAt);
    const isSelected = selectedRequestIds.has(request.id);
    
    return (
      <Card className={`transition-all ${isSelected ? 'ring-2 ring-primary' : ''} ${urgency.bgColor}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {request.status === 'pending' && (
              <Checkbox 
                checked={isSelected}
                onCheckedChange={() => toggleRequestSelection(request.id)}
                className="mt-1"
                data-testid={`checkbox-request-${request.id}`}
              />
            )}
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(getUserName(request.userId, request))}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <p className="font-medium">{getUserName(request.userId, request)}</p>
                  <p className="text-sm text-muted-foreground">{request.requesterRole || 'Data Collector'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-lg">{formatCurrency(request.amount)}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(request.createdAt)}</p>
                </div>
              </div>
              
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {getStatusBadge(request.status)}
                {urgency.icon && (
                  <Badge variant="outline" className={urgency.color}>
                    <urgency.icon className="w-3 h-3 mr-1" />
                    {urgency.label}
                  </Badge>
                )}
                {request.requesterHub && (
                  <Badge variant="secondary" className="text-xs">
                    <Building2 className="w-3 h-3 mr-1" />
                    Hub
                  </Badge>
                )}
              </div>

              <div className="mt-2">
                <WorkflowTimeline request={request} />
              </div>

              {(request as any).description && (
                <div className="mt-3 p-2 bg-muted/50 rounded text-sm">
                  <p className="text-muted-foreground">{(request as any).description}</p>
                </div>
              )}

              {request.status === 'pending' && (
                <div className="mt-4 flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => handleApprove(request)}
                    className="flex-1"
                    data-testid={`button-approve-${request.id}`}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    Approve & Forward
                  </Button>
                  <Button 
                    size="sm" 
                    variant="destructive"
                    onClick={() => handleReject(request)}
                    data-testid={`button-reject-${request.id}`}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-7 w-7 text-primary" />
            Supervisor Approvals
          </h1>
          <p className="text-muted-foreground mt-1">
            Review and approve withdrawal requests from your team (Tier 1)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hubName && (
            <Badge variant="outline" className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {hubName}
            </Badge>
          )}
          <Badge variant="secondary" className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Tier 1: Supervisor Review
          </Badge>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Two-Tier Approval Process:</strong> As a supervisor, you review requests first (Tier 1). 
          Approved requests are forwarded to Finance/Admin for final processing and payment (Tier 2).
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold text-amber-600">{pendingRequests.length}</p>
              </div>
              <Clock className="h-8 w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Amount</p>
                <p className="text-2xl font-bold">{formatCurrency(totalPendingAmount)}</p>
              </div>
              <Wallet className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">With Finance</p>
                <p className="text-2xl font-bold text-blue-600">{forwardedRequests.length}</p>
              </div>
              <Send className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold text-emerald-600">{completedRequests.length}</p>
              </div>
              <CheckCheck className="h-8 w-8 text-emerald-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedRequestIds.size > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Checkbox 
                  checked={selectedRequestIds.size === pendingRequests.length}
                  onCheckedChange={toggleAllPendingSelection}
                  data-testid="checkbox-select-all"
                />
                <span className="font-medium">{selectedRequestIds.size} request(s) selected</span>
              </div>
              <Button onClick={() => setDialogType('batch_approve')} data-testid="button-batch-approve">
                <CheckCheck className="w-4 h-4 mr-1" />
                Batch Approve & Forward
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="pending" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pending" data-testid="tab-pending">
            Pending ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="forwarded" data-testid="tab-forwarded">
            With Finance ({forwardedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            Completed ({completedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            Rejected ({rejectedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : pendingRequests.length === 0 ? (
            <EmptyState 
              icon={CheckCircle2}
              title="No Pending Requests"
              description="All requests have been reviewed. Check back later for new submissions."
            />
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4 pr-4">
                {pendingRequests.map(request => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="forwarded" className="mt-4">
          {forwardedRequests.length === 0 ? (
            <EmptyState 
              icon={Send}
              title="No Requests With Finance"
              description="Approved requests awaiting finance processing will appear here."
            />
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4 pr-4">
                {forwardedRequests.map(request => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4">
          {completedRequests.length === 0 ? (
            <EmptyState 
              icon={CheckCheck}
              title="No Completed Requests"
              description="Successfully processed requests will appear here."
            />
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4 pr-4">
                {completedRequests.map(request => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          {rejectedRequests.length === 0 ? (
            <EmptyState 
              icon={XCircle}
              title="No Rejected Requests"
              description="Rejected requests will appear here."
            />
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-4 pr-4">
                {rejectedRequests.map(request => (
                  <RequestCard key={request.id} request={request} />
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogType === 'approve'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve & Forward to Finance</DialogTitle>
            <DialogDescription>
              This request will be forwarded to the Finance team for final processing and payment.
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requester:</span>
                  <span className="font-medium">{getUserName(selectedRequest.userId, selectedRequest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-semibold">{formatCurrency(selectedRequest.amount)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Approval Notes (Optional)</Label>
                <Textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any notes for the finance team..."
                  data-testid="textarea-approval-notes"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleConfirmAction} disabled={processing} data-testid="button-confirm-approve">
              {processing ? 'Processing...' : 'Approve & Forward'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogType === 'reject'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Request</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this request.
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requester:</span>
                  <span className="font-medium">{getUserName(selectedRequest.userId, selectedRequest)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-semibold">{formatCurrency(selectedRequest.amount)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Rejection Reason *</Label>
                <Textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Explain why this request is being rejected..."
                  required
                  data-testid="textarea-rejection-reason"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button 
              variant="destructive" 
              onClick={handleConfirmAction} 
              disabled={processing || !notes.trim()}
              data-testid="button-confirm-reject"
            >
              {processing ? 'Processing...' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogType === 'batch_approve'} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batch Approve Requests</DialogTitle>
            <DialogDescription>
              You are about to approve {selectedRequestIds.size} request(s) and forward them to Finance.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted/50 rounded-lg">
              <p className="font-medium">{selectedRequestIds.size} requests selected</p>
              <p className="text-sm text-muted-foreground">
                Total: {formatCurrency(
                  pendingRequests
                    .filter(r => selectedRequestIds.has(r.id))
                    .reduce((sum, r) => sum + r.amount, 0)
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Batch Approval Notes (Optional)</Label>
              <Textarea 
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes for all requests..."
                data-testid="textarea-batch-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)}>Cancel</Button>
            <Button onClick={handleBatchApprove} disabled={processing} data-testid="button-confirm-batch">
              {processing ? 'Processing...' : `Approve ${selectedRequestIds.size} Requests`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
