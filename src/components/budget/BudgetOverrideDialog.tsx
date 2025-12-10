import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, ShieldCheck, DollarSign, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppContext';
import { processOverBudgetApproval, canOverrideBudgetRestriction } from '@/services/budget-restriction.service';
import { BudgetNotificationService } from '@/services/budget-notification.service';
import { useToast } from '@/hooks/use-toast';
import type { AppRole } from '@/types/roles';

export interface OverBudgetRequest {
  id: string;
  type: 'expense' | 'withdrawal' | 'cost_submission';
  amount: number;
  shortfall: number;
  projectId: string;
  projectName: string;
  mmpId?: string;
  requestedBy: string;
  requestedByName: string;
  reason?: string;
  submittedAt: string;
}

interface BudgetOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: OverBudgetRequest | null;
  onApproved?: () => void;
  onRejected?: () => void;
}

export function BudgetOverrideDialog({
  open,
  onOpenChange,
  request,
  onApproved,
  onRejected,
}: BudgetOverrideDialogProps) {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const [overrideReason, setOverrideReason] = useState('');
  const [processing, setProcessing] = useState(false);

  const userRole = (currentUser?.role as AppRole) || 'DataCollector';
  const hasOverridePermission = canOverrideBudgetRestriction(userRole);

  const formatCurrency = (amount: number) => {
    return `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} SDG`;
  };

  const handleApprove = async () => {
    if (!request || !currentUser) return;
    
    if (!overrideReason.trim()) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a reason for the budget override',
        variant: 'destructive',
      });
      return;
    }

    setProcessing(true);
    try {
      const result = await processOverBudgetApproval(
        request.id,
        currentUser.id,
        userRole,
        overrideReason
      );

      if (result.success) {
        await BudgetNotificationService.sendApprovalResult(
          request.requestedBy,
          true,
          request.amount,
          request.projectName,
          currentUser.name || currentUser.email
        );

        toast({
          title: 'Override Approved',
          description: `Budget override for ${formatCurrency(request.amount)} has been approved`,
        });

        onApproved?.();
        onOpenChange(false);
        setOverrideReason('');
      } else {
        toast({
          title: 'Approval Failed',
          description: result.message,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process override approval',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!request || !currentUser) return;

    setProcessing(true);
    try {
      await BudgetNotificationService.sendApprovalResult(
        request.requestedBy,
        false,
        request.amount,
        request.projectName,
        currentUser.name || currentUser.email
      );

      toast({
        title: 'Request Rejected',
        description: `Over-budget request for ${formatCurrency(request.amount)} has been rejected`,
      });

      onRejected?.();
      onOpenChange(false);
      setOverrideReason('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process rejection',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  if (!request) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="dialog-budget-override">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-500" />
            Budget Override Required
          </DialogTitle>
          <DialogDescription>
            This request exceeds the available budget and requires approval from Senior Operations Lead.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Budget Shortfall: </span>
              {formatCurrency(request.shortfall)}
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Requested Amount</span>
              <p className="font-medium text-lg">{formatCurrency(request.amount)}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Over Budget By</span>
              <p className="font-medium text-lg text-red-600 dark:text-red-400">
                {formatCurrency(request.shortfall)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Project:</span>
              <Badge variant="outline">{request.projectName}</Badge>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Requested By:</span>
              <span className="text-sm font-medium">{request.requestedByName}</span>
            </div>
            {request.reason && (
              <div>
                <span className="text-sm text-muted-foreground">Request Reason:</span>
                <p className="text-sm mt-1">{request.reason}</p>
              </div>
            )}
          </div>

          {hasOverridePermission && (
            <div className="space-y-2">
              <Label htmlFor="override-reason">Override Justification *</Label>
              <Textarea
                id="override-reason"
                placeholder="Provide a detailed reason for approving this over-budget request..."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="min-h-[100px]"
                data-testid="textarea-override-reason"
              />
            </div>
          )}

          {!hasOverridePermission && (
            <Alert>
              <AlertDescription>
                You do not have permission to override budget restrictions. 
                Only Senior Operations Leads, Admins, and Super Admins can approve over-budget requests.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={processing}
            data-testid="button-cancel-override"
          >
            Cancel
          </Button>
          {hasOverridePermission && (
            <>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing}
                data-testid="button-reject-override"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Reject
              </Button>
              <Button
                onClick={handleApprove}
                disabled={processing || !overrideReason.trim()}
                data-testid="button-approve-override"
              >
                {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                <DollarSign className="h-4 w-4 mr-1" />
                Approve Override
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default BudgetOverrideDialog;
