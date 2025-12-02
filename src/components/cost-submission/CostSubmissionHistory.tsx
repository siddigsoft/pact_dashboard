import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SiteVisitCostSubmission } from "@/types/cost-submission";
import { format, differenceInHours, differenceInDays } from "date-fns";
import { 
  Eye, FileText, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Ban, User, 
  ThumbsUp, ThumbsDown, Filter, Search, AlertTriangle, Timer, CheckSquare, X,
  ChevronDown, ChevronUp
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useAppContext } from "@/context/AppContext";
import { useUser } from "@/context/user/UserContext";
import { useCostSubmissionContext } from "@/context/costApproval/CostSubmissionContext";
import { useToast } from "@/hooks/use-toast";
import { AppRole } from "@/types";

interface CostSubmissionHistoryProps {
  submissions: SiteVisitCostSubmission[];
}

const CostSubmissionHistory = ({ submissions }: CostSubmissionHistoryProps) => {
  const { currentUser, roles } = useAppContext();
  const { users } = useUser();
  const context = useCostSubmissionContext();
  const { mutate: reviewSubmission, isPending: isReviewing } = context.useReviewSubmission();
  const { toast } = useToast();
  
  const [selectedSubmission, setSelectedSubmission] = useState<SiteVisitCostSubmission | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showBulkApproveDialog, setShowBulkApproveDialog] = useState(false);
  const [showBulkRejectDialog, setShowBulkRejectDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [bulkApprovalNotes, setBulkApprovalNotes] = useState('');
  const [bulkRejectionNotes, setBulkRejectionNotes] = useState('');
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [submitterFilter, setSubmitterFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'amount' | 'age'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const isAdmin = roles?.includes('admin' as AppRole) || currentUser?.role === 'admin';
  const isSupervisor = roles?.includes('hubSupervisor' as AppRole) || 
                       roles?.includes('supervisor' as AppRole) ||
                       currentUser?.role === 'hubSupervisor' || 
                       currentUser?.role === 'supervisor';
  const canApprove = isAdmin || isSupervisor;
  
  const getSubmitterName = (submitterId: string) => {
    const user = users.find(u => u.id === submitterId);
    return user?.name || 'Unknown User';
  };

  const getAgingInfo = (submittedAt: string) => {
    const hours = differenceInHours(new Date(), new Date(submittedAt));
    const days = differenceInDays(new Date(), new Date(submittedAt));
    
    if (hours < 24) {
      return { label: `${hours}h`, severity: 'normal', hours };
    } else if (hours < 48) {
      return { label: `${days}d ${hours % 24}h`, severity: 'normal', hours };
    } else if (hours < 72) {
      return { label: `${days}d`, severity: 'warning', hours };
    } else {
      return { label: `${days}d`, severity: 'critical', hours };
    }
  };

  const getAgingBadge = (submittedAt: string, status: string) => {
    if (status !== 'pending' && status !== 'under_review') return null;
    
    const aging = getAgingInfo(submittedAt);
    
    if (aging.severity === 'critical') {
      return (
        <Badge variant="destructive" className="flex items-center gap-1 text-xs">
          <AlertTriangle className="h-3 w-3" />
          {aging.label} overdue
        </Badge>
      );
    } else if (aging.severity === 'warning') {
      return (
        <Badge className="flex items-center gap-1 text-xs bg-amber-500 text-white">
          <Timer className="h-3 w-3" />
          {aging.label} pending
        </Badge>
      );
    }
    return null;
  };

  const uniqueSubmitters = useMemo(() => {
    const submitterIds = [...new Set(submissions.map(s => s.submittedBy))];
    return submitterIds.map(id => ({
      id,
      name: getSubmitterName(id)
    }));
  }, [submissions, users]);

  const submitterNameMap = useMemo(() => {
    const map = new Map<string, string>();
    submissions.forEach(s => {
      if (!map.has(s.submittedBy)) {
        map.set(s.submittedBy, getSubmitterName(s.submittedBy));
      }
    });
    return map;
  }, [submissions, users]);

  const filteredSubmissions = useMemo(() => {
    let filtered = [...submissions];
    
    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter);
    }
    
    if (submitterFilter !== 'all') {
      filtered = filtered.filter(s => s.submittedBy === submitterFilter);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        s.id.toLowerCase().includes(query) ||
        (submitterNameMap.get(s.submittedBy) || '').toLowerCase().includes(query) ||
        s.submissionNotes?.toLowerCase().includes(query)
      );
    }
    
    filtered.sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'date') {
        comparison = new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
      } else if (sortBy === 'amount') {
        comparison = a.totalCostCents - b.totalCostCents;
      } else if (sortBy === 'age') {
        comparison = getAgingInfo(a.submittedAt).hours - getAgingInfo(b.submittedAt).hours;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [submissions, statusFilter, submitterFilter, searchQuery, sortBy, sortOrder, submitterNameMap]);

  const pendingSubmissions = filteredSubmissions.filter(
    s => s.status === 'pending' || s.status === 'under_review'
  );

  const financeSummary = useMemo(() => {
    const pending = submissions.filter(s => s.status === 'pending' || s.status === 'under_review');
    const approved = submissions.filter(s => s.status === 'approved');
    const overdue = pending.filter(s => getAgingInfo(s.submittedAt).severity === 'critical');
    
    const aggregateByCurrency = (items: typeof submissions) => {
      const byC: Record<string, number> = {};
      items.forEach(s => {
        byC[s.currency] = (byC[s.currency] || 0) + s.totalCostCents;
      });
      return byC;
    };
    
    const pendingByCurrency = aggregateByCurrency(pending);
    const approvedByCurrency = aggregateByCurrency(approved);
    const primaryCurrency = Object.keys(pendingByCurrency)[0] || Object.keys(approvedByCurrency)[0] || 'SDG';
    
    return {
      pendingCount: pending.length,
      pendingTotal: pending.reduce((sum, s) => sum + s.totalCostCents, 0),
      pendingByCurrency,
      approvedCount: approved.length,
      approvedTotal: approved.reduce((sum, s) => sum + s.totalCostCents, 0),
      approvedByCurrency,
      overdueCount: overdue.length,
      primaryCurrency,
    };
  }, [submissions]);

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingSubmissions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingSubmissions.map(s => s.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const handleApprove = async (submission: SiteVisitCostSubmission) => {
    try {
      await reviewSubmission({
        submissionId: submission.id,
        action: 'approve',
        approvalNotes,
      });
      toast({
        title: "Submission Approved",
        description: "The cost submission has been approved successfully.",
      });
      setShowApproveDialog(false);
      setApprovalNotes('');
      setSelectedSubmission(null);
    } catch (error) {
      toast({
        title: "Approval Failed",
        description: "Failed to approve the submission. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const handleReject = async (submission: SiteVisitCostSubmission) => {
    if (!rejectionNotes.trim()) {
      toast({
        title: "Rejection Notes Required",
        description: "Please provide a reason for rejection.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      await reviewSubmission({
        submissionId: submission.id,
        action: 'reject',
        reviewerNotes: rejectionNotes,
      });
      toast({
        title: "Submission Rejected",
        description: "The cost submission has been rejected.",
      });
      setShowRejectDialog(false);
      setRejectionNotes('');
      setSelectedSubmission(null);
    } catch (error) {
      toast({
        title: "Rejection Failed",
        description: "Failed to reject the submission. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleBulkApprove = async () => {
    const selectedSubmissions = pendingSubmissions.filter(s => selectedIds.has(s.id));
    let successCount = 0;
    let failCount = 0;
    
    for (const submission of selectedSubmissions) {
      try {
        await reviewSubmission({
          submissionId: submission.id,
          action: 'approve',
          approvalNotes: bulkApprovalNotes,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }
    
    toast({
      title: "Bulk Approval Complete",
      description: `${successCount} approved, ${failCount} failed.`,
      variant: failCount > 0 ? "destructive" : "default",
    });
    
    setShowBulkApproveDialog(false);
    setBulkApprovalNotes('');
    setSelectedIds(new Set());
  };

  const handleBulkReject = async () => {
    if (!bulkRejectionNotes.trim()) {
      toast({
        title: "Rejection Notes Required",
        description: "Please provide a reason for rejection.",
        variant: "destructive",
      });
      return;
    }
    
    const selectedSubmissions = pendingSubmissions.filter(s => selectedIds.has(s.id));
    let successCount = 0;
    let failCount = 0;
    
    for (const submission of selectedSubmissions) {
      try {
        await reviewSubmission({
          submissionId: submission.id,
          action: 'reject',
          reviewerNotes: bulkRejectionNotes,
        });
        successCount++;
      } catch {
        failCount++;
      }
    }
    
    toast({
      title: "Bulk Rejection Complete",
      description: `${successCount} rejected, ${failCount} failed.`,
      variant: failCount > 0 ? "destructive" : "default",
    });
    
    setShowBulkRejectDialog(false);
    setBulkRejectionNotes('');
    setSelectedIds(new Set());
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { 
        variant: "outline" as const, 
        icon: Clock, 
        label: "Pending Review" 
      },
      under_review: { 
        variant: "default" as const, 
        icon: AlertCircle, 
        label: "Under Review" 
      },
      approved: { 
        variant: "default" as const, 
        icon: CheckCircle, 
        label: "Approved" 
      },
      rejected: { 
        variant: "destructive" as const, 
        icon: XCircle, 
        label: "Rejected" 
      },
      paid: { 
        variant: "default" as const, 
        icon: DollarSign, 
        label: "Paid" 
      },
      cancelled: { 
        variant: "secondary" as const, 
        icon: Ban, 
        label: "Cancelled" 
      }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const formatCurrency = (cents: number, currency: string) => {
    const amount = cents / 100;
    return `${amount.toLocaleString()} ${currency}`;
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'MMM dd, yyyy HH:mm');
    } catch {
      return dateString;
    }
  };

  if (submissions.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Submissions Yet</h3>
            <p className="text-muted-foreground">
              {canApprove 
                ? "No cost submissions from team members yet."
                : "You haven't submitted any cost submissions yet. Go to the Submit Costs tab to create your first submission."
              }
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {canApprove && (
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {financeSummary.pendingCount}
                </p>
                <p className="text-xs text-muted-foreground">Awaiting Review</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {Object.entries(financeSummary.pendingByCurrency).length > 0 ? (
                    Object.entries(financeSummary.pendingByCurrency).map(([currency, cents]) => (
                      <div key={currency} className="text-lg">{formatCurrency(cents, currency)}</div>
                    ))
                  ) : (
                    <span>0</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Pending Payout</p>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {Object.entries(financeSummary.approvedByCurrency).length > 0 ? (
                    Object.entries(financeSummary.approvedByCurrency).map(([currency, cents]) => (
                      <div key={currency} className="text-lg">{formatCurrency(cents, currency)}</div>
                    ))
                  ) : (
                    <span>0</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Ready to Pay</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {financeSummary.overdueCount}
                </p>
                <p className="text-xs text-muted-foreground">Overdue (&gt;72h)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Collapsible open={showFilters} onOpenChange={setShowFilters}>
        <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
          <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search submissions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-toggle-filters">
                <Filter className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
          </div>
          
          {canApprove && selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{selectedIds.size} selected</Badge>
              <Button
                size="sm"
                onClick={() => setShowBulkApproveDialog(true)}
                className="bg-emerald-600 text-white"
                data-testid="button-bulk-approve"
              >
                <CheckSquare className="h-4 w-4 mr-1" />
                Approve All
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowBulkRejectDialog(true)}
                data-testid="button-bulk-reject"
              >
                <X className="h-4 w-4 mr-1" />
                Reject All
              </Button>
            </div>
          )}
        </div>
        
        <CollapsibleContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-3 p-4 bg-muted/50 rounded-lg">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {canApprove && (
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Submitter</label>
                <Select value={submitterFilter} onValueChange={setSubmitterFilter}>
                  <SelectTrigger data-testid="select-submitter-filter">
                    <SelectValue placeholder="All submitters" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Team Members</SelectItem>
                    {uniqueSubmitters.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Sort By</label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger data-testid="select-sort-by">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date Submitted</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                  <SelectItem value="age">Age (Oldest First)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Order</label>
              <Button
                variant="outline"
                className="w-full justify-between"
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                data-testid="button-toggle-sort-order"
              >
                {sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                {sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {canApprove && pendingSubmissions.length > 0 && (
        <div className="flex items-center gap-2 py-2 px-1">
          <Checkbox
            checked={selectedIds.size === pendingSubmissions.length && pendingSubmissions.length > 0}
            onCheckedChange={toggleSelectAll}
            data-testid="checkbox-select-all"
          />
          <span className="text-sm text-muted-foreground">
            Select all pending ({pendingSubmissions.length})
          </span>
        </div>
      )}

      {filteredSubmissions.map((submission) => {
        const isPending = submission.status === 'pending' || submission.status === 'under_review';
        
        return (
          <Card key={submission.id} data-testid={`submission-${submission.id}`}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  {canApprove && isPending && (
                    <Checkbox
                      checked={selectedIds.has(submission.id)}
                      onCheckedChange={() => toggleSelect(submission.id)}
                      className="mt-1"
                      data-testid={`checkbox-${submission.id}`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                      Cost Submission #{submission.id.slice(0, 8)}
                      {getAgingBadge(submission.submittedAt, submission.status)}
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                      {canApprove && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span className="font-medium">{getSubmitterName(submission.submittedBy)}</span>
                          <span className="mx-1">-</span>
                        </span>
                      )}
                      <span>{formatDate(submission.submittedAt)}</span>
                    </div>
                  </div>
                </div>
                {getStatusBadge(submission.status)}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Transportation</p>
                    <p className="text-sm font-semibold">
                      {formatCurrency(submission.transportationCostCents, submission.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Accommodation</p>
                    <p className="text-sm font-semibold">
                      {formatCurrency(submission.accommodationCostCents, submission.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Meals</p>
                    <p className="text-sm font-semibold">
                      {formatCurrency(submission.mealAllowanceCents, submission.currency)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Other</p>
                    <p className="text-sm font-semibold">
                      {formatCurrency(submission.otherCostsCents, submission.currency)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted rounded-md">
                  <span className="font-semibold">Total Cost:</span>
                  <span className="text-lg font-bold text-primary" data-testid={`total-${submission.id}`}>
                    {formatCurrency(submission.totalCostCents, submission.currency)}
                  </span>
                </div>

                {submission.reviewerNotes && (
                  <div className="p-3 border rounded-md">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Reviewer Notes:</p>
                    <p className="text-sm">{submission.reviewerNotes}</p>
                  </div>
                )}

                {submission.approvalNotes && (
                  <div className="p-3 border rounded-md">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Approval Notes:</p>
                    <p className="text-sm">{submission.approvalNotes}</p>
                  </div>
                )}

                {submission.status === 'paid' && submission.paidAt && (
                  <div className="p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                      <DollarSign className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        Paid on {formatDate(submission.paidAt)}
                        {submission.paidAmountCents && (
                          <span className="ml-2">
                            ({formatCurrency(submission.paidAmountCents, submission.currency)})
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {canApprove && isPending && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setShowApproveDialog(true);
                        }}
                        disabled={isReviewing}
                        className="bg-emerald-600 text-white"
                        data-testid={`button-approve-${submission.id}`}
                      >
                        <ThumbsUp className="h-4 w-4 mr-2" />
                        Approve
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setSelectedSubmission(submission);
                          setShowRejectDialog(true);
                        }}
                        disabled={isReviewing}
                        data-testid={`button-reject-${submission.id}`}
                      >
                        <ThumbsDown className="h-4 w-4 mr-2" />
                        Reject
                      </Button>
                    </>
                  )}
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedSubmission(submission)}
                        data-testid={`button-view-details-${submission.id}`}
                      >
                        <Eye className="h-4 w-4 mr-2" />
                        View Details
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Cost Submission Details</DialogTitle>
                        <DialogDescription>
                          Full details and supporting documents for this submission
                        </DialogDescription>
                      </DialogHeader>
                      {selectedSubmission && (
                        <div className="space-y-4 py-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Status</p>
                              {getStatusBadge(selectedSubmission.status)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-muted-foreground">Submitted</p>
                              <p className="text-sm">{formatDate(selectedSubmission.submittedAt)}</p>
                            </div>
                            {selectedSubmission.reviewedAt && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Reviewed</p>
                                <p className="text-sm">{formatDate(selectedSubmission.reviewedAt)}</p>
                              </div>
                            )}
                            {selectedSubmission.paidAt && (
                              <div>
                                <p className="text-sm font-medium text-muted-foreground">Paid</p>
                                <p className="text-sm">{formatDate(selectedSubmission.paidAt)}</p>
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            <h4 className="font-semibold">Cost Breakdown</h4>
                            
                            {selectedSubmission.transportationCostCents > 0 && (
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-sm font-medium">Transportation</span>
                                  <span className="text-sm font-semibold">
                                    {formatCurrency(selectedSubmission.transportationCostCents, selectedSubmission.currency)}
                                  </span>
                                </div>
                                {selectedSubmission.transportationDetails && (
                                  <p className="text-xs text-muted-foreground pl-4">
                                    {selectedSubmission.transportationDetails}
                                  </p>
                                )}
                              </div>
                            )}

                            {selectedSubmission.accommodationCostCents > 0 && (
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-sm font-medium">Accommodation</span>
                                  <span className="text-sm font-semibold">
                                    {formatCurrency(selectedSubmission.accommodationCostCents, selectedSubmission.currency)}
                                  </span>
                                </div>
                                {selectedSubmission.accommodationDetails && (
                                  <p className="text-xs text-muted-foreground pl-4">
                                    {selectedSubmission.accommodationDetails}
                                  </p>
                                )}
                              </div>
                            )}

                            {selectedSubmission.mealAllowanceCents > 0 && (
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-sm font-medium">Meals</span>
                                  <span className="text-sm font-semibold">
                                    {formatCurrency(selectedSubmission.mealAllowanceCents, selectedSubmission.currency)}
                                  </span>
                                </div>
                                {selectedSubmission.mealDetails && (
                                  <p className="text-xs text-muted-foreground pl-4">
                                    {selectedSubmission.mealDetails}
                                  </p>
                                )}
                              </div>
                            )}

                            {selectedSubmission.otherCostsCents > 0 && (
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-sm font-medium">Other Costs</span>
                                  <span className="text-sm font-semibold">
                                    {formatCurrency(selectedSubmission.otherCostsCents, selectedSubmission.currency)}
                                  </span>
                                </div>
                                {selectedSubmission.otherCostsDetails && (
                                  <p className="text-xs text-muted-foreground pl-4">
                                    {selectedSubmission.otherCostsDetails}
                                  </p>
                                )}
                              </div>
                            )}

                            <div className="flex justify-between items-center pt-3 border-t">
                              <span className="font-semibold">Total</span>
                              <span className="text-lg font-bold text-primary">
                                {formatCurrency(selectedSubmission.totalCostCents, selectedSubmission.currency)}
                              </span>
                            </div>
                          </div>

                          {selectedSubmission.supportingDocuments && selectedSubmission.supportingDocuments.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="font-semibold">Supporting Documents</h4>
                              <div className="grid grid-cols-2 gap-2">
                                {selectedSubmission.supportingDocuments.map((doc, index) => (
                                  <Button
                                    key={index}
                                    variant="outline"
                                    size="sm"
                                    onClick={() => window.open(doc.url, '_blank')}
                                    className="justify-start"
                                    data-testid={`button-document-${index}`}
                                  >
                                    <FileText className="h-4 w-4 mr-2" />
                                    <span className="truncate">{doc.filename}</span>
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedSubmission.submissionNotes && (
                            <div>
                              <h4 className="font-semibold mb-2">Submission Notes</h4>
                              <p className="text-sm text-muted-foreground">
                                {selectedSubmission.submissionNotes}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
      
      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Cost Submission</DialogTitle>
            <DialogDescription>
              You are about to approve this cost submission for{' '}
              {selectedSubmission && (
                <span className="font-semibold">
                  {formatCurrency(selectedSubmission.totalCostCents, selectedSubmission.currency)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Approval Notes (Optional)
              </label>
              <Textarea
                placeholder="Add any notes about this approval..."
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowApproveDialog(false);
                setApprovalNotes('');
                setSelectedSubmission(null);
              }}
              data-testid="button-cancel-approve"
            >
              Cancel
            </Button>
            <Button
              onClick={() => selectedSubmission && handleApprove(selectedSubmission)}
              disabled={isReviewing}
              className="bg-emerald-600 text-white"
              data-testid="button-confirm-approve"
            >
              {isReviewing ? 'Approving...' : 'Approve Submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Cost Submission</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder="Explain why this submission is being rejected..."
                value={rejectionNotes}
                onChange={(e) => setRejectionNotes(e.target.value)}
                className="min-h-[100px]"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowRejectDialog(false);
                setRejectionNotes('');
                setSelectedSubmission(null);
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedSubmission && handleReject(selectedSubmission)}
              disabled={isReviewing || !rejectionNotes.trim()}
              data-testid="button-confirm-reject"
            >
              {isReviewing ? 'Rejecting...' : 'Reject Submission'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkApproveDialog} onOpenChange={setShowBulkApproveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Approve Submissions</DialogTitle>
            <DialogDescription>
              You are about to approve {selectedIds.size} submissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Approval Notes (Optional - applies to all)
              </label>
              <Textarea
                placeholder="Add notes for all selected approvals..."
                value={bulkApprovalNotes}
                onChange={(e) => setBulkApprovalNotes(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBulkApproveDialog(false);
                setBulkApprovalNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkApprove}
              disabled={isReviewing}
              className="bg-emerald-600 text-white"
            >
              {isReviewing ? 'Approving...' : `Approve ${selectedIds.size} Submissions`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBulkRejectDialog} onOpenChange={setShowBulkRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Reject Submissions</DialogTitle>
            <DialogDescription>
              You are about to reject {selectedIds.size} submissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Rejection Reason <span className="text-red-500">*</span>
              </label>
              <Textarea
                placeholder="Explain why these submissions are being rejected..."
                value={bulkRejectionNotes}
                onChange={(e) => setBulkRejectionNotes(e.target.value)}
                className="min-h-[100px]"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBulkRejectDialog(false);
                setBulkRejectionNotes('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBulkReject}
              disabled={isReviewing || !bulkRejectionNotes.trim()}
            >
              {isReviewing ? 'Rejecting...' : `Reject ${selectedIds.size} Submissions`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CostSubmissionHistory;
