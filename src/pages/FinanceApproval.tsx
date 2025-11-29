import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWallet } from '@/context/wallet/WalletContext';
import { useUser } from '@/context/user/UserContext';
import { 
  Clock, 
  CheckCircle2, 
  XCircle, 
  User, 
  Calendar, 
  Send, 
  Banknote, 
  CreditCard, 
  Info, 
  FileText, 
  RefreshCw,
  Wallet,
  ArrowRightLeft,
  DollarSign,
  TrendingUp,
  Building2,
  AlertCircle
} from 'lucide-react';
import { format } from 'date-fns';
import { AdminWithdrawalRequest } from '@/types/wallet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

export default function FinanceApproval() {
  const { adminListWithdrawalRequests, adminProcessWithdrawal, adminRejectWithdrawal } = useWallet();
  const { users } = useUser();
  const [allRequests, setAllRequests] = useState<AdminWithdrawalRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<AdminWithdrawalRequest | null>(null);
  const [dialogType, setDialogType] = useState<'process' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAllRequests = async () => {
    const requests = await adminListWithdrawalRequests();
    setAllRequests(requests);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchAllRequests();
      setLoading(false);
    };
    loadData();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAllRequests();
    setRefreshing(false);
  };

  const supervisorApprovedRequests = allRequests.filter(r => r.status === 'supervisor_approved');
  const processingRequests = allRequests.filter(r => r.status === 'processing');
  const completedRequests = allRequests.filter(r => r.status === 'approved');
  const rejectedRequests = allRequests.filter(r => r.status === 'rejected');

  const totalReadyAmount = supervisorApprovedRequests.reduce((sum, r) => sum + r.amount, 0);
  const totalCompletedAmount = completedRequests.reduce((sum, r) => sum + r.amount, 0);

  const getUserName = (userId: string, request?: AdminWithdrawalRequest) => {
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

  const handleProcess = (request: AdminWithdrawalRequest) => {
    setSelectedRequest(request);
    setDialogType('process');
    setNotes('');
  };

  const handleReject = (request: AdminWithdrawalRequest) => {
    setSelectedRequest(request);
    setDialogType('reject');
    setNotes('');
  };

  const handleConfirmAction = async () => {
    if (!selectedRequest) return;

    setProcessing(true);
    try {
      if (dialogType === 'process') {
        await adminProcessWithdrawal(selectedRequest.id, notes);
      } else if (dialogType === 'reject') {
        await adminRejectWithdrawal(selectedRequest.id, notes);
      }
      await fetchAllRequests();
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
        return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"><Clock className="w-3 h-3 mr-1" />With Supervisor</Badge>;
      case 'supervisor_approved':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"><Send className="w-3 h-3 mr-1" />Ready to Pay</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30"><Banknote className="w-3 h-3 mr-1" />Processing</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"><CheckCircle2 className="w-3 h-3 mr-1" />Paid</Badge>;
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

  const PaymentDetails = ({ details }: { details: Record<string, any> | null }) => {
    if (!details || Object.keys(details).length === 0) {
      return <span className="text-muted-foreground italic text-sm">No payment details</span>;
    }
    return (
      <div className="text-sm space-y-0.5">
        {Object.entries(details).slice(0, 2).map(([key, value]) => (
          <div key={key} className="flex items-center gap-1">
            <span className="text-muted-foreground capitalize text-xs">{key.replace(/_/g, ' ')}:</span>
            <span className="font-medium truncate max-w-[100px]">{String(value)}</span>
          </div>
        ))}
      </div>
    );
  };

  const RequestCard = ({ request, showActions = false }: { request: AdminWithdrawalRequest, showActions?: boolean }) => {
    const userName = getUserName(request.userId, request);
    const supervisorName = request.supervisorId ? getUserName(request.supervisorId) : null;
    
    return (
      <Card className={`group transition-all duration-200 hover:shadow-md ${
        request.status === 'supervisor_approved' ? 'border-l-4 border-l-blue-500' :
        request.status === 'processing' ? 'border-l-4 border-l-purple-500' :
        request.status === 'approved' ? 'border-l-4 border-l-emerald-500' :
        request.status === 'rejected' ? 'border-l-4 border-l-red-500' : ''
      }`}>
        <CardContent className="p-5">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <Avatar className="h-11 w-11 border-2 border-blue-500/20">
                <AvatarFallback className="bg-blue-500/10 text-blue-700 dark:text-blue-400 text-sm font-medium">
                  {getInitials(userName)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-foreground">{userName}</h4>
                  {getStatusBadge(request.status)}
                </div>
                <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(request.createdAt)}
                  </span>
                  <span className="flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span className="capitalize">{request.paymentMethod}</span>
                  </span>
                </div>
                {supervisorName && (
                  <div className="mt-2 flex items-center gap-1.5 text-sm">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-muted-foreground">Approved by</span>
                    <span className="font-medium text-foreground">{supervisorName}</span>
                  </div>
                )}
                {request.supervisorNotes && (
                  <p className="text-sm text-muted-foreground mt-1 italic line-clamp-1">
                    "{request.supervisorNotes}"
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <p className="text-2xl font-bold tabular-nums text-foreground">
                {formatCurrency(request.amount, request.currency)}
              </p>
              <PaymentDetails details={request.paymentDetails} />
            </div>
          </div>

          {showActions && request.status === 'supervisor_approved' && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t">
              <Button
                size="sm"
                onClick={() => handleProcess(request)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                data-testid={`button-process-${request.id}`}
              >
                <Banknote className="w-4 h-4 mr-1.5" />
                Process Payment
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleReject(request)}
                className="flex-1 border-red-500/30 text-red-600 hover:bg-red-500/10"
                data-testid={`button-reject-${request.id}`}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Reject
              </Button>
            </div>
          )}

          {request.status === 'approved' && request.adminNotes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <span className="italic">"{request.adminNotes}"</span>
              </p>
            </div>
          )}

          {request.status === 'rejected' && request.adminNotes && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-start gap-1.5 text-red-600 dark:text-red-400">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <p className="text-xs italic">"{request.adminNotes}"</p>
              </div>
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

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <DollarSign className="w-6 h-6 text-emerald-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Finance Processing</h1>
          </div>
          <p className="text-muted-foreground mt-1">
            Process verified withdrawal requests and release payments
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
        <Card className="bg-gradient-to-br from-blue-500/5 via-blue-500/10 to-indigo-500/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">Ready to Pay</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{supervisorApprovedRequests.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(totalReadyAmount)} pending
                </p>
              </div>
              <div className="p-3 rounded-full bg-blue-500/10">
                <Send className="w-6 h-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/5 via-purple-500/10 to-violet-500/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-purple-600 dark:text-purple-400">Processing</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{processingRequests.length}</p>
                <p className="text-xs text-muted-foreground mt-1">In progress</p>
              </div>
              <div className="p-3 rounded-full bg-purple-500/10">
                <ArrowRightLeft className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-500/5 via-emerald-500/10 to-green-500/5 border-emerald-500/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Paid Out</p>
                <p className="text-3xl font-bold mt-1 tabular-nums">{completedRequests.length}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(totalCompletedAmount)} total
                </p>
              </div>
              <div className="p-3 rounded-full bg-emerald-500/10">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
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
                <p className="text-xs text-muted-foreground mt-1">Declined</p>
              </div>
              <div className="p-3 rounded-full bg-red-500/10">
                <XCircle className="w-6 h-6 text-red-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {supervisorApprovedRequests.length > 0 && (
        <Alert className="bg-blue-500/5 border-blue-500/30">
          <Banknote className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-700 dark:text-blue-400">
            <strong>{supervisorApprovedRequests.length} request{supervisorApprovedRequests.length !== 1 ? 's' : ''}</strong> verified by supervisors and ready for payment. 
            Total amount: <strong>{formatCurrency(totalReadyAmount)}</strong>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-emerald-600" />
            <CardTitle className="text-base">Final Payment Step</CardTitle>
          </div>
          <CardDescription>
            All requests shown here have been verified by supervisors. Process payments to release funds from enumerator wallets.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="ready" className="space-y-4">
        <TabsList className="w-full sm:w-auto grid grid-cols-4 sm:inline-flex">
          <TabsTrigger value="ready" className="gap-1.5" data-testid="tab-ready">
            <Send className="w-4 h-4 hidden sm:inline" />
            Ready
            {supervisorApprovedRequests.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{supervisorApprovedRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="processing" className="gap-1.5" data-testid="tab-processing">
            <Banknote className="w-4 h-4 hidden sm:inline" />
            Processing
            {processingRequests.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{processingRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5" data-testid="tab-completed">
            <CheckCircle2 className="w-4 h-4 hidden sm:inline" />
            Completed
          </TabsTrigger>
          <TabsTrigger value="rejected" className="gap-1.5" data-testid="tab-rejected">
            <XCircle className="w-4 h-4 hidden sm:inline" />
            Rejected
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ready" className="space-y-3">
          {supervisorApprovedRequests.length === 0 ? (
            <Card>
              <EmptyState 
                icon={Send}
                title="No requests ready for payment"
                description="Supervisor-approved requests will appear here for final processing."
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {supervisorApprovedRequests.map((request) => (
                <RequestCard key={request.id} request={request} showActions={true} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="processing" className="space-y-3">
          {processingRequests.length === 0 ? (
            <Card>
              <EmptyState 
                icon={ArrowRightLeft}
                title="No payments in progress"
                description="Requests being processed will appear here."
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {processingRequests.map((request) => (
                <RequestCard key={request.id} request={request} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-3">
          {completedRequests.length === 0 ? (
            <Card>
              <EmptyState 
                icon={Wallet}
                title="No completed payments"
                description="Successfully processed withdrawals will appear here."
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {completedRequests.map((request) => (
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
                description="Requests that were declined by finance will appear here."
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

      <Dialog open={dialogType !== null} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType === 'process' ? (
                <>
                  <div className="p-2 rounded-full bg-emerald-500/10">
                    <Banknote className="w-5 h-5 text-emerald-600" />
                  </div>
                  Process Payment
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
                    <span className="font-bold text-foreground tabular-nums text-lg">{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Payment Method</span>
                    <span className="font-medium text-foreground capitalize">{selectedRequest.paymentMethod}</span>
                  </div>
                  {selectedRequest.paymentDetails && Object.keys(selectedRequest.paymentDetails).length > 0 && (
                    <div className="pt-2 border-t space-y-1">
                      <p className="text-xs text-muted-foreground mb-2">Payment Details</p>
                      {Object.entries(selectedRequest.paymentDetails).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                          <span className="font-medium text-foreground">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedRequest.supervisorId && (
                    <div className="pt-2 border-t flex items-center justify-between">
                      <span className="text-muted-foreground text-sm">Verified by</span>
                      <span className="font-medium text-foreground text-sm">{getUserName(selectedRequest.supervisorId)}</span>
                    </div>
                  )}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="notes">
              {dialogType === 'process' ? 'Payment Reference / Notes' : 'Rejection Reason'} 
              {dialogType === 'reject' && <span className="text-destructive">*</span>}
            </Label>
            <Textarea
              id="notes"
              placeholder={dialogType === 'process' ? 'Enter transaction reference or payment notes...' : 'Explain the reason for rejection...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="input-finance-notes"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogType(null)} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={processing || (dialogType === 'reject' && !notes.trim())}
              className={dialogType === 'process' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
              data-testid="button-confirm-action"
            >
              {processing ? 'Processing...' : dialogType === 'process' ? 'Confirm Payment' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
