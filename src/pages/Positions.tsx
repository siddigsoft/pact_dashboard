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
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Briefcase, Plus, Edit2, Trash2, Loader2, Search, UserCheck, UserX,
  Pause, ClipboardList, Download, AlertTriangle, Shield, Users,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { exportToExcel } from '@/utils/report-export';

interface Position {
  id: string;
  title: string;
  department_id: string | null;
  reports_to_position: string | null;
  level: string | null;
  employment_type: string;
  current_holder_id: string | null;
  vacancy_status: 'filled' | 'open' | 'frozen' | 'planned';
  opened_at: string | null;
  target_fill_date: string | null;
  monthly_budget: number | null;
  currency: string | null;
  notes: string | null;
  is_critical_role: boolean;
  primary_successor_id: string | null;
  secondary_successor_id: string | null;
  successor_readiness: number | null;
  succession_notes: string | null;
}

interface Profile { id: string; full_name: string; }
interface Dept { id: string; name: string; }

const STATUS_CFG: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
  filled:  { label: 'Filled',  class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40', icon: <UserCheck className="h-3 w-3" /> },
  open:    { label: 'Open',    class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40', icon: <UserX className="h-3 w-3" /> },
  frozen:  { label: 'Frozen',  class: 'bg-gray-100 text-gray-700 dark:bg-gray-800', icon: <Pause className="h-3 w-3" /> },
  planned: { label: 'Planned', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40', icon: <ClipboardList className="h-3 w-3" /> },
};

const READINESS_LABEL = (r: number | null) => {
  if (r == null) return null;
  if (r >= 75) return { label: 'Ready Now', cls: 'text-emerald-700 bg-emerald-100' };
  if (r >= 50) return { label: 'Ready 1yr', cls: 'text-blue-700 bg-blue-100' };
  if (r >= 25) return { label: 'Ready 2-3yr', cls: 'text-amber-700 bg-amber-100' };
  return { label: 'Early Stage', cls: 'text-gray-700 bg-gray-100' };
};

const BLANK = {
  title: '', department_id: '', reports_to_position: '', level: '',
  employment_type: 'full_time', current_holder_id: '',
  vacancy_status: 'open' as Position['vacancy_status'],
  target_fill_date: '', monthly_budget: '', currency: 'USD', notes: '',
  is_critical_role: false, primary_successor_id: '', secondary_successor_id: '',
  successor_readiness: '', succession_notes: '',
};

export default function PositionsPage() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr']);

  const [positions, setPositions] = useState<Position[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');
  const [editing, setEditing] = useState<Position | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [pos, prof, dep] = await Promise.all([
      supabase.from('positions').select('*').order('title'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('departments').select('id, name').order('name'),
    ]);
    if (pos.data) setPositions(pos.data as Position[]);
    if (prof.data) setProfiles(prof.data as Profile[]);
    if (dep.data) setDepts(dep.data as Dept[]);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK });
    setDialogOpen(true);
  }
  function openEdit(p: Position) {
    setEditing(p);
    setForm({
      title: p.title,
      department_id: p.department_id ?? '',
      reports_to_position: p.reports_to_position ?? '',
      level: p.level ?? '',
      employment_type: p.employment_type ?? 'full_time',
      current_holder_id: p.current_holder_id ?? '',
      vacancy_status: p.vacancy_status,
      target_fill_date: p.target_fill_date ?? '',
      monthly_budget: p.monthly_budget != null ? String(p.monthly_budget) : '',
      currency: p.currency ?? 'USD',
      notes: p.notes ?? '',
      is_critical_role: p.is_critical_role ?? false,
      primary_successor_id: p.primary_successor_id ?? '',
      secondary_successor_id: p.secondary_successor_id ?? '',
      successor_readiness: p.successor_readiness != null ? String(p.successor_readiness) : '',
      succession_notes: p.succession_notes ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast({ title: 'Title is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload: any = {
      title: form.title.trim(),
      department_id: form.department_id || null,
      reports_to_position: form.reports_to_position || null,
      level: form.level || null,
      employment_type: form.employment_type,
      current_holder_id: form.current_holder_id || null,
      vacancy_status: form.vacancy_status,
      target_fill_date: form.target_fill_date || null,
      monthly_budget: form.monthly_budget ? parseFloat(form.monthly_budget) : null,
      currency: form.currency || 'USD',
      notes: form.notes || null,
      is_critical_role: form.is_critical_role,
      primary_successor_id: form.primary_successor_id || null,
      secondary_successor_id: form.secondary_successor_id || null,
      successor_readiness: form.successor_readiness ? parseInt(form.successor_readiness, 10) : null,
      succession_notes: form.succession_notes || null,
    };
    const { error } = editing
      ? await supabase.from('positions').update(payload).eq('id', editing.id)
      : await supabase.from('positions').insert(payload);
    setSaving(false);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: editing ? 'Position updated' : 'Position created' }); setDialogOpen(false); fetchAll(); }
  }

  async function handleDelete(p: Position) {
    if (!confirm(`Delete position "${p.title}"?`)) return;
    const { error } = await supabase.from('positions').delete().eq('id', p.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Position deleted' }); fetchAll(); }
  }

  const profileMap = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p.full_name])), [profiles]);
  const deptMap = useMemo(() => Object.fromEntries(depts.map(d => [d.id, d.name])), [depts]);

  const criticalPositions = useMemo(() => positions.filter(p => p.is_critical_role), [positions]);
  const atRiskCritical = useMemo(
    () => criticalPositions.filter(p => !p.primary_successor_id || (p.successor_readiness ?? 0) < 50),
    [criticalPositions]
  );

  const visible = useMemo(() => {
    let list = activeTab === 'critical' ? criticalPositions : positions;
    if (statusFilter !== 'all') list = list.filter(p => p.vacancy_status === statusFilter);
    if (deptFilter !== 'all') list = list.filter(p => p.department_id === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.level ?? '').toLowerCase().includes(q) ||
        (p.current_holder_id
          ? (profileMap[p.current_holder_id] ?? '').toLowerCase().includes(q)
          : ['vacant', 'open', 'none'].some(kw => kw.includes(q) || q.includes(kw))));
    }
    return list;
  }, [positions, criticalPositions, activeTab, statusFilter, deptFilter, search, profileMap]);

  function exportPositions() {
    const rows = visible.map(p => ({
      'Title': p.title,
      'Department': p.department_id ? (deptMap[p.department_id] ?? '') : '',
      'Level': p.level ?? '',
      'Employment Type': p.employment_type,
      'Vacancy Status': STATUS_CFG[p.vacancy_status]?.label ?? p.vacancy_status,
      'Current Holder': p.current_holder_id ? (profileMap[p.current_holder_id] ?? '') : 'Vacant',
      'Critical Role': p.is_critical_role ? 'Yes' : 'No',
      'Primary Successor': p.primary_successor_id ? (profileMap[p.primary_successor_id] ?? '') : '',
      'Secondary Successor': p.secondary_successor_id ? (profileMap[p.secondary_successor_id] ?? '') : '',
      'Successor Readiness %': p.successor_readiness ?? '',
      'Target Fill Date': p.target_fill_date ? format(new Date(p.target_fill_date), 'yyyy-MM-dd') : '',
      'Monthly Budget': p.monthly_budget ?? '',
      'Currency': p.currency ?? '',
      'Notes': p.notes ?? '',
    }));
    exportToExcel(rows, 'Positions & Vacancies', `positions-vacancies-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  const kpi = useMemo(() => ({
    total: positions.length,
    filled: positions.filter(p => p.vacancy_status === 'filled').length,
    open: positions.filter(p => p.vacancy_status === 'open').length,
    critical: criticalPositions.length,
    atRisk: atRiskCritical.length,
  }), [positions, criticalPositions, atRiskCritical]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" data-testid="page-positions">
      <header className="flex flex-wrap items-center gap-3">
        <Briefcase className="h-5 w-5 text-blue-500" />
        <h1 className="text-xl font-semibold">Positions & Vacancies</h1>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={exportPositions} data-testid="button-export-positions">
            <Download className="h-4 w-4 mr-1" /> Export
          </Button>
          {isAdmin && (
            <Button size="sm" onClick={openNew} data-testid="button-new-position">
              <Plus className="h-4 w-4 mr-1" /> New position
            </Button>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total" value={kpi.total} />
        <Kpi label="Filled" value={kpi.filled} tone="ok" />
        <Kpi label="Open" value={kpi.open} tone={kpi.open ? 'warn' : 'ok'} />
        <Kpi label="Critical Roles" value={kpi.critical} tone="warn" />
        <Kpi label="At Risk" value={kpi.atRisk} tone={kpi.atRisk ? 'danger' : 'ok'} />
      </div>

      {atRiskCritical.length > 0 && (
        <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/10">
          <CardContent className="py-3 px-4 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-700">Succession Risk Alert</p>
              <p className="text-xs text-red-600">
                {atRiskCritical.length} critical role{atRiskCritical.length !== 1 ? 's' : ''} lack{atRiskCritical.length === 1 ? 's' : ''} a ready successor:{' '}
                {atRiskCritical.map(p => p.title).join(', ')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All Positions ({positions.length})</TabsTrigger>
          <TabsTrigger value="critical" data-testid="tab-critical-roles">
            Critical Roles ({criticalPositions.length})
            {atRiskCritical.length > 0 && <Badge className="ml-1.5 h-4 px-1 text-[10px] bg-red-500">{atRiskCritical.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="pt-3">
          <FiltersRow
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            deptFilter={deptFilter} setDeptFilter={setDeptFilter}
            search={search} setSearch={setSearch} depts={depts}
          />
          <PositionTable visible={visible} profileMap={profileMap} deptMap={deptMap} isAdmin={isAdmin} loading={loading} onEdit={openEdit} onDelete={handleDelete} showSuccession={false} />
        </TabsContent>

        <TabsContent value="critical" className="pt-3">
          <FiltersRow
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            deptFilter={deptFilter} setDeptFilter={setDeptFilter}
            search={search} setSearch={setSearch} depts={depts}
          />
          {criticalPositions.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
              No positions marked as critical. Edit a position to flag it as a critical role.
            </CardContent></Card>
          ) : (
            <PositionTable visible={visible} profileMap={profileMap} deptMap={deptMap} isAdmin={isAdmin} loading={loading} onEdit={openEdit} onDelete={handleDelete} showSuccession />
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit position' : 'New position'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Title *</Label>
              <Input data-testid="input-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Field Officer" />
            </div>
            <div>
              <Label>Department</Label>
              <Select value={form.department_id || 'none'} onValueChange={v => setForm({ ...form, department_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Level</Label>
              <Input value={form.level} onChange={e => setForm({ ...form, level: e.target.value })} placeholder="manager, officer…" />
            </div>
            <div>
              <Label>Employment type</Label>
              <Select value={form.employment_type} onValueChange={v => setForm({ ...form, employment_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="intern">Intern</SelectItem>
                  <SelectItem value="consultant">Consultant</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Current holder</Label>
              <Select value={form.current_holder_id || 'none'} onValueChange={v => setForm({ ...form, current_holder_id: v === 'none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Vacant" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Vacant —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Vacancy status</Label>
              <Select value={form.vacancy_status} onValueChange={v => setForm({ ...form, vacancy_status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="filled">Filled</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="frozen">Frozen</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Target fill date</Label>
              <Input type="date" value={form.target_fill_date} onChange={e => setForm({ ...form, target_fill_date: e.target.value })} />
            </div>
            <div>
              <Label>Monthly budget</Label>
              <Input type="number" value={form.monthly_budget} onChange={e => setForm({ ...form, monthly_budget: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} maxLength={5} />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>

            {/* ── Succession Planning ── */}
            <div className="col-span-2 border-t pt-4">
              <p className="text-sm font-semibold flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-rose-500" />Succession Planning
              </p>
            </div>
            <div className="col-span-2 flex items-center gap-3 border rounded-lg p-3 bg-muted/30">
              <Switch id="critical-role" checked={form.is_critical_role} onCheckedChange={v => setForm({ ...form, is_critical_role: v })} />
              <div>
                <Label htmlFor="critical-role" className="font-medium">Critical Role</Label>
                <p className="text-xs text-muted-foreground">Flag this position as critical to organisational continuity. It will appear in succession risk reports.</p>
              </div>
            </div>
            <div>
              <Label>Primary Successor</Label>
              <Select value={form.primary_successor_id || 'none'} onValueChange={v => setForm({ ...form, primary_successor_id: v === 'none' ? '' : v })}>
                <SelectTrigger data-testid="select-primary-successor"><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {profiles.filter(p => p.id !== form.current_holder_id || !form.current_holder_id).map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Secondary Successor</Label>
              <Select value={form.secondary_successor_id || 'none'} onValueChange={v => setForm({ ...form, secondary_successor_id: v === 'none' ? '' : v })}>
                <SelectTrigger data-testid="select-secondary-successor"><SelectValue placeholder="— None —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Successor Readiness (0–100%)</Label>
              <Input
                type="number" min={0} max={100} placeholder="e.g. 75"
                value={form.successor_readiness}
                onChange={e => setForm({ ...form, successor_readiness: e.target.value })}
                data-testid="input-successor-readiness"
              />
              {form.successor_readiness && (
                <p className="text-xs text-muted-foreground mt-1">
                  {(() => { const r = READINESS_LABEL(parseInt(form.successor_readiness)); return r ? r.label : ''; })()}
                </p>
              )}
            </div>
            <div className="col-span-2">
              <Label>Succession Notes</Label>
              <Textarea
                rows={2} placeholder="Development gaps, timeline notes, interim plan…"
                value={form.succession_notes}
                onChange={e => setForm({ ...form, succession_notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-position">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FiltersRow({ statusFilter, setStatusFilter, deptFilter, setDeptFilter, search, setSearch, depts }: any) {
  return (
    <div className="flex flex-wrap gap-2 items-center mb-3">
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          <SelectItem value="filled">Filled</SelectItem>
          <SelectItem value="open">Open</SelectItem>
          <SelectItem value="frozen">Frozen</SelectItem>
          <SelectItem value="planned">Planned</SelectItem>
        </SelectContent>
      </Select>
      <Select value={deptFilter} onValueChange={setDeptFilter}>
        <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All departments</SelectItem>
          {depts.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
        </SelectContent>
      </Select>
      <div className="relative ml-auto">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input data-testid="input-search-positions" value={search} onChange={(e: any) => setSearch(e.target.value)} placeholder="Search…" className="pl-8 w-56" />
      </div>
    </div>
  );
}

function PositionTable({ visible, profileMap, deptMap, isAdmin, loading, onEdit, onDelete, showSuccession }: {
  visible: Position[]; profileMap: Record<string, string>; deptMap: Record<string, string>;
  isAdmin: boolean; loading: boolean; onEdit: (p: Position) => void; onDelete: (p: Position) => void;
  showSuccession: boolean;
}) {
  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-30" /></div>;
  if (visible.length === 0) return (
    <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No positions match your filters.</CardContent></Card>
  );
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Department</th>
                <th className="text-left p-3">Holder</th>
                <th className="text-left p-3">Status</th>
                {showSuccession && <th className="text-left p-3">Successor</th>}
                {showSuccession && <th className="text-left p-3">Readiness</th>}
                {!showSuccession && <th className="text-left p-3">Target fill</th>}
                {!showSuccession && <th className="text-right p-3">Budget</th>}
                {isAdmin && <th className="p-3 w-20"></th>}
              </tr>
            </thead>
            <tbody>
              {visible.map(p => {
                const cfg = STATUS_CFG[p.vacancy_status];
                const readiness = READINESS_LABEL(p.successor_readiness);
                const hasNoSuccessor = p.is_critical_role && !p.primary_successor_id;
                const lowReadiness = p.is_critical_role && p.primary_successor_id && (p.successor_readiness ?? 0) < 50;
                return (
                  <tr key={p.id} className={cn('border-t hover:bg-slate-50 dark:hover:bg-slate-900/50', (hasNoSuccessor || lowReadiness) && 'bg-red-50/30 dark:bg-red-950/10')} data-testid={`row-position-${p.id}`}>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {p.is_critical_role && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" title="Critical Role" />}
                        <div>
                          <div className="font-medium">{p.title}</div>
                          {p.level && <div className="text-xs text-muted-foreground">{p.level}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-xs">{p.department_id ? deptMap[p.department_id] ?? '—' : '—'}</td>
                    <td className="p-3 text-xs">
                      {p.current_holder_id ? (profileMap[p.current_holder_id] ?? '—') : <span className="text-muted-foreground italic">vacant</span>}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={cn('text-[10px] gap-1', cfg.class)}>{cfg.icon}{cfg.label}</Badge>
                    </td>
                    {showSuccession && (
                      <td className="p-3 text-xs">
                        {p.primary_successor_id ? (
                          <div>
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-muted-foreground" />
                              {profileMap[p.primary_successor_id] ?? '—'}
                            </div>
                            {p.secondary_successor_id && (
                              <div className="text-muted-foreground text-[10px] mt-0.5">
                                +{profileMap[p.secondary_successor_id] ?? '—'}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-red-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />None</span>
                        )}
                      </td>
                    )}
                    {showSuccession && (
                      <td className="p-3">
                        {readiness ? (
                          <Badge variant="outline" className={cn('text-[10px]', readiness.cls)}>
                            {p.successor_readiness}% · {readiness.label}
                          </Badge>
                        ) : '—'}
                      </td>
                    )}
                    {!showSuccession && <td className="p-3 text-xs">{p.target_fill_date ? format(new Date(p.target_fill_date), 'PP') : '—'}</td>}
                    {!showSuccession && (
                      <td className="p-3 text-xs text-right">
                        {p.monthly_budget != null ? `${p.currency ?? 'USD'} ${p.monthly_budget.toLocaleString()}` : '—'}
                      </td>
                    )}
                    {isAdmin && (
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => onEdit(p)} data-testid={`button-edit-${p.id}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => onDelete(p)} data-testid={`button-delete-${p.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'ok' | 'danger' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('text-2xl font-semibold mt-0.5',
          tone === 'warn' && value > 0 && 'text-amber-600 dark:text-amber-400',
          tone === 'danger' && value > 0 && 'text-red-600 dark:text-red-400',
          tone === 'ok' && 'text-emerald-700 dark:text-emerald-400')}>{value}</div>
      </CardContent>
    </Card>
  );
}
