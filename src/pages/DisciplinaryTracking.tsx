import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, Plus, Loader2, Edit2, Trash2, ShieldAlert, Lock, FileDown } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { exportToExcel } from '@/utils/report-export';
import { PageLoader } from '@/components/ui/page-loader';

interface Case {
  id: string; user_id: string; case_type: 'disciplinary' | 'grievance'; category: string | null;
  severity: 'low' | 'medium' | 'high' | 'critical'; description: string;
  status: 'open' | 'investigating' | 'resolved' | 'closed';
  incident_date: string; raised_by: string | null; assigned_to: string | null;
  resolution_notes: string | null; resolved_at: string | null; confidential: boolean;
}
interface Profile { id: string; full_name: string; }

const SEVERITY_CFG: Record<Case['severity'], string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40',
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/40',
};
const STATUS_CFG: Record<Case['status'], string> = {
  open: 'border-red-300 text-red-700', investigating: 'border-amber-300 text-amber-700',
  resolved: 'border-emerald-300 text-emerald-700', closed: 'border-gray-300 text-gray-500',
};

const BLANK = {
  user_id: '', case_type: 'disciplinary' as Case['case_type'], category: '', severity: 'low' as Case['severity'],
  description: '', status: 'open' as Case['status'], incident_date: format(new Date(), 'yyyy-MM-dd'),
  assigned_to: '', resolution_notes: '', confidential: true,
};

