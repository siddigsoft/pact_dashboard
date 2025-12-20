import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Clock, AlertTriangle, History } from 'lucide-react';
import { format, parseISO, isAfter, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { PostponementReason, POSTPONEMENT_REASONS, PostponementFormData } from '@/types/postponement';
import { PostponementHistoryEntry } from '@/types/mmp/site';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';

interface PostponementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteEntry: {
    id: string;
    siteName?: string;
    siteCode?: string;
    visitDate?: string;
    visitDateFrom?: string;
    visitDateTo?: string;
    mainActivity?: string;
    postponementHistory?: PostponementHistoryEntry[];
  };
  currentUser: {
    id: string;
    full_name?: string;
    name?: string;
  };
  onSubmit: (siteEntryId: string, postponement: PostponementHistoryEntry) => Promise<void>;
}

export function PostponementDialog({
  open,
  onOpenChange,
  siteEntry,
  currentUser,
  onSubmit
}: PostponementDialogProps) {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | undefined>(undefined);
  const [reason, setReason] = useState<PostponementReason | ''>('');
  const [reasonDetails, setReasonDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const originalDate = siteEntry.visitDate || siteEntry.visitDateFrom;
  const isDateRange = !!(siteEntry.visitDateFrom && siteEntry.visitDateTo);
  const history = siteEntry.postponementHistory || [];

  const handleSubmit = async () => {
    if (!selectedDate || !reason) {
      toast({
        title: 'Missing Information',
        description: 'Please select a new date and reason for postponement.',
        variant: 'destructive'
      });
      return;
    }

    if (originalDate && !isAfter(selectedDate, parseISO(originalDate))) {
      toast({
        title: 'Invalid Date',
        description: 'New date must be after the original date.',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const postponement: PostponementHistoryEntry = {
        id: uuidv4(),
        originalDate: originalDate || new Date().toISOString(),
        originalDateTo: isDateRange ? siteEntry.visitDateTo : undefined,
        newDate: selectedDate.toISOString(),
        newDateTo: isDateRange && selectedEndDate ? selectedEndDate.toISOString() : undefined,
        isDateRange: isDateRange,
        reason,
        reasonDetails: reasonDetails || undefined,
        requestedBy: currentUser.id,
        requestedByName: currentUser.full_name || currentUser.name || 'Unknown',
        requestedAt: new Date().toISOString(),
        status: 'pending'
      };

      await onSubmit(siteEntry.id, postponement);
      
      toast({
        title: 'Postponement Requested',
        description: 'Your postponement request has been submitted for approval.',
        variant: 'default'
      });
      
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error('Failed to submit postponement:', error);
      toast({
        title: 'Submission Failed',
        description: 'Could not submit postponement request. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setSelectedDate(undefined);
    setSelectedEndDate(undefined);
    setReason('');
    setReasonDetails('');
  };

  const getStatusBadge = (status: PostponementHistoryEntry['status']) => {
    switch (status) {
      case 'approved':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'cancelled':
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" />
            Request Visit Postponement
          </DialogTitle>
          <DialogDescription>
            Request to change the scheduled visit date for {siteEntry.siteName || siteEntry.siteCode || 'this site'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted p-3 rounded-md space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Date:</span>
              <span className="font-medium">
                {originalDate ? format(parseISO(originalDate), 'PPP') : 'Not set'}
                {isDateRange && siteEntry.visitDateTo && (
                  <span className="text-muted-foreground"> to {format(parseISO(siteEntry.visitDateTo), 'PPP')}</span>
                )}
              </span>
            </div>
            {siteEntry.mainActivity && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Activity:</span>
                <Badge variant="outline">{siteEntry.mainActivity}</Badge>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>New Visit Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !selectedDate && 'text-muted-foreground'
                  )}
                  data-testid="button-select-new-date"
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, 'PPP') : 'Select new date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  disabled={(date) => {
                    const minDate = originalDate ? parseISO(originalDate) : new Date();
                    return date <= minDate;
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {isDateRange && (
            <div className="space-y-2">
              <Label>New End Date (for multi-day activities)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !selectedEndDate && 'text-muted-foreground'
                    )}
                    data-testid="button-select-end-date"
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {selectedEndDate ? format(selectedEndDate, 'PPP') : 'Select end date (optional)'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedEndDate}
                    onSelect={setSelectedEndDate}
                    disabled={(date) => {
                      return selectedDate ? date < selectedDate : date < new Date();
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason for Postponement *</Label>
            <Select value={reason} onValueChange={(value) => setReason(value as PostponementReason)}>
              <SelectTrigger data-testid="select-postponement-reason">
                <SelectValue placeholder="Select a reason" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(POSTPONEMENT_REASONS).map(([key, labels]) => (
                  <SelectItem key={key} value={key}>
                    {labels.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Additional Details</Label>
            <Textarea
              placeholder="Provide any additional context for this postponement request..."
              value={reasonDetails}
              onChange={(e) => setReasonDetails(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="input-postponement-details"
            />
          </div>

          {history.length > 0 && (
            <div className="border-t pt-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="w-full justify-between"
                data-testid="button-toggle-history"
              >
                <span className="flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Postponement History ({history.length})
                </span>
                <span>{showHistory ? 'Hide' : 'Show'}</span>
              </Button>
              
              {showHistory && (
                <div className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                  {history.map((entry) => (
                    <div key={entry.id} className="bg-muted/50 p-2 rounded text-sm space-y-1">
                      <div className="flex items-center justify-between">
                        <span>
                          {format(parseISO(entry.originalDate), 'MMM d')}
                          {entry.originalDateTo && ` - ${format(parseISO(entry.originalDateTo), 'MMM d')}`}
                          {' → '}
                          {format(parseISO(entry.newDate), 'MMM d')}
                          {entry.newDateTo && ` - ${format(parseISO(entry.newDateTo), 'MMM d')}`}
                          {', '}
                          {format(parseISO(entry.newDate), 'yyyy')}
                        </span>
                        {getStatusBadge(entry.status)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {POSTPONEMENT_REASONS[entry.reason as PostponementReason]?.en || entry.reason} - by {entry.requestedByName}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              This request will be sent to your supervisor for approval. The visit date will only change once approved.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isSubmitting || !selectedDate || !reason}
            data-testid="button-submit-postponement"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default PostponementDialog;
