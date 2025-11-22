import { useState } from 'react';
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
import { Clock, CheckCircle2, XCircle, User, Wallet, Calendar, DollarSign, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { WithdrawalRequest } from '@/types/wallet';
import { ScrollArea } from '@/components/ui/scroll-area';

export default function WithdrawalApproval() {
  const { withdrawalRequests, approveWithdrawalRequest, rejectWithdrawalRequest } = useWallet();
  const { users } = useUser();
  const [selectedRequest, setSelectedRequest] = useState<WithdrawalRequest | null>(null);
  const [dialogType, setDialogType] = useState<'approve' | 'reject' | null>(null);
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const pendingRequests = withdrawalRequests.filter(r => r.status === 'pending');
  const approvedRequests = withdrawalRequests.filter(r => r.status === 'approved');
  const rejectedRequests = withdrawalRequests.filter(r => r.status === 'rejected');

  const getUserName = (userId: string) => {
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

  const handleApprove = (request: WithdrawalRequest) => {
    setSelectedRequest(request);
    setDialogType('approve');
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
      if (dialogType === 'approve') {
        await approveWithdrawalRequest(selectedRequest.id, notes);
      } else if (dialogType === 'reject') {
        await rejectWithdrawalRequest(selectedRequest.id, notes);
      }
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
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/20"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const RequestTable = ({ requests }: { requests: WithdrawalRequest[] }) => (
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
                  <span className="font-medium">{getUserName(request.userId)}</span>
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Withdrawal Approval</h1>
          <p className="text-muted-foreground mt-1">Review and approve enumerator withdrawal requests</p>
        </div>
        <div className="flex items-center gap-4">
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Clock className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold tabular-nums">{pendingRequests.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pending" data-testid="tab-pending">
            <Clock className="w-4 h-4 mr-2" />
            Pending ({pendingRequests.length})
          </TabsTrigger>
          <TabsTrigger value="approved" data-testid="tab-approved">
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Approved ({approvedRequests.length})
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
                <Clock className="w-5 h-5 text-primary" />
                Pending Requests
              </CardTitle>
              <CardDescription>Withdrawal requests awaiting your approval</CardDescription>
            </CardHeader>
            <CardContent>
              <RequestTable requests={pendingRequests} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approved">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Approved Requests
              </CardTitle>
              <CardDescription>Previously approved withdrawal requests</CardDescription>
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
              <CardDescription>Previously rejected withdrawal requests</CardDescription>
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
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                  Approve Withdrawal Request
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
              {processing ? 'Processing...' : dialogType === 'approve' ? 'Approve' : 'Reject'}
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
