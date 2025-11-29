import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useWallet } from '@/context/wallet/WalletContext';
import { useUser } from '@/context/user/UserContext';
import { Clock, CheckCircle2, XCircle, User, Calendar, ArrowRight, Send, Info, RefreshCw, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { WithdrawalRequest } from '@/types/wallet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SupervisedRequest extends WithdrawalRequest {
  requesterName?: string;
  requesterEmail?: string;
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
  const [selectedRequest, setSelectedRequest] = useState<SupervisedRequest | null>(null);
  const [dialogType, setDialogType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    refreshSupervisedWithdrawalRequests();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshSupervisedWithdrawalRequests();
    setRefreshing(false);
  };

  const pendingRequests = supervisedWithdrawalRequests.filter(r => r.status === 'pending');
  const forwardedRequests = supervisedWithdrawalRequests.filter(r => r.status === 'supervisor_approved' || r.status === 'processing');
  const approvedRequests = supervisedWithdrawalRequests.filter(r => r.status === 'approved');
  const rejectedRequests = supervisedWithdrawalRequests.filter(r => r.status === 'rejected');

  const getUserName = (userId: string, request?: SupervisedRequest) => {
    if (request?.requesterName) {
      return request.requesterName;
    }
    const user = users.find(u => u.id === userId);
    return user?.name || 'Unknown User';
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
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
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
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />Pending Review</Badge>;
      case 'supervisor_approved':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"><Send className="w-3 h-3 mr-1" />Awaiting Finance</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"><ArrowRight className="w-3 h-3 mr-1" />Processing</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const RequestTable = ({ requests }: { requests: SupervisedRequest[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Enumerator</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Payment Method</TableHead>
          <TableHead>Requested</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              No requests found
            </TableCell>
          </TableRow>
        ) : (
          requests.map((request) => (
            <TableRow key={request.id} className="hover-elevate">
              <TableCell>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium">{getUserName(request.userId, request)}</span>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-semibold tabular-nums">{formatCurrency(request.amount, request.currency)}</span>
              </TableCell>
              <TableCell>
                <Badge variant="secondary" className="capitalize">{request.paymentMethod}</Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  {formatDate(request.createdAt)}
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(request.status)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {request.status === 'pending' && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleApprove(request)}
                        className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 hover:bg-green-500/20"
                        data-testid={`button-approve-${request.id}`}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReject(request)}
                        className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20 hover:bg-red-500/20"
                        data-testid={`button-reject-${request.id}`}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </>
                  )}
                  {request.status !== 'pending' && request.supervisorNotes && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedRequest(request);
                        setDialogType(null);
                      }}
                      data-testid={`button-view-notes-${request.id}`}
                    >
                      <FileText className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-24 w-40" />
          <Skeleton className="h-24 w-40" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Supervisor Approval</h1>
            <p className="text-muted-foreground mt-1">Step 1: Review and verify withdrawal requests from your team members</p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh} 
            disabled={refreshing}
            data-testid="button-refresh-requests"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
          <div className="flex items-center gap-4 flex-wrap">
            <Card className="bg-gradient-to-br from-yellow-500/5 to-yellow-500/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-yellow-500/10">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold tabular-nums">{pendingRequests.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Send className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">With Finance</p>
                    <p className="text-2xl font-bold tabular-nums">{forwardedRequests.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Alert className="bg-blue-500/5 border-blue-500/20">
          <Info className="w-4 h-4 text-blue-600" />
          <AlertDescription className="text-blue-700 dark:text-blue-400">
            <strong>Two-Step Approval:</strong> After you approve, requests are forwarded to Finance for payment processing. 
            Funds are only released after Finance completes the payment.
          </AlertDescription>
        </Alert>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            <Clock className="w-4 h-4 mr-2" />
            Pending Review ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="forwarded" data-testid="tab-forwarded">
            <Send className="w-4 h-4 mr-2" />
            With Finance ({forwardedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Completed ({approvedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            <XCircle className="w-4 h-4 mr-2" />
            Rejected ({rejectedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-yellow-600" />
                Pending Supervisor Review
              </CardTitle>
              <CardDescription>Withdrawal requests awaiting your verification and approval</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={pendingRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forwarded">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                Forwarded to Finance
              </CardTitle>
              <CardDescription>Requests you approved that are awaiting Finance processing</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={forwardedRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Completed Requests
              </CardTitle>
              <CardDescription>Requests that have been fully processed and paid</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={approvedRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rejected">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                Rejected Requests
              </CardTitle>
              <CardDescription>Requests rejected by supervisor or finance</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={rejectedRequests} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Approval/Rejection Dialog */}
      <Dialog open={dialogType !== null} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType === 'approve' ? (
                <>
                  <Send className="w-5 h-5 text-blue-600" />
                  Forward to Finance
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600" />
                  Reject Withdrawal Request
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <div className="space-y-2 mt-4 text-foreground">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Enumerator:</span>
                      <p className="font-medium">{getUserName(selectedRequest.userId)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount:</span>
                      <p className="font-medium tabular-nums">{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Payment Method:</span>
                      <p className="font-medium capitalize">{selectedRequest.paymentMethod}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Requested:</span>
                      <p className="font-medium">{formatDate(selectedRequest.createdAt)}</p>
                    </div>
                  </div>
                  {selectedRequest.requestReason && (
                    <div>
                      <span className="text-sm text-muted-foreground">Reason:</span>
                      <p className="text-sm mt-1 p-2 bg-muted rounded-md">{selectedRequest.requestReason}</p>
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
              placeholder={`Add ${dialogType === 'approve' ? 'optional' : 'required'} notes...`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              data-testid="input-supervisor-notes"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={processing || (dialogType === 'reject' && !notes.trim())}
              variant={dialogType === 'approve' ? 'default' : 'destructive'}
              data-testid="button-confirm-action"
            >
              {processing ? 'Processing...' : dialogType === 'approve' ? 'Forward to Finance' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Notes Dialog */}
      <Dialog open={selectedRequest !== null && dialogType === null} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <div className="space-y-3 mt-4 text-foreground">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Enumerator:</span>
                      <p className="font-medium">{getUserName(selectedRequest.userId)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount:</span>
                      <p className="font-medium tabular-nums">{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status:</span>
                      <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Date:</span>
                      <p className="font-medium">{formatDate(selectedRequest.createdAt)}</p>
                    </div>
                  </div>
                  {selectedRequest.requestReason && (
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Request Reason:</span>
                      <p className="text-sm mt-1 p-2 bg-muted rounded-md">{selectedRequest.requestReason}</p>
                    </div>
                  )}
                  {selectedRequest.supervisorNotes && (
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Supervisor Notes:</span>
                      <p className="text-sm mt-1 p-2 bg-muted rounded-md">{selectedRequest.supervisorNotes}</p>
                    </div>
                  )}
                  {selectedRequest.adminNotes && (
                    <div>
                      <span className="text-sm font-medium text-muted-foreground">Finance Notes:</span>
                      <p className="text-sm mt-1 p-2 bg-muted rounded-md">{selectedRequest.adminNotes}</p>
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
    </div>
  );
}
