import { useState, useMemo, useEffect, useRef } from 'react';
import {
  format, isToday, isBefore, parseISO, isValid, startOfDay,
  addDays, differenceInCalendarDays,
} from 'date-fns';
import {
  Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock,
  LayoutDashboard, ListTodo, MoreHorizontal, Plus,
  Search, AlertCircle, Loader2, X, Trash2, Edit2, Check,
  Columns2, Layers, GanttChart, Grid2x2, Sun, Sparkles, Target,
  RefreshCw, TrendingUp, Briefcase, User, Lightbulb,
  CheckSquare, Circle, Zap, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useTaskNotifications, statusToEvent } from '@/hooks/useTaskNotifications';
import { Layout2MissionTabs } from '@/components/tasks/layouts/Layout2MissionTabs';
import { Layout3BoardGantt } from '@/components/tasks/layouts/Layout3BoardGantt';
import { Layout4EisenhowerMatrix } from '@/components/tasks/layouts/Layout4EisenhowerMatrix';
import { Layout5DailyOps } from '@/components/tasks/layouts/Layout5DailyOps';
import type { LayoutId } from '@/components/tasks/layouts/LayoutTypes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

// ── Smart Hints Data ─────────────────────────────────────────────────────────

const SMART_HINTS = [
  { icon: '🧠', text: 'Tackle your hardest task in the morning when focus peaks.' },
  { icon: '🔗', text: 'Break complex tasks into subtasks for clearer progress.' },
  { icon: '⏰', text: 'Set realistic deadlines — buffer 20% for unexpected delays.' },
  { icon: '🎯', text: 'Complete one urgent task before checking messages.' },
  { icon: '📊', text: 'Review your week every Friday to plan the next one.' },
  { icon: '🔄', text: 'Batch similar tasks together to reduce context-switching.' },
];

function SmartHint() {
  const idx = useMemo(() => Math.floor(Date.now() / 120000) % SMART_HINTS.length, []);
  const hint = SMART_HINTS[idx];
  return (
    <div className="shrink-0 border-t border-amber-100 bg-gradient-to-br from-amber-50 to-orange-50 p-3">
      <div className="flex items-start gap-2">
        <span className="text-base shrink-0 mt-0.5">{hint.icon}</span>
        <div>
          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-0.5 flex items-center gap-1">
            <Lightbulb className="w-2.5 h-2.5" /> Smart Tip
          </p>
          <p className="text-[11px] text-amber-900 leading-relaxed">{hint.text}</p>
        </div>
      </div>
    </div>
  );
}

// ── Enhanced Task Card (with progress bar) ────────────────────────────────────

interface EnhancedTaskCardProps {
  task: PersonalTask;
  subtasks: PersonalTask[];
  onToggleDone: () => void;
  onEdit: () => void;
  isUpdating: boolean;
}