export default function DisciplinaryTracking() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const isHr = hasAnyRole(['super_admin', 'admin', 'hr', 'hr_manager']);

  const [cases, setCases] = useState<Case[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editing, setEditing] = useState<Case | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [missingTable, setMissingTable] = useState(false);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [caseRes, profRes] = await Promise.all([
      supabase.from('hr_disciplinary_cases' as any).select('*').order('incident_date', { ascending: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    if (caseRes.error?.code === '42P01') { setMissingTable(true); setLoading(false); return; }
    if (caseRes.error?.code === '42501' || caseRes.error?.message?.toLowerCase().includes('permission')) { setForbidden(true); setLoading(false); return; }
    if (caseRes.data) setCases(caseRes.data as unknown as Case[]);
    if (profRes.data) setProfiles(profRes.data as Profile[]);
    setLoading(false);
  }

  const filtered = useMemo(() => cases.filter(c =>
    (typeFilter === 'all' || c.case_type === typeFilter) && (statusFilter === 'all' || c.status === statusFilter)
  ), [cases, typeFilter, statusFilter]);

  function nameOf(id: string | null) { return profiles.find(p => p.id === id)?.full_name ?? '—'; }

  function openNew() { setEditing(null); setForm({ ...BLANK }); setDialogOpen(true); }
  function openEdit(c: Case) {
    setEditing(c);
    setForm({
      user_id: c.user_id, case_type: c.case_type, category: c.category ?? '', severity: c.severity,
      description: c.description, status: c.status, incident_date: c.incident_date,
      assigned_to: c.assigned_to ?? '', resolution_notes: c.resolution_notes ?? '', confidential: c.confidential,
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.user_id) { toast({ title: 'Select the staff member involved', variant: 'destructive' }); return; }
    if (!form.description.trim()) { toast({ title: 'Description is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      user_id: form.user_id, case_type: form.case_type, category: form.category || null, severity: form.severity,
      description: form.description.trim(), status: form.status, incident_date: form.incident_date,
      assigned_to: form.assigned_to || null, resolution_notes: form.resolution_notes || null,
      confidential: form.confidential, resolved_at: form.status === 'resolved' || form.status === 'closed' ? new Date().toISOString() : null,
    };
    const { error } = editing
      ? await supabase.from('hr_disciplinary_cases' as any).update(payload).eq('id', editing.id)
      : await supabase.from('hr_disciplinary_cases' as any).insert({ ...payload, raised_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Case updated' : 'Case logged' });
    setDialogOpen(false);
    if (payload.assigned_to && payload.assigned_to !== editing?.assigned_to) {
      try {
        await NotificationTriggerService.send({
          userId: payload.assigned_to,
          title: payload.case_type === 'grievance' ? 'Grievance Case Assigned' : 'Disciplinary Case Assigned',
          message: `A ${payload.severity} severity ${payload.case_type} case has been assigned to you for review.`,
          type: 'warning',
          category: 'approvals',
          priority: payload.severity === 'critical' || payload.severity === 'high' ? 'urgent' : 'high',
          link: '/disciplinary-tracking',
        });
      } catch (e) { console.warn('[Disciplinary] assignment notification failed:', e); }
    }
    fetchAll();
  }

  function handleExport() {
    const rows = cases.map(c => ({
      'Staff Member': nameOf(c.user_id),
      Type: c.case_type,
      Category: c.category ?? '',
      Severity: c.severity,
      Status: c.status,
      'Incident Date': c.incident_date,
      'Assigned To': nameOf(c.assigned_to),
      Description: c.description,
      'Resolution Notes': c.resolution_notes ?? '',
    }));
    exportToExcel(rows, 'Cases', `Disciplinary_Cases_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  async function remove(c: Case) {
    if (!confirm('Delete this case record? This cannot be undone.')) return;
    const { error } = await supabase.from('hr_disciplinary_cases' as any).delete().eq('id', c.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Case deleted' }); fetchAll(); }
  }

  if (!isHr) {
    return (
      <Card className="border-dashed"><CardContent className="py-16 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Lock className="h-5 w-5" />Disciplinary & grievance records are restricted to HR and admin roles.
      </CardContent></Card>
    );
  }
  if (loading) return <PageLoader compact />;
  if (missingTable) {
    return (
      <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="py-10 text-center text-sm text-amber-700 dark:text-amber-400">
          Apply <code className="font-mono text-xs">supabase/migrations/20260705_hr_recruitment_disciplinary_benefits_headcount.sql</code> to enable Disciplinary & Grievance Tracking.
        </CardContent>
      </Card>
    );
  }
  if (forbidden) return <Card className="border-dashed"><CardContent className="py-16 text-center text-sm text-muted-foreground">You don't have access to view these records.</CardContent></Card>;

  return (
    <div className="space-y-4" data-testid="page-disciplinary">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All types</SelectItem><SelectItem value="disciplinary">Disciplinary</SelectItem><SelectItem value="grievance">Grievance</SelectItem></SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem><SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} data-testid="button-export-cases"><FileDown className="h-4 w-4 mr-1" />Export</Button>
          <Button onClick={openNew} data-testid="button-new-case"><Plus className="h-4 w-4 mr-1" />Log Case</Button>
        </div>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground py-10 text-center">No cases match these filters.</p>}
        {filtered.map(c => (
          <Card key={c.id} data-testid={`row-case-${c.id}`}>
            <CardContent className="py-3 px-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {c.case_type === 'disciplinary' ? <ShieldAlert className="h-4 w-4 text-red-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                  <p className="font-medium text-sm">{nameOf(c.user_id)}</p>
                  <Badge className={cn('text-xs', SEVERITY_CFG[c.severity])}>{c.severity}</Badge>
                  <Badge variant="outline" className={cn('text-xs', STATUS_CFG[c.status])}>{c.status}</Badge>
                  {c.confidential && <Badge variant="outline" className="text-xs"><Lock className="h-3 w-3 mr-1" />Confidential</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{c.category || (c.case_type === 'disciplinary' ? 'Disciplinary' : 'Grievance')} · Incident {format(new Date(c.incident_date), 'MMM d, yyyy')} · Assigned to {nameOf(c.assigned_to)}</p>
                <p className="text-sm mt-2">{c.description}</p>
                {c.resolution_notes && <p className="text-xs text-muted-foreground mt-2 border-t pt-2">Resolution: {c.resolution_notes}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(c)} data-testid={`button-edit-case-${c.id}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => remove(c)} data-testid={`button-delete-case-${c.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Case' : 'Log New Case'}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div>
              <Label>Staff Member</Label>
              <Select value={form.user_id} onValueChange={v => setForm(f => ({ ...f, user_id: v }))}>
                <SelectTrigger data-testid="select-case-user"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.case_type} onValueChange={v => setForm(f => ({ ...f, case_type: v as Case['case_type'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="disciplinary">Disciplinary</SelectItem><SelectItem value="grievance">Grievance</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v as Case['severity'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem><SelectItem value="critical">Critical</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Category</Label><Input placeholder="Attendance, conduct, harassment..." value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></div>
            <div><Label>Incident Date</Label><Input type="date" value={form.incident_date} onChange={e => setForm(f => ({ ...f, incident_date: e.target.value }))} /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} data-testid="input-case-description" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as Case['status'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="open">Open</SelectItem><SelectItem value="investigating">Investigating</SelectItem><SelectItem value="resolved">Resolved</SelectItem><SelectItem value="closed">Closed</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Assigned To</Label>
                <Select value={form.assigned_to} onValueChange={v => setForm(f => ({ ...f, assigned_to: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Resolution Notes</Label><Textarea rows={2} value={form.resolution_notes} onChange={e => setForm(f => ({ ...f, resolution_notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={save} disabled={saving} data-testid="button-save-case">{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
