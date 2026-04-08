import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, isValid, isPast, isToday, differenceInDays } from 'date-fns';
import {
  Flag, Plus, Edit2, Trash2, Loader2, CheckCircle2,
  Circle, Clock, AlertTriangle, User, Calendar, ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useUser } from '@/context/user/UserContext';

interface Milestone {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  assigned_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignee_name?: string | null;
}

interface Profile { id: string; full_name: string; }

interface Props {
  projectId: string;
}

const STATUS_CFG: Record<string, { label: string; icon: React.ReactNode; badge: string; dot: string }> = {
  pending:     { label: 'Pending',     icon: <Circle className="h-4 w-4" />,        badge: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300', dot: 'bg-gray-400' },
  in_progress: { label: 'In Progress', icon: <Clock className="h-4 w-4 text-blue-500" />,   badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', dot: 'bg-blue-500' },
  completed:   { label: 'Completed',   icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', dot: 'bg-emerald-500' },
  overdue:     { label: 'Overdue',     icon: <AlertTriangle className="h-4 w-4 text-red-500" />,  badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300', dot: 'bg-red-500' },
};

const BLANK = { title: '', description: '', due_date: '', status: 'pending', assigned_to: '' };

function computeStatus(m: Milestone): string {
  if (m.status === 'completed') return 'completed';
  if (m.due_date) {
    const d = parseISO(m.due_date);
    if (isValid(d) && isPast(d) && !isToday(d)) return 'overdue';
  }
  if (m.status === 'in_progress') return 'in_progress';
  return 'pending';
}

export function ProjectMilestonesPanel({ projectId }: Props) {
  const { currentUser } = useUser();
  const { toast } = useToast();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [form, setForm] = useState({ ...BLANK });

  const load = async () => {
    setLoading(true);
    const [{ data: ms }, { data: ps }] = await Promise.all([
      supabase.from('project_milestones').select('*').eq('project_id', projectId).order('due_date', { ascending: true, nullsFirst: false }),
      supabase.from('profiles').select('id, full_name').order('full_name'),
    ]);
    const pMap: Record<string, string> = {};
    (ps || []).forEach((p: any) => { pMap[p.id] = p.full_name; });
    setMilestones((ms || []).map((m: any) => ({ ...m, assignee_name: m.assigned_to ? pMap[m.assigned_to] || null : null })));
    setProfiles(ps || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [projectId]);

  const enriched = useMemo(() => milestones.map(m => ({ ...m, computedStatus: computeStatus(m) })), [milestones]);

  const stats = useMemo(() => ({
    total: enriched.length,
    completed: enriched.filter(m => m.status === 'completed').length,
    overdue: enriched.filter(m => m.computedStatus === 'overdue').length,
    upcoming: enriched.filter(m => m.computedStatus === 'pending' || m.computedStatus === 'in_progress').length,
  }), [enriched]);

  const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

  const openNew = () => {
    setEditing(null);
    setForm({ ...BLANK });
    setDialogOpen(true);
  };

  const openEdit = (m: Milestone) => {
    setEditing(m);
    setForm({ title: m.title, description: m.description || '', due_date: m.due_date || '', status: m.status, assigned_to: m.assigned_to || '' });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        status: form.status,
        assigned_to: form.assigned_to || null,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error } = await supabase.from('project_milestones').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Milestone updated' });
      } else {
        const { error } = await supabase.from('project_milestones').insert({ ...payload, created_by: currentUser?.id });
        if (error) throw error;
        toast({ title: 'Milestone added' });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Error saving milestone', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this milestone?')) return;
    setDeleting(id);
    const { error } = await supabase.from('project_milestones').delete().eq('id', id);
    if (error) toast({ title: 'Error deleting', variant: 'destructive' });
    else { toast({ title: 'Milestone deleted' }); load(); }
    setDeleting(null);
  };

  const toggleComplete = async (m: Milestone) => {
    const newStatus = m.status === 'completed' ? 'in_progress' : 'completed';
    await supabase.from('project_milestones').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', m.id);
    // Log milestone completion to workspace activity for team visibility
    if (newStatus === 'completed') {
      supabase.from('workspace_activity').insert({
        user_id: currentUser?.id,
        action: 'milestone_completed',
        metadata: {
          milestone_id: m.id,
          milestone_title: m.title,
          project_id: projectId,
        },
      }).then(() => {}).catch(() => {});
    }
    load();
  };

  const setF = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + progress */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Flag className="h-4 w-4 text-[#1D3461]" />
            <span className="text-sm font-semibold">{stats.total} milestone{stats.total !== 1 ? 's' : ''}</span>
            {stats.overdue > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[11px]">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{stats.overdue} overdue
              </Badge>
            )}
          </div>
          {stats.total > 0 && (
            <div className="flex items-center gap-3">
              <Progress value={pct} className="h-2 flex-1 max-w-xs" />
              <span className="text-xs text-muted-foreground font-medium">{stats.completed}/{stats.total} done ({pct}%)</span>
            </div>
          )}
        </div>
        <Button size="sm" onClick={openNew} className="bg-[#1D3461] hover:bg-[#0F2041] text-white">
          <Plus className="h-4 w-4 mr-1.5" />Add Milestone
        </Button>
      </div>

      {/* KPI strip */}
      {stats.total > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: 'Completed', value: stats.completed, color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'In Progress / Pending', value: stats.upcoming, color: 'text-blue-600 dark:text-blue-400' },
            { label: 'Overdue', value: stats.overdue, color: stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground' },
          ].map(k => (
            <div key={k.label} className="bg-muted/30 rounded-xl p-3 text-center border">
              <div className={cn('text-2xl font-bold', k.color)}>{k.value}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Milestone list */}
      {enriched.length === 0 ? (
        <div className="flex flex-col items-center py-14 border-2 border-dashed rounded-xl gap-3">
          <Flag className="h-10 w-10 text-muted-foreground/30" />
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">No milestones yet</p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">Add milestones to track key checkpoints in this project</p>
          </div>
          <Button size="sm" variant="outline" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" />Add first milestone</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {enriched.map(m => {
            const cfg = STATUS_CFG[m.computedStatus] ?? STATUS_CFG.pending;
            const daysLeft = m.due_date && isValid(parseISO(m.due_date))
              ? differenceInDays(parseISO(m.due_date), new Date())
              : null;
            return (
              <div
                key={m.id}
                className={cn(
                  'group flex items-start gap-3 p-3.5 rounded-xl border bg-card hover:shadow-sm transition-all',
                  m.computedStatus === 'overdue' && 'border-red-200 dark:border-red-900/40',
                  m.computedStatus === 'completed' && 'opacity-70',
                )}
                data-testid={`milestone-${m.id}`}
              >
                {/* Complete toggle */}
                <button
                  type="button"
                  onClick={() => toggleComplete(m)}
                  className="mt-0.5 flex-shrink-0 transition-transform hover:scale-110"
                  title={m.status === 'completed' ? 'Mark incomplete' : 'Mark complete'}
                >
                  {m.status === 'completed'
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    : <div className={cn('h-5 w-5 rounded-full border-2 border-muted-foreground/40 hover:border-emerald-500 transition-colors')} />
                  }
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={cn('text-sm font-semibold leading-tight', m.status === 'completed' && 'line-through text-muted-foreground')}>
                      {m.title}
                    </span>
                    <Badge className={cn('text-[11px] px-2 py-0.5', cfg.badge)}>{cfg.label}</Badge>
                  </div>
                  {m.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {m.due_date && isValid(parseISO(m.due_date)) && (
                      <span className={cn('text-[11px] flex items-center gap-1', m.computedStatus === 'overdue' ? 'text-red-600' : 'text-muted-foreground')}>
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(m.due_date), 'dd MMM yyyy')}
                        {daysLeft !== null && m.status !== 'completed' && (
                          <span>
                            {daysLeft < 0 ? ` (${Math.abs(daysLeft)}d overdue)` : daysLeft === 0 ? ' (today)' : ` (in ${daysLeft}d)`}
                          </span>
                        )}
                      </span>
                    )}
                    {m.assignee_name && (
                      <span className="text-[11px] flex items-center gap-1 text-muted-foreground">
                        <User className="h-3 w-3" />{m.assignee_name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(m)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    data-testid={`edit-milestone-${m.id}`}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    disabled={deleting === m.id}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 transition-colors"
                    data-testid={`delete-milestone-${m.id}`}
                  >
                    {deleting === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-[#1D3461]" />
              {editing ? 'Edit Milestone' : 'Add Milestone'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setF('title', e.target.value)} placeholder="e.g. Phase 1 assessment complete" className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={e => setF('description', e.target.value)} placeholder="What does this milestone represent?" className="mt-1 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Due Date</Label>
                <Input type="date" value={form.due_date} onChange={e => setF('due_date', e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setF('status', v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Assign To</Label>
              <Select value={form.assigned_to || 'none'} onValueChange={v => setF('assigned_to', v === 'none' ? '' : v)}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {profiles.map(p => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-[#1D3461] hover:bg-[#0F2041] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editing ? 'Update' : 'Add Milestone'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
