import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useAppContext } from '@/context/AppContext';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, RefreshCw, Download, RotateCcw, Pencil, Trash2, Play, CalendarDays } from 'lucide-react';
import { exportToExcel } from '@/utils/report-export';
import { cn } from '@/lib/utils';

interface RecurringJournal {
  id: string; name: string; description: string | null; frequency: string;
  day_of_month: number | null; next_run_date: string; last_run_date: string | null;
  end_date: string | null; is_active: boolean; auto_post: boolean;
  run_count: number; max_runs: number | null; created_at: string;
}

const FREQ_COLORS: Record<string, string> = {
  daily: 'bg-purple-50 text-purple-700', weekly: 'bg-blue-50 text-blue-700',
  monthly: 'bg-emerald-50 text-emerald-700', quarterly: 'bg-amber-50 text-amber-700',
  yearly: 'bg-rose-50 text-rose-700',
};

export default function AccountingRecurringJournals() {
  const { hasAnyRole, isAuthenticated } = useAuthorization();
  const { authReady } = useAppContext();
  const { toast } = useToast();
  const allowed = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant', 'auditor']);
  const canManage = hasAnyRole(['super_admin', 'admin', 'finance', 'financialAdmin', 'accountant']);

  const [rows, setRows] = useState<RecurringJournal[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RecurringJournal | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RecurringJournal | null>(null);

  const BLANK = { name: '', description: '', frequency: 'monthly', day_of_month: '1', next_run_date: new Date().toISOString().slice(0, 10), end_date: '', max_runs: '', auto_post: 'false', is_active: 'true' };
  const [form, setForm] = useState<Record<string, string>>(BLANK);
  const sf = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('acct_recurring_journals' as any).select('*').order('next_run_date');
    setRows((data ?? []) as RecurringJournal[]);
    setLoading(false);
  };

  useEffect(() => { if (allowed) void load(); }, [allowed]);

  const counts = useMemo(() => ({
    active: rows.filter(r => r.is_active).length,
    dueToday: rows.filter(r => r.is_active && r.next_run_date <= new Date().toISOString().slice(0, 10)).length,
  }), [rows]);

  const openAdd = () => { setEditTarget(null); setForm(BLANK); setFormOpen(true); };
  const openEdit = (r: RecurringJournal) => {
    setEditTarget(r);
    setForm({ name: r.name, description: r.description ?? '', frequency: r.frequency, day_of_month: String(r.day_of_month ?? 1), next_run_date: r.next_run_date, end_date: r.end_date ?? '', max_runs: r.max_runs ? String(r.max_runs) : '', auto_post: String(r.auto_post), is_active: String(r.is_active) });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { name: form.name.trim(), description: form.description || null, frequency: form.frequency, day_of_month: parseInt(form.day_of_month) || null, next_run_date: form.next_run_date, end_date: form.end_date || null, max_runs: form.max_runs ? parseInt(form.max_runs) : null, auto_post: form.auto_post === 'true', is_active: form.is_active === 'true' };
    const { error } = editTarget
      ? await supabase.from('acct_recurring_journals' as any).update(payload).eq('id', editTarget.id)
      : await supabase.from('acct_recurring_journals' as any).insert({ ...payload, run_count: 0 });
    if (error) toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Saved' }); setFormOpen(false); void load(); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('acct_recurring_journals' as any).delete().eq('id', deleteTarget.id);
    if (error) toast({ title: 'Delete failed', description: error.message, variant: 'destructive' });
    else { toast({ title: 'Deleted' }); setDeleteTarget(null); void load(); }
  };

  const toggleActive = async (r: RecurringJournal) => {
    await supabase.from('acct_recurring_journals' as any).update({ is_active: !r.is_active }).eq('id', r.id);
    void load();
  };

  if (!authReady || !isAuthenticated) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!allowed) return <Navigate to="/" replace />;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><RotateCcw className="w-6 h-6 text-purple-600" /> Recurring Journal Entries</h1>
          <p className="text-sm text-muted-foreground mt-1">Auto-generate journals on a schedule — rent, depreciation, subscriptions</p>
        </div>
        <div className="flex gap-2">
          {canManage && <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" /> New Recurring</Button>}
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="w-4 h-4 mr-1" /> Refresh</Button>
          <Button variant="outline" size="sm" onClick={() => exportToExcel(rows, 'recurring-journals')} disabled={!rows.length}><Download className="w-4 h-4 mr-1" /> Excel</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total', value: rows.length, color: 'text-purple-600' },
          { label: 'Active', value: counts.active, color: 'text-emerald-600' },
          { label: 'Due Today', value: counts.dueToday, color: counts.dueToday > 0 ? 'text-rose-600' : 'text-muted-foreground' },
        ].map(k => (
          <Card key={k.label}><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{k.label}</div>
            <div className={cn('text-2xl font-bold', k.color)}>{k.value}</div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Schedules ({rows.length})</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…</div>
          : rows.length === 0 ? <div className="text-center py-10 text-muted-foreground text-sm">No recurring journals yet.</div>
          : (
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.id} className={cn('flex items-center gap-3 p-3 rounded-lg border', !r.is_active ? 'opacity-50' : r.next_run_date <= today ? 'border-amber-200 bg-amber-50' : 'border-border bg-card')} data-testid={`row-recurring-${r.id}`}>
                  <CalendarDays className={cn('w-8 h-8 shrink-0', r.next_run_date <= today && r.is_active ? 'text-amber-600' : 'text-muted-foreground')} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{r.name}</span>
                      <Badge variant="outline" className={cn('text-[10px]', FREQ_COLORS[r.frequency] ?? '')}>{r.frequency}</Badge>
                      {r.auto_post && <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700">Auto-post</Badge>}
                      {!r.is_active && <Badge variant="outline" className="text-[10px]">Paused</Badge>}
                    </div>
                    {r.description && <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>}
                    <div className="flex gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Next: <strong className={r.next_run_date <= today && r.is_active ? 'text-amber-700' : ''}>{r.next_run_date}</strong></span>
                      {r.last_run_date && <span>Last: {r.last_run_date}</span>}
                      <span>Runs: {r.run_count}{r.max_runs ? ` / ${r.max_runs}` : ''}</span>
                    </div>
                  </div>
                  {canManage && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => toggleActive(r)} className={cn('p-1.5 rounded hover:bg-muted', r.is_active ? 'text-emerald-600' : 'text-muted-foreground')} title={r.is_active ? 'Pause' : 'Activate'}><Play className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openEdit(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteTarget(r)} className="p-1.5 rounded hover:bg-rose-50 text-rose-600" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editTarget ? 'Edit Schedule' : 'New Recurring Journal'}</DialogTitle><DialogDescription>Define the schedule. Lines can be added after saving.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. Monthly Rent Expense" /></div>
            <div className="space-y-1"><Label>Description</Label><Input value={form.description} onChange={e => sf('description', e.target.value)} placeholder="Optional description" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Frequency</Label>
                <Select value={form.frequency} onValueChange={v => sf('frequency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['daily','weekly','monthly','quarterly','yearly'].map(f => <SelectItem key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {form.frequency === 'monthly' && <div className="space-y-1"><Label>Day of Month</Label><Input type="number" min={1} max={28} value={form.day_of_month} onChange={e => sf('day_of_month', e.target.value)} /></div>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Next Run Date</Label><Input type="date" value={form.next_run_date} onChange={e => sf('next_run_date', e.target.value)} /></div>
              <div className="space-y-1"><Label>End Date (optional)</Label><Input type="date" value={form.end_date} onChange={e => sf('end_date', e.target.value)} /></div>
            </div>
            <div className="space-y-1"><Label>Max Runs (blank = unlimited)</Label><Input type="number" value={form.max_runs} onChange={e => sf('max_runs', e.target.value)} placeholder="∞" /></div>
            <div className="flex gap-6">
              <div className="flex items-center gap-2"><Switch checked={form.auto_post === 'true'} onCheckedChange={v => sf('auto_post', String(v))} /><Label>Auto-Post</Label></div>
              <div className="flex items-center gap-2"><Switch checked={form.is_active === 'true'} onCheckedChange={v => sf('is_active', String(v))} /><Label>Active</Label></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Recurring Journal</DialogTitle><DialogDescription>Delete "{deleteTarget?.name}"? This cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
