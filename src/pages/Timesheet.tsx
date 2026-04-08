import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, isToday, isSameDay } from 'date-fns';
import {
  Clock, Plus, Edit2, Trash2, Loader2, CheckCircle2, ChevronLeft,
  ChevronRight, User, Briefcase, Download, Search, Calendar,
  AlertCircle, TrendingUp, BarChart2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppContext';

interface TimesheetEntry {
  id: string;
  user_id: string;
  project_id: string | null;
  task_id: string | null;
  task_type: string;
  date: string;
  hours: number;
  description: string | null;
  is_billable: boolean;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  user_name?: string;
  project_name?: string;
}

interface Project { id: string; name: string; }
interface Profile { id: string; full_name: string; }

const STATUS_CFG: Record<string, { label: string; badge: string }> = {
  pending:  { label: 'Pending',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40' },
  approved: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40' },
  rejected: { label: 'Rejected', badge: 'bg-red-100 text-red-700 dark:bg-red-900/40' },
};

const TASK_TYPES = [
  { value: 'project', label: 'Project Work' },
  { value: 'field_visit', label: 'Field Visit' },
  { value: 'training', label: 'Training' },
  { value: 'admin', label: 'Administrative' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'report', label: 'Report Writing' },
  { value: 'other', label: 'Other' },
];

const BLANK = { date: format(new Date(), 'yyyy-MM-dd'), hours: '', project_id: '', task_type: 'project', description: '', is_billable: true };

export default function Timesheet() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const isAdmin = hasAnyRole(['super_admin', 'admin', 'hr', 'manager', 'finance']);

  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimesheetEntry | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [tab, setTab] = useState<'week' | 'all' | 'team'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [search, setSearch] = useState('');
  const [userFilter, setUserFilter] = useState('');

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [entRes, projRes, profRes] = await Promise.all([
      supabase.from('timesheets').select('*').order('date', { ascending: false }),
      supabase.from('projects').select('id, name').eq('status', 'active').order('name'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    const pm: Record<string, string> = Object.fromEntries((profRes.data ?? []).map((p: any) => [p.id, p.full_name]));
    const prm: Record<string, string> = Object.fromEntries((projRes.data ?? []).map((p: any) => [p.id, p.name]));
    if (entRes.data) {
      setEntries(entRes.data.map((e: any) => ({
        ...e,
        user_name: pm[e.user_id] ?? 'Unknown',
        project_name: e.project_id ? (prm[e.project_id] ?? '—') : '—',
      })));
    }
    setProjects((projRes.data ?? []) as Project[]);
    setProfiles((profRes.data ?? []) as Profile[]);
    setLoading(false);
  }

  function openNew() {
    setEditing(null);
    setForm({ ...BLANK });
    setDialogOpen(true);
  }

  function openEdit(e: TimesheetEntry) {
    setEditing(e);
    setForm({
      date: e.date,
      hours: String(e.hours),
      project_id: e.project_id ?? '',
      task_type: e.task_type,
      description: e.description ?? '',
      is_billable: e.is_billable,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    const h = parseFloat(form.hours);
    if (!form.date || isNaN(h) || h <= 0) return;
    setSaving(true);
    const payload: any = {
      user_id: currentUser?.id,
      date: form.date,
      hours: h,
      project_id: form.project_id || null,
      task_type: form.task_type,
      description: form.description || null,
      is_billable: form.is_billable,
      status: 'pending',
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error } = await supabase.from('timesheets').update(payload).eq('id', editing.id);
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Entry updated' }); setDialogOpen(false); fetchAll(); }
    } else {
      const { error } = await supabase.from('timesheets').insert({ ...payload, created_at: new Date().toISOString() });
      if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
      else { toast({ title: 'Hours logged' }); setDialogOpen(false); fetchAll(); }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    await supabase.from('timesheets').delete().eq('id', id);
    toast({ title: 'Entry deleted' });
    setEntries(p => p.filter(e => e.id !== id));
  }

  async function handleApprove(id: string) {
    const entry = entries.find(e => e.id === id);
    await supabase.from('timesheets').update({ status: 'approved', approved_by: currentUser?.id, approved_at: new Date().toISOString() }).eq('id', id);
    // Notify the employee whose timesheet was approved
    if (entry && entry.user_id !== currentUser?.id) {
      await supabase.from('notifications').insert({
        recipient_id: entry.user_id,
        event_type: 'timesheet_approved',
        entity_type: 'timesheet',
        entity_id: id,
        title_en: 'Timesheet Entry Approved',
        message_en: `Your timesheet entry for ${entry.date} (${entry.hours}h — ${entry.activity_type ?? 'General'}) has been approved by ${currentUser?.name ?? 'Admin'}.`,
        priority: 'normal',
        status: 'pending',
        triggered_by: currentUser?.id,
        triggered_by_name: currentUser?.name ?? '',
        action_url: '/timesheet',
        email_sent: false,
      });
    }
    toast({ title: 'Entry approved' });
    setEntries(p => p.map(e => e.id === id ? { ...e, status: 'approved' } : e));
  }

  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) });

  const myEntries = entries.filter(e => e.user_id === currentUser?.id);

  const weekEntries = myEntries.filter(e => {
    const d = parseISO(e.date);
    return isValid(d) && d >= weekStart && d <= endOfWeek(weekStart, { weekStartsOn: 1 });
  });

  const weekTotal = weekEntries.reduce((s, e) => s + e.hours, 0);
  const weekBillable = weekEntries.filter(e => e.is_billable).reduce((s, e) => s + e.hours, 0);

  const filtered = useMemo(() => {
    let list = tab === 'week' ? weekEntries
      : tab === 'team' ? entries
      : myEntries;
    if (userFilter) list = list.filter(e => e.user_id === userFilter);
    if (search) list = list.filter(e =>
      e.description?.toLowerCase().includes(search.toLowerCase()) ||
      e.project_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.task_type.toLowerCase().includes(search.toLowerCase())
    );
    return list;
  }, [entries, tab, weekEntries, myEntries, userFilter, search]);

  const totalHours = myEntries.reduce((s, e) => s + e.hours, 0);
  const approvedHours = myEntries.filter(e => e.status === 'approved').reduce((s, e) => s + e.hours, 0);
  const thisWeekHours = weekTotal;
  const pendingCount = isAdmin ? entries.filter(e => e.status === 'pending').length : 0;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-blue-500" />
            Timesheet
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Log and track hours across projects and activities</p>
        </div>
        <Button onClick={openNew} data-testid="btn-log-hours">
          <Plus className="h-4 w-4 mr-1" /> Log Hours
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'This Week', value: `${thisWeekHours.toFixed(1)}h`, icon: <Calendar className="h-4 w-4" />, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20' },
          { label: 'Total Logged', value: `${totalHours.toFixed(1)}h`, icon: <TrendingUp className="h-4 w-4" />, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
          { label: 'Billable (Week)', value: `${weekBillable.toFixed(1)}h`, icon: <BarChart2 className="h-4 w-4" />, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
          { label: isAdmin ? 'Pending Approval' : 'Approved Total', value: isAdmin ? pendingCount : `${approvedHours.toFixed(1)}h`, icon: <CheckCircle2 className="h-4 w-4" />, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20' },
        ].map(s => (
          <div key={s.label} className={cn('rounded-lg p-3 flex items-center gap-3', s.bg)}>
            <span className={s.color}>{s.icon}</span>
            <div>
              <p className={cn('text-xl font-bold', s.color)}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Weekly calendar strip */}
      {tab === 'week' && (
        <div className="border rounded-lg bg-card p-3">
          <div className="flex items-center justify-between mb-3">
            <Button size="icon" variant="ghost" onClick={() => setWeekStart(w => subWeeks(w, 1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm font-medium">
              {format(weekStart, 'dd MMM')} – {format(endOfWeek(weekStart, { weekStartsOn: 1 }), 'dd MMM yyyy')}
            </span>
            <Button size="icon" variant="ghost" onClick={() => setWeekStart(w => addWeeks(w, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map(day => {
              const dayEntries = weekEntries.filter(e => isSameDay(parseISO(e.date), day));
              const dayHours = dayEntries.reduce((s, e) => s + e.hours, 0);
              return (
                <div key={day.toISOString()} className={cn(
                  'rounded-lg p-2 text-center border transition-colors',
                  isToday(day) ? 'bg-primary/10 border-primary/30' : 'bg-muted/30',
                )}>
                  <p className="text-xs text-muted-foreground">{format(day, 'EEE')}</p>
                  <p className={cn('text-sm font-semibold', isToday(day) && 'text-primary')}>{format(day, 'd')}</p>
                  <p className={cn('text-xs font-medium mt-0.5', dayHours >= 8 ? 'text-emerald-600' : dayHours > 0 ? 'text-amber-600' : 'text-muted-foreground')}>
                    {dayHours > 0 ? `${dayHours}h` : '—'}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-center text-xs text-muted-foreground">
            Week total: <span className={cn('font-semibold', weekTotal >= 40 ? 'text-emerald-600' : 'text-amber-600')}>{weekTotal.toFixed(1)}h</span>
            {weekTotal < 40 && <span className="ml-1 text-muted-foreground">({(40 - weekTotal).toFixed(1)}h remaining to full week)</span>}
          </div>
        </div>
      )}

      {/* Tabs + Filters */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="all">My History</TabsTrigger>
            {isAdmin && <TabsTrigger value="team">Team View</TabsTrigger>}
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          {(tab === 'team' && isAdmin) && (
            <Select value={userFilter} onValueChange={setUserFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="All staff" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Staff</SelectItem>
                {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input className="pl-8 w-40" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Entries list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Clock className="h-10 w-10 mx-auto mb-2 opacity-20" />
          <p>No timesheet entries found.</p>
          <Button className="mt-3" variant="outline" onClick={openNew}>Log your first hours</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => {
            const st = STATUS_CFG[entry.status] ?? STATUS_CFG.pending;
            return (
              <Card key={entry.id} data-testid={`timesheet-entry-${entry.id}`}>
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    {/* Hours bubble */}
                    <div className={cn(
                      'min-w-[3rem] h-12 rounded-lg flex flex-col items-center justify-center text-sm font-bold border',
                      entry.is_billable ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800 text-blue-700 dark:text-blue-400' : 'bg-muted border-border text-muted-foreground'
                    )}>
                      <span>{entry.hours}h</span>
                      <span className="text-[9px] font-normal">{entry.is_billable ? 'Billable' : 'Non-bill'}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs capitalize">{TASK_TYPES.find(t => t.value === entry.task_type)?.label ?? entry.task_type}</Badge>
                        {entry.project_name !== '—' && <span className="text-xs text-muted-foreground flex items-center gap-1"><Briefcase className="h-3 w-3" />{entry.project_name}</span>}
                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full', st.badge)}>{st.label}</span>
                      </div>
                      <p className="text-sm mt-0.5 text-muted-foreground">{entry.description ?? '—'}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{isValid(parseISO(entry.date)) ? format(parseISO(entry.date), 'EEE, dd MMM yyyy') : entry.date}</span>
                        {tab === 'team' && entry.user_name && <span className="flex items-center gap-1"><User className="h-3 w-3" />{entry.user_name}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {isAdmin && entry.status === 'pending' && (
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 h-7 text-xs" onClick={() => handleApprove(entry.id)}>Approve</Button>
                      )}
                      {(entry.user_id === currentUser?.id && entry.status !== 'approved') && (
                        <>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(entry)}><Edit2 className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(entry.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Log Hours Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Entry' : 'Log Hours'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <Label>Hours *</Label>
                <Input type="number" min={0.25} max={24} step={0.25} value={form.hours} onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} placeholder="e.g. 4.5" />
              </div>
            </div>
            <div>
              <Label>Activity Type</Label>
              <Select value={form.task_type} onValueChange={v => setForm(p => ({ ...p, task_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project (optional)</Label>
              <Select value={form.project_id} onValueChange={v => setForm(p => ({ ...p, project_id: v }))}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} placeholder="What did you work on?" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="billable" checked={form.is_billable} onChange={e => setForm(p => ({ ...p, is_billable: e.target.checked }))} className="h-4 w-4 rounded" />
              <Label htmlFor="billable" className="cursor-pointer">Billable hours</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.date || !form.hours} data-testid="btn-save-hours">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editing ? 'Update' : 'Log Hours'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
