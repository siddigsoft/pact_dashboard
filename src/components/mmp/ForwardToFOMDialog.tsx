import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { appendForwardedToFom, fetchFomUsers, insertNotifications } from '@/services/mmpActions';

interface ForwardToFOMDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mmpId: string;
  mmpName?: string;
  onForwarded?: (userIds: string[]) => void;
}

interface FOMUser {
  id: string;
  full_name?: string | null;
  username?: string | null;
  email?: string | null;
  hub_id?: string | null;
  state_id?: string | null;
  locality_id?: string | null;
}

export const ForwardToFOMDialog: React.FC<ForwardToFOMDialogProps> = ({ open, onOpenChange, mmpId, mmpName, onForwarded }) => {
  const [loading, setLoading] = React.useState(false);
  const [foms, setFoms] = React.useState<FOMUser[]>([]);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { refreshMMPFiles } = useMMP();
  const { currentUser } = useAppContext();

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchFomUsers();
        if (!cancelled) setFoms(data as FOMUser[]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return foms;
    return foms.filter(u =>
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q)
    );
  }, [foms, search]);

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
        message: `${mmpName || 'MMP'} has been forwarded to you for permits attachment`,
        type: 'info',
        link: `/mmp/${mmpId}`,
        related_entity_id: mmpId,
        related_entity_type: 'mmpFile'
      }));
      await insertNotifications(rows);

      // Notify the forwarder themself
      if (currentUser?.id) {
        await insertNotifications([{
          user_id: currentUser.id,
          title: 'MMP forwarded',
          message: `You forwarded ${mmpName || 'MMP'} to ${ids.length} FOM(s)`,
          type: 'success',
          link: `/mmp/${mmpId}`,
          related_entity_id: mmpId,
          related_entity_type: 'mmpFile'
        }]);
      }

      // Update workflow field
      await appendForwardedToFom(mmpId, ids);
      await refreshMMPFiles();

      toast({ title: 'MMP forwarded', description: `Forwarded to ${ids.length} FOM(s)` });
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
          <DialogTitle>Forward to Field Operations Managers</DialogTitle>
          <DialogDescription>
            Select one or more FOMs to forward this MMP. They will get a notification to attach permits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            placeholder="Search by name, username, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="max-h-64 overflow-auto border rounded-md p-2">
            {loading && <div className="text-sm text-muted-foreground p-2">Loading FOMs…</div>}
            {!loading && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground p-2">No FOMs found</div>
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

export default ForwardToFOMDialog;
