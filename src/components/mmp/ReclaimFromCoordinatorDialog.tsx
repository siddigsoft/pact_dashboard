import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  RotateCcw,
  AlertTriangle,
  Loader2,
  FileText,
  MapPin,
  Users,
  User,
} from 'lucide-react';
import { reclaimFromCoordinator, insertNotifications } from '@/services/mmpActions';
import { logMMPAudit } from '@/services/mmpAudit.service';
import { useToast } from '@/hooks/use-toast';
import { useAppContext } from '@/context/AppContext';
import { useMMP } from '@/context/mmp/MMPContext';
import { supabase } from '@/integrations/supabase/client';

const RECLAIM_REASONS = [
  { value: 'permit_issue', labelEn: 'Permit Issue', labelAr: 'مشكلة في التصريح' },
  { value: 'timeline_not_enough', labelEn: 'Timeline Was Not Enough', labelAr: 'الجدول الزمني غير كافٍ' },
  { value: 'wfp_changes', labelEn: 'WFP Changes', labelAr: 'تغييرات برنامج الأغذية العالمي' },
  { value: 'cp_not_distributing', labelEn: 'CP Will Not Distribute This Month', labelAr: 'الشريك المنفذ لن يوزع هذا الشهر' },
  { value: 'security_concerns', labelEn: 'Security Concerns', labelAr: 'مخاوف أمنية' },
  { value: 'staff_unavailable', labelEn: 'Staff Unavailable', labelAr: 'الموظفون غير متاحين' },
  { value: 'data_correction', labelEn: 'Data Correction Needed', labelAr: 'يحتاج تصحيح البيانات' },
  { value: 'reassignment_needed', labelEn: 'Reassignment to Different Coordinator', labelAr: 'إعادة تعيين لمنسق مختلف' },
  { value: 'other', labelEn: 'Other', labelAr: 'أخرى' },
];

interface CoordinatorInfo {
  id: string;
  name: string;
  email?: string;
  siteCount: number;
}

interface ReclaimFromCoordinatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mmpId: string;
  mmpName: string;
  siteCount?: number;
  coordinatorName?: string;
  onReclaimComplete?: () => void;
}

