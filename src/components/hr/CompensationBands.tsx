import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit2, Trash2, Loader2, DollarSign, BarChart3, Download } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';

const CURRENCIES = ['SDG', 'USD', 'EUR', 'GBP', 'KES', 'UGX', 'ETB', 'SSP'];

interface Grade {
  id: string;
  code: string;
  title: string;
  min_salary: number;
  midpoint_salary: number;
  max_salary: number;
  currency: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

const BLANK: Omit<Grade, 'id' | 'created_at'> = {
  code: '', title: '', min_salary: 0, midpoint_salary: 0, max_salary: 0,
  currency: 'SDG', description: null, is_active: true,
};

function BandBar({ min, mid, max }: { min: number; mid: number; max: number }) {
  if (!max || max <= min) return null;
  const spread = max - min;
  const midPct = Math.round(((mid - min) / spread) * 100);
  return (
    <div className="relative h-6 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden w-full" title={`Min: ${min.toLocaleString()} | Mid: ${mid.toLocaleString()} | Max: ${max.toLocaleString()}`}>
      <div className="absolute inset-0 flex">
        <div className="h-full bg-blue-200 dark:bg-blue-900" style={{ width: `${midPct}%` }} />
        <div className="h-full bg-blue-400 dark:bg-blue-600" style={{ width: `${100 - midPct}%` }} />
      </div>
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2 h-4 bg-blue-700 dark:bg-blue-300 rounded"
        style={{ left: `calc(${midPct}% - 4px)` }}
        title={`Midpoint: ${mid.toLocaleString()}`}
      />
    </div>
  );
}

export default function CompensationBands() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [form, setForm] = useState<Omit<Grade, 'id' | 'created_at'>>({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const { data: grades = [], isLoading } = useQuery<Grade[]>({
    queryKey: ['hr-compensation-grades'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_compensation_grades')
        .select('*')
        .order('code');
      if (error) throw error;
      return (data ?? []) as Grade[];
    },
    staleTime: 60_000,
  });

  const { data: employeeCount = {} } = useQuery<Record<string, number>>({
    queryKey: ['hr-grade-employee-counts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('employee_salary_config')
        .select('grade_id')
        .not('grade_id', 'is', null);
      const cnt: Record<string, number> = {};
      (data ?? []).forEach((r: any) => {
        if (r.grade_id) cnt[r.grade_id] = (cnt[r.grade_id] ?? 0) + 1;
      });
      return cnt;
    },
    staleTime: 60_000,
  });

  const openAdd = () => { setEditing(null); setForm({ ...BLANK }); setDialogOpen(true); };
  const openEdit = (g: Grade) => { setEditing(g); setForm({ code: g.code, title: g.title, min_salary: g.min_salary, midpoint_salary: g.midpoint_salary, max_salary: g.max_salary, currency: g.currency, description: g.description, is_active: g.is_active }); setDialogOpen(true); };
  const setF = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code || !form.title) { toast({ title: 'Code and title are required', variant: 'destructive' }); return; }
    if (form.min_salary >= form.max_salary) { toast({ title: 'Max must be greater than Min', variant: 'destructive' }); return; }
    if (form.midpoint_salary < form.min_salary || form.midpoint_salary > form.max_salary) { toast({ title: 'Midpoint must be between Min and Max', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from('hr_compensation_grades').update({ ...form, updated_at: new Date().toISOString() }).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Grade updated' });
      } else {
        const { error } = await supabase.from('hr_compensation_grades').insert({ ...form });
        if (error) throw error;
        toast({ title: 'Grade created' });
      }
      qc.invalidateQueries({ queryKey: ['hr-compensation-grades'] });
      setDialogOpen(false);
    } catch (e: any) {
      toast({ title: 'Error saving grade', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const deleteGrade = async (id: string) => {
    if (!confirm('Delete this compensation grade? Positions and salary configs linked to it will lose their grade reference.')) return;
    setDeleting(id);
    const { error } = await supabase.from('hr_compensation_grades').delete().eq('id', id);
    if (error) toast({ title: 'Error deleting', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Grade deleted' }); qc.invalidateQueries({ queryKey: ['hr-compensation-grades'] }); }
    setDeleting(null);
  };

  const exportGrades = () => {
    const rows = grades.map(g => ({
      Code: g.code, Title: g.title, Currency: g.currency,
      Min: g.min_salary, Midpoint: g.midpoint_salary, Max: g.max_salary,
      'Spread %': g.max_salary > 0 ? Math.round(((g.max_salary - g.min_salary) / g.midpoint_salary) * 100) + '%' : '—',
      'Employees': employeeCount[g.id] ?? 0, Active: g.is_active ? 'Yes' : 'No',
      Description: g.description ?? '',
    }));
    exportToExcel(rows, 'Compensation Grades', 'compensation-grades.xlsx');
  };

  const activeGrades = useMemo(() => grades.filter(g => g.is_active), [grades]);
  const maxSalaryForChart = useMemo(() => Math.max(...grades.map(g => g.max_salary), 1), [grades]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0F2041] dark:text-white">Compensation Bands</h2>
          <p className="text-sm text-muted-foreground">{grades.length} grade{grades.length !== 1 ? 's' : ''} · {activeGrades.length} active</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportGrades} className="gap-1.5 h-9 text-xs">
            <Download className="h-3.5 w-3.5" />Export
          </Button>
          <Button size="sm" onClick={openAdd} className="gap-1.5 h-9 text-xs bg-[#0F2041] hover:bg-[#1D3461] text-white">
            <Plus className="h-3.5 w-3.5" />Add Grade
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin opacity-30" /></div>
      ) : grades.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <BarChart3 className="h-10 w-10 opacity-20" />
            <p className="text-sm font-medium">No compensation grades defined yet</p>
            <Button size="sm" onClick={openAdd} className="gap-1.5 bg-[#0F2041] hover:bg-[#1D3461] text-white">
              <Plus className="h-3.5 w-3.5" />Create First Grade
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Band Visualisation */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-5">
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Band Overview</p>
            </CardHeader>
            <CardContent className="px-5 pb-5 space-y-3">
              {grades.filter(g => g.is_active).map(g => (
                <div key={g.id} className="grid grid-cols-[80px_1fr_120px] items-center gap-3">
                  <div>
                    <span className="text-xs font-bold text-[#0F2041] dark:text-white">{g.code}</span>
                    <p className="text-[10px] text-muted-foreground truncate">{g.title}</p>
                  </div>
                  <BandBar min={g.min_salary} mid={g.midpoint_salary} max={g.max_salary} />
                  <div className="text-right">
                    <p className="text-xs font-semibold">{g.min_salary.toLocaleString()} – {g.max_salary.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{g.currency}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Grade Table */}
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900 border-b border-border">
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Code</th>
                  <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-2.5">Title</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Min</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Midpoint</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Max</th>
                  <th className="text-right text-xs font-semibold text-muted-foreground px-4 py-2.5">Spread</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-2.5">Staff</th>
                  <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {grades.map((g, i) => {
                  const spread = g.midpoint_salary > 0
                    ? Math.round(((g.max_salary - g.min_salary) / g.midpoint_salary) * 100)
                    : 0;
                  return (
                    <tr key={g.id} className={`border-b border-border last:border-0 hover:bg-slate-50/60 dark:hover:bg-slate-900/40 ${!g.is_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3 font-bold text-[#0F2041] dark:text-blue-300">{g.code}</td>
                      <td className="px-4 py-3 font-medium">{g.title}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm">{g.min_salary.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold">{g.midpoint_salary.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-sm">{g.max_salary.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">{spread}%</td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{employeeCount[g.id] ?? 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge className={g.is_active ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 text-xs' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 text-xs'}>
                          {g.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(g)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => deleteGrade(g.id)} disabled={deleting === g.id} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 transition-colors" title="Delete">
                            {deleting === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md p-0">
          <div className="px-5 pt-5 pb-4 border-b bg-slate-50 dark:bg-slate-900 rounded-t-2xl">
            <DialogTitle className="text-base font-bold">{editing ? 'Edit Grade' : 'New Compensation Grade'}</DialogTitle>
            <DialogDescription className="text-xs mt-0.5">Define salary band boundaries and a unique grade code.</DialogDescription>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Grade Code *</Label>
                <Input placeholder="e.g. G3, P2, SM1" value={form.code} onChange={e => setF('code', e.target.value.toUpperCase())} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Currency</Label>
                <Select value={form.currency} onValueChange={v => setF('currency', v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title *</Label>
              <Input placeholder="e.g. Field Officer Grade 3" value={form.title} onChange={e => setF('title', e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Min Salary *</Label>
                <Input type="number" value={form.min_salary || ''} onChange={e => setF('min_salary', parseFloat(e.target.value) || 0)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Midpoint *</Label>
                <Input type="number" value={form.midpoint_salary || ''} onChange={e => setF('midpoint_salary', parseFloat(e.target.value) || 0)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max Salary *</Label>
                <Input type="number" value={form.max_salary || ''} onChange={e => setF('max_salary', parseFloat(e.target.value) || 0)} className="h-9 text-sm" />
              </div>
            </div>
            {form.min_salary > 0 && form.max_salary > form.min_salary && form.midpoint_salary > 0 && (
              <div className="pt-1">
                <Label className="text-xs text-muted-foreground mb-1 block">Band Preview</Label>
                <BandBar min={form.min_salary} mid={form.midpoint_salary} max={form.max_salary} />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea rows={2} placeholder="Notes about this grade…" value={form.description ?? ''} onChange={e => setF('description', e.target.value || null)} className="text-sm resize-none" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="grade-active" checked={form.is_active} onChange={e => setF('is_active', e.target.checked)} className="rounded" />
              <Label htmlFor="grade-active" className="text-sm cursor-pointer">Active</Label>
            </div>
          </div>
          <DialogFooter className="px-5 py-4 border-t gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-9">Cancel</Button>
            <Button onClick={save} disabled={saving} className="h-9 bg-[#0F2041] hover:bg-[#1D3461] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editing ? 'Save Changes' : 'Create Grade'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
