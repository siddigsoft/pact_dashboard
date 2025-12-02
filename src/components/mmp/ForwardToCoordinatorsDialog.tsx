import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ForwardToCoordinatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mmpId: string;
  mmpName?: string;
  onForwarded?: (userIds: string[]) => void;
}

interface CoordinatorUser {
  id: string;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
  hub_id?: string | null;
  state_id?: string | null;
  locality_id?: string | null;
}

export const ForwardToCoordinatorsDialog: React.FC<ForwardToCoordinatorsDialogProps> = ({
  open,
  onOpenChange,
  mmpId,
  mmpName,
  onForwarded
}) => {
  const [loading, setLoading] = React.useState(false);
  const [coordinators, setCoordinators] = React.useState<CoordinatorUser[]>([]);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const { toast } = useToast();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, username, email, hub_id, state_id, locality_id')
          .eq('role', 'coordinator')
          .order('full_name', { ascending: true });
        if (!cancelled) {
          if (error) {
            console.error('Failed to load Coordinators', error);
            setCoordinators([]);
          } else {
            setCoordinators(data as any[] as CoordinatorUser[]);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return coordinators;
    return coordinators.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [coordinators, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleForward = async () => {
    if (selected.size === 0) return;
    setLoading(true);
    try {
      const ids = Array.from(selected);
      // Insert notifications
      const rows = ids.map(uid => ({
        user_id: uid,
        title: 'MMP forwarded to you',
        message: `${mmpName || 'MMP'} has been forwarded to you for verification`,
        type: 'info',
        link: `/mmp/${mmpId}`,
        related_entity_id: mmpId,
        related_entity_type: 'mmpFile'
      }));
      const { error: nErr } = await supabase.from('notifications').insert(rows);
      if (nErr) throw nErr;

      // Notify the forwarder themself
      try {
        const { data: auth } = await supabase.auth.getUser();
        const forwarderId = auth?.user?.id;
        if (forwarderId) {
          await supabase.from('notifications').insert({
            user_id: forwarderId,
            title: 'MMP forwarded',
            message: `You forwarded ${mmpName || 'MMP'} to ${ids.length} Coordinator(s)`,
            type: 'success',
            link: `/mmp/${mmpId}`,
            related_entity_id: mmpId,
            related_entity_type: 'mmpFile'
          });
        }
      } catch {}

      // Update workflow field
      const { data: row } = await supabase
        .from('mmp_files')
        .select('workflow')
        .eq('id', mmpId)
        .single();
      const now = new Date().toISOString();
      const wf = (row?.workflow as any) || {};
      const list: string[] = Array.isArray(wf.forwardedToCoordinatorIds) ? wf.forwardedToCoordinatorIds : [];
      const unique = Array.from(new Set([...list, ...ids]));
      const next = {
        ...wf,
        currentStage: 'awaitingCoordinatorVerification',
        forwardedToCoordinatorIds: unique,
        forwardedToCoordinators: true,
        forwardedAt: now,
        lastUpdated: now
      };
      await supabase.from('mmp_files').update({ workflow: next }).eq('id', mmpId);

      toast({ title: 'MMP forwarded', description: `Forwarded to ${ids.length} Coordinator(s)` });
      try { onForwarded?.(ids); } catch {}
      onOpenChange(false);
      setSelected(new Set());
    } catch (e: any) {
      console.error('Forward failed', e);
      toast({ title: 'Forward failed', description: e?.message || 'Unexpected error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Forward to Coordinators</DialogTitle>
          <DialogDescription>
            Select one or more Coordinators to forward this MMP. They will get a notification to review and verify the sites.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search by name, username, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-64 overflow-auto border rounded-md p-2">
            {loading && <div className="text-sm text-muted-foreground p-2">Loading Coordinators…</div>}
            {!loading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground p-2">No Coordinators found</div>
            )}
            {!loading && filtered.map(u => (
              <label key={u.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer">
                <Checkbox checked={selected.has(u.id)} onCheckedChange={() => toggle(u.id)} />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{u.full_name || u.username || u.email || u.id}</span>
                  <span className="text-xs text-muted-foreground">{u.email}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={handleForward} disabled={loading || selected.size === 0}>
            {loading ? 'Forwarding…' : 'Forward'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ForwardToCoordinatorsDialog;