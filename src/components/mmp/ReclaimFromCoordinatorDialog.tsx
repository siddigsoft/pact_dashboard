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
      // Try the SECURITY DEFINER RPC first — bypasses RLS so all coordinators
      // across every state/locality are returned. Falls back to a direct query
      // (which may miss some rows due to RLS) if the RPC isn't deployed yet.
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_mmp_coordinators', { p_mmp_file_id: mmpId });

      if (!rpcError && rpcData) {
        const coordList: CoordinatorInfo[] = rpcData.map((row: any) => ({
          id: row.coordinator_id,
          name: row.full_name || row.username || row.email || `Unknown (${String(row.coordinator_id).slice(0, 8)}...)`,
          email: row.email,
          siteCount: Number(row.site_count),
        }));
        setCoordinators(coordList);
        return;
      }

      // --- Fallback: direct query (partial results due to RLS) ---
      console.warn('[Reclaim] RPC unavailable, falling back to direct query:', rpcError?.message);
      const { data: entries } = await supabase
        .from('mmp_site_entries')
        .select('forwarded_to_user_id, accepted_by, additional_data')
        .eq('mmp_file_id', mmpId)
        .limit(5000);

      const coordMap = new Map<string, number>();
      (entries || []).forEach((entry: any) => {
        // Mirror the same priority used in mmpActions: forwarded_to_user_id → additional_data.assigned_to → accepted_by
        const coordId =
          entry.forwarded_to_user_id ||
          entry.additional_data?.assigned_to ||
          (entry.accepted_by && entry.accepted_by.match(/^[0-9a-f-]{36}$/i) ? entry.accepted_by : null);
        if (coordId) coordMap.set(coordId, (coordMap.get(coordId) || 0) + 1);
      });

      if (coordMap.size === 0) { setCoordinators([]); return; }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, username')
        .in('id', [...coordMap.keys()]);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
      const fallbackList: CoordinatorInfo[] = [...coordMap.entries()].map(([coordId, count]) => {
        const p = profileMap.get(coordId);
        return {
          id: coordId,
          name: p?.full_name || p?.username || p?.email || `Unknown (${coordId.slice(0, 8)}...)`,
          email: p?.email,
          siteCount: count,
        };
      });
      fallbackList.sort((a, b) => a.name.localeCompare(b.name));
      setCoordinators(fallbackList);
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
      <DialogContent className="sm:max-w-[500px] p-0 gap-0" data-testid="dialog-reclaim-coordinator">
        <DialogHeader className="px-5 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-orange-500" />
            Reclaim MMP from Coordinators
          </DialogTitle>
          <DialogDescription className="text-xs">
            Return sites back to FOM management.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-5 py-2 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <p className="text-sm font-medium truncate">{mmpName}</p>
            <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">
              <MapPin className="h-3 w-3 mr-1" />
              {affectedSiteCount} sites
            </Badge>
          </div>

          <div className="space-y-1">
            <Label htmlFor="reclaim-coordinator" className="text-xs">Reclaim From <span className="text-destructive">*</span></Label>
            <Select value={selectedCoordinator} onValueChange={(v) => { setSelectedCoordinator(v); setConfirmed(false); }}>
              <SelectTrigger id="reclaim-coordinator" className="h-9" data-testid="select-reclaim-coordinator">
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
                      Loading...
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

          <div className="space-y-1">
            <Label htmlFor="reclaim-reason" className="text-xs">Reason for Reclaim <span className="text-destructive">*</span></Label>
            <Select value={selectedReason} onValueChange={setSelectedReason}>
              <SelectTrigger id="reclaim-reason" className="h-9" data-testid="select-reclaim-reason">
                <SelectValue placeholder="Select a reason..." />
              </SelectTrigger>
              <SelectContent>
                {RECLAIM_REASONS.map((reason) => (
                  <SelectItem key={reason.value} value={reason.value} data-testid={`option-reason-${reason.value}`}>
                    <span>{reason.labelEn}</span>
                    <span className="text-muted-foreground ml-1 text-xs">({reason.labelAr})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="additional-notes" className="text-xs">Additional Notes (Optional)</Label>
            <Textarea
              id="additional-notes"
              placeholder="Additional details..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              className="resize-none text-sm"
              rows={2}
              data-testid="textarea-reclaim-notes"
            />
          </div>

          <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 p-2.5 text-xs text-orange-800 dark:text-orange-200">
            <div className="flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">This action will:</p>
                <ul className="list-disc ml-3 space-y-0">
                  {isReclaimAll ? (
                    <>
                      <li>Return MMP status to "Forwarded to FOM"</li>
                      <li>Reset all coordinator assignments to "Verified"</li>
                      <li>Notify coordinators and FOMs</li>
                    </>
                  ) : (
                    <>
                      <li>Reset {selectedCoordInfo?.name}'s {selectedCoordInfo?.siteCount || 0} assignment(s) to "Verified"</li>
                      <li>Other coordinators unchanged</li>
                      <li>Notify affected coordinator and FOMs</li>
                    </>
                  )}
                  <li>Record in audit log</li>
                </ul>
              </div>
            </div>
          </div>

          {selectedReason && (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="confirm-reclaim"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 mt-0.5"
                data-testid="checkbox-confirm-reclaim"
              />
              <Label htmlFor="confirm-reclaim" className="text-xs cursor-pointer leading-tight">
                {isReclaimAll
                  ? 'I confirm I want to reclaim this MMP from all coordinators'
                  : `I confirm I want to reclaim sites from ${selectedCoordInfo?.name || 'this coordinator'}`
                }
              </Label>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 px-5 py-3 border-t">
          <Button variant="outline" size="sm" onClick={handleClose} disabled={loading} data-testid="button-cancel-reclaim">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleReclaim}
            disabled={!selectedReason || !confirmed || loading}
            className="bg-orange-500 hover:bg-orange-600 text-white"
            data-testid="button-confirm-reclaim"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Reclaiming...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-1" />
                {isReclaimAll ? 'Reclaim All' : 'Reclaim'}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
