import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CalendarDays, Check, X, Clock, MapPin, User, MessageSquare, AlertTriangle } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { PostponementHistoryEntry } from '@/types/mmp/site';
import { POSTPONEMENT_REASONS, PostponementReason } from '@/types/postponement';
import { useToast } from '@/hooks/use-toast';

interface PendingPostponement {
  siteEntryId: string;
  siteName: string;
  siteCode: string;
  locality?: string;
  hubOffice?: string;
  mainActivity?: string;
  postponement: PostponementHistoryEntry;
}

interface PendingPostponementApprovalsProps {
  pendingItems: PendingPostponement[];
  onApprove: (siteEntryId: string, postponementId: string, notes?: string) => Promise<void>;
  onReject: (siteEntryId: string, postponementId: string, notes: string) => Promise<void>;
  isLoading?: boolean;
}

export function PendingPostponementApprovals({
  pendingItems,
  onApprove,
  onReject,
  isLoading
}: PendingPostponementApprovalsProps) {
  const { toast } = useToast();
  const [selectedItem, setSelectedItem] = useState<PendingPostponement | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleReview = (item: PendingPostponement, action: 'approve' | 'reject') => {
    setSelectedItem(item);
    setReviewAction(action);
    setReviewNotes('');
  };

  const handleSubmitReview = async () => {
    if (!selectedItem || !reviewAction) return;
    
    if (reviewAction === 'reject' && !reviewNotes.trim()) {
      toast({
        title: 'Notes Required',
        description: 'Please provide a reason for rejection.',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      if (reviewAction === 'approve') {
        await onApprove(selectedItem.siteEntryId, selectedItem.postponement.id, reviewNotes || undefined);
        toast({
          title: 'Postponement Approved',
          description: `Visit date updated for ${selectedItem.siteName}`,
          variant: 'default'
        });
      } else {
        await onReject(selectedItem.siteEntryId, selectedItem.postponement.id, reviewNotes);
        toast({
          title: 'Postponement Rejected',
          description: `Request rejected for ${selectedItem.siteName}`,
          variant: 'default'
        });
      }
      setSelectedItem(null);
      setReviewAction(null);
    } catch (error) {
      console.error('Failed to process review:', error);
      toast({
        title: 'Review Failed',
        description: 'Could not process the review. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDateDifference = (original: string, newDate: string) => {
    const diff = differenceInDays(parseISO(newDate), parseISO(original));
    return diff > 0 ? `+${diff} days` : `${diff} days`;
  };

  if (pendingItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Pending Postponements
          </CardTitle>
          <CardDescription>No postponement requests pending approval</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <CardTitle>Pending Postponements</CardTitle>
            </div>
            <Badge variant="secondary">{pendingItems.length} pending</Badge>
          </div>
          <CardDescription>
            Review and approve/reject postponement requests from data collectors
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {pendingItems.map((item) => (
                <div 
                  key={`${item.siteEntryId}-${item.postponement.id}`}
                  className="p-4 border rounded-lg bg-card space-y-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{item.siteName}</span>
                        <Badge variant="outline" className="text-xs">{item.siteCode}</Badge>
                      </div>
                      {item.locality && (
                        <p className="text-sm text-muted-foreground pl-6">
                          {item.locality} {item.hubOffice && `- ${item.hubOffice}`}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="whitespace-nowrap">
                        {getDateDifference(item.postponement.originalDate, item.postponement.newDate)}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {format(parseISO(item.postponement.originalDate), 'MMM d')}
                        {item.postponement.originalDateTo && ` - ${format(parseISO(item.postponement.originalDateTo), 'MMM d')}`}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium text-foreground">
                        {format(parseISO(item.postponement.newDate), 'MMM d')}
                        {item.postponement.newDateTo && ` - ${format(parseISO(item.postponement.newDateTo), 'MMM d')}`}
                        {', '}
                        {format(parseISO(item.postponement.newDate), 'yyyy')}
                      </span>
                      {item.postponement.isDateRange && (
                        <Badge variant="outline" className="text-xs ml-1">Multi-day</Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span>
                        {POSTPONEMENT_REASONS[item.postponement.reason as PostponementReason]?.en || item.postponement.reason}
                      </span>
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">{item.postponement.requestedByName}</span>
                    </div>
                    <Separator orientation="vertical" className="h-4" />
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {format(parseISO(item.postponement.requestedAt), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  </div>

                  {item.postponement.reasonDetails && (
                    <div className="flex items-start gap-1.5 text-sm bg-muted p-2 rounded">
                      <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">{item.postponement.reasonDetails}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleReview(item, 'reject')}
                      className="text-destructive hover:text-destructive"
                      data-testid={`button-reject-${item.siteEntryId}`}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleReview(item, 'approve')}
                      className="bg-green-600 hover:bg-green-700"
                      data-testid={`button-approve-${item.siteEntryId}`}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!selectedItem && !!reviewAction} onOpenChange={() => { setSelectedItem(null); setReviewAction(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewAction === 'approve' ? (
                <Check className="h-5 w-5 text-green-600" />
              ) : (
                <X className="h-5 w-5 text-destructive" />
              )}
              {reviewAction === 'approve' ? 'Approve' : 'Reject'} Postponement
            </DialogTitle>
            <DialogDescription>
              {reviewAction === 'approve' 
                ? 'Confirm approval of this postponement request'
                : 'Provide a reason for rejecting this request'}
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 py-4">
              <div className="bg-muted p-3 rounded-md space-y-2">
                <p className="font-medium">{selectedItem.siteName}</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    {format(parseISO(selectedItem.postponement.originalDate), 'MMM d')}
                  </span>
                  <span>→</span>
                  <span className="font-medium">
                    {format(parseISO(selectedItem.postponement.newDate), 'MMM d, yyyy')}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {reviewAction === 'approve' ? 'Notes (Optional)' : 'Reason for Rejection *'}
                </label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={reviewAction === 'approve' 
                    ? 'Add any notes for the data collector...'
                    : 'Explain why this request is being rejected...'}
                  rows={3}
                  className="resize-none"
                  data-testid="input-review-notes"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => { setSelectedItem(null); setReviewAction(null); }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitReview}
              disabled={isSubmitting || (reviewAction === 'reject' && !reviewNotes.trim())}
              variant={reviewAction === 'approve' ? 'default' : 'destructive'}
              data-testid="button-confirm-review"
            >
              {isSubmitting ? 'Processing...' : reviewAction === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default PendingPostponementApprovals;
