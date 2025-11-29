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
import { Clock, CheckCircle2, XCircle, User, Calendar, Send, Banknote, CreditCard, Info, FileText, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { WithdrawalRequest } from '@/types/wallet';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminWithdrawalRequest extends WithdrawalRequest {
  requesterName?: string;
  requesterEmail?: string;
}

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

  const getUserName = (userId: string, request?: AdminWithdrawalRequest) => {
    // Use requesterName from request if available (from profile join)
    if (request?.requesterName) {
      return request.requesterName;
    }
    // Fallback to users list
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

  const handleProcess = (request: WithdrawalRequest) => {
    setSelectedRequest(request);
    setDialogType('process');
    setNotes('');
  };

  const handleReject = (request: WithdrawalRequest) => {
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
      // Refresh the list after action
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
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />Pending Supervisor</Badge>;
      case 'supervisor_approved':
        return <Badge variant="outline" className="bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20"><Send className="w-3 h-3 mr-1" />Ready for Payment</Badge>;
      case 'processing':
        return <Badge variant="outline" className="bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20"><Banknote className="w-3 h-3 mr-1" />Processing Payment</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Paid</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPaymentMethodIcon = (method: string) => {
    return <CreditCard className="w-4 h-4" />;
  };

  const RequestTable = ({ requests, showActions = false }: { requests: AdminWithdrawalRequest[], showActions?: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Enumerator</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Payment Method</TableHead>
          <TableHead>Payment Details</TableHead>
          <TableHead>Supervisor</TableHead>
          <TableHead>Status</TableHead>
          {showActions && <TableHead className="text-right">Actions</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showActions ? 7 : 6} className="text-center text-muted-foreground py-8">
              No requests found
            </TableCell>
          </TableRow>
        ) : (
          requests.map((request) => (
            <TableRow key={request.id} className="hover-elevate">
              <TableCell>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <span className="font-medium">{getUserName(request.userId, request)}</span>
                    <div className="text-xs text-muted-foreground">
                      Requested: {formatDate(request.createdAt)}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="font-semibold tabular-nums text-lg">{formatCurrency(request.amount, request.currency)}</span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  {getPaymentMethodIcon(request.paymentMethod)}
                  <Badge variant="secondary" className="capitalize">{request.paymentMethod}</Badge>
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {request.paymentDetails ? (
                    Object.entries(request.paymentDetails).map(([key, value]) => (
                      <div key={key} className="truncate">
                        <span className="capitalize">{key.replace(/_/g, ' ')}:</span> {String(value)}
                      </div>
                    ))
                  ) : (
                    <span className="italic">No details</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {request.supervisorId && (
                    <div className="text-muted-foreground">
                      Approved by: <span className="font-medium text-foreground">{getUserName(request.supervisorId)}</span>
                    </div>
                  )}
                  {request.supervisorNotes && (
                    <div className="text-xs text-muted-foreground italic mt-1 truncate max-w-[150px]">
                      "{request.supervisorNotes}"
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>{getStatusBadge(request.status)}</TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    {request.status === 'supervisor_approved' && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleProcess(request)}
                          className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"
                          data-testid={`button-process-${request.id}`}
                        >
                          <Banknote className="w-4 h-4 mr-1" />
                          Process Payment
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReject(request)}
                          className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"
                          data-testid={`button-reject-${request.id}`}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          Reject
                        </Button>
                      </>
                    )}
                    {(request.supervisorNotes || request.adminNotes) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setDialogType(null);
                        }}
                        data-testid={`button-view-details-${request.id}`}
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
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
            <h1 className="text-3xl font-bold tracking-tight">Finance Processing</h1>
            <p className="text-muted-foreground mt-1">Step 2: Process approved withdrawal payments</p>
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
            <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Send className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Ready to Pay</p>
                    <p className="text-2xl font-bold tabular-nums">{supervisorApprovedRequests.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Banknote className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Completed</p>
                    <p className="text-2xl font-bold tabular-nums">{completedRequests.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Alert className="bg-green-500/5 border-green-500/20">
          <Info className="w-4 h-4 text-green-600" />
          <AlertDescription className="text-green-700 dark:text-green-400">
            <strong>Final Step:</strong> These requests have been verified by supervisors. 
            Process the payment and mark as complete to release funds from the enumerator's wallet.
          </AlertDescription>
        </Alert>
      </div>

      <Tabs defaultValue="ready" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ready" data-testid="tab-ready">
            <Send className="w-4 h-4 mr-2" />
            Ready to Pay ({supervisorApprovedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="processing" data-testid="tab-processing">
            <Banknote className="w-4 h-4 mr-2" />
            Processing ({processingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Completed ({completedRequests.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">
            <XCircle className="w-4 h-4 mr-2" />
            Rejected ({rejectedRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ready">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" />
                Ready for Payment
              </CardTitle>
              <CardDescription>Supervisor-approved requests awaiting payment processing</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={supervisorApprovedRequests} showActions={true} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="processing">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-purple-600" />
                Processing
              </CardTitle>
              <CardDescription>Payments currently being processed</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={processingRequests} showActions={false} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Completed Payments
              </CardTitle>
              <CardDescription>Successfully processed and paid withdrawals</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={completedRequests} showActions={false} />
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
              <CardDescription>Requests rejected during finance processing</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={rejectedRequests} showActions={false} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Process/Reject Dialog */}
      <Dialog open={dialogType !== null} onOpenChange={() => setDialogType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType === 'process' ? (
                <>
                  <Banknote className="w-5 h-5 text-green-600" />
                  Confirm Payment Processed
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-red-600" />
                  Reject Payment Request
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <div className="space-y-3 mt-4 text-foreground">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Enumerator:</span>
                      <p className="font-medium">{getUserName(selectedRequest.userId, selectedRequest)}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Amount:</span>
                      <p className="font-semibold tabular-nums text-lg">{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</p>
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
                  {selectedRequest.paymentDetails && Object.keys(selectedRequest.paymentDetails).length > 0 && (
                    <div className="p-3 bg-muted rounded-md">
                      <span className="text-sm font-medium text-muted-foreground">Payment Details:</span>
                      <div className="mt-1 text-sm space-y-1">
                        {Object.entries(selectedRequest.paymentDetails).map(([key, value]) => (
                          <div key={key}>
                            <span className="capitalize text-muted-foreground">{key.replace(/_/g, ' ')}:</span>{' '}
                            <span className="font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedRequest.supervisorNotes && (
                    <div>
                      <span className="text-sm text-muted-foreground">Supervisor Notes:</span>
                      <p className="text-sm mt-1 p-2 bg-muted rounded-md">{selectedRequest.supervisorNotes}</p>
                    </div>
                  )}
                  {dialogType === 'process' && (
                    <Alert className="bg-amber-500/10 border-amber-500/20">
                      <Info className="w-4 h-4 text-amber-600" />
                      <AlertDescription className="text-amber-700 dark:text-amber-400 text-sm">
                        By confirming, you acknowledge that the payment of{' '}
                        <strong>{formatCurrency(selectedRequest.amount, selectedRequest.currency)}</strong>{' '}
                        has been sent to the enumerator via <strong>{selectedRequest.paymentMethod}</strong>.
                        The funds will be deducted from their wallet balance.
                      </AlertDescription>
                    </Alert>
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
              placeholder={dialogType === 'process' 
                ? 'Add transaction reference or confirmation details...' 
                : 'Provide reason for rejection (required)...'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              data-testid="input-admin-notes"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)} disabled={processing}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmAction}
              disabled={processing || (dialogType === 'reject' && !notes.trim())}
              variant={dialogType === 'process' ? 'default' : 'destructive'}
              data-testid="button-confirm-finance-action"
            >
              {processing ? 'Processing...' : dialogType === 'process' ? 'Confirm Payment Complete' : 'Reject Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Details Dialog */}
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
                      <p className="font-medium">{getUserName(selectedRequest.userId, selectedRequest)}</p>
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
