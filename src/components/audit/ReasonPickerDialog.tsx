import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import {
  REJECTION_REASONS,
  APPROVAL_REASONS,
  type WorkflowType,
} from '@/config/rejectionReasons';

interface ReasonPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'approve' | 'reject';
  workflowType?: WorkflowType;
  title?: string;
  description?: string | React.ReactNode;
  onConfirm: (reason: string, comment: string) => Promise<void> | void;
  loading?: boolean;
  approveLabel?: string;
  rejectLabel?: string;
  requireReasonOnApprove?: boolean;
}

export function ReasonPickerDialog({
  open,
  onOpenChange,
  mode,
  workflowType = 'general',
  title,
  description,
  onConfirm,
  loading = false,
  approveLabel = 'Confirm Approval',
  rejectLabel = 'Confirm Rejection',
  requireReasonOnApprove = false,
}: ReasonPickerDialogProps) {
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');

  const options = mode === 'reject'
    ? REJECTION_REASONS[workflowType] || REJECTION_REASONS.general
    : APPROVAL_REASONS[workflowType] || APPROVAL_REASONS.general;

  const requireReason = mode === 'reject' || requireReasonOnApprove;
  const canSubmit = !loading && (!requireReason || reason.trim() !== '');

  const handleConfirm = async () => {
    if (!canSubmit) return;
    await onConfirm(reason, comment);
    setReason('');
    setComment('');
  };

  const handleClose = (val: boolean) => {
    if (!loading) {
      if (!val) {
        setReason('');
        setComment('');
      }
      onOpenChange(val);
    }
  };

  const isApprove = mode === 'approve';
  const defaultTitle = isApprove ? 'Confirm Approval' : 'Confirm Rejection';
  const iconBg = isApprove ? 'bg-green-500/10' : 'bg-red-500/10';
  const iconColor = isApprove ? 'text-green-600' : 'text-red-600';
  const Icon = isApprove ? CheckCircle2 : XCircle;
  const confirmLabel = isApprove ? approveLabel : rejectLabel;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className={`p-2 rounded-full ${iconBg}`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            {title || defaultTitle}
          </DialogTitle>
          {description && (
            <DialogDescription asChild>
              <div className="mt-2">{description}</div>
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="reason-select">
              {isApprove ? 'Reason' : 'Reason for Rejection'}
              {requireReason && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger id="reason-select" data-testid="select-rejection-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {options.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {requireReason && !reason && (
              <p className="text-xs text-destructive">A reason is required before submitting.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason-comment">
              Additional Comments <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="reason-comment"
              placeholder={isApprove ? 'Add any notes for the record...' : 'Provide more context about the rejection...'}
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              data-testid="input-reason-comment"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!canSubmit}
            className={isApprove ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'}
            data-testid="button-confirm-reason"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
