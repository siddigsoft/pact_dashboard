import React, { useEffect, useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface BulkClearForwardedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface MMPRow {
  id: string;
  name?: string;
  workflow?: any;
}

export const BulkClearForwardedDialog: React.FC<BulkClearForwardedDialogProps> = ({ open, onOpenChange }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [mmpRows, setMmpRows] = useState<MMPRow[]>([]);
  const [siteVisitCounts, setSiteVisitCounts] = useState<Record<string, number>>({});
  const [includeSiteVisitDeletion, setIncludeSiteVisitDeletion] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [clearing, setClearing] = useState(false);

  // Load forwarded MMPs when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('mmp_files')
          .select('id,name,workflow');
        if (error) throw error;
        if (cancelled) return;
        const forwarded = (data || []).filter((r: any) => {
          const wf = (r.workflow || {}) as any;
          const hasFom = Array.isArray(wf.forwardedToFomIds) && wf.forwardedToFomIds.length > 0;
          const hasCoord = wf.forwardedToCoordinators === true || (Array.isArray(wf.forwardedToCoordinatorIds) && wf.forwardedToCoordinatorIds.length > 0);
          return hasFom || hasCoord;
        });
        setMmpRows(forwarded as MMPRow[]);
        const ids = forwarded.map((r: any) => r.id);
        if (ids.length) {
          const { data: visits, error: vErr } = await supabase
            .from('site_visits')
            .select('id,mmp_id')
            .in('mmp_id', ids);
          if (vErr) throw vErr;
          const counts: Record<string, number> = {};
          for (const v of (visits || []) as any[]) {
            counts[v.mmp_id] = (counts[v.mmp_id] || 0) + 1;
          }
          setSiteVisitCounts(counts);
        } else {
          setSiteVisitCounts({});
        }
      } catch (e: any) {
        console.error('Bulk clear load failed', e);
        toast({ title: 'Load failed', description: e.message || 'Unable to load forwarded items', variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open, toast]);

  const totalSiteVisits = useMemo(() => Object.values(siteVisitCounts).reduce((a, b) => a + b, 0), [siteVisitCounts]);

  const handleClear = async () => {
    if (confirmText.trim().toUpperCase() !== 'CLEAR') return;
    setClearing(true);
    try {
      // Get admin id for notification
      let adminId: string | undefined;
      try {
        const { data: auth } = await supabase.auth.getUser();
        adminId = auth?.user?.id;
      } catch {}

      // Update workflows
      for (const mmp of mmpRows) {
        const wf = (mmp.workflow || {}) as any;
        const now = new Date().toISOString();
        const next = {
          ...wf,
          forwardedToFomIds: [],
          forwardedToCoordinatorIds: [],
          forwardedToCoordinators: false,
          coordinatorVerified: false,
          clearedForwardingAt: now,
        };
        // Do not forcibly reset currentStage unless it is explicitly a forwarding stage
        if (['awaitingPermits','awaitingCoordinatorVerification','coordinatorReview'].includes(String(wf.currentStage))) {
          next.currentStage = 'draft';
        }
        await supabase.from('mmp_files').update({ workflow: next }).eq('id', mmp.id);
      }

      // Delete site visits if opted in
      if (includeSiteVisitDeletion && mmpRows.length) {
        const ids = mmpRows.map(r => r.id);
        await supabase.from('site_visits').delete().in('mmp_id', ids);
      }

      // Notification summary
      if (adminId) {
        await supabase.from('notifications').insert({
          user_id: adminId,
          title: 'Forwarded sites cleared',
          message: `Cleared ${mmpRows.length} MMP(s); removed ${includeSiteVisitDeletion ? totalSiteVisits : 0} site visit record(s).`,
          type: 'info',
          related_entity_type: 'mmpFile',
        });
      }

      toast({
        title: 'Forwarded sites cleared',
        description: `Reset ${mmpRows.length} MMP(s); deleted ${includeSiteVisitDeletion ? totalSiteVisits : 0} site visit(s).`,
      });
      onOpenChange(false);
      setConfirmText('');
    } catch (e: any) {
      console.error('Bulk clear failed', e);
      toast({ title: 'Clear failed', description: e.message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Clear Forwarded Sites</DialogTitle>
          <DialogDescription>
            This action will remove forwarding flags (FOM & Coordinator) from all MMPs currently forwarded. Optionally delete their site visit records. Type CLEAR to confirm.
          </DialogDescription>
        </DialogHeader>

        {loading && <div className="text-sm text-muted-foreground">Loading forwarded MMP data…</div>}
        {!loading && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg border bg-muted/40">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Forwarded MMPs</div>
                <div className="text-2xl font-bold">{mmpRows.length}</div>
              </div>
              <div className="p-3 rounded-lg border bg-muted/40">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Site Visits {includeSiteVisitDeletion ? '(will delete)' : '(retain)'}</div>
                <div className="text-2xl font-bold">{totalSiteVisits}</div>
              </div>
            </div>

            <div className="flex items-center justify-between border rounded-md p-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">Delete site visit records</span>
                <span className="text-xs text-muted-foreground">Uncheck to only reset workflow flags</span>
              </div>
              <Button
                variant={includeSiteVisitDeletion ? 'destructive' : 'outline'}
                onClick={() => setIncludeSiteVisitDeletion(v => !v)}
                className={includeSiteVisitDeletion ? 'bg-red-600 hover:bg-red-700 text-white' : ''}
              >
                {includeSiteVisitDeletion ? 'Will Delete' : 'Keep Records'}
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Type CLEAR to confirm</label>
              <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="CLEAR" />
            </div>

            <div>
              <div className="text-xs font-semibold mb-1">Affected MMPs ({mmpRows.length})</div>
              <ScrollArea className="h-40 border rounded-md p-2">
                {mmpRows.length === 0 && <div className="text-xs text-muted-foreground">No forwarded MMPs found.</div>}
                {mmpRows.map(m => {
                  const wf = (m.workflow || {}) as any;
                  const fomCount = Array.isArray(wf.forwardedToFomIds) ? wf.forwardedToFomIds.length : 0;
                  const coordCount = Array.isArray(wf.forwardedToCoordinatorIds) ? wf.forwardedToCoordinatorIds.length : 0;
                  return (
                    <div key={m.id} className="flex items-center justify-between text-xs py-1 border-b last:border-none">
                      <span className="truncate max-w-[12rem]" title={m.name || m.id}>{m.name || m.id}</span>
                      <div className="flex items-center gap-1">
                        {fomCount > 0 && <Badge variant="secondary" className="text-[10px]">FOM: {fomCount}</Badge>}
                        {coordCount > 0 && <Badge variant="secondary" className="text-[10px]">Coord: {coordCount}</Badge>}
                        {siteVisitCounts[m.id] && <Badge variant="outline" className="text-[10px]">Sites: {siteVisitCounts[m.id]}</Badge>}
                      </div>
                    </div>
                  );
                })}
              </ScrollArea>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={clearing || loading}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={clearing || loading || confirmText.trim().toUpperCase() !== 'CLEAR' || mmpRows.length === 0}
            onClick={handleClear}
          >
            {clearing ? 'Clearing…' : 'Confirm Clear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkClearForwardedDialog;