export const ReclaimFromCoordinatorDialog: React.FC<ReclaimFromCoordinatorDialogProps> = ({
  open,
  onOpenChange,
  mmpId,
  mmpName,
  siteCount = 0,
  coordinatorName,
  onReclaimComplete,
}) => {
  const [selectedReason, setSelectedReason] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedCoordinator, setSelectedCoordinator] = useState('all');
  const [coordinators, setCoordinators] = useState<CoordinatorInfo[]>([]);
  const [loadingCoordinators, setLoadingCoordinators] = useState(false);
  const { toast } = useToast();
  const { currentUser, users } = useAppContext();
  const { refreshMMPFiles } = useMMP();

  useEffect(() => {
    if (!open || !mmpId) return;
    loadCoordinators();
  }, [open, mmpId]);

  const loadCoordinators = async () => {
    setLoadingCoordinators(true);
    try {
      const { data: entries, error } = await supabase
        .from('mmp_site_entries')
        .select('forwarded_to_user_id, accepted_by, additional_data')
        .eq('mmp_file_id', mmpId);

      if (error) throw error;

      const coordMap = new Map<string, number>();
      (entries || []).forEach((entry: any) => {
        const coordId = entry.forwarded_to_user_id || entry.accepted_by || entry.additional_data?.assigned_to;
        if (coordId) {
          coordMap.set(coordId, (coordMap.get(coordId) || 0) + 1);
        }
      });

      const coordList: CoordinatorInfo[] = [];
      for (const [coordId, count] of coordMap) {
        const userInfo = (users || []).find((u: any) => u.id === coordId);
        coordList.push({
          id: coordId,
          name: userInfo?.fullName || (userInfo as any)?.full_name || userInfo?.username || userInfo?.email || coordId.slice(0, 8) + '...',
          email: userInfo?.email,
          siteCount: count,
        });
      }

      coordList.sort((a, b) => a.name.localeCompare(b.name));
      setCoordinators(coordList);
    } catch (err) {
      console.error('[Reclaim] Failed to load coordinators:', err);
    } finally {
      setLoadingCoordinators(false);
    }
  };

  const handleClose = () => {
    setSelectedReason('');
    setAdditionalNotes('');
    setConfirmed(false);
    setLoading(false);
    setSelectedCoordinator('all');
    onOpenChange(false);
  };

  const selectedReasonObj = RECLAIM_REASONS.find(r => r.value === selectedReason);
  const reasonText = selectedReasonObj ? selectedReasonObj.labelEn : '';

  const selectedCoordInfo = useMemo(() => {
    if (selectedCoordinator === 'all') return null;
    return coordinators.find(c => c.id === selectedCoordinator);
  }, [selectedCoordinator, coordinators]);

  const affectedSiteCount = selectedCoordinator === 'all'
    ? siteCount
    : (selectedCoordInfo?.siteCount || 0);

  const handleReclaim = async () => {
    if (!selectedReason || !confirmed) return;

    setLoading(true);
    try {
      const coordinatorId = selectedCoordinator === 'all' ? undefined : selectedCoordinator;

      const result = await reclaimFromCoordinator({
        mmpId,
        reason: reasonText + (additionalNotes ? ` - ${additionalNotes}` : ''),
        reasonCategory: selectedReason,
        currentUserId: currentUser?.id || '',
        additionalNotes,
        coordinatorId,
      });

      const targetName = selectedCoordInfo?.name || coordinatorName || 'all coordinators';
      const actualNewStatus = result?.newStatus || (coordinatorId ? 'forwarded_to_coordinator' : 'forwarded_to_fom');

      await logMMPAudit({
        mmpId,
        mmpName,
        action: 'reclaim_from_coordinator',
        performedBy: currentUser?.id || '',
        performedByEmail: currentUser?.email || '',
        performedByName: (currentUser as any)?.fullName || currentUser?.username || '',
        previousStatus: 'forwarded_to_coordinator',
        newStatus: actualNewStatus,
        reason: `${selectedReasonObj?.labelEn} - ${selectedReasonObj?.labelAr}${additionalNotes ? `: ${additionalNotes}` : ''}`,
        affectedSites: result?.affectedSites || 0,
        metadata: {
          reasonCategory: selectedReason,
          reasonEn: selectedReasonObj?.labelEn,
          reasonAr: selectedReasonObj?.labelAr,
          additionalNotes,
          coordinatorName: targetName,
          coordinatorId: coordinatorId || 'all',
        },
      });

      const notificationTargets = coordinatorId
        ? (users || []).filter((u: any) => u.id === coordinatorId || u.role?.toLowerCase() === 'fom')
        : (users || []).filter((u: any) => u.role?.toLowerCase() === 'coordinator' || u.role?.toLowerCase() === 'fom');

      if (notificationTargets.length > 0) {
        const notifications = notificationTargets.map((user: any) => ({
          recipient_id: user.id,
          title_en: `MMP Reclaimed: ${mmpName}`,
          title_ar: `تم استرجاع خطة المراقبة: ${mmpName}`,
          message_en: coordinatorId
            ? `Sites assigned to ${targetName} in MMP "${mmpName}" have been reclaimed. Reason: ${selectedReasonObj?.labelEn}${additionalNotes ? ` - ${additionalNotes}` : ''}`
            : `MMP "${mmpName}" has been reclaimed from all coordinators. Reason: ${selectedReasonObj?.labelEn}${additionalNotes ? ` - ${additionalNotes}` : ''}`,
          message_ar: coordinatorId
            ? `تم استرجاع المواقع المعينة لـ ${targetName} في خطة المراقبة "${mmpName}". السبب: ${selectedReasonObj?.labelAr}${additionalNotes ? ` - ${additionalNotes}` : ''}`
            : `تم استرجاع خطة المراقبة "${mmpName}" من جميع المنسقين. السبب: ${selectedReasonObj?.labelAr}${additionalNotes ? ` - ${additionalNotes}` : ''}`,
          event_type: 'mmp_reclaim',
          entity_id: mmpId,
          entity_type: 'mmp',
          action_url: `/mmp/${mmpId}`,
          priority: 'high',
        }));

        try {
          await insertNotifications(notifications);
        } catch (notifError) {
          console.warn('[Reclaim] Notification insertion failed:', notifError);
        }
      }

      await refreshMMPFiles();

      toast({
        title: 'MMP Reclaimed Successfully',
        description: coordinatorId
          ? `${result?.affectedSites || 0} site(s) from ${targetName} have been reclaimed and reset to verified status.`
          : `"${mmpName}" has been reclaimed from all coordinators. ${result?.affectedSites || 0} site(s) have been reset to verified status.`,
      });

      handleClose();
      onReclaimComplete?.();
    } catch (error: any) {
      console.error('[Reclaim] Failed:', error);
      toast({
        title: 'Reclaim Failed',
        description: error.message || 'Failed to reclaim MMP from coordinators.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const isReclaimAll = selectedCoordinator === 'all';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[520px]" data-testid="dialog-reclaim-coordinator">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-500" />
            Reclaim MMP from Coordinators
          </DialogTitle>
          <DialogDescription>
            Return sites back to FOM management. You can reclaim from a specific coordinator or all at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-2 p-3 rounded-md bg-muted/50">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{mmpName}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="secondary">
                  <MapPin className="h-3 w-3 mr-1" />
                  {affectedSiteCount} site(s) affected
                </Badge>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reclaim-coordinator">Reclaim From <span className="text-destructive">*</span></Label>
            <Select value={selectedCoordinator} onValueChange={(v) => { setSelectedCoordinator(v); setConfirmed(false); }}>
              <SelectTrigger id="reclaim-coordinator" data-testid="select-reclaim-coordinator">
                <SelectValue placeholder="Select coordinator..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-coordinator-all">
                  <span className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    All Coordinators ({siteCount} sites)
                  </span>
                </SelectItem>
                {loadingCoordinators ? (
                  <SelectItem value="_loading" disabled>
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading coordinators...
                    </span>
                  </SelectItem>
                ) : (
                  coordinators.map((coord) => (
                    <SelectItem key={coord.id} value={coord.id} data-testid={`option-coordinator-${coord.id}`}>
                      <span className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5" />
                        {coord.name} ({coord.siteCount} sites)
                      </span>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reclaim-reason">Reason for Reclaim <span className="text-destructive">*</span></Label>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger id="reclaim-reason" data-testid="select-reclaim-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {RECLAIM_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value} data-testid={`option-reason-${reason.value}`}>
                    <span>{reason.labelEn}</span>
                    <span className="text-muted-foreground ml-2 text-xs">({reason.labelAr})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="additional-notes">Additional Notes (Optional)</Label>
            <Textarea
              id="additional-notes"
              placeholder="Add any additional details about why this MMP is being reclaimed..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="textarea-reclaim-notes"
            />
          </div>

          <Alert variant="destructive" className="border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <AlertDescription className="text-orange-800 dark:text-orange-200">
              This action will:
              <ul className="list-disc ml-4 mt-1 space-y-0.5 text-sm">
                {isReclaimAll ? (
                  <>
                    <li>Return the MMP status back to "Forwarded to FOM"</li>
                    <li>Reset all coordinator site assignments to "Verified"</li>
                    <li>Notify all relevant coordinators and FOMs</li>
                  </>
                ) : (
                  <>
                    <li>Reset {selectedCoordInfo?.name}'s {selectedCoordInfo?.siteCount || 0} site assignment(s) to "Verified"</li>
                    <li>Other coordinators' assignments will remain unchanged</li>
                    <li>Notify the affected coordinator and FOMs</li>
                  </>
                )}
                <li>Record this action in the audit log</li>
              </ul>
            </AlertDescription>
          </Alert>

          {selectedReason && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="confirm-reclaim"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                data-testid="checkbox-confirm-reclaim"
              />
              <Label htmlFor="confirm-reclaim" className="text-sm cursor-pointer">
                {isReclaimAll
                  ? 'I confirm I want to reclaim this MMP from all coordinators'
                  : `I confirm I want to reclaim sites from ${selectedCoordInfo?.name || 'this coordinator'}`
                }
              </Label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={loading} data-testid="button-cancel-reclaim">
            Cancel
          </Button>
          <Button
            onClick={handleReclaim}
            disabled={!selectedReason || !confirmed || loading}
            className="bg-orange-500 hover:bg-orange-600 text-white"
            data-testid="button-confirm-reclaim"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Reclaiming...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                {isReclaimAll ? 'Reclaim All' : 'Reclaim from Coordinator'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
