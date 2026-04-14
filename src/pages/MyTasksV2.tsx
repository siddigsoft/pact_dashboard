import { useState, useMemo, useEffect, useRef } from 'react';
import {
  format, isToday, isBefore, parseISO, isValid, startOfDay,
  addDays, isThisWeek, differenceInCalendarDays,
} from 'date-fns';
import {
  Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  Filter, LayoutDashboard, ListTodo, MoreHorizontal, Plus,
  Search, Users, AlertCircle, Briefcase, User, ChevronUp,
  ChevronDown, Loader2, X, Trash2, Edit2, Check, Bell,
  MessageSquare, Settings,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/context/user/UserContext';
import {
  usePersonalTasks, useAssignedProjectTasks, useUpdateProjectTaskStatus, materialiseDailyTasks,
  type PersonalTask, type PersonalTaskPriority, type PersonalTaskStatus,
} from '@/hooks/usePersonalTasks';
import { DailyBriefing } from '@/components/tasks/DailyBriefing';
import { PriorityMatrix } from '@/components/tasks/PriorityMatrix';

// ── Config ───────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'todo' | 'inprogress' | 'overdue' | 'done';

const PRIORITY_ORDER: Record<PersonalTaskPriority, number> = {
  critical: 0, high: 1, medium: 2, low: 3,
};

const PRIORITY_CFG = {
  critical: { label: 'Urgent',   color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200 hover:border-red-400',    pill: 'bg-red-500',    group: 'urgent' },
  high:     { label: 'High',     color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200 hover:border-amber-400', pill: 'bg-amber-500',  group: 'high' },
  medium:   { label: 'Medium',   color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200 hover:border-blue-400',   pill: 'bg-blue-500',   group: 'normal' },
  low:      { label: 'Low',      color: 'text-slate-600',  bg: 'bg-slate-50',  border: 'border-slate-200 hover:border-slate-300', pill: 'bg-slate-400',  group: 'normal' },
};

const STATUS_CFG: Record<PersonalTaskStatus, { label: string }> = {
  todo:       { label: 'To Do' },
  inprogress: { label: 'In Progress' },
  done:       { label: 'Done' },
  cancelled:  { label: 'Cancelled' },
};

type TypeKey = 'personal' | 'project';
const TYPE_CFG: Record<TypeKey, { color: string; bg: string; border: string; label: string }> = {
  personal: { color: 'bg-blue-500',  bg: 'bg-blue-50',  border: 'border-blue-200 hover:border-blue-400',  label: 'Personal' },
  project:  { color: 'bg-teal-500',  bg: 'bg-teal-50',  border: 'border-teal-200 hover:border-teal-400',  label: 'Project' },
};

function isOverdue(due?: string | null, status?: string) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  try { const d = parseISO(due); return isValid(d) && isBefore(startOfDay(d), startOfDay(new Date())); } catch { return false; }
}

function initials(name?: string | null) {
  if (!name) return 'ME';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Quick Add Dialog ─────────────────────────────────────────────────────────

interface QuickAddDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: { title: string; priority: PersonalTaskPriority; status: PersonalTaskStatus; dueDate: string; description: string }) => void;
  isCreating: boolean;
}
function QuickAddDialog({ open, onClose, onCreate, isCreating }: QuickAddDialogProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [status, setStatus] = useState<PersonalTaskStatus>('todo');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  const reset = () => { setTitle(''); setPriority('medium'); setStatus('todo'); setDueDate(''); setDescription(''); };

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), priority, status, dueDate, description });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <Input
            autoFocus
            placeholder="Task title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            data-testid="input-task-title"
          />
          <Textarea
            placeholder="Description (optional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as PersonalTaskPriority)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['critical', 'high', 'medium', 'low'] as PersonalTaskPriority[]).map(p => (
                    <SelectItem key={p} value={p}>{PRIORITY_CFG[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as PersonalTaskStatus)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['todo', 'inprogress', 'done', 'cancelled'] as PersonalTaskStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Due Date</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="h-9"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
            onClick={submit}
            disabled={!title.trim() || isCreating}
            data-testid="button-create-task"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
            Create Task
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ──────────────────────────────────────────────────────────────

interface EditDialogProps {
  task: PersonalTask | null;
  onClose: () => void;
  onSave: (id: string, data: Partial<PersonalTask>) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
}
function EditDialog({ task, onClose, onSave, onDelete, isUpdating }: EditDialogProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [status, setStatus] = useState<PersonalTaskStatus>('todo');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setPriority(task.priority);
      setStatus(task.status);
      setDueDate(task.dueDate ?? '');
      setDescription(task.description ?? '');
    }
  }, [task]);

  if (!task) return null;

  return (
    <Dialog open={!!task} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          <Input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Task title…"
          />
          <Textarea
            placeholder="Description"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as PersonalTaskPriority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['critical', 'high', 'medium', 'low'] as PersonalTaskPriority[]).map(p => (
                    <SelectItem key={p} value={p}>{PRIORITY_CFG[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Status</Label>
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
          <div>
            <Label className="text-xs mb-1 block">Due Date</Label>
            <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-9" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 mr-auto"
            onClick={() => { onDelete(task.id); onClose(); }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
            onClick={() => { onSave(task.id, { title, priority, status, dueDate: dueDate || null, description }); onClose(); }}
            disabled={!title.trim() || isUpdating}
          >
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Task Card (right panel) ───────────────────────────────────────────────────

interface TaskCardProps {
  task: PersonalTask;
  onToggleDone: () => void;
  onEdit: () => void;
  isUpdating: boolean;
}
function TaskCard({ task, onToggleDone, onEdit, isUpdating }: TaskCardProps) {
  const cfg = PRIORITY_CFG[task.priority];
  const isDone = task.status === 'done';

  return (
    <Card
      className={cn(
        'border transition-all hover:shadow-md cursor-pointer overflow-hidden bg-white group',
        isDone ? 'opacity-60 border-slate-200' : cfg.border,
      )}
      onClick={onEdit}
      data-testid={`card-task-${task.id}`}
    >
      <div className="flex">
        <div className={cn('w-1 shrink-0', isDone ? 'bg-emerald-400' : cfg.pill)} />
        <div className="flex-1 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <button
              className="mt-0.5 shrink-0"
              onClick={e => { e.stopPropagation(); onToggleDone(); }}
              disabled={isUpdating}
              data-testid={`button-toggle-done-${task.id}`}
            >
              {isDone
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                : <div className="w-4 h-4 rounded-full border-2 border-slate-300 group-hover:border-slate-500 transition-colors" />
              }
            </button>
            <p className={cn('flex-1 text-sm font-medium leading-snug', isDone && 'line-through text-slate-400')}>
              {task.title}
            </p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  onClick={e => e.stopPropagation()}
                  data-testid={`button-task-menu-${task.id}`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }}>
                  <Edit2 className="w-3.5 h-3.5 mr-2" />Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={e => { e.stopPropagation(); onToggleDone(); }}>
                  <Check className="w-3.5 h-3.5 mr-2" />{isDone ? 'Mark as Todo' : 'Mark as Done'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2 mt-2 pl-6 flex-wrap">
            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0.5 border-0', cfg.bg, cfg.color)}>
              {cfg.label}
            </Badge>
            {task.dueDate && (
              <span className={cn(
                'flex items-center gap-1 text-[10px] font-medium',
                isOverdue(task.dueDate, task.status) ? 'text-red-600' : 'text-slate-400',
              )}>
                <Clock className="w-3 h-3" />
                {isOverdue(task.dueDate, task.status) ? 'Overdue · ' : ''}
                {(() => { try { const d = parseISO(task.dueDate!); return isValid(d) ? format(d, 'dd MMM') : null; } catch { return null; } })()}
              </span>
            )}
            {task.category && (
              <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{task.category}</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

interface TimelineProps {
  tasks: PersonalTask[];
  weekOffset: number;
  onTaskClick: (task: PersonalTask) => void;
}
function Timeline({ tasks, weekOffset, onTaskClick }: TimelineProps) {
  const today = startOfDay(new Date());
  const startDay = addDays(today, weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(startDay, i);
    return { d, day: format(d, 'EEE'), date: format(d, 'd'), isToday: isToday(d) };
  });

  // Build positioned task pills (only tasks with due_date in this 7-day window)
  const positioned = useMemo(() => {
    const rows: Array<{ task: PersonalTask; col: number; span: number; row: number }> = [];
    const rowOccupied: boolean[][] = Array.from({ length: 4 }, () => Array(7).fill(false));

    tasks
      .filter(t => t.status !== 'cancelled')
      .filter(t => {
        if (!t.dueDate) return false;
        try {
          const d = parseISO(t.dueDate);
          if (!isValid(d)) return false;
          const col = differenceInCalendarDays(startOfDay(d), startDay);
          return col >= 0 && col < 7;
        } catch { return false; }
      })
      .sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2))
      .forEach(task => {
        try {
          const d = parseISO(task.dueDate!);
          const col = differenceInCalendarDays(startOfDay(d), startDay);
          const span = Math.min(1, 7 - col);
          // Find first free row
          for (let r = 0; r < 4; r++) {
            let fits = true;
            for (let c = col; c < col + span; c++) {
              if (rowOccupied[r][c]) { fits = false; break; }
            }
            if (fits) {
              for (let c = col; c < col + span; c++) rowOccupied[r][c] = true;
              rows.push({ task, col, span, row: r });
              break;
            }
          }
        } catch {}
      });
    return rows;
  }, [tasks, startDay]);

  return (
    <>
      {/* Days header */}
      <div className="grid grid-cols-7 gap-2 mb-3 px-2">
        {days.map(({ d, day, date, isToday: tod }) => (
          <div key={d.toISOString()} className="flex flex-col items-center gap-1">
            <span className={cn('text-xs font-medium uppercase tracking-wider', tod ? 'text-blue-600' : 'text-slate-400')}>{day}</span>
            <span className={cn('w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold', tod ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-700')}>
              {date}
            </span>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="relative flex-1 border border-slate-100 rounded-xl bg-slate-50/40 overflow-hidden min-h-[220px]">
        {/* Column lines */}
        <div className="absolute inset-0 grid grid-cols-7">
          {days.map(({ d, isToday: tod }) => (
            <div key={d.toISOString()} className={cn('border-r border-slate-100 h-full last:border-r-0', tod && 'bg-blue-50/40')} />
          ))}
        </div>
        {/* Row lines */}
        <div className="absolute inset-0 flex flex-col">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-1 border-b border-dashed border-slate-100 last:border-b-0" />
          ))}
        </div>

        {/* Task pills */}
        {positioned.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
            No tasks due this week
          </div>
        )}
        {positioned.map(({ task, col, span, row }) => {
          const typeKey: TypeKey = task.category === 'project-task' ? 'project' : 'personal';
          const typeCfg = TYPE_CFG[typeKey];
          const priorityCfg = PRIORITY_CFG[task.priority];
          const left = `${(col / 7) * 100}%`;
          const width = `calc(${(span / 7) * 100}% - 8px)`;
          const top = `${row * 25 + 4}%`;

          return (
            <button
              key={task.id}
              className={cn(
                'absolute h-[18%] rounded-lg p-1.5 flex flex-col justify-center shadow-sm border transition-all hover:shadow-md hover:z-10 text-left overflow-hidden',
                task.status === 'done' ? 'bg-slate-100 border-slate-200 opacity-60' : cn(typeCfg.bg, typeCfg.border),
              )}
              style={{ left, width, top, marginLeft: '4px' }}
              onClick={() => onTaskClick(task)}
              data-testid={`pill-task-${task.id}`}
            >
              <div className="flex items-center gap-1 overflow-hidden">
                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', task.status === 'done' ? 'bg-slate-400' : priorityCfg.pill)} />
                <span className="text-[10px] font-semibold truncate text-slate-800 leading-tight">{task.title}</span>
              </div>
              {task.category && (
                <span className="text-[9px] text-slate-500 truncate pl-2.5">{task.category}</span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

// ── Priority Group Header ─────────────────────────────────────────────────────

function PriorityGroupHeader({ label, count, icon: Icon, iconClass }: { label: string; count: number; icon: typeof AlertCircle; iconClass: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className={cn('flex items-center justify-center w-6 h-6 rounded-full', iconClass)}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">{label}</h3>
      <Badge variant="outline" className="text-xs px-1.5">{count}</Badge>
      <div className="h-px flex-1 bg-slate-200 ml-1" />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/workspace' },
  { icon: ListTodo,        label: 'Tasks',     path: '/my-tasks', active: true },
  { icon: Calendar,        label: 'Calendar',  path: '/my-tasks' },
  { icon: Users,           label: 'Team',      path: '/my-tasks' },
  { icon: MessageSquare,   label: 'Messages',  path: '/my-tasks' },
];

export default function MyTasksV2() {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const userId = currentUser?.id;
  const qc = useQueryClient();

  const {
    tasks: allTasks, isLoading, createTask, updateTask, deleteTask, isCreating, isUpdating,
  } = usePersonalTasks(userId);

  // Exclude subtasks from top level
  const tasks = useMemo(() => allTasks.filter(t => !t.parentTaskId), [allTasks]);

  const { data: projectTasks = [] } = useAssignedProjectTasks(userId);
  const updateProjectTaskStatus = useUpdateProjectTaskStatus();

  // Materialise daily recurring tasks on mount
  useEffect(() => {
    if (!userId) return;
    materialiseDailyTasks({
      userId,
      userRole: currentUser?.role ?? null,
      userDepartmentId: currentUser?.departmentId ?? null,
      userEmail: currentUser?.email ?? null,
      userName: currentUser?.fullName ?? null,
    }).then(() => qc.invalidateQueries({ queryKey: ['personal_tasks'] })).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // UI state
  const [filterKey, setFilterKey] = useState<FilterKey>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [teamView, setTeamView] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
  const [activePlanningTab, setActivePlanningTab] = useState<'briefing' | 'matrix'>('briefing');
  const searchRef = useRef<HTMLInputElement>(null);

  // Stats
  const stats = useMemo(() => {
    const allCombined = [
      ...tasks,
      ...projectTasks.map(pt => ({
        status: pt.status as string,
        dueDate: pt.dueDate ? String(pt.dueDate) : null,
        priority: 'medium' as PersonalTaskPriority,
      })),
    ];
    return {
      all:        allCombined.filter(t => t.status !== 'done' && t.status !== 'cancelled').length,
      todo:       allCombined.filter(t => t.status === 'todo').length,
      inprogress: allCombined.filter(t => t.status === 'inprogress').length,
      overdue:    allCombined.filter(t => isOverdue(t.dueDate, t.status)).length,
      done:       allCombined.filter(t => t.status === 'done').length,
    };
  }, [tasks, projectTasks]);

  const FILTER_CHIPS = [
    { key: 'all' as FilterKey,        label: 'All',         count: stats.all },
    { key: 'todo' as FilterKey,       label: 'To Do',       count: stats.todo },
    { key: 'inprogress' as FilterKey, label: 'In Progress', count: stats.inprogress },
    { key: 'overdue' as FilterKey,    label: 'Overdue',     count: stats.overdue, alert: true },
    { key: 'done' as FilterKey,       label: 'Done',        count: stats.done },
  ];

  // Filtered tasks for action panel
  const q = searchQuery.toLowerCase().trim();
  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        if (filterKey === 'all')        return t.status !== 'cancelled';
        if (filterKey === 'todo')       return t.status === 'todo';
        if (filterKey === 'inprogress') return t.status === 'inprogress';
        if (filterKey === 'overdue')    return isOverdue(t.dueDate, t.status);
        if (filterKey === 'done')       return t.status === 'done';
        return true;
      })
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q));
  }, [tasks, filterKey, q]);

  const urgent  = filteredTasks.filter(t => t.priority === 'critical').sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const high    = filteredTasks.filter(t => t.priority === 'high').sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  const normal  = filteredTasks.filter(t => t.priority === 'medium' || t.priority === 'low').sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  // Week label
  const startDay = addDays(startOfDay(new Date()), weekOffset * 7);
  const endDay   = addDays(startDay, 6);
  const weekLabel = `${format(startDay, 'MMM d')} – ${format(endDay, 'MMM d')}`;

  // Handlers
  const handleCreate = async (data: { title: string; priority: PersonalTaskPriority; status: PersonalTaskStatus; dueDate: string; description: string }) => {
    try {
      await createTask({ title: data.title, priority: data.priority, status: data.status, dueDate: data.dueDate || null, description: data.description });
      setShowAdd(false);
      toast({ title: 'Task created' });
    } catch {
      toast({ title: 'Failed to create task', variant: 'destructive' });
    }
  };

  const handleToggleDone = async (task: PersonalTask) => {
    const newStatus: PersonalTaskStatus = task.status === 'done' ? 'todo' : 'done';
    try {
      await updateTask(task.id, { status: newStatus });
    } catch {
      toast({ title: 'Failed to update task', variant: 'destructive' });
    }
  };

  const handleSave = async (id: string, data: Partial<PersonalTask>) => {
    try {
      await updateTask(id, data);
      toast({ title: 'Task saved' });
    } catch {
      toast({ title: 'Failed to save task', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTask(id);
      toast({ title: 'Task deleted' });
    } catch {
      toast({ title: 'Failed to delete task', variant: 'destructive' });
    }
  };

  const handleMarkPersonalDone = async (id: string, prevStatus: PersonalTaskStatus) => {
    const newStatus: PersonalTaskStatus = prevStatus === 'done' ? 'todo' : 'done';
    await updateTask(id, { status: newStatus });
  };

  const handleMarkProjectDone = async (id: string) => {
    await updateProjectTaskStatus.mutateAsync({ taskId: id, status: 'done' });
  };

  const userInitials = currentUser?.fullName ? initials(currentUser.fullName) : 'ME';

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900">

      {/* Left nav sidebar */}
      <aside className="w-16 h-full flex flex-col items-center py-4 bg-[#0F2041] border-r border-slate-800 z-20 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg mb-8 shadow-lg select-none">
          P
        </div>
        <nav className="flex-1 flex flex-col gap-4 w-full px-2">
          {NAV_ITEMS.map((item, i) => (
            <button
              key={i}
              title={item.label}
              className={cn(
                'p-3 rounded-xl flex items-center justify-center transition-all duration-200 relative',
                item.active
                  ? 'bg-[#1D3461] text-white shadow-inner'
                  : 'text-slate-400 hover:bg-[#1D3461]/50 hover:text-slate-200',
              )}
            >
              <item.icon className="w-5 h-5" />
              {item.active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-400 rounded-r-full" />
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-4 w-full px-2 items-center">
          <button className="p-3 rounded-xl text-slate-400 hover:bg-[#1D3461]/50 hover:text-slate-200 transition-colors" title="Settings">
            <Settings className="w-5 h-5" />
          </button>
          <Avatar className="w-10 h-10 border-2 border-[#1D3461] cursor-pointer">
            <AvatarFallback className="bg-slate-700 text-xs text-slate-300">{userInitials}</AvatarFallback>
          </Avatar>
        </div>
      </aside>

      {/* Main area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">

        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-5">
            <h1 className="text-xl font-semibold tracking-tight text-[#0F2041] whitespace-nowrap">Command Center</h1>
            <div className="h-6 w-px bg-slate-200 hidden md:block" />
            <div className="hidden lg:flex items-center gap-1.5 flex-wrap">
              {FILTER_CHIPS.map(chip => (
                <button
                  key={chip.key}
                  onClick={() => setFilterKey(chip.key)}
                  data-testid={`filter-chip-${chip.key}`}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap',
                    filterKey === chip.key
                      ? 'bg-slate-900 text-white'
                      : chip.alert
                        ? 'bg-red-50 text-red-600 border border-red-100 hover:bg-red-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  )}
                >
                  {chip.label}
                  <span className={cn(
                    'px-1.5 py-0.5 rounded-full text-xs',
                    filterKey === chip.key ? 'bg-white/20' : chip.alert ? 'bg-red-100' : 'bg-white',
                  )}>
                    {chip.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {showSearch && (
              <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-3 bg-white">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  ref={searchRef}
                  className="h-8 text-sm bg-transparent outline-none w-40"
                  placeholder="Search tasks…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  data-testid="input-search-tasks"
                />
                <button onClick={() => { setShowSearch(false); setSearchQuery(''); }}>
                  <X className="w-3.5 h-3.5 text-slate-400 hover:text-slate-700" />
                </button>
              </div>
            )}
            <div className="hidden sm:flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Switch
                id="team-view"
                checked={teamView}
                onCheckedChange={setTeamView}
                className="data-[state=checked]:bg-[#1D3461]"
              />
              <Label htmlFor="team-view" className="text-sm font-medium cursor-pointer text-slate-700 whitespace-nowrap">Team View</Label>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="text-slate-500 border-slate-200"
              onClick={() => { setShowSearch(s => !s); setTimeout(() => searchRef.current?.focus(), 50); }}
              data-testid="button-toggle-search"
            >
              <Search className="w-4 h-4" />
            </Button>
            <Button
              className="bg-[#1D3461] hover:bg-[#0F2041] text-white shadow-sm"
              onClick={() => setShowAdd(true)}
              data-testid="button-quick-add"
            >
              <Plus className="w-4 h-4 mr-2" />
              Quick Add
            </Button>
          </div>
        </header>

        {/* Split workspace */}
        <div className="flex-1 flex overflow-hidden">

          {/* Left 60%: Timeline */}
          <div className="w-[60%] flex flex-col h-full border-r border-slate-200 bg-white relative">

            {/* Timeline subheader */}
            <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-4">
                <h2 className="font-semibold text-slate-800">Timeline</h2>
                <div className="hidden md:flex items-center gap-3 text-xs font-medium text-slate-500">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Personal</span>
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500 inline-block" />Project</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={() => setWeekOffset(w => w - 1)} data-testid="button-prev-week">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm font-medium text-slate-600 min-w-[110px] text-center">{weekLabel}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700" onClick={() => setWeekOffset(w => w + 1)} data-testid="button-next-week">
                  <ChevronRight className="w-4 h-4" />
                </Button>
                {weekOffset !== 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-7 text-blue-600" onClick={() => setWeekOffset(0)}>Today</Button>
                )}
              </div>
            </div>

            {/* Timeline grid */}
            <ScrollArea className="flex-1">
              <div className="p-6 flex flex-col" style={{ minHeight: 'calc(100% - 4rem)' }}>
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
                  </div>
                ) : (
                  <Timeline tasks={tasks} weekOffset={weekOffset} onTaskClick={setEditingTask} />
                )}
              </div>
            </ScrollArea>

            {/* Planning Tools panel (slides up from bottom) */}
            <div
              className={cn(
                'absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 transition-all duration-300 ease-in-out z-10 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.12)]',
                planningOpen ? 'h-72' : 'h-12',
              )}
            >
              <button
                onClick={() => setPlanningOpen(p => !p)}
                className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-full p-1 shadow-sm text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                data-testid="button-toggle-planning"
              >
                {planningOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              <div
                className="h-12 px-6 flex items-center justify-between cursor-pointer"
                onClick={() => !planningOpen && setPlanningOpen(true)}
              >
                <h3 className="font-semibold text-sm text-[#0F2041] flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-slate-400" />
                  Planning Tools
                </h3>
                {!planningOpen && (
                  <span className="text-xs text-slate-500 font-medium hidden sm:block">Daily Briefing & Priority Matrix</span>
                )}
                {planningOpen && (
                  <div className="flex gap-1">
                    {(['briefing', 'matrix'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={e => { e.stopPropagation(); setActivePlanningTab(tab); }}
                        className={cn(
                          'px-3 py-1 rounded text-xs font-medium transition-colors',
                          activePlanningTab === tab ? 'bg-[#1D3461] text-white' : 'text-slate-500 hover:bg-slate-100',
                        )}
                      >
                        {tab === 'briefing' ? 'Briefing' : 'Matrix'}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {planningOpen && (
                <div className="px-6 pb-6 h-[calc(100%-48px)] overflow-auto">
                  {activePlanningTab === 'briefing' ? (
                    <DailyBriefing
                      personalTasks={tasks}
                      allPersonalTasks={allTasks}
                      projectTasks={projectTasks}
                      currentUserFullName={currentUser?.fullName}
                      isLoading={isLoading}
                      onMarkPersonalDone={handleMarkPersonalDone}
                      onMarkProjectDone={handleMarkProjectDone}
                      onOpenNewTask={() => setShowAdd(true)}
                    />
                  ) : (
                    <PriorityMatrix
                      personalTasks={tasks}
                      allPersonalTasks={allTasks}
                      projectTasks={projectTasks}
                      isLoading={isLoading}
                      onMarkPersonalDone={handleMarkPersonalDone}
                      onMarkProjectDone={handleMarkProjectDone}
                      onOpenNewTask={() => setShowAdd(true)}
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right 40%: Action Items */}
          <div className="w-[40%] bg-slate-50 flex flex-col h-full">
            <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 bg-white">
              <h2 className="font-semibold text-slate-800">Action Items</h2>
              <div className="flex gap-2 items-center">
                {isLoading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-8"
                  onClick={() => setShowAdd(true)}
                  data-testid="button-add-task-panel"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />New
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-4 flex flex-col gap-3">

                {/* Mobile filter row */}
                <div className="lg:hidden flex gap-1.5 flex-wrap">
                  {FILTER_CHIPS.map(chip => (
                    <button
                      key={chip.key}
                      onClick={() => setFilterKey(chip.key)}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                        filterKey === chip.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600',
                      )}
                    >
                      {chip.label} {chip.count}
                    </button>
                  ))}
                </div>

                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-3" />
                    <p className="text-sm font-medium text-slate-600">All clear!</p>
                    <p className="text-xs text-slate-400 mt-1">No tasks match this filter.</p>
                    <Button
                      size="sm"
                      className="mt-4 bg-[#1D3461] hover:bg-[#0F2041] text-white"
                      onClick={() => setShowAdd(true)}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />Add Task
                    </Button>
                  </div>
                ) : (
                  <>
                    {urgent.length > 0 && (
                      <div>
                        <PriorityGroupHeader label="Urgent" count={urgent.length} icon={AlertCircle} iconClass="bg-red-100 text-red-600" />
                        <div className="flex flex-col gap-2">
                          {urgent.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onToggleDone={() => handleToggleDone(task)}
                              onEdit={() => setEditingTask(task)}
                              isUpdating={isUpdating}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {high.length > 0 && (
                      <div className={urgent.length > 0 ? 'mt-3' : ''}>
                        <PriorityGroupHeader label="High Priority" count={high.length} icon={AlertCircle} iconClass="bg-amber-100 text-amber-600" />
                        <div className="flex flex-col gap-2">
                          {high.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onToggleDone={() => handleToggleDone(task)}
                              onEdit={() => setEditingTask(task)}
                              isUpdating={isUpdating}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {normal.length > 0 && (
                      <div className={(urgent.length > 0 || high.length > 0) ? 'mt-3' : ''}>
                        <PriorityGroupHeader label="Normal" count={normal.length} icon={CheckCircle2} iconClass="bg-emerald-100 text-emerald-600" />
                        <div className="flex flex-col gap-2">
                          {normal.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onToggleDone={() => handleToggleDone(task)}
                              onEdit={() => setEditingTask(task)}
                              isUpdating={isUpdating}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Spacer so last card isn't clipped */}
                    <div className="h-6" />
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </main>

      {/* Dialogs */}
      <QuickAddDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreate={handleCreate}
        isCreating={isCreating}
      />
      <EditDialog
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        isUpdating={isUpdating}
      />
    </div>
  );
}
