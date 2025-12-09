import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useApproval } from '@/context/approval/ApprovalContext';
import { useSuperAdmin } from '@/context/superAdmin/SuperAdminContext';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { 
  ApprovalRequest, 
  ApprovalStatus, 
  APPROVAL_REQUEST_TYPE_LABELS,
  APPROVAL_STATUS_LABELS 
} from '@/types/approval-request';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  User,
  FileText,
  Trash2,
  Shield,
  RefreshCw
} from 'lucide-react';

const ApprovalDashboard = () => {
  const navigate = useNavigate();
  const { isSuperAdmin } = useSuperAdmin();
  const { 
    pendingRequests, 
    allRequests, 
    loading,
    reviewRequest,
    refreshRequests,
    getPendingCount
  } = useApproval();

  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Shield className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Only Super Admins can access the Approval Dashboard.
        </p>
        <Button onClick={() => navigate('/dashboard')} data-testid="button-go-dashboard">
          Go to Dashboard
        </Button>
      </div>
    );
  }

  const handleReviewClick = (request: ApprovalRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setReviewAction(action);
    setReviewNotes('');
  };

  const handleConfirmReview = async () => {
    if (!selectedRequest || !reviewAction || isReviewing) return;

    setIsReviewing(true);
    try {
      const result = await reviewRequest(selectedRequest.id, reviewAction, reviewNotes || undefined);
      if (result.success) {
        toast({
          title: reviewAction === 'approve' ? 'Request Approved' : 'Request Rejected',
          description: `The ${APPROVAL_REQUEST_TYPE_LABELS[selectedRequest.type]} request has been ${reviewAction}d.`,
        });
        setSelectedRequest(null);
        setReviewAction(null);
        setReviewNotes('');
        await refreshRequests();
      } else {
        toast({
          title: 'Error',
          description: result.error || 'Failed to process the request.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsReviewing(false);
    }
  };

  const getStatusBadge = (status: ApprovalStatus) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200"><Clock className="h-3 w-3 mr-1" /> Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200"><CheckCircle className="h-3 w-3 mr-1" /> Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200"><XCircle className="h-3 w-3 mr-1" /> Rejected</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-gray-50 text-gray-500 border-gray-200"><AlertTriangle className="h-3 w-3 mr-1" /> Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeIcon = (type: string) => {
    if (type.includes('user')) return <User className="h-4 w-4" />;
    if (type.includes('role')) return <Shield className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const approvedRequests = allRequests.filter(r => r.status === 'approved');
  const rejectedRequests = allRequests.filter(r => r.status === 'rejected');
  const cancelledRequests = allRequests.filter(r => r.status === 'cancelled');

  const renderRequestCard = (request: ApprovalRequest, showActions: boolean = false) => (
    <Card key={request.id} className="mb-3" data-testid={`card-approval-${request.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {getTypeIcon(request.type)}
            <CardTitle className="text-base">{APPROVAL_REQUEST_TYPE_LABELS[request.type]}</CardTitle>
          </div>
          {getStatusBadge(request.status)}
        </div>
        <CardDescription className="mt-1">
          {request.resourceName || request.resourceId}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="text-sm space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-3 w-3" />
            <span>Requested by: {request.requestedByName || 'Unknown'}</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{format(new Date(request.requestedAt), 'MMM d, yyyy h:mm a')}</span>
          </div>
          {request.reason && (
            <div className="bg-muted/50 rounded-md p-2 mt-2">
              <span className="text-xs font-medium text-muted-foreground">Reason:</span>
              <p className="text-sm mt-1">{request.reason}</p>
            </div>
          )}
          {request.reviewedBy && (
            <div className="mt-2 pt-2 border-t">
              <div className="text-xs text-muted-foreground">
                {request.status === 'approved' ? 'Approved' : 'Rejected'} by {request.reviewedByName || 'Super Admin'}
                {request.reviewedAt && ` on ${format(new Date(request.reviewedAt), 'MMM d, yyyy h:mm a')}`}
              </div>
              {request.reviewNotes && (
                <p className="text-sm mt-1 italic">"{request.reviewNotes}"</p>
              )}
            </div>
          )}
        </div>
        {showActions && request.status === 'pending' && (
          <div className="flex gap-2 mt-4">
            <Button 
              size="sm" 
              onClick={() => handleReviewClick(request, 'approve')}
              data-testid={`button-approve-${request.id}`}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Approve
            </Button>
            <Button 
              size="sm" 
              variant="destructive" 
              onClick={() => handleReviewClick(request, 'reject')}
              data-testid={`button-reject-${request.id}`}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Approval Dashboard</h1>
          <p className="text-muted-foreground">Review and manage deletion and role assignment requests</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshRequests} disabled={loading} data-testid="button-refresh">
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Loading...' : 'Refresh'}
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          <div className="text-muted-foreground">Loading approval requests...</div>
        </div>
      ) : (
        <Tabs defaultValue="pending">
          <TabsList className="mb-4" data-testid="tabs-approval-status">
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending
              {pendingRequests.length > 0 && (
                <Badge variant="destructive" className="ml-2">{pendingRequests.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              Approved ({approvedRequests.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">
              Rejected ({rejectedRequests.length})
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">
              All ({allRequests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            {pendingRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                  <h3 className="text-lg font-medium">All Caught Up</h3>
                  <p className="text-muted-foreground text-center mt-1">
                    No pending approval requests at this time.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                {pendingRequests.map(request => renderRequestCard(request, true))}
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="approved">
            {approvedRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No approved requests yet.</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                {approvedRequests.map(request => renderRequestCard(request))}
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="rejected">
            {rejectedRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No rejected requests yet.</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                {rejectedRequests.map(request => renderRequestCard(request))}
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="all">
            {allRequests.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No requests have been made yet.</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[calc(100vh-280px)]">
                {allRequests.map(request => renderRequestCard(request, request.status === 'pending'))}
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={!!selectedRequest && !!reviewAction} onOpenChange={() => {
        setSelectedRequest(null);
        setReviewAction(null);
      }}>
        <DialogContent data-testid="dialog-review">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approve' ? 'Approve Request' : 'Reject Request'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <>
                  You are about to {reviewAction} the request to{' '}
                  <strong>{APPROVAL_REQUEST_TYPE_LABELS[selectedRequest.type].toLowerCase()}</strong>
                  {selectedRequest.resourceName && `: "${selectedRequest.resourceName}"`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="review-notes">Notes (optional)</Label>
            <Textarea
              id="review-notes"
              placeholder="Add any notes for the requester..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="mt-2"
              data-testid="input-review-notes"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setSelectedRequest(null);
                setReviewAction(null);
              }}
              data-testid="button-cancel-review"
            >
              Cancel
            </Button>
            <Button
              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
              onClick={handleConfirmReview}
              disabled={isReviewing}
              data-testid="button-confirm-review"
            >
              {isReviewing ? 'Processing...' : reviewAction === 'approve' ? 'Approve' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApprovalDashboard;
