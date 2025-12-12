import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useMMP } from '@/context/mmp/MMPContext';
import { useAppContext } from '@/context/AppContext';
import { fetchCoordinatorUsers, insertNotifications, forwardSitesToCoordinator } from '@/services/mmpActions';

interface ForwardToCoordinatorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mmpId?: string;
  mmpName?: string;
  siteIds?: string[];
  siteNames?: string[];
  siteGroups?: Array<{
    stateId: string;
    localityId: string;
    stateName: string;
    localityName: string;
    sites: Array<{
      id: string;
      siteName: string;
      siteCode?: string;
    }>;
  }>;
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
  siteIds,
  siteNames,
  siteGroups,
  onForwarded
}) => {
  const [loading, setLoading] = React.useState(false);
  const [coordinators, setCoordinators] = React.useState<CoordinatorUser[]>([]);
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { currentUser } = useAppContext();
  const { refreshMMPFiles } = useMMP();

  // For grouped sites, track selections per group
  const [groupSelections, setGroupSelections] = React.useState<Record<string, Set<string>>>({});

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const data = await fetchCoordinatorUsers();
        if (!cancelled) setCoordinators(data as CoordinatorUser[]);
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
    if (!siteGroups || siteGroups.length === 0) {
      // Legacy behavior for non-grouped sites
      if (selected.size === 0) return;
    } else {
      // Check if any group has coordinators selected
      const hasAnySelection = Object.values(groupSelections).some(sel => sel.size > 0);
      if (!hasAnySelection) return;
    }

    setLoading(true);
    try {
      const isSiteForwarding = siteIds && siteIds.length > 0;
      const isGroupedForwarding = siteGroups && siteGroups.length > 0;

      if (isGroupedForwarding) {
        // Forward grouped sites to coordinators
        const now = new Date().toISOString();

        for (const group of siteGroups!) {
          const groupKey = `${group.stateId}|${group.localityId}`;
          const selectedCoordinators = groupSelections[groupKey] || new Set();

          if (selectedCoordinators.size === 0) continue; // Skip groups with no selection

          const coordinatorIds = Array.from(selectedCoordinators);
          const siteIdsInGroup = group.sites.map(s => s.id);
          const siteNamesInGroup = group.sites.map(s => s.siteName || s.siteCode || `Site ${s.id}`);

          // Update each site entry in this group
          for (const siteId of siteIdsInGroup) {
            const { data: row } = await supabase
              .from('mmp_site_entries')
              .select('workflow')
              .eq('id', siteId)
              .single();

            const wf = (row?.workflow as any) || {};
            const list: string[] = Array.isArray(wf.forwardedToCoordinatorIds) ? wf.forwardedToCoordinatorIds : [];
            const unique = Array.from(new Set([...list, ...coordinatorIds]));
            const next = {
              ...wf,
              currentStage: 'awaitingCoordinatorVerification',
              forwardedToCoordinatorIds: unique,
              forwardedToCoordinators: true,
              forwardedAt: now,
              lastUpdated: now,
              locked: true // Lock the site after forwarding
            };
            await supabase.from('mmp_site_entries').update({ workflow: next }).eq('id', siteId);
          }

          // Insert notifications for coordinators in this group
          const rows = coordinatorIds.map(uid => ({
            user_id: uid,
            title: 'Sites forwarded to you',
            message: `${siteNamesInGroup.join(', ')} (${group.stateName}${group.localityName ? ` - ${group.localityName}` : ''}) have been forwarded to you for verification`,
            type: 'info',
            link: `/mmp/${mmpId}`,
            related_entity_id: siteIdsInGroup[0], // Use first site ID as reference
            related_entity_type: 'mmpSiteEntry'
          }));
          const { error: nErr } = await supabase.from('notifications').insert(rows);
          if (nErr) throw nErr;

          // Notify the forwarder
          try {
            const { data: auth } = await supabase.auth.getUser();
            const forwarderId = auth?.user?.id;
            if (forwarderId) {
              await supabase.from('notifications').insert({
                user_id: forwarderId,
                title: 'Sites forwarded',
                message: `You forwarded ${siteNamesInGroup.join(', ')} (${group.stateName}${group.localityName ? ` - ${group.localityName}` : ''}) to ${coordinatorIds.length} Coordinator(s)`,
                type: 'success',
                link: `/mmp/${mmpId}`,
                related_entity_id: siteIdsInGroup[0],
                related_entity_type: 'mmpSiteEntry'
              });
            }
          } catch {}
        }

        toast({ title: 'Sites forwarded', description: `Forwarded sites to coordinators by locality` });
      } else if (isSiteForwarding) {
        // Forward all sites to coordinators (existing logic)
        const now = new Date().toISOString();

        // Update each site entry
        for (const siteId of siteIds!) {
          const { data: row } = await supabase
            .from('mmp_site_entries')
            .select('workflow')
            .eq('id', siteId)
            .single();

          const wf = (row?.workflow as any) || {};
          const list: string[] = Array.isArray(wf.forwardedToCoordinatorIds) ? wf.forwardedToCoordinatorIds : [];
          const unique = Array.from(new Set([...list, ...Array.from(selected)]));
          const next = {
            ...wf,
            currentStage: 'awaitingCoordinatorVerification',
            forwardedToCoordinatorIds: unique,
            forwardedToCoordinators: true,
            forwardedAt: now,
            lastUpdated: now,
            locked: true // Lock the site after forwarding
          };
          await supabase.from('mmp_site_entries').update({ workflow: next }).eq('id', siteId);
        }

        // Insert notifications for each coordinator
        const ids = Array.from(selected);
        const siteNamesStr = siteNames?.join(', ') || 'sites';
        const rows = ids.map(uid => ({
          user_id: uid,
          title: 'Sites forwarded to you',
          message: `${siteNamesStr} have been forwarded to you for verification`,
          type: 'info',
          link: `/mmp/${mmpId}`,
          related_entity_id: siteIds![0], // Use first site ID as reference
          related_entity_type: 'mmpSiteEntry'
        }));
        const { error: nErr } = await supabase.from('notifications').insert(rows);
        if (nErr) throw nErr;

        // Notify the forwarder
        try {
          const { data: auth } = await supabase.auth.getUser();
          const forwarderId = auth?.user?.id;
          if (forwarderId) {
            await supabase.from('notifications').insert({
              user_id: forwarderId,
              title: 'Sites forwarded',
              message: `You forwarded ${siteNamesStr} to ${ids.length} Coordinator(s)`,
              type: 'success',
              link: `/mmp/${mmpId}`,
              related_entity_id: siteIds![0],
              related_entity_type: 'mmpSiteEntry'
            });
          }
        } catch {}

        toast({ title: 'Sites forwarded', description: `Forwarded to ${ids.length} Coordinator(s)` });
      } else if (mmpId) {
        // Forward MMP to coordinators (existing logic)
        // Insert notifications
        const ids = Array.from(selected);
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
      }

      try { onForwarded?.(Array.from(selected)); } catch {}
      onOpenChange(false);
      setSelected(new Set());
      setGroupSelections({});
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
            {siteGroups && siteGroups.length > 0
              ? `Select coordinators for each locality group. Sites will be forwarded to coordinators based on their assigned localities.`
              : siteIds && siteIds.length > 0
              ? `Select one or more Coordinators to forward the selected sites. They will get a notification to review and verify the sites.`
              : `Select one or more Coordinators to forward this MMP. They will get a notification to review and verify the sites.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {siteGroups && siteGroups.length > 0 ? (
            // Grouped sites view
            <div className="max-h-96 overflow-auto space-y-4">
              {siteGroups.map((group) => {
                const groupKey = `${group.stateId}|${group.localityId}`;
                const selectedForGroup = groupSelections[groupKey] || new Set();
                const filteredCoordinators = coordinators.filter(c =>
                  (c.state_id === group.stateId) &&
                  (!group.localityId || c.locality_id === group.localityId)
                );

                return (
                  <Card key={groupKey} className="p-4">
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-sm">
                          {group.stateName}{group.localityName ? ` - ${group.localityName}` : ''}
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          {group.sites.length} site{group.sites.length !== 1 ? 's' : ''}: {group.sites.map(s => s.siteName || s.siteCode || s.id).join(', ')}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Select Coordinators:</label>
                        <div className="max-h-32 overflow-auto border rounded p-2 space-y-1">
                          {filteredCoordinators.length > 0 ? (
                            filteredCoordinators.map(c => (
                              <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={selectedForGroup.has(c.id)}
                                  onCheckedChange={(checked) => {
                                    setGroupSelections(prev => {
                                      const next = { ...prev };
                                      const groupSel = new Set(next[groupKey] || []);
                                      if (checked) {
                                        groupSel.add(c.id);
                                      } else {
                                        groupSel.delete(c.id);
                                      }
                                      next[groupKey] = groupSel;
                                      return next;
                                    });
                                  }}
                                />
                                <div>
                                  <span className="font-medium">{c.full_name || c.username || c.email || c.id}</span>
                                  {c.email && <span className="text-muted-foreground ml-1">({c.email})</span>}
                                </div>
                              </label>
                            ))
                          ) : (
                            <div className="text-sm text-muted-foreground p-2">
                              No coordinators assigned to this locality
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            // Single selection view (for non-grouped sites or MMP)
            <>
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
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button 
            onClick={handleForward} 
            disabled={loading || (
              (!siteGroups || siteGroups.length === 0) 
                ? selected.size === 0 
                : Object.values(groupSelections).every(sel => sel.size === 0)
            )}
          >
            {loading ? 'Forwarding…' : 'Forward'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ForwardToCoordinatorsDialog;