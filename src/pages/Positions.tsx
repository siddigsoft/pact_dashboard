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
import { Briefcase, Plus, Edit2, Trash2, Loader2, Search, UserCheck, UserX, Pause, ClipboardList } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

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
}

interface Profile { id: string; full_name: string; }
interface Dept { id: string; name: string; }

const STATUS_CFG: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
  filled:  { label: 'Filled',  class: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40', icon: <UserCheck className="h-3 w-3" /> },
  open:    { label: 'Open',    class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40', icon: <UserX className="h-3 w-3" /> },
  frozen:  { label: 'Frozen',  class: 'bg-gray-100 text-gray-700 dark:bg-gray-800', icon: <Pause className="h-3 w-3" /> },
  planned: { label: 'Planned', class: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40', icon: <ClipboardList className="h-3 w-3" /> },
};

const BLANK = {
  title: '', department_id: '', reports_to_position: '', level: '',
  employment_type: 'full_time', current_holder_id: '',
  vacancy_status: 'open' as Position['vacancy_status'],
  target_fill_date: '', monthly_budget: '', currency: 'USD', notes: '',
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
      vacancy_status: form.current_holder_id ? 'filled' : form.vacancy_status,
      target_fill_date: form.target_fill_date || null,
      monthly_budget: form.monthly_budget ? parseFloat(form.monthly_budget) : null,
      currency: form.currency || 'USD',
      notes: form.notes || null,
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

  const visible = useMemo(() => {
    let list = positions;
    if (statusFilter !== 'all') list = list.filter(p => p.vacancy_status === statusFilter);
    if (deptFilter !== 'all') list = list.filter(p => p.department_id === deptFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.level ?? '').toLowerCase().includes(q) ||
        (p.current_holder_id ? (profileMap[p.current_holder_id] ?? '').toLowerCase().includes(q) : false));
    }
    return list;
  }, [positions, statusFilter, deptFilter, search, profileMap]);

  const kpi = useMemo(() => ({
    total: positions.length,
    filled: positions.filter(p => p.vacancy_status === 'filled').length,
    open: positions.filter(p => p.vacancy_status === 'open').length,
    frozen: positions.filter(p => p.vacancy_status === 'frozen').length,
    planned: positions.filter(p => p.vacancy_status === 'planned').length,
  }), [positions]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" data-testid="page-positions">
      <header className="flex flex-wrap items-center gap-3">
        <Briefcase className="h-5 w-5 text-blue-500" />
        <h1 className="text-xl font-semibold">Positions & Vacancies</h1>
        {isAdmin && (
          <Button size="sm" onClick={openNew} className="ml-auto" data-testid="button-new-position">
            <Plus className="h-4 w-4 mr-1" /> New position
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi label="Total" value={kpi.total} />
        <Kpi label="Filled" value={kpi.filled} tone="ok" />
        <Kpi label="Open" value={kpi.open} tone={kpi.open ? 'warn' : 'ok'} />
        <Kpi label="Frozen" value={kpi.frozen} />
        <Kpi label="Planned" value={kpi.planned} />
      </div>

      <div className="flex flex-wrap gap-2 items-center">
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
            {depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input data-testid="input-search-positions" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 w-56" />
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-30" /></div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          No positions match your filters.{isAdmin && ' Create one to start tracking vacancies.'}
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Title</th>
                  <th className="text-left p-3">Department</th>
                  <th className="text-left p-3">Holder</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Target fill</th>
                  <th className="text-right p-3">Budget</th>
                  {isAdmin && <th className="p-3 w-20"></th>}
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const cfg = STATUS_CFG[p.vacancy_status];
                  return (
                    <tr key={p.id} className="border-t hover:bg-slate-50 dark:hover:bg-slate-900/50" data-testid={`row-position-${p.id}`}>
                      <td className="p-3">
                        <div className="font-medium">{p.title}</div>
                        {p.level && <div className="text-xs text-muted-foreground">{p.level}</div>}
                      </td>
                      <td className="p-3 text-xs">{p.department_id ? deptMap[p.department_id] ?? '—' : '—'}</td>
                      <td className="p-3 text-xs">
                        {p.current_holder_id ? (profileMap[p.current_holder_id] ?? '—') : <span className="text-muted-foreground italic">vacant</span>}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={cn('text-[10px] gap-1', cfg.class)}>{cfg.icon}{cfg.label}</Badge>
                      </td>
                      <td className="p-3 text-xs">{p.target_fill_date ? format(new Date(p.target_fill_date), 'PP') : '—'}</td>
                      <td className="p-3 text-xs text-right">
                        {p.monthly_budget != null ? `${p.currency ?? 'USD'} ${p.monthly_budget.toLocaleString()}` : '—'}
                      </td>
                      {isAdmin && (
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(p)} data-testid={`button-edit-${p.id}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(p)} data-testid={`button-delete-${p.id}`}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
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

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'ok' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('text-2xl font-semibold mt-0.5',
          tone === 'warn' && value > 0 && 'text-amber-600 dark:text-amber-400',
          tone === 'ok' && 'text-emerald-700 dark:text-emerald-400')}>{value}</div>
      </CardContent>
    </Card>
  );
}
