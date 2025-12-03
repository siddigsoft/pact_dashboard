import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useDownPayment } from '@/context/downPayment/DownPaymentContext';
import { useUser } from '@/context/user/UserContext';
import { DownPaymentRequest } from '@/types/down-payment';
import {
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  FileText,
  User,
  MapPin,
  AlertTriangle,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { format } from 'date-fns';

interface DownPaymentApprovalPanelProps {
  userRole: 'supervisor' | 'admin';
}

export function DownPaymentApprovalPanel({ userRole }: DownPaymentApprovalPanelProps) {
  const { currentUser } = useUser();
  const { requests, supervisorApprove, supervisorReject, adminApprove, adminReject, processPayment } =
    useDownPayment();

  const [selectedRequest, setSelectedRequest] = useState<DownPaymentRequest | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | 'pay' | null>(null);
  const [notes, setNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [processing, setProcessing] = useState(false);

  const pendingRequests = requests.filter((req) => {
    if (userRole === 'supervisor') {
      return req.status === 'pending_supervisor';
    } else if (userRole === 'admin') {
      return req.status === 'pending_admin' || req.status === 'approved';
    }
    return false;
  });

  const handleApprove = async () => {
    if (!selectedRequest || !currentUser) return;

    setProcessing(true);
    const success =
      userRole === 'supervisor'
        ? await supervisorApprove({
            requestId: selectedRequest.id,
            approvedBy: currentUser.id,
            notes,
          })
        : await adminApprove({
            requestId: selectedRequest.id,
            approvedBy: currentUser.id,
            notes,
          });

    setProcessing(false);
    if (success) {
      closeDialog();
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !currentUser) return;

    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setProcessing(true);
    const success =
      userRole === 'supervisor'
        ? await supervisorReject({
            requestId: selectedRequest.id,
            rejectedBy: currentUser.id,
            rejectionReason,
          })
        : await adminReject({
            requestId: selectedRequest.id,
            rejectedBy: currentUser.id,
            rejectionReason,
          });

    setProcessing(false);
    if (success) {
      closeDialog();
    }
  };

  const handleProcessPayment = async () => {
    if (!selectedRequest || !currentUser) return;

    if (paymentAmount <= 0) {
      alert('Please enter a valid payment amount');
      return;
    }

    setProcessing(true);
    const success = await processPayment({
      requestId: selectedRequest.id,
      amount: paymentAmount,
      processedBy: currentUser.id,
      notes,
    });

    setProcessing(false);
    if (success) {
      closeDialog();
    }
  };

  const closeDialog = () => {
    setSelectedRequest(null);
    setAction(null);
    setNotes('');
    setRejectionReason('');
    setPaymentAmount(0);
  };

  const openActionDialog = (request: DownPaymentRequest, actionType: 'approve' | 'reject' | 'pay') => {
    setSelectedRequest(request);
    setAction(actionType);
    if (actionType === 'pay') {
      setPaymentAmount(request.remainingAmount || request.requestedAmount);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: any; icon: any }> = {
      pending_supervisor: { variant: 'secondary', icon: Clock },
      pending_admin: { variant: 'default', icon: Clock },
      approved: { variant: 'default', icon: CheckCircle2 },
      rejected: { variant: 'destructive', icon: XCircle },
      partially_paid: { variant: 'default', icon: DollarSign },
      fully_paid: { variant: 'default', icon: CheckCircle2 },
    };

    const config = statusMap[status] || { variant: 'secondary', icon: Clock };
    const Icon = config.icon;

    return (
      <Badge variant={config.variant as any} className="gap-1">
        <Icon className="h-3 w-3" />
        {status.replace(/_/g, ' ').toUpperCase()}
      </Badge>
    );
  };

  const hasHubId = !!currentUser?.hubId;

  return (
    <>
      {userRole === 'supervisor' && !hasHubId && (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Hub Configuration Missing:</strong> Your profile doesn't have a hub assigned. 
            You can only see your own requests. Please contact an administrator to assign you to a hub 
            so you can review requests from your team members.
          </AlertDescription>
        </Alert>
      )}

      <Card data-testid="card-down-payment-approval">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              Down-Payment Requests
              {userRole === 'supervisor' ? ' (Tier 1 Approval)' : ' (Tier 2 Processing)'}
            </span>
            <Badge variant="secondary">{pendingRequests.length} Pending</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pendingRequests.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No pending requests</p>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <Card key={request.id} className="hover-elevate">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {request.siteName}
                          </h4>
                          <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                            <User className="h-3 w-3" />
                            Requested {format(new Date(request.requestedAt), 'MMM d, yyyy')}
                          </p>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <Label className="text-xs text-muted-foreground">Budget</Label>
                          <p className="font-medium">{request.totalTransportationBudget} SDG</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Requested</Label>
                          <p className="font-medium text-primary">{request.requestedAmount} SDG</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Payment Type</Label>
                          <p className="font-medium capitalize">{request.paymentType.replace('_', ' ')}</p>
                        </div>
                        {request.remainingAmount > 0 && (
                          <div>
                            <Label className="text-xs text-muted-foreground">Remaining</Label>
                            <p className="font-medium text-orange-600">{request.remainingAmount} SDG</p>
                          </div>
                        )}
                      </div>

                      {request.justification && (
                        <div className="bg-muted/50 p-3 rounded-md">
                          <Label className="text-xs flex items-center gap-1 mb-1">
                            <FileText className="h-3 w-3" />
                            Justification
                          </Label>
                          <p className="text-sm">{request.justification}</p>
                        </div>
                      )}

                      <div className="flex gap-2">
                        {userRole === 'supervisor' && request.status === 'pending_supervisor' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openActionDialog(request, 'approve')}
                              data-testid={`button-approve-${request.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openActionDialog(request, 'reject')}
                              data-testid={`button-reject-${request.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}

                        {userRole === 'admin' && request.status === 'pending_admin' && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => openActionDialog(request, 'approve')}
                              data-testid={`button-admin-approve-${request.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => openActionDialog(request, 'reject')}
                              data-testid={`button-admin-reject-${request.id}`}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Reject
                            </Button>
                          </>
                        )}

                        {userRole === 'admin' && request.status === 'approved' && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => openActionDialog(request, 'pay')}
                            data-testid={`button-process-payment-${request.id}`}
                          >
                            <DollarSign className="h-4 w-4 mr-1" />
                            Process Payment
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!action} onOpenChange={() => closeDialog()}>
        <DialogContent data-testid="dialog-approval-action">
          <DialogHeader>
            <DialogTitle>
              {action === 'approve' && 'Approve Request'}
              {action === 'reject' && 'Reject Request'}
              {action === 'pay' && 'Process Payment'}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-md space-y-2">
                <p>
                  <strong>Site:</strong> {selectedRequest.siteName}
                </p>
                <p>
                  <strong>Amount:</strong> {selectedRequest.requestedAmount} SDG
                </p>
                {action === 'pay' && (
                  <p>
                    <strong>Remaining:</strong> {selectedRequest.remainingAmount} SDG
                  </p>
                )}
              </div>

              {action === 'pay' && (
                <div>
                  <Label htmlFor="payment-amount">Payment Amount (SDG)</Label>
                  <Input
                    id="payment-amount"
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value) || 0)}
                    max={selectedRequest.remainingAmount}
                    data-testid="input-payment-amount"
                  />
                </div>
              )}

              {action === 'reject' ? (
                <div>
                  <Label htmlFor="rejection-reason">Rejection Reason *</Label>
                  <Textarea
                    id="rejection-reason"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Explain why this request is being rejected..."
                    rows={3}
                    data-testid="textarea-rejection-reason"
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor="approval-notes">Notes (Optional)</Label>
                  <Textarea
                    id="approval-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add any notes or comments..."
                    rows={3}
                    data-testid="textarea-approval-notes"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-action">
              Cancel
            </Button>
            <Button
              onClick={
                action === 'approve'
                  ? handleApprove
                  : action === 'reject'
                  ? handleReject
                  : handleProcessPayment
              }
              disabled={processing}
              variant={action === 'reject' ? 'destructive' : 'default'}
              data-testid="button-confirm-action"
            >
              {processing ? 'Processing...' : action === 'approve' ? 'Approve' : action === 'reject' ? 'Reject' : 'Process Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
