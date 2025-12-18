import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  RotateCcw,
  Clock,
  CheckCircle2,
  XCircle,
  User,
  Loader2,
  DollarSign,
  MapPin,
  Shield
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuthorization } from '@/hooks/use-authorization';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  RecallTier,
  RecallScopeType,
  RECALL_TIER_LABELS,
  RECALL_SCOPE_LABELS
} from '@/types/recall';
import { approveRecall, rejectRecall } from '@/utils/recallUtils';

interface PendingRecall {
  id: string;
  recall_event_id: string;
  mmp_id: string;
  mmp_name: string;
  tier: RecallTier;
  scope_type: RecallScopeType;
  recalled_by_name: string;
  recalled_by_email?: string;
  reason: string;
  affected_site_count: number;
  has_financial_impact: boolean;
  financial_amount?: number;
  is_force_recall: boolean;
  created_at: string;
}

const TIER_COLORS: Record<RecallTier, string> = {
  admin_to_fom: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  fom_to_coordinator: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  coordinator_to_collector: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
};

export function PendingRecallApprovals() {
  const { currentUser } = useAuthorization();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRecalls, setPendingRecalls] = useState<PendingRecall[]>([]);
  
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedRecall, setSelectedRecall] = useState<PendingRecall | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'ict';
  const isFOM = currentUser?.role === 'fom';
  const canApprove = isSuperAdmin || isAdmin || isFOM;

  useEffect(() => {
    if (canApprove) {
      loadPendingRecalls();
    }
  }, [canApprove]);

  const loadPendingRecalls = async () => {
    setIsLoading(true);
    try {
      const { data: mmpFiles, error } = await supabase
        .from('mmp_files')
        .select('id, name, logs, workflow')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const pending: PendingRecall[] = [];

      for (const mmp of mmpFiles || []) {
        const logs = (mmp.logs as any[]) || [];
        
        const pendingRecallLogs = logs.filter((log: any) => 
          log.action === 'recall_initiated' && 
          !logs.some((l: any) => 
            (l.action === 'recall_approved' || l.action === 'recall_rejected' || l.action === 'recall_completed') &&
            l.recallEventId === log.recallEventId
          )
        );

        for (const log of pendingRecallLogs) {
          const recallEventId = log.recallEventId || `${mmp.id}-${log.date}`;
          pending.push({
            id: `${mmp.id}-${log.date}`,
            recall_event_id: recallEventId,
            mmp_id: mmp.id,
            mmp_name: mmp.name || 'Unknown MMP',
            tier: log.tier || 'admin_to_fom',
            scope_type: log.scopeType || 'full_mmp',
            recalled_by_name: log.by || 'Unknown',
            recalled_by_email: log.byEmail,
            reason: log.reason || '',
            affected_site_count: log.affectedSites || 0,
            has_financial_impact: log.tier === 'coordinator_to_collector',
            financial_amount: log.financialAmount,
            is_force_recall: log.isForceRecall || false,
            created_at: log.date
          });
        }
      }

      setPendingRecalls(pending);
    } catch (error) {
      console.error('Error loading pending recalls:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = (recall: PendingRecall, type: 'approve' | 'reject') => {
    setSelectedRecall(recall);
    setActionType(type);
    setNotes('');
    setActionDialogOpen(true);
  };

  const handleSubmitAction = async () => {
    if (!selectedRecall) return;

    if (actionType === 'reject' && !notes.trim()) {
      toast({
        title: 'Reason Required',
        description: 'Please provide a reason for rejection',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    try {
      let result: { success: boolean; error?: string };

      if (actionType === 'approve') {
        result = await approveRecall(
          selectedRecall.mmp_id,
          selectedRecall.recall_event_id,
          currentUser?.id || '',
          currentUser?.fullName || 'Unknown',
          currentUser?.email,
          notes || undefined
        );
      } else {
        result = await rejectRecall(
          selectedRecall.mmp_id,
          selectedRecall.recall_event_id,
          currentUser?.id || '',
          currentUser?.fullName || 'Unknown',
          currentUser?.email,
          notes
        );
      }

      if (!result.success) {
        throw new Error(result.error || 'Operation failed');
      }

      toast({
        title: actionType === 'approve' ? 'Recall Approved' : 'Recall Rejected',
        description: `The recall request has been ${actionType === 'approve' ? 'approved and executed' : 'rejected'}`,
      });

      setPendingRecalls(prev => prev.filter(r => r.id !== selectedRecall.id));
      setActionDialogOpen(false);
    } catch (error: any) {
      toast({
        title: 'Action Failed',
        description: error.message || 'An error occurred',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!canApprove) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RotateCcw className="h-5 w-5" />
          Pending Recall Approvals
          {pendingRecalls.length > 0 && (
            <Badge variant="destructive" className="ml-2">
              {pendingRecalls.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Review and approve or reject pending MMP recall requests
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : pendingRecalls.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No pending recall approvals
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>MMP</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Requested By</TableHead>
                <TableHead>Sites</TableHead>
                <TableHead>Financial</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingRecalls.map((recall) => (
                <TableRow key={recall.id}>
                  <TableCell>
                    <div className="font-medium">{recall.mmp_name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(recall.created_at), 'MMM d, h:mm a')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={TIER_COLORS[recall.tier]}>
                      {RECALL_TIER_LABELS[recall.tier].en}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      <MapPin className="h-3 w-3 mr-1" />
                      {RECALL_SCOPE_LABELS[recall.scope_type].en}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm">{recall.recalled_by_name}</div>
                        {recall.recalled_by_email && (
                          <div className="text-xs text-muted-foreground">
                            {recall.recalled_by_email}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {recall.affected_site_count} sites
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {recall.has_financial_impact ? (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                        <DollarSign className="h-3 w-3 mr-1" />
                        {recall.financial_amount?.toLocaleString()} SDG
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">None</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAction(recall, 'reject')}
                        data-testid={`button-reject-recall-${recall.id}`}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleAction(recall, 'approve')}
                        data-testid={`button-approve-recall-${recall.id}`}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {actionType === 'approve' ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                {actionType === 'approve' ? 'Approve Recall' : 'Reject Recall'}
              </DialogTitle>
              <DialogDescription>
                {actionType === 'approve'
                  ? 'This will execute the recall and notify all affected users'
                  : 'This will reject the recall request and notify the requester'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {selectedRecall && (
                <div className="p-3 bg-muted rounded-lg space-y-2">
                  <div className="font-medium">{selectedRecall.mmp_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {selectedRecall.affected_site_count} sites affected
                  </div>
                  {selectedRecall.has_financial_impact && (
                    <Badge className="bg-amber-100 text-amber-800">
                      <DollarSign className="h-3 w-3 mr-1" />
                      {selectedRecall.financial_amount?.toLocaleString()} SDG recovery needed
                    </Badge>
                  )}
                  <div className="text-sm mt-2">
                    <span className="font-medium">Reason: </span>
                    {selectedRecall.reason}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="action-notes">
                  {actionType === 'approve' ? 'Notes (Optional)' : 'Rejection Reason *'}
                </Label>
                <Textarea
                  id="action-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={actionType === 'approve' 
                    ? 'Add any notes...' 
                    : 'Explain why this recall is being rejected...'}
                  rows={3}
                  data-testid="textarea-action-notes"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setActionDialogOpen(false)}
                disabled={isProcessing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitAction}
                disabled={isProcessing}
                variant={actionType === 'approve' ? 'default' : 'destructive'}
                data-testid="button-confirm-action"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Processing...
                  </>
                ) : actionType === 'approve' ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve Recall
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Recall
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default PendingRecallApprovals;
