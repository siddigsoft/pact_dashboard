import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, CalendarDays, Loader2, Plus, Radio, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Assignment = {
  id?: string;
  assignment_id?: string;
  profile_id?: string;
  official_name?: string;
  official_role?: string;
  role?: string;
  role_scope?: string;
  raw_device_id?: string;
  normalized_device_id?: string;
  device_id?: string;
  status?: string;
  valid_from?: string;
  valid_to?: string | null;
  reason?: string;
};

type Props = {
  profileId: string;
  profileName?: string;
  profileRole?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
};

const roleOptions = [
  { value: 'collector', label: 'Data Collector' },
  { value: 'coordinator', label: 'Coordinator' },
];
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Present';
const normalizedRole = (value?: string) => (value || '').toLowerCase().replace(/[\s_-]/g, '');

export function FieldDeviceAssignments({ profileId, profileName, profileRole, open, onOpenChange, canManage }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [role, setRole] = useState(roleOptions[0].value);
  const [reason, setReason] = useState('');
  const [retireTarget, setRetireTarget] = useState<Assignment | null>(null);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('admin_list_field_device_assignments', { p_profile: profileId });
    if (rpcError) setError(rpcError.message || 'Could not load device assignments.');
    else setAssignments(Array.isArray(data) ? data as Assignment[] : []);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const current = useMemo(() => assignments.filter(a => (a.status || '').toLowerCase() === 'active' || !a.valid_to), [assignments]);
  const history = useMemo(() => assignments.filter(a => !current.includes(a)), [assignments, current]);
  const displayDevice = (a: Assignment) => a.normalized_device_id || a.device_id || '—';

  const assign = async () => {
    if (!canManage || !deviceId.trim() || !reason.trim()) return;
    setWorking(true); setError('');
    const { error: rpcError } = await supabase.rpc('admin_assign_field_device', {
      p_profile: profileId, p_raw_device: deviceId.trim(), p_role_scope: role,
      p_valid_from: new Date().toISOString(), p_reason: reason.trim(),
    });
    if (rpcError) setError(rpcError.message || 'Assignment was rejected.');
    else { setDeviceId(''); setReason(''); await load(); }
    setWorking(false);
  };

  const retire = async () => {
    if (!retireTarget || !reason.trim() || !canManage) return;
    setWorking(true); setError('');
    const { error: rpcError } = await supabase.rpc('admin_retire_field_device_assignment', {
      p_assignment: retireTarget.assignment_id || retireTarget.id,
      p_valid_to: new Date().toISOString(), p_reason: reason.trim(),
    });
    if (rpcError) setError(rpcError.message || 'Assignment could not be retired.');
    else { setRetireTarget(null); setReason(''); await load(); }
    setWorking(false);
  };

  const isRoleTarget = ['datacollector', 'coordinator'].includes(normalizedRole(profileRole));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Field device assignments</DialogTitle>
          <DialogDescription>
            {profileName || 'User'} · {profileRole || 'Unspecified role'}. Device IDs are normalized by the Command Center.
          </DialogDescription>
        </DialogHeader>

        {!isRoleTarget && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Only Data Collector and Coordinator profiles can receive field devices.</div>}
        {error && <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div>}

        <section className="space-y-2">
          <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Current assignments</h3><Badge variant="outline">{current.length} active</Badge></div>
          {loading ? <div className="flex items-center gap-2 rounded-md border p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading assignments</div> :
            current.length === 0 ? <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">No active device assignment.</div> :
            <div className="space-y-2">{current.map((a, index) => <AssignmentRow key={a.assignment_id || a.id || index} assignment={a} canManage={canManage} onRetire={() => { setRetireTarget(a); setReason(''); }} />)}</div>}
        </section>

        {canManage && isRoleTarget && <section className="rounded-lg border bg-muted/20 p-4 space-y-3">
          <div><h3 className="text-sm font-semibold">Assign or replace device</h3><p className="text-xs text-muted-foreground">A new assignment may retire an existing conflicting assignment.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="text-xs font-medium">Raw device ID <span className="text-destructive">*</span></label><Input value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="IMEI, serial, or device identifier" className="mt-1" /></div>
            <div><label className="text-xs font-medium">Assignment role <span className="text-destructive">*</span></label><Select value={role} onValueChange={setRole}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{roleOptions.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div><label className="text-xs font-medium">Reason <span className="text-destructive">*</span></label><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this device being assigned?" className="mt-1 min-h-16" /></div>
          <Button onClick={assign} disabled={working || !deviceId.trim() || !reason.trim()}><Plus className="mr-2 h-4 w-4" />Assign / replace device</Button>
        </section>}

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Assignment history</h3>
          {history.length === 0 ? <p className="text-sm text-muted-foreground">No retired assignments.</p> :
            <div className="divide-y rounded-md border">{history.map((a, index) => <AssignmentRow key={a.assignment_id || a.id || index} assignment={a} canManage={false} />)}</div>}
        </section>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter>

        <Dialog open={!!retireTarget} onOpenChange={value => !value && setRetireTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Retire device assignment</DialogTitle><DialogDescription>This ends the current assignment immediately. A reason is required for the audit history.</DialogDescription></DialogHeader>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for retiring this assignment" />
            <DialogFooter><Button variant="outline" onClick={() => setRetireTarget(null)}>Cancel</Button><Button variant="destructive" onClick={retire} disabled={working || !reason.trim()}><RotateCcw className="mr-2 h-4 w-4" />Retire assignment</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentRow({ assignment, canManage, onRetire }: { assignment: Assignment; canManage: boolean; onRetire?: () => void }) {
  const active = !assignment.valid_to && (assignment.status || 'active').toLowerCase() === 'active';
  return <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm font-semibold">{assignment.normalized_device_id || assignment.device_id || '—'}</span><Badge variant={active ? 'default' : 'secondary'}>{active ? 'Active' : 'Retired'}</Badge><Badge variant="outline">{assignment.role_scope || assignment.role || '—'}</Badge></div>
      {assignment.raw_device_id && assignment.raw_device_id !== (assignment.normalized_device_id || assignment.device_id) && <p className="text-xs text-muted-foreground">Raw ID: <span className="font-mono">{assignment.raw_device_id}</span></p>}
      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{dateLabel(assignment.valid_from)} — {dateLabel(assignment.valid_to)}</span>{assignment.official_name && <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />{assignment.official_name}{assignment.official_role && ` · ${assignment.official_role}`}</span>}</p>
    </div>
    {canManage && active && <Button variant="outline" size="sm" onClick={onRetire}><X className="mr-1.5 h-3.5 w-3.5" />Retire</Button>}
  </div>;
}