function EnhancedTaskCard({ task, subtasks, onToggleDone, onEdit, isUpdating }: EnhancedTaskCardProps) {
  const cfg = PRIORITY_CFG[task.priority];
  const isDone = task.status === 'done';
  const isInProgress = task.status === 'inprogress';
  const overdueFlag = isOverdue(task.dueDate, task.status);

  const doneSubs = subtasks.filter(s => s.status === 'done').length;
  const totalSubs = subtasks.length;
  const progressPct = isDone
    ? 100
    : totalSubs > 0
      ? Math.round((doneSubs / totalSubs) * 100)
      : isInProgress ? 40 : 0;

  const barColor = progressPct === 100
    ? 'bg-emerald-500'
    : progressPct >= 60 ? 'bg-blue-500'
    : progressPct >= 30 ? 'bg-amber-500'
    : overdueFlag ? 'bg-red-500'
    : 'bg-slate-300';

  return (
    <Card
      className={cn(
        'border transition-all hover:shadow-md cursor-pointer overflow-hidden bg-white group',
        isDone ? 'opacity-60 border-slate-200' : overdueFlag ? 'border-red-200 hover:border-red-400' : cfg.border,
      )}
      onClick={onEdit}
      data-testid={`card-task-${task.id}`}
    >
      <div className="flex">
        <div className={cn('w-1 shrink-0', isDone ? 'bg-emerald-400' : overdueFlag ? 'bg-red-500' : cfg.pill)} />
        <div className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <button
              className="mt-0.5 shrink-0"
              onClick={e => { e.stopPropagation(); onToggleDone(); }}
              disabled={isUpdating}
              data-testid={`button-toggle-done-${task.id}`}
            >
              {isDone
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                : <Circle className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
              }
            </button>
            <p className={cn('flex-1 text-sm font-semibold leading-snug', isDone && 'line-through text-slate-400')}>
              {task.title}
            </p>
            <div className="flex items-center gap-1.5">
              <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                {cfg.label}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                    onClick={e => e.stopPropagation()}
                    data-testid={`button-task-menu-${task.id}`}
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
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
          </div>

          {/* Progress bar */}
          <div className="mt-2.5 pl-6">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-400">
                {totalSubs > 0 ? `${doneSubs} / ${totalSubs} subtasks` : isDone ? 'Completed' : isInProgress ? 'In Progress' : 'Not started'}
              </span>
              <span className={cn('text-[10px] font-bold', progressPct === 100 ? 'text-emerald-600' : progressPct > 0 ? 'text-blue-600' : 'text-slate-400')}>
                {progressPct}%
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all duration-500', barColor)}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 mt-2 pl-6 flex-wrap">
            {task.dueDate && (
              <span className={cn(
                'flex items-center gap-1 text-[10px] font-medium',
                overdueFlag ? 'text-red-600' : isToday(parseISO(task.dueDate ?? '')) ? 'text-amber-600' : 'text-slate-400',
              )}>
                <Clock className="w-3 h-3" />
                {overdueFlag ? 'Overdue · ' : isToday(parseISO(task.dueDate ?? '')) ? 'Due today · ' : ''}
                {(() => { try { const d = parseISO(task.dueDate!); return isValid(d) ? format(d, 'dd MMM') : null; } catch { return null; } })()}
              </span>
            )}
            {task.category && (
              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full truncate max-w-[100px]">
                {task.category}
              </span>
            )}
            {totalSubs > 0 && (
              <span className="text-[10px] text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">
                {totalSubs} subtask{totalSubs !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ── Daily Planner View ────────────────────────────────────────────────────────

interface DailyPlannerProps {
  tasks: PersonalTask[];
  projectTasks: import('@/hooks/usePersonalTasks').AssignedProjectTask[];
  onEdit: (task: PersonalTask) => void;
  onToggleDone: (task: PersonalTask) => void;
  isUpdating: boolean;
}

function DailyPlannerView({ tasks, projectTasks, onEdit, onToggleDone, isUpdating }: DailyPlannerProps) {
  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');

  const morning   = activeTasks.filter(t => t.priority === 'critical' || t.priority === 'high');
  const afternoon = activeTasks.filter(t => t.priority === 'medium');
  const evening   = activeTasks.filter(t => t.priority === 'low');
  const projSlot  = projectTasks.filter(t => String(t.status) !== 'done' && String(t.status) !== 'cancelled').slice(0, 5);

  const Slot = ({
    label, sub, icon, tasks: slotTasks, accent, bg,
  }: {
    label: string; sub: string; icon: React.ReactNode; tasks: PersonalTask[]; accent: string; bg: string;
  }) => (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center shrink-0', bg)}>
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">{label}</h3>
          <p className="text-[10px] text-slate-400">{sub}</p>
        </div>
        <div className={cn('ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full', bg, accent)}>
          {slotTasks.length} task{slotTasks.length !== 1 ? 's' : ''}
        </div>
      </div>
      {slotTasks.length === 0 ? (
        <div className="flex items-center justify-center py-4 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
          No tasks in this slot — enjoy the free time!
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {slotTasks.map(task => {
            const cfg = PRIORITY_CFG[task.priority];
            const isDone = task.status === 'done';
            return (
              <div
                key={task.id}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl border cursor-pointer transition-all hover:shadow-sm group',
                  isDone ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 hover:border-slate-300',
                )}
                onClick={() => onEdit(task)}
                data-testid={`planner-task-${task.id}`}
              >
                <button
                  className="shrink-0"
                  onClick={e => { e.stopPropagation(); onToggleDone(task); }}
                  disabled={isUpdating}
                >
                  {isDone
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    : <Circle className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm font-medium truncate', isDone ? 'line-through text-slate-400' : 'text-slate-800')}>
                    {task.title}
                  </p>
                  {task.dueDate && isValid(parseISO(task.dueDate)) && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(parseISO(task.dueDate), 'dd MMM')}
                    </span>
                  )}
                </div>
                <div className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0', cfg.bg, cfg.color)}>
                  {cfg.label}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="p-5 max-w-2xl">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Daily Planner</h2>
          <p className="text-xs text-slate-500 mt-0.5">{format(new Date(), 'EEEE, d MMMM yyyy')}</p>
        </div>
        <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
          <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="text-[11px] text-amber-800 font-medium">High-effort tasks are best done in the morning</span>
        </div>
      </div>

      <Slot
        label="Morning"
        sub="Urgent & high priority — tackle while energy is high"
        icon={<Sun className="w-4 h-4 text-amber-600" />}
        tasks={morning}
        accent="text-amber-700"
        bg="bg-amber-50"
      />
      <Slot
        label="Afternoon"
        sub="Medium priority — steady, focused work"
        icon={<TrendingUp className="w-4 h-4 text-blue-600" />}
        tasks={afternoon}
        accent="text-blue-700"
        bg="bg-blue-50"
      />
      <Slot
        label="Evening"
        sub="Low priority — light tasks and wrap-up"
        icon={<CheckSquare className="w-4 h-4 text-violet-600" />}
        tasks={evening}
        accent="text-violet-700"
        bg="bg-violet-50"
      />

      {projSlot.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
              <Briefcase className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Project Tasks</h3>
              <p className="text-[10px] text-slate-400">Collaborative work items</p>
            </div>
            <div className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700">
              {projSlot.length} task{projSlot.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {projSlot.map(pt => (
              <div
                key={pt.id}
                className="flex items-center gap-3 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl hover:border-teal-300 transition-all"
                data-testid={`planner-project-${pt.id}`}
              >
                <Briefcase className="w-4 h-4 text-teal-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">{String(pt.title ?? 'Project task')}</p>
                  <p className="text-[10px] text-slate-400 truncate">{pt.projectName}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Kanban Board View ────────────────────────────────────────────────────────

interface KanbanBoardViewProps {
  tasks: PersonalTask[];
  subtaskMap: Map<string, PersonalTask[]>;
  isLoading: boolean;
  isUpdating: boolean;
  onEdit: (task: PersonalTask) => void;
  onToggleDone: (task: PersonalTask) => void;
  onAddTask: () => void;
}

const KANBAN_PRIORITY_CFG = {
  critical: { bar: 'bg-red-500',    badge: 'bg-red-100 text-red-700',       label: 'Urgent' },
  high:     { bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700', label: 'High' },
  medium:   { bar: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700',   label: 'Med' },
  low:      { bar: 'bg-sky-400',    badge: 'bg-sky-100 text-sky-700',       label: 'Low' },
};

const KANBAN_CAT_COLORS: Record<string, string> = {
  project:   'bg-blue-100 text-blue-700',
  personal:  'bg-purple-100 text-purple-700',
  recurring: 'bg-green-100 text-green-700',
};

const KANBAN_COLUMNS: { key: string; label: string; dot: string; filter: (t: PersonalTask) => boolean }[] = [
  {
    key: 'todo',
    label: 'To Do',
    dot: 'bg-slate-500',
    filter: t => t.status === 'todo' && !isOverdue(t.dueDate, t.status),
  },
  {
    key: 'inprogress',
    label: 'In Progress',
    dot: 'bg-blue-500',
    filter: t => t.status === 'inprogress' && !isOverdue(t.dueDate, t.status),
  },
  {
    key: 'overdue',
    label: 'Overdue',
    dot: 'bg-red-500',
    filter: t => isOverdue(t.dueDate, t.status),
  },
  {
    key: 'done',
    label: 'Done',
    dot: 'bg-emerald-500',
    filter: t => t.status === 'done',
  },
];

function KanbanTaskCard({
  task, subtasks, onEdit, onToggleDone, isUpdating,
}: {
  task: PersonalTask;
  subtasks: PersonalTask[];
  onEdit: (t: PersonalTask) => void;
  onToggleDone: (t: PersonalTask) => void;
  isUpdating: boolean;
}) {
  const p = KANBAN_PRIORITY_CFG[task.priority] ?? KANBAN_PRIORITY_CFG.medium;
  const done = task.status === 'done';
  const overdueFlag = isOverdue(task.dueDate, task.status);
  const dueLabel = task.dueDate && isValid(parseISO(task.dueDate))
    ? isToday(parseISO(task.dueDate)) ? 'Today' : format(parseISO(task.dueDate), 'dd MMM')
    : null;
  const tags = task.tags ?? [];
  const catKey = (task.category ?? '').toLowerCase();
  const catColor = KANBAN_CAT_COLORS[catKey] ?? 'bg-slate-100 text-slate-500';
  const doneSubtasks = subtasks.filter(s => s.status === 'done').length;

  return (
    <div
      className={cn(
        'bg-white rounded-xl border shadow-sm hover:shadow-md transition-all group cursor-pointer',
        done ? 'border-slate-100 opacity-60' : overdueFlag ? 'border-red-200' : 'border-slate-100 hover:border-slate-300',
      )}
      onClick={() => onEdit(task)}
      data-testid={`kanban-card-${task.id}`}
    >
      <div className={cn('h-1 rounded-t-xl', p.bar)} />
      <div className="p-3">
        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className={cn('text-[13px] font-semibold leading-snug text-slate-800 flex-1 min-w-0', done && 'line-through text-slate-400')}>
            {done && <CheckCircle2 className="inline w-3.5 h-3.5 text-emerald-500 mr-1 shrink-0" />}
            {task.title}
          </p>
          <button
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            onClick={e => { e.stopPropagation(); onEdit(task); }}
            data-testid={`kanban-menu-${task.id}`}
          >
            <MoreHorizontal className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.map(tag => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Bottom row: category + subtasks + due date */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            {task.category && (
              <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', catColor)}>
                {task.category}
              </span>
            )}
            {subtasks.length > 0 && (
              <span className="text-[10px] text-slate-400">
                {doneSubtasks}/{subtasks.length} ✓
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            {dueLabel && (
              <span className={cn(
                'text-[10px] flex items-center gap-0.5',
                overdueFlag ? 'text-red-500 font-semibold' : 'text-slate-400',
              )}>
                <Clock className="w-2.5 h-2.5" />
                {dueLabel}
              </span>
            )}
            <button
              className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={e => { e.stopPropagation(); onToggleDone(task); }}
              disabled={isUpdating}
              data-testid={`kanban-toggle-${task.id}`}
              title={done ? 'Mark incomplete' : 'Mark done'}
            >
              {done
                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                : <Circle className="w-3.5 h-3.5 text-slate-300 hover:text-emerald-400 transition-colors" />
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KanbanBoardView({ tasks, subtaskMap, isLoading, isUpdating, onEdit, onToggleDone, onAddTask }: KanbanBoardViewProps) {
  const todoCount      = tasks.filter(KANBAN_COLUMNS[0].filter).length;
  const inProgressCount= tasks.filter(KANBAN_COLUMNS[1].filter).length;
  const overdueCount   = tasks.filter(KANBAN_COLUMNS[2].filter).length;
  const doneCount      = tasks.filter(KANBAN_COLUMNS[3].filter).length;
  const totalCount     = tasks.filter(t => t.status !== 'cancelled').length;
  const completionPct  = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Kanban columns */}
      <div className="flex-1 flex gap-3 p-4 overflow-x-auto overflow-y-hidden">
        {KANBAN_COLUMNS.map(col => {
          const colTasks = tasks.filter(col.filter);
          return (
            <div key={col.key} className="flex flex-col w-[280px] shrink-0">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-1">
                <div className={cn('w-3 h-3 rounded-full shrink-0', col.dot)} />
                <h3 className="text-[12px] font-bold text-slate-700 flex-1">{col.label}</h3>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-2 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>

              {/* Cards */}
              <div className="flex-1 flex flex-col gap-2 overflow-y-auto pb-4 min-h-0">
                {colTasks.length === 0 ? (
                  <div className={cn(
                    'flex items-center justify-center py-6 rounded-xl border-2 border-dashed text-[11px] text-slate-400',
                    col.key === 'overdue' ? 'border-red-100 bg-red-50/30' : 'border-slate-200',
                  )}>
                    {col.key === 'overdue' ? 'All caught up!' : 'Empty'}
                  </div>
                ) : (
                  colTasks.map(task => (
                    <KanbanTaskCard
                      key={task.id}
                      task={task}
                      subtasks={subtaskMap.get(task.id) ?? []}
                      onEdit={onEdit}
                      onToggleDone={onToggleDone}
                      isUpdating={isUpdating}
                    />
                  ))
                )}
                {col.key !== 'done' && col.key !== 'overdue' && (
                  <button
                    onClick={onAddTask}
                    data-testid={`kanban-add-${col.key}`}
                    className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-[#1D3461]/40 hover:text-[#1D3461] transition-colors text-[11px] font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add task
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer stats bar */}
      <div className="shrink-0 bg-white border-t border-slate-200 px-5 py-2.5 flex items-center gap-5">
        {[
          { label: 'Total',    val: totalCount,     color: 'text-slate-700' },
          { label: 'Active',   val: inProgressCount,color: 'text-blue-600'  },
          { label: 'Overdue',  val: overdueCount,   color: 'text-red-600'   },
          { label: 'Done',     val: doneCount,      color: 'text-emerald-600'},
          { label: 'Completion Rate', val: `${completionPct}%`, color: 'text-slate-600' },
        ].map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">{s.label}:</span>
            <span className={cn('text-[12px] font-bold', s.color)}>{s.val}</span>
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {overdueCount > 0 && (
            <div className="flex items-center gap-1 ml-2 text-[10px] text-red-600 font-medium">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {overdueCount} overdue
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Layout Switcher ───────────────────────────────────────────────────────────

const LAYOUT_ICONS: Record<LayoutId, typeof Columns2> = {
  1: Columns2,
  2: Layers,
  3: GanttChart,
  4: Grid2x2,
  5: Sun,
};
const LAYOUT_LABELS: Record<LayoutId, string> = {
  1: 'Command Split',
  2: 'Mission Tabs',
  3: 'Board & Gantt',
  4: 'Eisenhower',
  5: 'Daily Ops',
};

interface LayoutSwitcherProps {
  current: LayoutId;
  onChange: (l: LayoutId) => void;
}
function LayoutSwitcher({ current, onChange }: LayoutSwitcherProps) {
  const [open, setOpen] = useState(false);
  const CurrentIcon = LAYOUT_ICONS[current];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {open && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl p-2 flex flex-col gap-1 animate-in slide-in-from-bottom-2">
          {([1, 2, 3, 4, 5] as LayoutId[]).map(id => {
            const Icon = LAYOUT_ICONS[id];
            const isActive = current === id;
            return (
              <button
                key={id}
                onClick={() => { onChange(id); setOpen(false); }}
                title={LAYOUT_LABELS[id]}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left',
                  isActive
                    ? 'bg-[#0F2041] text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100',
                )}
                data-testid={`layout-option-${id}`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="whitespace-nowrap">{LAYOUT_LABELS[id]}</span>
                {isActive && <div className="ml-auto w-2 h-2 rounded-full bg-blue-400" />}
              </button>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        title={`Layout: ${LAYOUT_LABELS[current]}`}
        className={cn(
          'w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all border-2',
          open
            ? 'bg-[#0F2041] border-[#1D3461] text-white scale-105'
            : 'bg-white border-slate-200 text-slate-600 hover:border-[#1D3461] hover:text-[#0F2041] hover:shadow-xl',
        )}
        data-testid="button-layout-switcher"
      >
        <CurrentIcon className="w-5 h-5" />
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────


export default function MyTasksV2() {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const userId = currentUser?.id;
  const qc = useQueryClient();
  const { notify, notifySelf } = useTaskNotifications();

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
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
  const [activePlanningTab, setActivePlanningTab] = useState<'briefing' | 'matrix'>('briefing');
  const [mainView, setMainView] = useState<'cards' | 'timeline' | 'planner' | 'kanban'>('kanban');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'personal' | 'project' | 'recurring'>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const [layout, setLayout] = useState<LayoutId>(() => {
    try { const v = localStorage.getItem('pact-tasks-layout'); return (v && [1,2,3,4,5].includes(Number(v))) ? Number(v) as LayoutId : 1; }
    catch { return 1; }
  });
  const switchLayout = (l: LayoutId) => { setLayout(l); try { localStorage.setItem('pact-tasks-layout', String(l)); } catch {} };

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

  // Subtask map: taskId → subtasks[]
  const subtaskMap = useMemo(() => {
    const map = new Map<string, PersonalTask[]>();
    allTasks.forEach(t => {
      if (t.parentTaskId) {
        const existing = map.get(t.parentTaskId) ?? [];
        map.set(t.parentTaskId, [...existing, t]);
      }
    });
    return map;
  }, [allTasks]);

  // Category counts for sidebar
  const recurringTasks = tasks.filter(t => !!t.dailyTaskDate);
  const personalTasks  = tasks.filter(t => !t.dailyTaskDate && t.category !== 'project-task');

  // Category-filtered tasks (on top of status/search filter)
  const categoryFiltered = useMemo(() => {
    if (categoryFilter === 'all') return filteredTasks;
    if (categoryFilter === 'personal') return filteredTasks.filter(t => !t.dailyTaskDate && t.category !== 'project-task');
    if (categoryFilter === 'project') return filteredTasks.filter(t => t.category === 'project-task');
    if (categoryFilter === 'recurring') return filteredTasks.filter(t => !!t.dailyTaskDate);
    return filteredTasks;
  }, [filteredTasks, categoryFilter]);

  const catUrgent = categoryFiltered.filter(t => t.priority === 'critical');
  const catHigh   = categoryFiltered.filter(t => t.priority === 'high');
  const catNormal = categoryFiltered.filter(t => t.priority === 'medium' || t.priority === 'low');

  // Progress bar percentage for sidebar
  const totalAll = tasks.length;
  const totalDone = tasks.filter(t => t.status === 'done').length;
  const overallPct = totalAll > 0 ? Math.round((totalDone / totalAll) * 100) : 0;

  // Motivational nudge based on stats
  const motivationalNudge = useMemo(() => {
    if (overallPct === 100 && totalAll > 0) return 'Outstanding! Every task is complete. Time to plan what\'s next!';
    if (overallPct >= 75) return `Almost there! ${totalAll - totalDone} task${totalAll - totalDone !== 1 ? 's' : ''} left — you can do it!`;
    if (overallPct >= 50) return 'Halfway there — keep the momentum going!';
    if (stats.overdue > 0) return `${stats.overdue} overdue task${stats.overdue !== 1 ? 's' : ''} need attention. Let\'s clear them first!`;
    if (stats.all === 0) return 'No active tasks — great time to plan ahead!';
    return 'One task at a time. You\'ve got this!';
  }, [overallPct, totalAll, totalDone, stats.overdue, stats.all]);

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
      // Notify the task owner / assignee on completion
      if (newStatus === 'done' && userId) {
        notifySelf('task_completed', task.title, task.dueDate ?? null);
        // If assigned by someone else, notify them too
        if (task.assignedTo && task.assignedTo !== userId) {
          notify({ event: 'task_completed', taskId: task.id, taskTitle: task.title, recipientUserId: task.assignedTo, dueDate: task.dueDate ?? null });
        }
      }
    } catch {
      toast({ title: 'Failed to update task', variant: 'destructive' });
    }
  };

  const handleSave = async (id: string, data: Partial<PersonalTask>) => {
    try {
      await updateTask(id, data);
      toast({ title: 'Task saved' });
      // Fire lifecycle notification if status changed
      if (data.status && userId) {
        const task = allTasks.find(t => t.id === id);
        const event = statusToEvent(data.status);
        notifySelf(event, task?.title ?? 'Task', task?.dueDate ?? null);
        if (task?.assignedTo && task.assignedTo !== userId) {
          notify({ event, taskId: id, taskTitle: task.title, recipientUserId: task.assignedTo, dueDate: task.dueDate ?? null });
        }
      }
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

  // Shared layout props (passed to layouts 2-5, defined after all handlers)
  const layoutProps = {
    tasks,
    allTasks,
    projectTasks,
    isLoading,
    isUpdating,
    onToggleDone: handleToggleDone,
    onEdit: (task: PersonalTask) => setEditingTask(task),
    onAdd: () => setShowAdd(true),
    currentUser: currentUser ? {
      fullName: currentUser.fullName ?? null,
      id: currentUser.id,
      role: currentUser.role ?? null,
    } : null,
    stats,
  };

  // Layouts 2-5: render alternative view + the shared dialogs
  if (layout !== 1) {
    return (
      <>
        {layout === 2 && <Layout2MissionTabs {...layoutProps} />}
        {layout === 3 && <Layout3BoardGantt {...layoutProps} />}
        {layout === 4 && <Layout4EisenhowerMatrix {...layoutProps} />}
        {layout === 5 && <Layout5DailyOps {...layoutProps} />}
        <LayoutSwitcher current={layout} onChange={switchLayout} />
        <QuickAddDialog open={showAdd} onClose={() => setShowAdd(false)} onCreate={handleCreate} isCreating={isCreating} />
        <EditDialog task={editingTask} onClose={() => setEditingTask(null)} onSave={handleSave} onDelete={handleDelete} isUpdating={isUpdating} />
      </>
    );
  }

  // Category nav config
  const CATEGORY_NAV = [
    { key: 'all' as const,       label: 'All Tasks',  icon: LayoutDashboard, count: tasks.filter(t => t.status !== 'cancelled').length },
    { key: 'personal' as const,  label: 'Personal',   icon: User,            count: personalTasks.filter(t => t.status !== 'cancelled').length },
    { key: 'project' as const,   label: 'Project',    icon: Briefcase,       count: projectTasks.filter(t => String(t.status) !== 'cancelled').length },
    { key: 'recurring' as const, label: 'Recurring',  icon: RefreshCw,       count: recurringTasks.filter(t => t.status !== 'cancelled').length },
  ];

  return (
    <div className="flex h-full w-full overflow-hidden font-sans text-slate-900" style={{ background: '#f4f6f9' }}>
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">

        {/* ── Top header bar ── */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-5 shrink-0 z-10 gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div>
              <p className="text-[10px] text-slate-400 leading-none mb-0.5 uppercase tracking-wider font-medium">My Workspace</p>
              <h1 className="text-sm font-bold tracking-tight text-[#0F2041] leading-none">My Tasks</h1>
            </div>
            <div className="h-5 w-px bg-slate-200 shrink-0" />
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500">
                {stats.all} active · {stats.done} done · {stats.overdue > 0 && <span className="text-red-500 font-semibold">{stats.overdue} overdue</span>}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {showSearch && (
              <div className="flex items-center gap-1 border border-slate-200 rounded-lg px-3 bg-slate-50 h-8">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  ref={searchRef}
                  className="text-sm bg-transparent outline-none w-32"
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
            <button
              onClick={() => { setShowSearch(s => !s); setTimeout(() => searchRef.current?.focus(), 50); }}
              data-testid="button-toggle-search"
              className="p-1.5 rounded-lg text-slate-500 border border-slate-200 hover:bg-slate-50 transition-colors"
              title="Search tasks"
            >
              <Search className="w-4 h-4" />
            </button>
            <Button
              className="bg-[#1D3461] hover:bg-[#0F2041] text-white shadow-sm h-8 px-3 text-xs font-semibold"
              onClick={() => setShowAdd(true)}
              data-testid="button-quick-add"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />New Task
            </Button>
          </div>
        </header>

        {/* ── Three-panel workspace ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ══ LEFT SIDEBAR: Category Nav + Progress — hidden in Kanban mode ══ */}
          {mainView !== 'kanban' && <aside className="w-[200px] shrink-0 flex flex-col border-r border-slate-200 bg-white overflow-hidden">

            {/* Category navigation */}
            <div className="p-3 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Categories</p>
              {CATEGORY_NAV.map(cat => {
                const Icon = cat.icon;
                const isActive = categoryFilter === cat.key;
                return (
                  <button
                    key={cat.key}
                    onClick={() => setCategoryFilter(cat.key)}
                    data-testid={`category-filter-${cat.key}`}
                    className={cn(
                      'flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-semibold transition-all mb-0.5',
                      isActive
                        ? 'bg-[#1D3461] text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="flex-1 text-left">{cat.label}</span>
                    <span className={cn(
                      'text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-400',
                    )}>
                      {cat.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Progress summary */}
            <div className="p-3 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Today's Progress</p>
              <div className="bg-slate-50 rounded-xl p-2.5">
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${overallPct}%` }}
                  />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-slate-500">{totalDone} of {totalAll} done</span>
                  <span className={cn(
                    'text-[11px] font-bold',
                    overallPct === 100 ? 'text-emerald-600' : overallPct >= 50 ? 'text-blue-600' : 'text-slate-500',
                  )}>
                    {overallPct}%
                  </span>
                </div>
                {stats.overdue > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium text-red-600 bg-red-50 rounded-lg px-2 py-1">
                    <AlertCircle className="w-3 h-3 shrink-0" />
                    {stats.overdue} overdue
                  </div>
                )}
              </div>
            </div>

            {/* Motivational nudge */}
            <div className="p-3 flex-1 flex flex-col justify-end">
              <div className="bg-gradient-to-br from-[#0F2041]/5 to-blue-50 border border-blue-100 rounded-xl p-3">
                <p className="text-[10px] font-bold text-[#1D3461] uppercase tracking-wider mb-1.5 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5" /> Daily Nudge
                </p>
                <p className="text-[11px] text-slate-600 leading-relaxed">{motivationalNudge}</p>
              </div>
            </div>
          </aside>}

          {/* ══ CENTER: Main task content area ══ */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* View switcher + filter bar */}
            <div className="h-12 border-b border-slate-200 bg-white flex items-center px-4 gap-3 shrink-0">
              {/* View switcher */}
              <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5 shrink-0">
                {([
                  { key: 'cards' as const,    label: 'Task Cards',    Icon: ListTodo },
                  { key: 'kanban' as const,   label: 'Kanban',        Icon: Columns2 },
                  { key: 'timeline' as const, label: 'Timeline',      Icon: Calendar },
                  { key: 'planner' as const,  label: 'Daily Planner', Icon: Sun },
                ] as const).map(v => (
                  <button
                    key={v.key}
                    onClick={() => setMainView(v.key)}
                    data-testid={`view-switch-${v.key}`}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap',
                      mainView === v.key
                        ? 'bg-white text-[#1D3461] shadow-sm'
                        : 'text-slate-500 hover:text-slate-700',
                    )}
                  >
                    <v.Icon className="w-3.5 h-3.5" />
                    {v.label}
                  </button>
                ))}
              </div>

              {/* Status filter chips — cards view only */}
              {mainView === 'cards' && (
                <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-none">
                  {FILTER_CHIPS.map(chip => (
                    <button
                      key={chip.key}
                      onClick={() => setFilterKey(chip.key)}
                      data-testid={`filter-chip-${chip.key}`}
                      className={cn(
                        'px-2 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap border shrink-0',
                        filterKey === chip.key
                          ? 'bg-[#1D3461] text-white border-[#1D3461]'
                          : chip.alert && chip.count > 0
                            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      {chip.label}
                      {chip.count > 0 && (
                        <span className={cn(
                          'ml-1 font-bold',
                          filterKey === chip.key ? 'text-white/80' : chip.alert ? 'text-red-600' : 'text-slate-400',
                        )}>
                          {chip.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Week navigation — timeline view only */}
              {mainView === 'timeline' && (
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  <div className="hidden md:flex items-center gap-3 text-[11px] font-medium text-slate-400 mr-2">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />Personal</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 inline-block" />Project</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={() => setWeekOffset(w => w - 1)} data-testid="button-prev-week">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs font-semibold text-slate-600 min-w-[100px] text-center bg-slate-50 border border-slate-200 rounded-md px-2 py-1">{weekLabel}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={() => setWeekOffset(w => w + 1)} data-testid="button-next-week">
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                  {weekOffset !== 0 && (
                    <Button variant="ghost" size="sm" className="text-[11px] h-7 text-blue-600 hover:bg-blue-50 px-2" onClick={() => setWeekOffset(0)}>Today</Button>
                  )}
                </div>
              )}
            </div>

            {/* ── CARDS VIEW ── */}
            {mainView === 'cards' && (
              <ScrollArea className="flex-1">
                <div className="p-4 flex flex-col gap-3">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    </div>
                  ) : categoryFiltered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                        <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                      </div>
                      <p className="text-sm font-semibold text-slate-700">All clear!</p>
                      <p className="text-xs text-slate-400 mt-1 mb-4">No tasks match this filter.</p>
                      <Button
                        size="sm"
                        className="bg-[#1D3461] hover:bg-[#0F2041] text-white text-xs"
                        onClick={() => setShowAdd(true)}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />Add a Task
                      </Button>
                    </div>
                  ) : (
                    <>
                      {catUrgent.length > 0 && (
                        <div>
                          <PriorityGroupHeader label="Urgent" count={catUrgent.length} icon={AlertCircle} iconClass="bg-red-100 text-red-600" />
                          <div className="flex flex-col gap-2">
                            {catUrgent.map(task => (
                              <EnhancedTaskCard
                                key={task.id}
                                task={task}
                                subtasks={subtaskMap.get(task.id) ?? []}
                                onToggleDone={() => handleToggleDone(task)}
                                onEdit={() => setEditingTask(task)}
                                isUpdating={isUpdating}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {catHigh.length > 0 && (
                        <div className={catUrgent.length > 0 ? 'mt-3' : ''}>
                          <PriorityGroupHeader label="High Priority" count={catHigh.length} icon={AlertCircle} iconClass="bg-amber-100 text-amber-600" />
                          <div className="flex flex-col gap-2">
                            {catHigh.map(task => (
                              <EnhancedTaskCard
                                key={task.id}
                                task={task}
                                subtasks={subtaskMap.get(task.id) ?? []}
                                onToggleDone={() => handleToggleDone(task)}
                                onEdit={() => setEditingTask(task)}
                                isUpdating={isUpdating}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {catNormal.length > 0 && (
                        <div className={(catUrgent.length > 0 || catHigh.length > 0) ? 'mt-3' : ''}>
                          <PriorityGroupHeader label="Normal" count={catNormal.length} icon={CheckCircle2} iconClass="bg-emerald-100 text-emerald-600" />
                          <div className="flex flex-col gap-2">
                            {catNormal.map(task => (
                              <EnhancedTaskCard
                                key={task.id}
                                task={task}
                                subtasks={subtaskMap.get(task.id) ?? []}
                                onToggleDone={() => handleToggleDone(task)}
                                onEdit={() => setEditingTask(task)}
                                isUpdating={isUpdating}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="h-6" />
                    </>
                  )}
                </div>
              </ScrollArea>
            )}

            {/* ── TIMELINE VIEW ── */}
            {mainView === 'timeline' && (
              <ScrollArea className="flex-1">
                <div className="p-5 flex flex-col" style={{ minHeight: 'calc(100% - 2rem)' }}>
                  {isLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
                    </div>
                  ) : (
                    <Timeline tasks={tasks} weekOffset={weekOffset} onTaskClick={setEditingTask} />
                  )}
                </div>
              </ScrollArea>
            )}

            {/* ── DAILY PLANNER VIEW ── */}
            {mainView === 'planner' && (
              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
                  </div>
                ) : (
                  <DailyPlannerView
                    tasks={tasks}
                    projectTasks={projectTasks}
                    onEdit={setEditingTask}
                    onToggleDone={handleToggleDone}
                    isUpdating={isUpdating}
                  />
                )}
              </ScrollArea>
            )}

            {/* ── KANBAN BOARD VIEW ── */}
            {mainView === 'kanban' && (
              <KanbanBoardView
                tasks={tasks}
                subtaskMap={subtaskMap}
                isLoading={isLoading}
                isUpdating={isUpdating}
                onEdit={setEditingTask}
                onToggleDone={handleToggleDone}
                onAddTask={() => setShowAdd(true)}
              />
            )}
          </div>

          {/* ══ RIGHT PANEL: Planning Tools + SmartHint ══ */}
          <div className="w-[260px] shrink-0 flex flex-col border-l border-slate-200 overflow-hidden bg-white">

            {/* Panel header — dark branded */}
            <div className="shrink-0 bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-4 py-3">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-[10px] font-bold text-white/90 flex items-center gap-1.5 uppercase tracking-wider">
                  <Target className="w-3 h-3" />
                  Planning Tools
                </span>
                {isLoading && <Loader2 className="w-3 h-3 animate-spin text-white/50" />}
              </div>
              <div className="flex gap-1 bg-white/10 rounded-lg p-0.5">
                <button
                  onClick={() => setActivePlanningTab('briefing')}
                  data-testid="tab-planning-briefing"
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all',
                    activePlanningTab === 'briefing'
                      ? 'bg-white text-[#1D3461] shadow-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10',
                  )}
                >
                  <Sparkles className="w-3 h-3" />
                  Briefing
                </button>
                <button
                  onClick={() => setActivePlanningTab('matrix')}
                  data-testid="tab-planning-matrix"
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-[11px] font-semibold transition-all',
                    activePlanningTab === 'matrix'
                      ? 'bg-white text-[#1D3461] shadow-sm'
                      : 'text-white/70 hover:text-white hover:bg-white/10',
                  )}
                >
                  <Target className="w-3 h-3" />
                  Matrix
                </button>
              </div>
            </div>

            {/* Scrollable planning content */}
            <div className="flex-1 overflow-auto min-h-0">
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

            {/* SmartHint at bottom */}
            <SmartHint />
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
      <LayoutSwitcher current={layout} onChange={switchLayout} />
    </div>
  );
}
