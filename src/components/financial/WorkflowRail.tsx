import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Clock,
  CheckCircle,
  XCircle,
  DollarSign,
  User,
  Calendar,
  MapPin,
  FileText,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useCostSubmissions, usePendingCostApprovals, useCostSubmissionContext } from '@/context/costApproval/CostSubmissionContext';
import { SiteVisitCostSubmission, PendingCostApproval } from '@/types/cost-submission';
import { format } from 'date-fns';

const formatCurrency = (amountCents: number, currency: string = 'SDG') => {
  const amount = amountCents / 100;
  if (currency === 'SDG') {
    return `SDG ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
};

interface WorkflowRailProps {
  onNavigateToSubmission?: (id: string) => void;
}

export const WorkflowRail = ({ onNavigateToSubmission }: WorkflowRailProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { submissions, isLoading } = useCostSubmissions();
  const { approvals, isLoading: pendingLoading } = usePendingCostApprovals();
  const context = useCostSubmissionContext();
  const { mutate: reviewSubmission, isPending: isReviewing } = context.useReviewSubmission();

  const [selectedSubmission, setSelectedSubmission] = useState<PendingCostApproval | SiteVisitCostSubmission | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState('');

  // Calculate workflow funnel metrics
  // Use approvals for pending (includes extended metadata), filter submissions for other statuses
  const pendingSubmissions = approvals || [];
  const approvedSubmissions = submissions?.filter(s => s.status === 'approved') || [];
  const paidSubmissions = submissions?.filter(s => s.status === 'paid') || [];
  const rejectedSubmissions = submissions?.filter(s => s.status === 'rejected') || [];

  const handleApprove = async () => {
    if (!selectedSubmission || isReviewing) return;

    try {
      await reviewSubmission({
        submissionId: selectedSubmission.id,
        action: 'approve',
        approvalNotes,
      });
      setShowApproveDialog(false);
      setApprovalNotes('');
      setSelectedSubmission(null);
    } catch (error) {
      // Error is already handled by context onError
    }
  };

  const handleReject = async () => {
    if (!selectedSubmission || !rejectionNotes.trim() || isReviewing) return;

    try {
      await reviewSubmission({
        submissionId: selectedSubmission.id,
        action: 'reject',
        reviewerNotes: rejectionNotes,
      });
      setShowRejectDialog(false);
      setRejectionNotes('');
      setSelectedSubmission(null);
    } catch (error) {
      // Error is already handled by context onError
    }
  };

  const SubmissionCard = ({ submission }: { submission: SiteVisitCostSubmission | PendingCostApproval }) => {
    const statusConfig = {
      pending: { icon: Clock, color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950', label: 'Pending' },
      approved: { icon: CheckCircle, color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-950', label: 'Approved' },
      paid: { icon: DollarSign, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950', label: 'Paid' },
      rejected: { icon: XCircle, color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950', label: 'Rejected' },
    };

    const config = statusConfig[submission.status as keyof typeof statusConfig] || statusConfig.pending;
    const StatusIcon = config.icon;

    // Type guard for PendingCostApproval
    const isPending = 'submitterName' in submission;
    const submitterName = isPending ? submission.submitterName : undefined;
    const siteName = isPending ? submission.siteName : undefined;

    return (
      <Card className="hover-elevate active-elevate-2">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge className={`${config.bgColor} ${config.color} border-0`}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {config.label}
                </Badge>
                {submission.classificationLevel && (
                  <Badge variant="outline" className="text-xs">
                    Level {submission.classificationLevel}
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium truncate">
                Submission #{submission.id.slice(0, 8)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold">
                {formatCurrency(submission.totalCostCents || 0, submission.currency ?? 'SDG')}
              </p>
            </div>
          </div>

          <div className="space-y-1 text-xs text-muted-foreground mb-3">
            {submitterName && (
              <div className="flex items-center gap-1">
                <User className="h-3 w-3" />
                <span className="truncate">{submitterName}</span>
              </div>
            )}
            {submission.submittedAt && (
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>{format(new Date(submission.submittedAt), 'MMM d, yyyy')}</span>
              </div>
            )}
            {siteName && (
              <div className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                <span className="truncate">{siteName}</span>
              </div>
            )}
          </div>

          {submission.status === 'pending' && (
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="default"
                className="flex-1"
                onClick={() => {
                  setSelectedSubmission(submission);
                  setShowApproveDialog(true);
                }}
                data-testid={`button-approve-${submission.id}`}
              >
                <CheckCircle className="h-3 w-3 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="flex-1"
                onClick={() => {
                  setSelectedSubmission(submission);
                  setShowRejectDialog(true);
                }}
                data-testid={`button-reject-${submission.id}`}
              >
                <XCircle className="h-3 w-3 mr-1" />
                Reject
              </Button>
            </div>
          )}

          {submission.status === 'approved' && (
            <Button
              size="sm"
              variant="outline"
              className="w-full mt-3"
              onClick={() => navigate(`/cost-submission/${submission.id}`)}
              data-testid={`button-review-payment-${submission.id}`}
            >
              <DollarSign className="h-3 w-3 mr-1" />
              Review Payment
            </Button>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="w-full mt-2"
            onClick={() => {
              if (onNavigateToSubmission) {
                onNavigateToSubmission(submission.id);
              } else {
                navigate(`/cost-submission/${submission.id}`);
              }
            }}
            data-testid={`button-view-details-${submission.id}`}
          >
            View Details
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (isLoading || pendingLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-muted-foreground">Loading workflow data...</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Pending Column */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-600" />
                Pending Review
              </CardTitle>
              <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                {pendingSubmissions.length}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Awaiting approval
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {pendingSubmissions.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-muted-foreground">No pending submissions</p>
                  </div>
                ) : (
                  pendingSubmissions.map((submission) => (
                    <SubmissionCard key={submission.id} submission={submission} />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Approved Column */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Approved
              </CardTitle>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                {approvedSubmissions.length}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Ready for payment
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {approvedSubmissions.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-muted-foreground">No approved submissions</p>
                  </div>
                ) : (
                  approvedSubmissions.map((submission) => (
                    <SubmissionCard key={submission.id} submission={submission} />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Paid Column */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-blue-600" />
                Paid
              </CardTitle>
              <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {paidSubmissions.length}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Payment completed
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {paidSubmissions.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-muted-foreground">No paid submissions</p>
                  </div>
                ) : (
                  paidSubmissions.map((submission) => (
                    <SubmissionCard key={submission.id} submission={submission} />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Rejected Column */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-600" />
                Rejected
              </CardTitle>
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                {rejectedSubmissions.length}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Declined submissions
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-3">
            <ScrollArea className="h-[400px]">
              <div className="space-y-2 pr-4">
                {rejectedSubmissions.length === 0 ? (
                  <div className="text-center py-8">
                    <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-muted-foreground">No rejected submissions</p>
                  </div>
                ) : (
                  rejectedSubmissions.map((submission) => (
                    <SubmissionCard key={submission.id} submission={submission} />
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Approve Dialog */}
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Cost Submission</DialogTitle>
            <DialogDescription>
              Approve submission #{selectedSubmission?.id.slice(0, 8)} for{' '}
              {selectedSubmission && formatCurrency(selectedSubmission.totalCostCents || 0, selectedSubmission.currency ?? 'SDG')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Approval Notes (Optional)</label>
              <Textarea
                placeholder="Add any notes about this approval..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                rows={3}
                data-testid="textarea-approval-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowApproveDialog(false);
                setApprovalNotes('');
              }}
              disabled={isReviewing}
              data-testid="button-cancel-approve"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={isReviewing}
              data-testid="button-confirm-approve"
            >
              {isReviewing ? 'Approving...' : 'Approve Submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Cost Submission</DialogTitle>
            <DialogDescription>
              Reject submission #{selectedSubmission?.id.slice(0, 8)}. Please provide a reason for rejection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Rejection Reason *</label>
              <Textarea
                placeholder="Explain why this submission is being rejected..."
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                rows={3}
                required
                data-testid="textarea-rejection-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectionNotes('');
              }}
              disabled={isReviewing}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={isReviewing || !rejectionNotes.trim()}
              data-testid="button-confirm-reject"
            >
              {isReviewing ? 'Rejecting...' : 'Reject Submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
