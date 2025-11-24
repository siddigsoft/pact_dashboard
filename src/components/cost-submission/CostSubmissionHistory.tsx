import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SiteVisitCostSubmission } from "@/types/cost-submission";
import { format } from "date-fns";
import { Eye, FileText, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Ban } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface CostSubmissionHistoryProps {
  submissions: SiteVisitCostSubmission[];
}

const CostSubmissionHistory = ({ submissions }: CostSubmissionHistoryProps) => {
  const [selectedSubmission, setSelectedSubmission] = useState<SiteVisitCostSubmission | null>(null);

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
    return `${amount.toFixed(2)} ${currency}`;
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
              You haven't submitted any cost submissions yet. Go to the Submit Costs tab to create your first submission.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {submissions.map((submission) => (
        <Card key={submission.id} data-testid={`submission-${submission.id}`}>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="text-base">
                  Cost Submission #{submission.id.slice(0, 8)}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Submitted on {formatDate(submission.submittedAt)}
                </p>
              </div>
              {getStatusBadge(submission.status)}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Cost Breakdown */}
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

              {/* Total */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-md">
                <span className="font-semibold">Total Cost:</span>
                <span className="text-lg font-bold text-primary" data-testid={`total-${submission.id}`}>
                  {formatCurrency(submission.totalCostCents, submission.currency)}
                </span>
              </div>

              {/* Review Notes */}
              {submission.reviewerNotes && (
                <div className="p-3 border rounded-md">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Reviewer Notes:</p>
                  <p className="text-sm">{submission.reviewerNotes}</p>
                </div>
              )}

              {/* Approval Notes */}
              {submission.approvalNotes && (
                <div className="p-3 border rounded-md">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Approval Notes:</p>
                  <p className="text-sm">{submission.approvalNotes}</p>
                </div>
              )}

              {/* Payment Info */}
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

              {/* Actions */}
              <div className="flex gap-2">
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
                        {/* Status and Dates */}
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

                        {/* Cost Details */}
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

                        {/* Supporting Documents */}
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

                        {/* Submission Notes */}
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
      ))}
    </div>
  );
};

export default CostSubmissionHistory;
