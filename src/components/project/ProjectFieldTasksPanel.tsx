import { useState, useMemo } from 'react';
import {
  Plus, Filter, X, MapPin, Calendar, User, Flag, Trash2,
  CheckCircle2, Clock, AlertTriangle, Circle, Loader2, Edit2,
  ChevronDown, Search, CheckSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { format, parseISO, isBefore } from 'date-fns';
import {
  useProjectTasks,
  type FieldTask,
  type FieldTaskStatus,
  type FieldTaskPriority,
  type CreateFieldTask,
} from '@/hooks/useProjectTasks';
import type { CustomStageEntry } from '@/hooks/useProjectFlow';
import type { FlowStage } from '@/config/projectFlows';

// ── Constants ──────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<FieldTaskPriority, { label: string; color: string; icon: string }> = {
  low:      { label: 'Low',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',     icon: '↓' },
  medium:   { label: 'Medium',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: '→' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', icon: '↑' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',         icon: '‼' },
};

const STATUS_CFG: Record<FieldTaskStatus, { label: string; color: string; border: string }> = {
  todo:       { label: 'To Do',       color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',         border: 'border-l-slate-300' },
  inprogress: { label: 'In Progress', color: 'bg-[#1D3461] text-white',                                                    border: 'border-l-[#1D3461]' },
  done:       { label: 'Done',        color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300', border: 'border-l-emerald-500' },
  cancelled:  { label: 'Cancelled',   color: 'bg-slate-100 text-slate-400 dark:bg-slate-800',                              border: 'border-l-slate-200' },
};

const STATUS_ORDER: FieldTaskStatus[] = ['todo', 'inprogress', 'done', 'cancelled'];
const PRIORITY_ORDER: FieldTaskPriority[] = ['critical', 'high', 'medium', 'low'];

// ── Helpers ────────────────────────────────────────────────────────────────

function useProfileSearch(q: string) {
  return useQuery({
    queryKey: ['profile_search_tasks', q],
    queryFn: async () => {
      if (q.length < 2) return [];
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('status', 'approved')
        .ilike('full_name', `%${q}%`)
        .limit(8);
      return data ?? [];
    },
    enabled: q.length >= 2,
    staleTime: 60_000,
  });
}

function fmtDate(iso?: string | null) {
  if (!iso) return null;
  try { return format(parseISO(iso), 'dd MMM yyyy'); } catch { return iso; }
}

function isOverdue(dueDate?: string | null, status?: FieldTaskStatus) {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  try { return isBefore(parseISO(dueDate), new Date()); } catch { return false; }
}

// ── Task Form Dialog ───────────────────────────────────────────────────────

interface TaskFormProps {
  open: boolean;
  onClose: () => void;
  initial?: FieldTask | null;
  onSave: (data: CreateFieldTask & { status: FieldTaskStatus }) => Promise<void>;
  isSaving: boolean;
  allStages: FlowStage[];
  customEntries: CustomStageEntry[];
}

function TaskFormDialog({ open, onClose, initial, onSave, isSaving, allStages, customEntries }: TaskFormProps) {
  const [title,        setTitle]        = useState(initial?.title        ?? '');
  const [description,  setDescription]  = useState(initial?.description  ?? '');
  const [priority,     setPriority]     = useState<FieldTaskPriority>(initial?.priority ?? 'medium');
  const [status,       setStatus]       = useState<FieldTaskStatus>(initial?.status ?? 'todo');
  const [dueDate,      setDueDate]      = useState(initial?.dueDate      ?? '');
  const [stateName,    setStateName]    = useState(initial?.stateName    ?? '');
  const [localityName, setLocalityName] = useState(initial?.localityName ?? '');
  const [stageId,      setStageId]      = useState(initial?.stageId      ?? '');
  const [notes,        setNotes]        = useState(initial?.notes        ?? '');
  const [assignedTo,   setAssignedTo]   = useState<string | null>(initial?.assignedTo ?? null);
  const [assigneeName, setAssigneeName] = useState(initial?.assignedToName ?? '');
  const [assignSearch, setAssignSearch] = useState('');
  const [assignOpen,   setAssignOpen]   = useState(false);
  const { data: searchResults = [] } = useProfileSearch(assignSearch);

  const isEditing = !!initial;

  const handleSubmit = async () => {
    if (!title.trim()) return;
    await onSave({
      title: title.trim(),
      description: description.trim() || undefined,
      priority,
      status,
      assignedTo: assignedTo || null,
      dueDate: dueDate || null,
      stateName: stateName.trim() || null,
      localityName: localityName.trim() || null,
      stageId: stageId || null,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-[#1D3461]" />
            {isEditing ? 'Edit Field Task' : 'New Field Task'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 py-2">
          {/* Title */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task Title *</Label>
            <Input
              placeholder="e.g. Visit 5 sites in Kassala State"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="h-9"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</Label>
            <Textarea
              placeholder="What needs to be done in the field..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>

          {/* Priority + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as FieldTaskPriority)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_ORDER.map(p => (
                    <SelectItem key={p} value={p}>
                      <span className="flex items-center gap-2">
                        <span>{PRIORITY_CFG[p].icon}</span>
                        {PRIORITY_CFG[p].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as FieldTaskStatus)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Assignee */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <User className="h-3 w-3" /> Assignee
            </Label>
            <Popover open={assignOpen} onOpenChange={setAssignOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 w-full justify-between text-sm font-normal">
                  {assigneeName || <span className="text-muted-foreground">Search staff…</span>}
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <Input
                  placeholder="Type a name…"
                  value={assignSearch}
                  onChange={e => setAssignSearch(e.target.value)}
                  className="h-8 text-sm mb-2"
                  autoFocus
                />
                {assignedTo && (
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm text-muted-foreground mb-1"
                    onClick={() => { setAssignedTo(null); setAssigneeName(''); setAssignOpen(false); }}
                  >
                    <X className="h-3.5 w-3.5" /> Remove assignee
                  </button>
                )}
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {assignSearch.length < 2 && <p className="text-[10px] text-muted-foreground px-2">Type 2+ chars to search</p>}
                  {searchResults.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted text-sm text-left"
                      onClick={() => { setAssignedTo(p.id); setAssigneeName(p.full_name); setAssignSearch(''); setAssignOpen(false); }}
                    >
                      <div className="h-6 w-6 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {p.full_name?.charAt(0) ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{p.full_name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{p.role?.replace(/_/g, ' ')}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Due date */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Due Date
            </Label>
            <Input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="h-9 text-sm"
            />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <MapPin className="h-3 w-3" /> State
              </Label>
              <Input
                placeholder="e.g. Kassala"
                value={stateName}
                onChange={e => setStateName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Locality</Label>
              <Input
                placeholder="e.g. Kassala City"
                value={localityName}
                onChange={e => setLocalityName(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Link to Flow Stage */}
          {allStages.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Linked to Flow Stage (optional)</Label>
              <Select value={stageId || 'none'} onValueChange={v => setStageId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="No stage link" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not linked to any stage</SelectItem>
                  {allStages.map(s => {
                    const entry = customEntries.find(e => e.id === s.id);
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {entry?.customLabel || s.label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Helps associate this task with a project phase</p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Field Notes</Label>
            <Textarea
              placeholder="Access instructions, contacts, risks, context…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter className="pt-3 gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSaving || !title.trim()}
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
          >
            {isSaving
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
              : isEditing ? 'Save Changes' : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Status quick-change menu ───────────────────────────────────────────────

function StatusMenu({ task, onUpdate }: { task: FieldTask; onUpdate: (status: FieldTaskStatus) => void }) {
  const cfg = STATUS_CFG[task.status];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1', cfg.color)}>
          {cfg.label} <ChevronDown className="h-2.5 w-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-36">
        {STATUS_ORDER.map(s => (
          <DropdownMenuItem key={s} onClick={() => onUpdate(s)} className={cn(task.status === s && 'font-semibold')}>
            {STATUS_CFG[s].label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────

interface Props {
  projectId: string;
  projectName: string;
  currentUserId?: string;
  currentUserName?: string;
  canEdit: boolean;
  allStages: FlowStage[];
  customEntries: CustomStageEntry[];
}

export function ProjectFieldTasksPanel({
  projectId, projectName, currentUserId, currentUserName = 'A manager', canEdit, allStages, customEntries,
}: Props) {
  const { toast } = useToast();
  const { tasks, isLoading, createTask, updateTask, deleteTask, isCreating, isUpdating } =
    useProjectTasks(projectId);

  const [formOpen,  setFormOpen]  = useState(false);
  const [editTask,  setEditTask]  = useState<FieldTask | null>(null);
  const [search,    setSearch]    = useState('');
  const [filterStatus,   setFilterStatus]   = useState<FieldTaskStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<FieldTaskPriority | 'all'>('all');
  const [filterAssignee, setFilterAssignee] = useState<'all' | 'mine'>('all');

  // Filtered + sorted tasks
  const filtered = useMemo(() => {
    return tasks
      .filter(t => {
        if (filterStatus !== 'all' && t.status !== filterStatus) return false;
        if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
        if (filterAssignee === 'mine' && t.assignedTo !== currentUserId) return false;
        if (search.trim()) {
          const q = search.toLowerCase();
          return t.title.toLowerCase().includes(q) ||
            (t.description ?? '').toLowerCase().includes(q) ||
            (t.stateName ?? '').toLowerCase().includes(q) ||
            (t.assignedToName ?? '').toLowerCase().includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        // Sort: critical first, then by due date, then by created date
        const pa = PRIORITY_ORDER.indexOf(a.priority);
        const pb = PRIORITY_ORDER.indexOf(b.priority);
        if (pa !== pb) return pa - pb;
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [tasks, filterStatus, filterPriority, filterAssignee, search, currentUserId]);

  // Counts
  const counts = useMemo(() => {
    const c: Record<string, number> = { todo: 0, inprogress: 0, done: 0, cancelled: 0 };
    tasks.forEach(t => { c[t.status] = (c[t.status] ?? 0) + 1; });
    return c;
  }, [tasks]);

  const handleCreate = async (data: CreateFieldTask & { status: FieldTaskStatus }) => {
    if (!currentUserId) return;
    try {
      await createTask(data, currentUserId, projectName, currentUserName);
      toast({ title: 'Field task created' });
      setFormOpen(false);
    } catch (err: any) {
      toast({ title: 'Failed to create task', description: err.message, variant: 'destructive' });
    }
  };

  const handleEdit = async (data: CreateFieldTask & { status: FieldTaskStatus }) => {
    if (!editTask) return;
    try {
      await updateTask(editTask.id, data, {
        currentUserId,
        projectName,
        currentUserName,
        prevAssignee: editTask.assignedTo,
      });
      toast({ title: 'Task updated' });
      setEditTask(null);
    } catch (err: any) {
      toast({ title: 'Failed to update task', description: err.message, variant: 'destructive' });
    }
  };

  const handleStatusChange = async (task: FieldTask, status: FieldTaskStatus) => {
    try {
      await updateTask(task.id, { status }, { currentUserId });
    } catch {
      toast({ title: 'Failed to update status', variant: 'destructive' });
    }
  };

  const handleDelete = async (task: FieldTask) => {
    try {
      await deleteTask(task.id);
      toast({ title: 'Task deleted' });
    } catch {
      toast({ title: 'Failed to delete task', variant: 'destructive' });
    }
  };

  const filtersActive = filterStatus !== 'all' || filterPriority !== 'all' || filterAssignee !== 'all' || !!search.trim();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading tasks…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold text-foreground">Field Tasks</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Project-specific field operations — independent of the MMP workflow
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            onClick={() => setFormOpen(true)}
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white h-8 text-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Field Task
          </Button>
        )}
      </div>

      {/* ── Status summary strip ── */}
      <div className="grid grid-cols-4 gap-2">
        {STATUS_ORDER.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setFilterStatus(prev => prev === s ? 'all' : s)}
            className={cn(
              'rounded-lg border px-3 py-2 text-left transition-all',
              filterStatus === s
                ? 'border-[#1D3461] bg-[#0F2041]/5 ring-1 ring-[#1D3461]/30'
                : 'border-border hover:border-[#1D3461]/30',
            )}
          >
            <p className="text-lg font-bold text-foreground leading-none">{counts[s] ?? 0}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{STATUS_CFG[s].label}</p>
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tasks…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
        <Select value={filterPriority} onValueChange={v => setFilterPriority(v as any)}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            {PRIORITY_ORDER.map(p => (
              <SelectItem key={p} value={p}>{PRIORITY_CFG[p].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={filterAssignee === 'mine' ? 'default' : 'outline'}
          className={cn('h-8 text-xs px-3', filterAssignee === 'mine' && 'bg-[#1D3461] text-white')}
          onClick={() => setFilterAssignee(prev => prev === 'mine' ? 'all' : 'mine')}
        >
          <User className="h-3 w-3 mr-1" /> My Tasks
        </Button>
        {filtersActive && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs px-2 text-muted-foreground"
            onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterAssignee('all'); setSearch(''); }}
          >
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* ── Task list ── */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckSquare className="h-10 w-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            {filtersActive ? 'No tasks match the current filters' : 'No field tasks yet'}
          </p>
          {!filtersActive && canEdit && (
            <p className="text-xs text-muted-foreground mt-1">
              Click "Add Field Task" to create the first one
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(task => {
            const pcfg = PRIORITY_CFG[task.priority];
            const overdue = isOverdue(task.dueDate, task.status);
            const linkedStage = allStages.find(s => s.id === task.stageId);
            const linkedLabel = linkedStage
              ? (customEntries.find(e => e.id === linkedStage.id)?.customLabel || linkedStage.label)
              : null;

            return (
              <div
                key={task.id}
                className={cn(
                  'rounded-xl border border-l-4 bg-white dark:bg-slate-900 p-3.5 group transition-colors hover:shadow-sm',
                  STATUS_CFG[task.status].border,
                  task.status === 'done' && 'opacity-70',
                  task.status === 'cancelled' && 'opacity-50',
                )}
              >
                <div className="flex items-start gap-3">
                  {/* Status icon */}
                  <div className="flex-shrink-0 mt-0.5">
                    {task.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : task.status === 'inprogress' ? (
                      <div className="h-4 w-4 rounded-full bg-[#1D3461] flex items-center justify-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                      </div>
                    ) : task.status === 'cancelled' ? (
                      <X className="h-4 w-4 text-slate-400" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground/40" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Title row */}
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className={cn(
                        'text-sm font-semibold leading-snug flex-1',
                        task.status === 'done' && 'line-through text-muted-foreground',
                        task.status === 'cancelled' && 'line-through text-muted-foreground',
                      )}>
                        {task.title}
                      </p>
                      <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0', pcfg.color)}>
                        {pcfg.icon} {pcfg.label}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
                    )}

                    {/* Meta row */}
                    <div className="flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
                      {task.assignedToName && (
                        <span className="flex items-center gap-1">
                          <div className="h-4 w-4 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[8px] font-bold">
                            {task.assignedToName.charAt(0)}
                          </div>
                          {task.assignedToName}
                        </span>
                      )}
                      {task.dueDate && (
                        <span className={cn('flex items-center gap-1', overdue ? 'text-red-600 font-medium' : '')}>
                          <Clock className="h-3 w-3" />
                          {overdue ? '⚠ ' : ''}Due {fmtDate(task.dueDate)}
                        </span>
                      )}
                      {(task.stateName || task.localityName) && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {[task.stateName, task.localityName].filter(Boolean).join(', ')}
                        </span>
                      )}
                      {linkedLabel && (
                        <span className="flex items-center gap-1 text-[#1D3461] dark:text-blue-300">
                          <Flag className="h-3 w-3" />
                          {linkedLabel}
                        </span>
                      )}
                      {task.createdByName && (
                        <span className="text-muted-foreground/60">by {task.createdByName}</span>
                      )}
                    </div>

                    {task.notes && (
                      <p className="text-[11px] text-muted-foreground/80 bg-muted/40 rounded px-2 py-1 leading-relaxed">
                        📝 {task.notes}
                      </p>
                    )}
                  </div>

                  {/* Right actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <StatusMenu task={task} onUpdate={s => handleStatusChange(task, s)} />
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => setEditTask(task)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-[#1D3461] p-1 rounded"
                          title="Edit task"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(task)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded"
                          title="Delete task"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Dialogs ── */}
      <TaskFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleCreate}
        isSaving={isCreating}
        allStages={allStages}
        customEntries={customEntries}
      />
      {editTask && (
        <TaskFormDialog
          open
          onClose={() => setEditTask(null)}
          initial={editTask}
          onSave={handleEdit}
          isSaving={isUpdating}
          allStages={allStages}
          customEntries={customEntries}
        />
      )}
    </div>
  );
}
