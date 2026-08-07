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
import { Plus, Loader2, Edit2, Trash2, TrendingUp, Users, FileDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationTriggerService } from '@/services/NotificationTriggerService';
import { exportToExcel } from '@/utils/report-export';
import { format } from 'date-fns';
import { PageLoader } from '@/components/ui/page-loader';

interface Plan {
  id: string; department_id: string | null; position_title: string; fiscal_year: number; quarter: number | null;
  current_count: number; budgeted_count: number; planned_hires: number; planned_salary_cost: number;
  currency: string; status: 'draft' | 'approved' | 'archived'; notes: string | null;
}
interface Dept { id: string; name: string; }

const CURRENT_YEAR = new Date().getFullYear();
const BLANK = {
  department_id: '', position_title: '', fiscal_year: String(CURRENT_YEAR), quarter: '1',
  current_count: '0', budgeted_count: '0', planned_hires: '0', planned_salary_cost: '0', currency: 'SDG',
  status: 'draft' as Plan['status'], notes: '',
};

export default function HeadcountPlanning() {
  const { currentUser } = useAppContext();
  const { hasAnyRole } = useAuthorization();
  const { toast } = useToast();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr', 'hr_manager', 'finance']);
  const canEdit = hasAnyRole(['super_admin', 'admin', 'hr', 'hr_manager']);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [yearFilter, setYearFilter] = useState<string>(String(CURRENT_YEAR));
  const [editing, setEditing] = useState<Plan | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...BLANK });
  const [missingTable, setMissingTable] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [planRes, deptRes] = await Promise.all([
      supabase.from('hr_headcount_plans' as any).select('*').order('fiscal_year', { ascending: false }).order('quarter', { ascending: true }),
      supabase.from('departments').select('id, name').order('name'),
    ]);
    if (planRes.error?.code === '42P01') { setMissingTable(true); setLoading(false); return; }
    if (planRes.data) setPlans(planRes.data as unknown as Plan[]);
    if (deptRes.data) setDepts(deptRes.data as Dept[]);
    setLoading(false);
  }

  const years = useMemo(() => Array.from(new Set(plans.map(p => p.fiscal_year))).sort((a, b) => b - a), [plans]);
  const filtered = useMemo(() => plans.filter(p => yearFilter === 'all' || String(p.fiscal_year) === yearFilter), [plans, yearFilter]);

  const totals = useMemo(() => filtered.reduce((acc, p) => ({
    current: acc.current + p.current_count, budgeted: acc.budgeted + p.budgeted_count,
    hires: acc.hires + p.planned_hires, cost: acc.cost + p.planned_salary_cost,
  }), { current: 0, budgeted: 0, hires: 0, cost: 0 }), [filtered]);

  function openNew() { setEditing(null); setForm({ ...BLANK, fiscal_year: yearFilter !== 'all' ? yearFilter : String(CURRENT_YEAR) }); setDialogOpen(true); }
  function openEdit(p: Plan) {
    setEditing(p);
    setForm({
      department_id: p.department_id ?? '', position_title: p.position_title, fiscal_year: String(p.fiscal_year),
      quarter: p.quarter ? String(p.quarter) : '1', current_count: String(p.current_count), budgeted_count: String(p.budgeted_count),
      planned_hires: String(p.planned_hires), planned_salary_cost: String(p.planned_salary_cost), currency: p.currency,
      status: p.status, notes: p.notes ?? '',
    });
    setDialogOpen(true);
  }

  async function save() {
    if (!form.position_title.trim()) { toast({ title: 'Position title is required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload: any = {
      department_id: form.department_id || null, position_title: form.position_title.trim(),
      fiscal_year: parseInt(form.fiscal_year, 10), quarter: form.quarter ? parseInt(form.quarter, 10) : null,
      current_count: parseInt(form.current_count, 10) || 0, budgeted_count: parseInt(form.budgeted_count, 10) || 0,
      planned_hires: parseInt(form.planned_hires, 10) || 0, planned_salary_cost: parseFloat(form.planned_salary_cost) || 0,
      currency: form.currency || 'SDG', status: form.status, notes: form.notes || null,
    };
    const { error } = editing
      ? await supabase.from('hr_headcount_plans' as any).update(payload).eq('id', editing.id)
      : await supabase.from('hr_headcount_plans' as any).insert({ ...payload, created_by: currentUser?.id ?? null });
    setSaving(false);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: editing ? 'Plan updated' : 'Plan created' });
    setDialogOpen(false);
    if (payload.status === 'approved' && editing?.status !== 'approved') {
      try {
        await NotificationTriggerService.sendToRoles(['super_admin', 'admin', 'finance'], {
          title: 'Headcount Plan Approved',
          message: `Headcount plan for "${payload.position_title}" (FY${payload.fiscal_year}${payload.quarter ? ` Q${payload.quarter}` : ''}) was approved — ${payload.planned_hires} planned hire(s), ${payload.planned_salary_cost.toLocaleString()} ${payload.currency} budgeted.`,
          type: 'success',
          category: 'financial',
          priority: 'normal',
          link: '/headcount-planning',
        });
      } catch (e) { console.warn('[Headcount] approval notification failed:', e); }
    }
    fetchAll();
  }

  function handleExport() {
    const rows = filtered.map(p => ({
      Position: p.position_title,
      Department: depts.find(d => d.id === p.department_id)?.name ?? '',
      'Fiscal Year': p.fiscal_year,
      Quarter: p.quarter ?? '',
      Current: p.current_count,
      Budgeted: p.budgeted_count,
      'Planned Hires': p.planned_hires,
      'Planned Cost': p.planned_salary_cost,
      Currency: p.currency,
      Status: p.status,
    }));
    exportToExcel(rows, 'Headcount Plan', `Headcount_Plan_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  }

  async function remove(p: Plan) {
    if (!confirm(`Delete headcount plan for "${p.position_title}"?`)) return;
    const { error } = await supabase.from('hr_headcount_plans' as any).delete().eq('id', p.id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Plan deleted' }); fetchAll(); }
  }

  if (!isAdmin) return <Card className="border-dashed"><CardContent className="py-16 text-center text-sm text-muted-foreground">Headcount planning is restricted to HR, admin, and finance roles.</CardContent></Card>;
  if (loading) return <PageLoader compact />;
  if (missingTable) {
    return (
      <Card className="border-dashed border-amber-300 bg-amber-50/50 dark:bg-amber-950/10">
        <CardContent className="py-10 text-center text-sm text-amber-700 dark:text-amber-400">
          Apply <code className="font-mono text-xs">supabase/migrations/20260705_hr_recruitment_disciplinary_benefits_headcount.sql</code> to enable Headcount Planning.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="page-headcount">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All years</SelectItem>
            {years.length === 0 && <SelectItem value={String(CURRENT_YEAR)}>{CURRENT_YEAR}</SelectItem>}
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} data-testid="button-export-headcount"><FileDown className="h-4 w-4 mr-1" />Export</Button>
          {canEdit && <Button onClick={openNew} data-testid="button-new-headcount-plan"><Plus className="h-4 w-4 mr-1" />New Plan Row</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-3 px-4"><p className="text-xs text-muted-foreground">Current Headcount</p><p className="text-xl font-bold">{totals.current}</p></CardContent></Card>
        <Card><CardContent className="py-3 px-4"><p className="text-xs text-muted-foreground">Budgeted Headcount</p><p className="text-xl font-bold">{totals.budgeted}</p></CardContent></Card>
        <Card><CardContent className="py-3 px-4"><p className="text-xs text-muted-foreground">Planned Hires</p><p className="text-xl font-bold">{totals.hires}</p></CardContent></Card>
        <Card><CardContent className="py-3 px-4"><p className="text-xs text-muted-foreground">Planned Salary Cost</p><p className="text-xl font-bold">{totals.cost.toLocaleString()}</p></CardContent></Card>
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && <p className="text-sm text-muted-foreground py-10 text-center">No headcount plan rows for this year yet.</p>}
        {filtered.map(p => {
          const gap = p.budgeted_count - p.current_count;
          return (
            <Card key={p.id} data-testid={`row-headcount-${p.id}`}>
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{p.position_title}</p>
                    <Badge variant="outline" className={cn(p.status === 'approved' && 'border-emerald-300 text-emerald-700', p.status === 'draft' && 'border-amber-300 text-amber-700', p.status === 'archived' && 'border-gray-300 text-gray-500')}>{p.status}</Badge>
                    <span className="text-xs text-muted-foreground">{depts.find(d => d.id === p.department_id)?.name ?? 'Unassigned dept'} · FY{p.fiscal_year}{p.quarter ? ` Q${p.quarter}` : ''}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1.5">
                    <span className="flex items-center gap-1"><Users className="h-3 w-3" />{p.current_count} current / {p.budgeted_count} budgeted</span>
                    <span className={cn('flex items-center gap-1', gap > 0 ? 'text-amber-600' : gap < 0 ? 'text-red-500' : 'text-emerald-600')}>
                      <TrendingUp className="h-3 w-3" />{gap > 0 ? `${gap} to hire` : gap < 0 ? `${Math.abs(gap)} over budget` : 'On target'}
                    </span>
                    <span>{p.planned_hires} planned hires · {p.planned_salary_cost.toLocaleString()} {p.currency}</span>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}><Edit2 className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Plan Row' : 'New Headcount Plan Row'}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
            <div><Label>Position Title</Label><Input value={form.position_title} onChange={e => setForm(f => ({ ...f, position_title: e.target.value }))} data-testid="input-headcount-position" /></div>
            <div>
              <Label>Department</Label>
              <Select value={form.department_id} onValueChange={v => setForm(f => ({ ...f, department_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fiscal Year</Label><Input type="number" value={form.fiscal_year} onChange={e => setForm(f => ({ ...f, fiscal_year: e.target.value }))} /></div>
              <div>
                <Label>Quarter</Label>
                <Select value={form.quarter} onValueChange={v => setForm(f => ({ ...f, quarter: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Q1</SelectItem><SelectItem value="2">Q2</SelectItem><SelectItem value="3">Q3</SelectItem><SelectItem value="4">Q4</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Current Count</Label><Input type="number" min={0} value={form.current_count} onChange={e => setForm(f => ({ ...f, current_count: e.target.value }))} /></div>
              <div><Label>Budgeted Count</Label><Input type="number" min={0} value={form.budgeted_count} onChange={e => setForm(f => ({ ...f, budgeted_count: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Planned Hires</Label><Input type="number" min={0} value={form.planned_hires} onChange={e => setForm(f => ({ ...f, planned_hires: e.target.value }))} /></div>
              <div><Label>Salary Cost</Label><Input type="number" value={form.planned_salary_cost} onChange={e => setForm(f => ({ ...f, planned_salary_cost: e.target.value }))} /></div>
              <div>
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="SDG">SDG</SelectItem><SelectItem value="USD">USD</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as Plan['status'] }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="approved">Approved</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button onClick={save} disabled={saving} data-testid="button-save-headcount">{saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
