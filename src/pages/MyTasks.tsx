import { useState, useMemo, useRef } from 'react';
import { format, isToday, isThisWeek, isBefore, parseISO, isValid, startOfDay } from 'date-fns';
import {
  CheckSquare, Plus, Trash2, Edit2, MoreHorizontal, Flag,
  Calendar, Clock, AlertTriangle, CheckCircle2, Circle,
  FolderOpen, User, ChevronRight, RefreshCw, Loader2,
  Filter, X, ListTodo, Inbox, Star, BarChart2, ArrowRight,
  Search, PlayCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useUser } from '@/context/user/UserContext';
import {
  usePersonalTasks, useAssignedProjectTasks, useUpdateProjectTaskStatus,
  type PersonalTask, type PersonalTaskPriority, type PersonalTaskStatus, type CreatePersonalTask,
} from '@/hooks/usePersonalTasks';

// ── Config ─────────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<PersonalTaskPriority, { label: string; color: string; dot: string; icon: string }> = {
  low:      { label: 'Low',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',         dot: 'bg-blue-500',    icon: '▽' },
  medium:   { label: 'Medium',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',     dot: 'bg-amber-500',   icon: '◈' },
  high:     { label: 'High',     color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', dot: 'bg-orange-500',  icon: '▲' },
  critical: { label: 'Critical', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',             dot: 'bg-red-500',     icon: '⬆' },
};

const STATUS_CFG: Record<PersonalTaskStatus, { label: string; color: string; border: string }> = {
  todo:       { label: 'To Do',       color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',          border: 'border-l-slate-400' },
  inprogress: { label: 'In Progress', color: 'bg-[#1D3461] text-white',                                                    border: 'border-l-[#1D3461]' },
  done:       { label: 'Done',        color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300', border: 'border-l-emerald-500' },
  cancelled:  { label: 'Cancelled',   color: 'bg-slate-100 text-slate-400 dark:bg-slate-800',                              border: 'border-l-slate-200' },
};

type FilterType = 'all' | 'today' | 'week' | 'overdue' | 'done';

function isOverdue(dueDate?: string | null, status?: string): boolean {
  if (!dueDate || status === 'done' || status === 'cancelled') return false;
  try {
    const d = parseISO(dueDate);
    return isValid(d) && isBefore(startOfDay(d), startOfDay(new Date()));
  } catch { return false; }
}

function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = parseISO(iso);
    return isValid(d) ? format(d, 'dd MMM') : null;
  } catch { return null; }
}

function matchFilter(dueDate: string | null | undefined, status: string, filter: FilterType): boolean {
  if (filter === 'all') return true;
  if (filter === 'done') return status === 'done';
  if (filter === 'overdue') return isOverdue(dueDate, status);
  if (!dueDate) return false;
  try {
    const d = parseISO(dueDate);
    if (!isValid(d)) return false;
    if (filter === 'today') return isToday(d);
    if (filter === 'week') return isThisWeek(d, { weekStartsOn: 0 });
  } catch { return false; }
  return false;
}

// ── Quick-add bar ───────────────────────────────────────────────────────────

interface QuickAddProps {
  onAdd: (title: string, priority: PersonalTaskPriority, dueDate: string) => void;
  isCreating: boolean;
}

function QuickAddBar({ onAdd, isCreating }: QuickAddProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, priority, dueDate);
    setTitle('');
    setDueDate('');
    setPriority('medium');
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-2 p-3 rounded-xl border-2 border-dashed border-[#1D3461]/20 bg-[#1D3461]/3 dark:bg-[#1D3461]/10 hover:border-[#1D3461]/40 transition-colors">
      <div className="h-5 w-5 rounded-full border-2 border-[#1D3461]/40 flex items-center justify-center flex-shrink-0">
        <Plus className="h-3 w-3 text-[#1D3461]/60" />
      </div>
      <Input
        ref={inputRef}
        placeholder="Add a personal task… press Enter to save"
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        className="border-0 bg-transparent shadow-none p-0 h-7 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/60 flex-1"
        data-testid="input-quick-add-task"
      />
      <Select value={priority} onValueChange={v => setPriority(v as PersonalTaskPriority)}>
        <SelectTrigger className="h-7 w-24 text-xs border-0 bg-muted/60 focus:ring-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['low', 'medium', 'high', 'critical'] as PersonalTaskPriority[]).map(p => (
            <SelectItem key={p} value={p} className="text-xs">{PRIORITY_CFG[p].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={dueDate}
        onChange={e => setDueDate(e.target.value)}
        className="h-7 w-32 text-xs border-0 bg-muted/60 focus:ring-0"
      />
      <Button
        size="sm"
        className="h-7 px-3 text-xs bg-[#1D3461] hover:bg-[#0F2041] text-white"
        onClick={submit}
        disabled={!title.trim() || isCreating}
        data-testid="button-add-personal-task"
      >
        {isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
      </Button>
    </div>
  );
}

// ── Personal Task Card ──────────────────────────────────────────────────────

interface PersonalTaskCardProps {
  task: PersonalTask;
  onStatusChange: (status: PersonalTaskStatus, prev: PersonalTaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function PersonalTaskCard({ task, onStatusChange, onEdit, onDelete }: PersonalTaskCardProps) {
  const pCfg = PRIORITY_CFG[task.priority];
  const sCfg = STATUS_CFG[task.status];
  const overdue = isOverdue(task.dueDate, task.status);
  const isDone = task.status === 'done';
  const isInProgress = task.status === 'inprogress';

  return (
    <div className={cn(
      'group flex items-start gap-3 px-3 py-2.5 rounded-lg border border-l-4 bg-card hover:shadow-sm transition-all',
      sCfg.border,
      isDone && 'opacity-60',
    )}>
      {/* Status toggle circle */}
      <button
        type="button"
        className={cn(
          'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110',
          isDone
            ? 'border-emerald-500 bg-emerald-500'
            : isInProgress
            ? 'border-[#1D3461] bg-[#1D3461]/10'
            : 'border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-50',
        )}
        onClick={() => onStatusChange(isDone ? 'todo' : 'done', task.status)}
        title={isDone ? 'Click to reopen' : 'Click to mark as done'}
        data-testid={`task-toggle-${task.id}`}
      >
        {isDone
          ? <CheckCircle2 className="h-3 w-3 text-white" />
          : isInProgress
          ? <div className="h-2 w-2 rounded-full bg-[#1D3461]" />
          : <CheckCircle2 className="h-3 w-3 text-emerald-500 opacity-0 group-hover:opacity-60 transition-opacity" />
        }
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium leading-snug', isDone && 'line-through text-muted-foreground')}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', pCfg.color)}>
            {pCfg.label}
          </span>
          {task.dueDate && (
            <span className={cn(
              'text-[10px] flex items-center gap-0.5',
              overdue ? 'text-red-600 font-semibold' : isToday(parseISO(task.dueDate)) ? 'text-amber-600 font-medium' : 'text-muted-foreground',
            )}>
              <Calendar className="h-2.5 w-2.5" />
              {overdue && '⚠ '}{fmtDate(task.dueDate)}
            </span>
          )}
          {task.category && task.category !== 'personal' && (
            <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{task.category}</span>
          )}
        </div>
      </div>

      {/* "Mark Done" visible button (not done tasks only) */}
      {!isDone && (
        <button
          type="button"
          onClick={() => onStatusChange('done', task.status)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0"
          data-testid={`task-mark-done-${task.id}`}
        >
          <CheckCircle2 className="h-3 w-3" /> Done
        </button>
      )}

      {/* Status dropdown */}
      <Select
        value={task.status}
        onValueChange={v => onStatusChange(v as PersonalTaskStatus, task.status)}
      >
        <SelectTrigger className="h-6 w-6 border-0 bg-transparent p-0 focus:ring-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" title="Change status">
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </SelectTrigger>
        <SelectContent>
          <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Change Status</div>
          {(['todo', 'inprogress', 'done', 'cancelled'] as PersonalTaskStatus[]).map(s => (
            <SelectItem key={s} value={s} className="text-xs">
              <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-semibold', STATUS_CFG[s].color)}>{STATUS_CFG[s].label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* More actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="text-sm">
          <DropdownMenuItem onClick={onEdit}><Edit2 className="h-3.5 w-3.5 mr-2" />Edit Task</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
            <Trash2 className="h-3.5 w-3.5 mr-2" />Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Assigned Project Task Card ──────────────────────────────────────────────

interface ProjectTaskCardProps {
  task: any;
  onStatusChange: (id: string, status: string) => void;
  isUpdating: boolean;
}

function ProjectTaskCard({ task, onStatusChange, isUpdating }: ProjectTaskCardProps) {
  const navigate = useNavigate();
  const overdue = isOverdue(task.dueDate, task.status);
  const isDone = task.status === 'done';
  const isInProgress = task.status === 'inprogress';
  const pCfg = PRIORITY_CFG[task.priority as PersonalTaskPriority] ?? PRIORITY_CFG.medium;

  const borderColor = isDone ? 'border-l-emerald-500'
    : isInProgress ? 'border-l-[#1D3461]'
    : overdue ? 'border-l-red-500'
    : 'border-l-slate-300';

  return (
    <div
      className={cn(
        'group flex items-start gap-3 px-3 py-2.5 rounded-lg border border-l-4 bg-card hover:shadow-sm transition-all',
        borderColor,
        isDone && 'opacity-60',
      )}
      data-testid={`project-task-card-${task.id}`}
    >
      {/* Status toggle circle */}
      <button
        type="button"
        disabled={isUpdating}
        className={cn(
          'mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110',
          isDone ? 'border-emerald-500 bg-emerald-500'
            : isInProgress ? 'border-[#1D3461] bg-[#1D3461]/10'
            : 'border-muted-foreground/40 hover:border-emerald-500 hover:bg-emerald-50',
        )}
        onClick={() => onStatusChange(task.id, isDone ? 'todo' : 'done')}
        title={isDone ? 'Click to reopen' : 'Click to mark as done'}
        data-testid={`project-task-toggle-${task.id}`}
      >
        {isDone
          ? <CheckCircle2 className="h-3 w-3 text-white" />
          : isInProgress
          ? <div className="h-2 w-2 rounded-full bg-[#1D3461]" />
          : <CheckCircle2 className="h-3 w-3 text-emerald-500 opacity-0 group-hover:opacity-60 transition-opacity" />
        }
      </button>

      {/* Content — clicking navigates to project field tasks */}
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => navigate(`/projects/${task.projectId}?tab=field_tasks`)}
      >
        <p className={cn('text-sm font-medium leading-snug', isDone && 'line-through text-muted-foreground')}>
          {task.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[9px] flex items-center gap-0.5 text-muted-foreground font-medium">
            <FolderOpen className="h-2.5 w-2.5" />
            {task.projectName}
          </span>
          <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', pCfg.color)}>
            {pCfg.label}
          </span>
          {task.dueDate && (
            <span className={cn(
              'text-[10px] flex items-center gap-0.5',
              overdue ? 'text-red-600 font-semibold' : isToday(parseISO(task.dueDate)) ? 'text-amber-600 font-medium' : 'text-muted-foreground',
            )}>
              <Calendar className="h-2.5 w-2.5" />
              {overdue && '⚠ '}{fmtDate(task.dueDate)}
            </span>
          )}
        </div>
      </div>

      {/* Inline status actions (hover) */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {!isDone && !isInProgress && (
          <button
            type="button"
            onClick={() => onStatusChange(task.id, 'inprogress')}
            className="text-[10px] font-medium text-[#1D3461] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1"
            title="Mark as In Progress"
            data-testid={`project-task-inprogress-${task.id}`}
          >
            <PlayCircle className="h-3 w-3" /> Start
          </button>
        )}
        {!isDone && (
          <button
            type="button"
            onClick={() => onStatusChange(task.id, 'done')}
            className="text-[10px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1"
            data-testid={`project-task-done-${task.id}`}
          >
            <CheckCircle2 className="h-3 w-3" /> Done
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate(`/projects/${task.projectId}?tab=field_tasks`)}
          className="text-[10px] text-muted-foreground hover:text-[#1D3461] p-0.5"
          title="Open in project"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Edit Dialog ─────────────────────────────────────────────────────────────

interface EditDialogProps {
  task: PersonalTask | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<CreatePersonalTask>) => Promise<void>;
  isSaving: boolean;
}

function EditPersonalTaskDialog({ task, onClose, onSave, isSaving }: EditDialogProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<PersonalTaskPriority>(task?.priority ?? 'medium');
  const [status, setStatus] = useState<PersonalTaskStatus>(task?.status ?? 'todo');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [category, setCategory] = useState(task?.category ?? 'personal');
  const [notes, setNotes] = useState(task?.notes ?? '');

  if (!task) return null;

  const handleSave = async () => {
    await onSave(task.id, {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      dueDate: dueDate || null,
      category: category || 'personal',
      notes: notes.trim() || null,
    });
    onClose();
  };

  return (
    <Dialog open={!!task} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4 text-[#1D3461]" />
            Edit Personal Task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} className="min-h-[70px] text-sm resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as PersonalTaskPriority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high', 'critical'] as PersonalTaskPriority[]).map(p => (
                    <SelectItem key={p} value={p}>{PRIORITY_CFG[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as PersonalTaskStatus)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['todo', 'inprogress', 'done', 'cancelled'] as PersonalTaskStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Due Date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Category</Label>
              <Input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. work, personal" className="h-9" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[60px] text-sm resize-none" />
          </div>
        </div>
        <DialogFooter className="gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={!title.trim() || isSaving} className="bg-[#1D3461] hover:bg-[#0F2041] text-white">
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function MyTasks() {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const userId = currentUser?.id;

  const { tasks: personalTasks, isLoading: loadingPersonal, createTask, updateTask, deleteTask, isCreating, isUpdating } = usePersonalTasks(userId);
  const { data: projectTasks = [], isLoading: loadingProject, refetch: refetchProject } = useAssignedProjectTasks(userId);
  const updateProjectTaskStatus = useUpdateProjectTaskStatus();

  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);

  const today = format(new Date(), 'EEEE, d MMMM yyyy');

  // Stats (computed before search filter so counts stay accurate)
  const stats = useMemo(() => {
    const allActive = [...personalTasks, ...projectTasks];
    const dueToday = allActive.filter(t => t.dueDate && isToday(parseISO(t.dueDate)) && t.status !== 'done' && t.status !== 'cancelled').length;
    const dueWeek = allActive.filter(t => t.dueDate && isThisWeek(parseISO(t.dueDate), { weekStartsOn: 0 }) && t.status !== 'done' && t.status !== 'cancelled').length;
    const overdue = allActive.filter(t => isOverdue(t.dueDate, t.status)).length;
    const done = [...personalTasks].filter(t => t.status === 'done').length;
    return { dueToday, dueWeek, overdue, done };
  }, [personalTasks, projectTasks]);

  const q = searchQuery.toLowerCase().trim();

  // Filtered lists (filter + search)
  const filteredPersonal = useMemo(() =>
    personalTasks
      .filter(t => matchFilter(t.dueDate, t.status, filter))
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q) || (t.category ?? '').toLowerCase().includes(q)),
    [personalTasks, filter, q],
  );

  const filteredProject = useMemo(() =>
    projectTasks
      .filter((t: any) => matchFilter(t.dueDate, t.status, filter))
      .filter((t: any) => !q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q) || t.projectName.toLowerCase().includes(q)),
    [projectTasks, filter, q],
  );

  const handleQuickAdd = async (title: string, priority: PersonalTaskPriority, dueDate: string) => {
    try {
      await createTask({ title, priority, dueDate: dueDate || null, category: 'personal' });
      toast({ title: 'Task added' });
    } catch {
      toast({ title: 'Failed to add task', variant: 'destructive' });
    }
  };

  const handleStatusChange = async (id: string, status: PersonalTaskStatus, prevStatus: PersonalTaskStatus) => {
    try {
      const task = personalTasks.find(t => t.id === id);
      await updateTask(id, { status, title: task?.title, priority: task?.priority }, prevStatus);
      if (status === 'done') toast({ title: '✓ Task completed!' });
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleProjectTaskStatusChange = async (id: string, status: string) => {
    try {
      await updateProjectTaskStatus.mutateAsync({ id, status });
      if (status === 'done') toast({ title: '✓ Project task marked done!' });
      else if (status === 'inprogress') toast({ title: 'Task started' });
    } catch {
      toast({ title: 'Failed to update project task', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTask(id);
      toast({ title: 'Task deleted' });
    } catch {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    }
  };

  const handleEditSave = async (id: string, updates: Partial<CreatePersonalTask>) => {
    try {
      await updateTask(id, updates);
      toast({ title: 'Task updated' });
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const FILTERS: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all',     label: 'All',      count: personalTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length + projectTasks.filter((t: any) => t.status !== 'done').length },
    { key: 'today',   label: 'Today',    count: stats.dueToday },
    { key: 'week',    label: 'This Week', count: stats.dueWeek },
    { key: 'overdue', label: 'Overdue',  count: stats.overdue },
    { key: 'done',    label: 'Done',     count: stats.done },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="h-8 w-8 rounded-lg bg-[#1D3461] flex items-center justify-center">
              <CheckSquare className="h-4 w-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-[#0F2041] dark:text-white">My Tasks</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-10">{today} · {currentUser?.fullName}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => refetchProject()}
          data-testid="button-refresh-tasks"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Due Today',  value: stats.dueToday,  icon: ListTodo,     color: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/20',   border: 'border-amber-200 dark:border-amber-800' },
          { label: 'This Week',  value: stats.dueWeek,   icon: Calendar,     color: 'text-[#1D3461]',  bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200 dark:border-blue-800' },
          { label: 'Overdue',    value: stats.overdue,   icon: AlertTriangle, color: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200 dark:border-red-800' },
          { label: 'Completed',  value: stats.done,      icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800' },
        ].map(({ label, value, icon: Icon, color, bg, border }) => (
          <div key={label} className={cn('rounded-xl border p-3.5 flex items-center gap-3', bg, border)}>
            <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', bg)}>
              <Icon className={cn('h-4.5 w-4.5', color)} />
            </div>
            <div>
              <p className={cn('text-2xl font-bold leading-none', color)}>{value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search tasks by title, project, or category…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm bg-muted/40 border-muted"
          data-testid="input-search-tasks"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* ── Quick Add ── */}
      <QuickAddBar onAdd={handleQuickAdd} isCreating={isCreating} />

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        {FILTERS.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all border',
              filter === f.key
                ? 'bg-[#1D3461] text-white border-[#1D3461] shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:border-[#1D3461]/40 hover:text-[#1D3461]',
            )}
            data-testid={`filter-${f.key}`}
          >
            {f.label}
            {(f.count ?? 0) > 0 && (
              <span className={cn(
                'inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold',
                filter === f.key ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground',
              )}>
                {f.count}
              </span>
            )}
          </button>
        ))}
        {filter !== 'all' && (
          <button type="button" onClick={() => setFilter('all')} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 ml-1">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* ── Project Tasks Section ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[#1D3461]" />
            Project Tasks Assigned to Me
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{filteredProject.length}</Badge>
          </h2>
          <a href="/projects" className="text-xs text-[#1D3461] hover:underline flex items-center gap-0.5">
            All Projects <ArrowRight className="h-3 w-3" />
          </a>
        </div>

        {loadingProject ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredProject.length === 0 ? (
          <div className="flex flex-col items-center py-8 border-2 border-dashed rounded-xl gap-2">
            <Inbox className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {filter === 'all' ? 'No project tasks assigned to you' : `No project tasks for "${FILTERS.find(f => f.key === filter)?.label}"`}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredProject.map((task: any) => (
              <ProjectTaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={handleProjectTaskStatusChange}
                  isUpdating={updateProjectTaskStatus.isPending}
                />
            ))}
          </div>
        )}
      </div>

      <Separator />

      {/* ── Personal Tasks Section ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            My Personal Tasks
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{filteredPersonal.length}</Badge>
          </h2>
          {personalTasks.filter(t => t.status === 'done').length > 0 && (
            <span className="text-xs text-muted-foreground">
              {personalTasks.filter(t => t.status === 'done').length} completed
            </span>
          )}
        </div>

        {/* Personal task progress */}
        {personalTasks.length > 0 && (() => {
          const active = personalTasks.filter(t => t.status !== 'cancelled').length;
          const done = personalTasks.filter(t => t.status === 'done').length;
          const pct = active > 0 ? Math.round((done / active) * 100) : 0;
          return (
            <div className="flex items-center gap-3 py-1">
              <Progress value={pct} className="h-1.5 flex-1" />
              <span className="text-[11px] text-muted-foreground font-medium flex-shrink-0">{pct}% done</span>
            </div>
          );
        })()}

        {loadingPersonal ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPersonal.length === 0 ? (
          <div className="flex flex-col items-center py-8 border-2 border-dashed rounded-xl gap-2">
            <CheckCircle2 className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              {personalTasks.length === 0
                ? 'No personal tasks yet — use the quick-add bar above to create one'
                : `No tasks for "${FILTERS.find(f => f.key === filter)?.label}"`}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredPersonal.map(task => (
              <PersonalTaskCard
                key={task.id}
                task={task}
                onStatusChange={(s, prev) => handleStatusChange(task.id, s, prev)}
                onEdit={() => setEditingTask(task)}
                onDelete={() => handleDelete(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Edit dialog ── */}
      <EditPersonalTaskDialog
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleEditSave}
        isSaving={isUpdating}
      />
    </div>
  );
}
