import { useState, useMemo, useRef, useEffect, useCallback, type ReactNode } from 'react';
import {
  format, isToday, isThisWeek, isBefore, parseISO, isValid,
  startOfDay, addDays, eachDayOfInterval, startOfToday, isAfter,
  startOfMonth, endOfMonth, getDay, subMonths, addMonths,
} from 'date-fns';
import {
  CheckSquare, Plus, Trash2, Edit2, MoreHorizontal, Flag,
  Calendar, Clock, AlertTriangle, CheckCircle2, Circle,
  FolderOpen, User, ChevronRight, RefreshCw, Loader2,
  Filter, X, ListTodo, Inbox, Star, BarChart2, ArrowRight,
  Search, PlayCircle, Sparkles, LayoutGrid, LayoutList,
  Users, Trophy, Zap, TrendingUp, Target, ChevronDown,
  ChevronUp, Eye, EyeOff, Award, Lightbulb, BookOpen,
  GanttChartSquare, HelpCircle, Info, Building2, ListChecks, DollarSign,
  Tag, FileText, StickyNote, ArrowUpDown, Layers, Hash, ExternalLink,
  Link2, Wrench, Paperclip, Check,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useOutlookCalendar, type CalendarEvent } from '@/hooks/useOutlookCalendar';
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { ConnectedPagesBar } from '@/components/ui/connected-pages-bar';
import { cn } from '@/lib/utils';
import { useUser } from '@/context/user/UserContext';
import { DailyBriefing } from '@/components/tasks/DailyBriefing';
import {
  usePersonalTasks, useAssignedProjectTasks, useUpdateProjectTaskStatus, useCreatedByMeTasks,
  materialiseDailyTasks,
  type PersonalTask, type PersonalTaskPriority, type PersonalTaskStatus, type CreatePersonalTask,
  type TaskAssignee, type AssignedProjectTask, type Dependency, type DependencyType,
  type TaskType, type TaskAttachment,
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
type SortBy = 'created' | 'due' | 'priority' | 'title';
type GroupBy = 'none' | 'priority' | 'status';

const PRIORITY_ORDER: Record<PersonalTaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

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
  onAdd: (title: string, priority: PersonalTaskPriority, dueDate: string, taskType: TaskType | null) => void;
  isCreating: boolean;
}

function QuickAddBar({ onAdd, isCreating }: QuickAddProps) {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onAdd(t, priority, dueDate, taskType);
    setTitle('');
    setDueDate('');
    setPriority('medium');
    setTaskType(null);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-2 p-3 rounded-xl border-2 border-dashed border-[#1D3461]/20 bg-[#1D3461]/3 dark:bg-[#1D3461]/10 hover:border-[#1D3461]/40 transition-colors">
      <div className="flex items-center gap-2">
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
      <div className="flex items-center gap-2 pl-7">
        <Select value={taskType ?? 'general'} onValueChange={v => setTaskType(v === 'general' ? null : v as TaskType)}>
          <SelectTrigger className="h-6 w-auto text-[10px] border border-border/60 bg-muted/40 focus:ring-0 px-2 gap-1" data-testid="quickadd-select-tasktype">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general" className="text-[10px]">General</SelectItem>
            <SelectItem value="project-task" className="text-[10px]">Project Task</SelectItem>
            <SelectItem value="day-to-day" className="text-[10px]">Day-to-Day</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={v => setPriority(v as PersonalTaskPriority)}>
          <SelectTrigger className="h-6 w-20 text-[10px] border border-border/60 bg-muted/40 focus:ring-0 px-2">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['low', 'medium', 'high', 'critical'] as PersonalTaskPriority[]).map(p => (
              <SelectItem key={p} value={p} className="text-[10px]">{PRIORITY_CFG[p].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="h-6 w-32 text-[10px] border border-border/60 bg-muted/40 focus:ring-0 px-2"
        />
      </div>
    </div>
  );
}

// ── Personal Task Card ──────────────────────────────────────────────────────

type HealthSignal = 'at-risk' | 'on-track' | 'done' | 'cancelled';

function getHealthSignal(
  status: PersonalTaskStatus,
  dueDate: string | null | undefined,
  priority: string,
): HealthSignal {
  if (status === 'done') return 'done';
  if (status === 'cancelled') return 'cancelled';
  if (isOverdue(dueDate, status)) return 'at-risk';
  if (dueDate && isValid(parseISO(dueDate)) && isToday(parseISO(dueDate)) && status === 'todo') return 'at-risk';
  return 'on-track';
}

const HEALTH_CFG: Record<HealthSignal, { label: string; bg: string; text: string; ring: string; icon: ReactNode; arcColor: string }> = {
  'at-risk':   { label: 'At Risk',   bg: 'bg-red-50',      text: 'text-red-700',     ring: 'ring-red-200',     icon: <AlertTriangle className="h-3.5 w-3.5" />, arcColor: '#ef4444' },
  'on-track':  { label: 'On Track',  bg: 'bg-emerald-50',  text: 'text-emerald-700', ring: 'ring-emerald-200', icon: <TrendingUp className="h-3.5 w-3.5" />,    arcColor: '#10b981' },
  'done':      { label: 'Done',      bg: 'bg-slate-100',   text: 'text-slate-500',   ring: 'ring-slate-200',   icon: <CheckCircle2 className="h-3.5 w-3.5" />,  arcColor: '#94a3b8' },
  'cancelled': { label: 'Cancelled', bg: 'bg-slate-100',   text: 'text-slate-400',   ring: 'ring-slate-200',   icon: <Circle className="h-3.5 w-3.5" />,        arcColor: '#cbd5e1' },
};

function TaskArcRing({
  pct, health, onClick, isDone,
}: { pct: number; health: HealthSignal; onClick: () => void; isDone: boolean }) {
  const r = 20; const circ = 2 * Math.PI * r;
  const color = HEALTH_CFG[health].arcColor;
  return (
    <button
      type="button"
      onClick={onClick}
      title={isDone ? 'Click to reopen' : 'Click to mark as done'}
      data-testid="task-arc-ring"
      className="flex-shrink-0 hover:scale-105 active:scale-95 transition-transform focus:outline-none"
    >
      <svg width="52" height="52" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="26" cy="26" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle cx="26" cy="26" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
          strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        <text x="26" y="26" dominantBaseline="middle" textAnchor="middle"
          style={{ transform: 'rotate(90deg)', transformOrigin: '26px 26px' }}
          fill="#64748b" fontSize="11" fontWeight="700" fontFamily="sans-serif">
          {pct}%
        </text>
      </svg>
    </button>
  );
}

interface PersonalTaskCardProps {
  task: PersonalTask;
  subtasks: PersonalTask[];
  onStatusChange: (status: PersonalTaskStatus, prev: PersonalTaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreateSubtask?: (title: string) => Promise<void>;
  onSubtaskStatusChange?: (id: string, status: PersonalTaskStatus, prev: PersonalTaskStatus) => void;
  onOpenDetail?: () => void;
}

function PersonalTaskCard({
  task, subtasks, onStatusChange, onEdit, onDelete,
  onCreateSubtask, onSubtaskStatusChange, onOpenDetail,
}: PersonalTaskCardProps) {
  const overdue = isOverdue(task.dueDate, task.status);
  const isDone = task.status === 'done';
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  const doneSubs = subtasks.filter(s => s.status === 'done').length;
  const totalSubs = subtasks.length;
  const arcPct = totalSubs > 0
    ? Math.round((doneSubs / totalSubs) * 100)
    : isDone ? 100 : task.status === 'inprogress' ? 50 : 0;

  const health = getHealthSignal(task.status, task.dueDate, task.priority);
  const hCfg = HEALTH_CFG[health];

  const handleAddSubtask = async () => {
    const t = newSubtaskTitle.trim();
    if (!t || !onCreateSubtask) return;
    setAddingSubtask(true);
    try {
      await onCreateSubtask(t);
      setNewSubtaskTitle('');
    } finally {
      setAddingSubtask(false);
    }
  };

  return (
    <div className={cn('rounded-xl bg-card shadow-sm hover:shadow-md transition-all duration-150 border border-border/60', isDone && 'opacity-60')}>
      {/* Main row */}
      <div className="flex items-center gap-4 px-4 py-3">
        {/* Arc ring — click to toggle done */}
        <TaskArcRing
          pct={arcPct}
          health={health}
          isDone={isDone}
          onClick={() => onStatusChange(isDone ? 'todo' : 'done', task.status)}
          data-testid={`task-toggle-${task.id}`}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Health chip row */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={cn(
              'inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ring-1',
              hCfg.bg, hCfg.text, hCfg.ring,
            )}>
              {hCfg.icon} {hCfg.label}
            </span>
            {task.taskType === 'project-task' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                <FolderOpen className="h-3 w-3" /> Project
              </span>
            )}
            {task.taskType === 'day-to-day' && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                <RefreshCw className="h-3 w-3" /> Day-to-Day
              </span>
            )}
            {task.notes && <StickyNote className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" title="Has notes" />}
            {task.attachments && task.attachments.length > 0 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground" title={`${task.attachments.length} attachment${task.attachments.length !== 1 ? 's' : ''}`}>
                <Paperclip className="h-3 w-3" />{task.attachments.length}
              </span>
            )}
            {/* Attachment download links (shown inline on card) */}
            {task.attachments && task.attachments.length > 0 && task.attachments.map((att, i) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] underline text-[#1D3461]/70 hover:text-[#1D3461] truncate max-w-[120px] flex items-center gap-0.5"
                title={att.name}
                data-testid={`card-attachment-link-${task.id}-${i}`}
                onClick={e => e.stopPropagation()}
              >
                <Paperclip className="h-2.5 w-2.5 flex-shrink-0" />{att.name.length > 18 ? att.name.slice(0, 16) + '…' : att.name}
              </a>
            ))}
            {task.recurrence && task.recurrence !== 'none' && (
              <span className="text-[11px] bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full font-medium capitalize flex items-center gap-1">
                <RefreshCw className="h-2.5 w-2.5" />{task.recurrence}
              </span>
            )}
            {task.completionRewardAmount && task.completionRewardAmount > 0 && (
              <span className="text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-0.5 font-semibold">
                <Trophy className="h-2.5 w-2.5" />+{task.completionRewardCurrency} {task.completionRewardAmount}
              </span>
            )}
          </div>

          {/* Title */}
          <button
            type="button"
            onClick={onOpenDetail}
            className={cn(
              'text-[14px] font-semibold leading-snug text-left w-full hover:text-[#1D3461] transition-colors',
              isDone && 'line-through text-muted-foreground hover:text-muted-foreground',
              onOpenDetail && 'cursor-pointer',
            )}
            title="Open task details"
            data-testid={`task-title-${task.id}`}
          >
            {task.title}
          </button>

          {task.description && (
            <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {task.dueDate && (
              <span className={cn(
                'text-[11px] flex items-center gap-1 font-medium',
                overdue
                  ? 'text-red-600'
                  : (isValid(parseISO(task.dueDate)) && isToday(parseISO(task.dueDate)))
                  ? 'text-amber-600'
                  : 'text-muted-foreground',
              )}>
                <Clock className="h-3 w-3" />
                {overdue && '⚠ '}{fmtDate(task.dueDate)}
              </span>
            )}
            {task.category && task.category !== 'personal' && (
              <span className="text-[11px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border/60">{task.category}</span>
            )}
            {(task.tags ?? []).slice(0, 3).map(tag => (
              <span key={tag} className="text-[11px] flex items-center gap-0.5 bg-[#1D3461]/8 text-[#1D3461] border border-[#1D3461]/15 px-2 py-0.5 rounded-full font-medium">
                <Hash className="h-2.5 w-2.5" />{tag}
              </span>
            ))}
            {(task.tags ?? []).length > 3 && (
              <span className="text-[11px] text-muted-foreground">+{(task.tags ?? []).length - 3}</span>
            )}
            {/* Co-assignees */}
            {task.coAssignees && task.coAssignees.length > 0 && (
              <div className="flex items-center gap-1">
                {task.coAssignees.slice(0, 3).map((a) => (
                  <span key={a.id} title={a.name} className="h-5 w-5 rounded-full bg-[#1D3461]/10 border border-[#1D3461]/20 flex items-center justify-center text-[9px] font-bold text-[#1D3461] flex-shrink-0">
                    {a.name.charAt(0).toUpperCase()}
                  </span>
                ))}
                {task.coAssignees.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{task.coAssignees.length - 3}</span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right — subtask expand + combined menu */}
        <div className="flex items-center gap-1 flex-shrink-0 self-start mt-1">
          {onCreateSubtask && (
            <button
              type="button"
              onClick={() => setSubtaskOpen(v => !v)}
              className={cn(
                'rounded-lg p-1.5 flex-shrink-0 transition-all',
                subtaskOpen ? 'bg-[#1D3461]/10 text-[#1D3461]' : 'text-muted-foreground hover:text-[#1D3461] hover:bg-[#1D3461]/5',
              )}
              title={subtaskOpen ? 'Hide subtasks' : 'Add / view subtasks'}
              data-testid={`subtask-expand-${task.id}`}
            >
              <ListChecks className="h-4 w-4" />
            </button>
          )}

          {/* Combined status + actions menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg p-1.5 flex-shrink-0 transition-all"
                data-testid={`task-menu-${task.id}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-sm w-44">
              <div className="px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Set Status</div>
              {(['todo', 'inprogress', 'done', 'cancelled'] as PersonalTaskStatus[]).map(s => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => onStatusChange(s, task.status)}
                  className={cn('gap-2 text-xs', task.status === s && 'bg-muted')}
                  data-testid={`task-status-${s}-${task.id}`}
                >
                  <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-semibold', STATUS_CFG[s].color)}>{STATUS_CFG[s].label}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit} className="gap-2">
                <Edit2 className="h-3.5 w-3.5" /> Edit Task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenDetail} className="gap-2">
                <ExternalLink className="h-3.5 w-3.5" /> Open Details
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive gap-2">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Subtask panel */}
      {subtaskOpen && (
        <div className="px-4 pb-3 pt-0 ml-16 border-t border-dashed border-muted/70 space-y-1.5" data-testid={`subtask-panel-${task.id}`}>
          {subtasks.length === 0 && (
            <p className="text-xs text-muted-foreground py-1.5">No subtasks yet — type below to add one.</p>
          )}
          {subtasks.map(sub => {
            const subDone = sub.status === 'done';
            return (
              <div key={sub.id} className="flex items-center gap-2 py-1 group/sub" data-testid={`subtask-item-${sub.id}`}>
                <button
                  type="button"
                  className={cn(
                    'h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110',
                    subDone ? 'border-emerald-500 bg-emerald-500' : 'border-muted-foreground/40 hover:border-emerald-500',
                  )}
                  onClick={() => onSubtaskStatusChange?.(sub.id, subDone ? 'todo' : 'done', sub.status)}
                  title={subDone ? 'Reopen' : 'Mark done'}
                >
                  {subDone && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                </button>
                <span className={cn('text-xs flex-1 leading-snug', subDone && 'line-through text-muted-foreground')}>{sub.title}</span>
                {sub.dueDate && (
                  <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtDate(sub.dueDate)}</span>
                )}
              </div>
            );
          })}
          {onCreateSubtask && (
            <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-dashed border-muted/50">
              <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                placeholder="Add subtask… press Enter"
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask(); }}
                className="flex-1 text-xs bg-muted/40 border border-muted rounded-lg px-2.5 py-1 outline-none focus:border-[#1D3461]/50 focus:bg-background transition-colors"
                disabled={addingSubtask}
                data-testid={`subtask-input-${task.id}`}
              />
              <button
                type="button"
                onClick={handleAddSubtask}
                disabled={!newSubtaskTitle.trim() || addingSubtask}
                className="text-[10px] font-medium text-[#1D3461] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded disabled:opacity-40"
                data-testid={`subtask-add-btn-${task.id}`}
              >
                Add
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Task Detail Sheet ────────────────────────────────────────────────────────

interface TaskDetailSheetProps {
  task: PersonalTask | null;
  subtasks: PersonalTask[];
  onClose: () => void;
  onSave: (id: string, updates: Partial<CreatePersonalTask>) => Promise<void>;
  onCreateSubtask: (title: string) => Promise<void>;
  onSubtaskStatusChange: (id: string, status: PersonalTaskStatus) => void;
  onDelete: () => void;
  isSaving: boolean;
  isAdmin: boolean;
  isManager?: boolean;
}

function TaskDetailSheet({
  task, subtasks, onClose, onSave, onCreateSubtask, onSubtaskStatusChange, onDelete, isSaving, isAdmin, isManager = false,
}: TaskDetailSheetProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [status, setStatus] = useState<PersonalTaskStatus>('todo');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagDuplicate, setTagDuplicate] = useState(false);
  const [category, setCategory] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardCurrency, setRewardCurrency] = useState('USD');
  const [dirty, setDirty] = useState(false);
  const [coAssignees, setCoAssignees] = useState<TaskAssignee[]>([]);
  const [coUserSearch, setCoUserSearch] = useState('');
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [depType, setDepType] = useState<DependencyType>('custom');
  const [depText, setDepText] = useState('');
  const [depDate, setDepDate] = useState('');
  const [depUserSearch, setDepUserSearch] = useState('');
  const [depSelectedUser, setDepSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [depDeptId, setDepDeptId] = useState('');
  const [depDuplicate, setDepDuplicate] = useState(false);
  const [tools, setTools] = useState('');
  const [attachments, setAttachments] = useState<{ name: string; url: string; uploadedAt: string; size?: number; type?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-for-task-assign'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as { id: string; full_name: string; role: string }[];
    },
    enabled: !!task,
    staleTime: 5 * 60_000,
  });

  const { data: depAllDepts = [] } = useQuery({
    queryKey: ['all-depts-for-dep-picker'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!task && depType === 'department',
    staleTime: 60_000,
  });

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description ?? '');
      setPriority(task.priority);
      setStatus(task.status);
      setDueDate(task.dueDate ?? '');
      setNotes(task.notes ?? '');
      setTags(task.tags ?? []);
      setCategory(task.category ?? '');
      setRewardAmount(task.completionRewardAmount ? String(task.completionRewardAmount) : '');
      setRewardCurrency(task.completionRewardCurrency ?? 'USD');
      setCoAssignees(task.coAssignees ?? []);
      setDependencies(task.dependencies ?? []);
      setTools(task.tools ?? '');
      setAttachments(task.attachments ?? []);
      setDirty(false);
      setTagInput('');
      setDepInput('');
      setTagDuplicate(false);
      setDepDuplicate(false);
      setNewSubtaskTitle('');
      setCoUserSearch('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    if (!task) return;
    const canEditReward = isAdmin || isManager;
    const reward = canEditReward ? (rewardAmount ? parseFloat(rewardAmount) : null) : task.completionRewardAmount;
    const currency = canEditReward ? (reward ? rewardCurrency : null) : task.completionRewardCurrency;
    await onSave(task.id, {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      dueDate: dueDate || null,
      notes: notes.trim() || null,
      tags: tags.length > 0 ? tags : null,
      category: category.trim() || 'personal',
      completionRewardAmount: reward,
      completionRewardCurrency: currency,
      coAssignees,
      dependencies,
      tools: tools.trim() || null,
      attachments: attachments.length > 0 ? attachments : null,
    });
    setDirty(false);
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !task) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `task-attachments/${task.id}/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('chat-files').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);
      const url = urlData.publicUrl;
      const newAtt = { name: file.name, url, uploadedAt: new Date().toISOString(), size: file.size, type: file.type || ext };
      setAttachments(prev => [...prev, newAtt]);
      markDirty();
    } catch (err) {
      console.error('Attachment upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t) return;
    if (tags.includes(t)) {
      setTagDuplicate(true);
      setTimeout(() => setTagDuplicate(false), 2000);
      return;
    }
    setTags(prev => [...prev, t]);
    markDirty();
    setTagInput('');
    setTagDuplicate(false);
    setTimeout(() => tagInputRef.current?.focus(), 50);
  };

  const handleRemoveTag = (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
    markDirty();
  };

  const handleAddDep = () => {
    let dep: Dependency;
    switch (depType) {
      case 'custom': {
        if (!depText.trim()) return;
        dep = { type: 'custom', label: depText.trim(), value: depText.trim() };
        break;
      }
      case 'date': {
        if (!depDate) return;
        dep = { type: 'date', label: depDate, value: depDate };
        break;
      }
      case 'user': {
        if (!depSelectedUser) return;
        dep = { type: 'user', label: depSelectedUser.name, userId: depSelectedUser.id, userName: depSelectedUser.name };
        break;
      }
      case 'department': {
        if (!depDeptId) return;
        const dept = depAllDepts.find(d => d.id === depDeptId);
        if (!dept) return;
        dep = { type: 'department', label: dept.name, deptId: dept.id, deptName: dept.name };
        break;
      }
      default: return;
    }
    const isDup = dependencies.some(d =>
      d.type === dep.type &&
      (dep.type === 'custom' ? d.value === dep.value :
       dep.type === 'date'   ? d.value === dep.value :
       dep.type === 'user'   ? d.userId === dep.userId :
       d.deptId === dep.deptId)
    );
    if (isDup) { setDepDuplicate(true); setTimeout(() => setDepDuplicate(false), 2000); return; }
    setDependencies(prev => [...prev, dep]);
    markDirty();
    setDepText(''); setDepDate(''); setDepSelectedUser(null); setDepUserSearch(''); setDepDeptId('');
    setDepDuplicate(false);
  };

  const handleAddSubtask = async () => {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    setAddingSubtask(true);
    try {
      await onCreateSubtask(t);
      setNewSubtaskTitle('');
    } finally {
      setAddingSubtask(false);
    }
  };

  if (!task) return null;

  const overdue = isOverdue(task.dueDate, task.status);
  const pCfg = PRIORITY_CFG[priority] ?? PRIORITY_CFG.medium;
  const doneSubs = subtasks.filter(s => s.status === 'done').length;

  // section label helper
  const SectionLabel = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <div className="flex items-center gap-2 mb-2.5">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground uppercase tracking-widest">
        {icon}{children}
      </div>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );

  return (
    <Dialog open={!!task} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full flex flex-col p-0 gap-0 overflow-hidden max-h-[92vh] [&>button:last-child]:hidden">

        {/* ── Header ── */}
        <div className="flex-shrink-0 bg-[#0a0a0a] px-6 pt-6 pb-5">
          {/* Top row: priority dot + title + actions */}
          <div className="flex items-start gap-3">
            <div className={cn('h-3 w-3 rounded-full mt-2.5 flex-shrink-0 ring-2 ring-white/20', pCfg.dot)} />
            <DialogTitle asChild className="flex-1 min-w-0">
              <input
                value={title}
                onChange={e => { setTitle(e.target.value); markDirty(); }}
                className="text-[22px] font-bold leading-snug w-full bg-transparent border-0 outline-none text-white placeholder:text-white/40 focus:bg-white/5 rounded px-1 -ml-1 transition-colors"
                data-testid="sheet-input-title"
              />
            </DialogTitle>
            <div className="flex items-center gap-2 flex-shrink-0 mt-1">
              {dirty && (
                <Button size="sm" onClick={handleSave} disabled={!title.trim() || isSaving}
                  className="h-8 px-4 text-sm bg-white/15 hover:bg-white/25 text-white border border-white/20">
                  {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}Save
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-white/60 hover:text-white hover:bg-white/10">
                    <MoreHorizontal className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" />Delete Task
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Meta badges row */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="text-[12px] text-white/50">
              Created {format(parseISO(task.createdAt), 'dd MMM yyyy')}
            </span>
            {task.assignedToName && (
              <span className="text-[12px] text-white/70 flex items-center gap-1 bg-white/10 px-2.5 py-0.5 rounded-full">
                <User className="h-3.5 w-3.5" />{task.assignedToName}
              </span>
            )}
            {task.recurrence && task.recurrence !== 'none' && (
              <span className="text-[12px] bg-blue-400/20 text-blue-200 border border-blue-300/20 px-2.5 py-0.5 rounded-full capitalize">
                {task.recurrence}
              </span>
            )}
            {overdue && !dirty && (
              <span className="text-[12px] text-red-300 font-semibold flex items-center gap-1 bg-red-500/20 px-2.5 py-0.5 rounded-full">
                <AlertTriangle className="h-3.5 w-3.5" />Overdue
              </span>
            )}
          </div>

          {/* Status/Priority/Due pill row */}
          <div className="grid grid-cols-3 gap-3 mt-4">
            {/* Status */}
            <Select value={status} onValueChange={v => { setStatus(v as PersonalTaskStatus); markDirty(); }}>
              <SelectTrigger className="h-11 bg-white/10 border-white/20 text-white hover:bg-white/15 focus:ring-white/20">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] text-white/50 uppercase tracking-widest leading-none">Status</span>
                  <span className={cn('text-[13px] font-semibold px-2 py-0.5 rounded-full', STATUS_CFG[status]?.color)}>
                    {STATUS_CFG[status]?.label}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {(['todo', 'inprogress', 'done', 'cancelled'] as PersonalTaskStatus[]).map(s => (
                  <SelectItem key={s} value={s} className="text-sm">
                    <span className={cn('px-2 py-0.5 rounded-full text-[12px] font-semibold', STATUS_CFG[s].color)}>{STATUS_CFG[s].label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Priority */}
            <Select value={priority} onValueChange={v => { setPriority(v as PersonalTaskPriority); markDirty(); }}>
              <SelectTrigger className="h-11 bg-white/10 border-white/20 text-white hover:bg-white/15 focus:ring-white/20">
                <div className="flex flex-col items-start gap-1">
                  <span className="text-[10px] text-white/50 uppercase tracking-widest leading-none">Priority</span>
                  <span className={cn('text-[13px] font-semibold px-2 py-0.5 rounded-full', pCfg.color)}>
                    {pCfg.label}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {(['low', 'medium', 'high', 'critical'] as PersonalTaskPriority[]).map(p => (
                  <SelectItem key={p} value={p} className="text-sm">
                    <span className={cn('px-2 py-0.5 rounded-full text-[12px] font-semibold', PRIORITY_CFG[p].color)}>{PRIORITY_CFG[p].label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Due Date */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] text-white/50 uppercase tracking-widest leading-none pl-0.5 pt-1">Due Date</span>
              <Input
                type="date"
                value={dueDate}
                onChange={e => { setDueDate(e.target.value); markDirty(); }}
                className={cn(
                  'h-9 text-sm bg-white/10 border-white/20 text-white [color-scheme:dark] focus:ring-white/20',
                  overdue && !dueDate && 'border-red-400/60',
                )}
              />
            </div>
          </div>
        </div>{/* end header */}

        {/* ── Tabbed body ── */}
        <Tabs defaultValue="details" className="flex-1 flex flex-col min-h-0 overflow-hidden">

          {/* Tab bar */}
          <div className="flex-shrink-0 border-b bg-muted/30 px-6">
            <TabsList className="h-11 bg-transparent p-0 gap-0 rounded-none">
              <TabsTrigger value="details" className="h-11 rounded-none px-4 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-[#1D3461] data-[state=active]:text-[#1D3461] data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all">
                <FileText className="h-3.5 w-3.5 mr-1.5" />Details
              </TabsTrigger>
              <TabsTrigger value="subtasks" className="h-11 rounded-none px-4 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-[#1D3461] data-[state=active]:text-[#1D3461] data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all">
                <ListChecks className="h-3.5 w-3.5 mr-1.5" />Subtasks
                {subtasks.length > 0 && (
                  <span className="ml-1.5 bg-[#1D3461]/15 text-[#1D3461] text-[11px] font-bold px-1.5 py-0.5 rounded-full">{doneSubs}/{subtasks.length}</span>
                )}
              </TabsTrigger>
              <TabsTrigger value="people" className="h-11 rounded-none px-4 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-[#1D3461] data-[state=active]:text-[#1D3461] data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all">
                <Users className="h-3.5 w-3.5 mr-1.5" />People &amp; Tools
              </TabsTrigger>
              {(task.completionRewardAmount || isAdmin || isManager) && (
                <TabsTrigger value="reward" className="h-11 rounded-none px-4 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-[#1D3461] data-[state=active]:text-[#1D3461] data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all">
                  <DollarSign className="h-3.5 w-3.5 mr-1.5" />Reward
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* ── Tab: Details ── */}
          <TabsContent value="details" className="flex-1 overflow-y-auto m-0 px-6 py-6 space-y-6 bg-background">

            {/* Description */}
            <div>
              <SectionLabel icon={<FileText className="h-3.5 w-3.5" />}>Description</SectionLabel>
              <Textarea
                value={description}
                onChange={e => { setDescription(e.target.value); markDirty(); }}
                placeholder="What needs to be done? Provide context, goals, or background that helps clarify this task…"
                className="resize-none text-[14px] leading-relaxed min-h-[110px] bg-muted/30 border-border/60 focus:border-[#1D3461]/40"
                data-testid="sheet-input-description"
              />
            </div>

            {/* Notes */}
            <div>
              <SectionLabel icon={<StickyNote className="h-3.5 w-3.5" />}>Notes</SectionLabel>
              <Textarea
                value={notes}
                onChange={e => { setNotes(e.target.value); markDirty(); }}
                placeholder="Private notes, reminders, or links — visible only to you and admins…"
                className="resize-none text-[14px] leading-relaxed min-h-[90px] bg-amber-50/50 dark:bg-amber-900/10 border-amber-200/60 dark:border-amber-700/30 focus:border-amber-400/60"
                data-testid="sheet-input-notes"
              />
            </div>

            {/* Tags */}
            <div>
              <SectionLabel icon={<Tag className="h-3.5 w-3.5" />}>Tags</SectionLabel>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 text-[13px] bg-[#1D3461]/10 text-[#1D3461] border border-[#1D3461]/20 px-2.5 py-1 rounded-full font-medium">
                      <Hash className="h-3 w-3 opacity-60" />{tag}
                      <button type="button" onClick={() => handleRemoveTag(tag)} className="text-[#1D3461]/50 hover:text-red-500 ml-0.5 transition-colors" data-testid={`remove-tag-${tag}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  ref={tagInputRef}
                  placeholder="Type a tag and press Enter — e.g. urgent, review, field"
                  value={tagInput}
                  onChange={e => { setTagInput(e.target.value); if (tagDuplicate) setTagDuplicate(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                  className={cn('h-10 text-[14px] flex-1 transition-colors', tagDuplicate && 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10 focus-visible:ring-amber-400/30')}
                  data-testid="sheet-input-tag"
                />
                <Button
                  type="button"
                  size="sm"
                  variant={tagInput.trim() ? 'default' : 'outline'}
                  onClick={handleAddTag}
                  disabled={!tagInput.trim()}
                  className={cn('h-10 px-4 text-sm transition-all', tagInput.trim() ? 'bg-[#1D3461] hover:bg-[#0F2041] text-white' : '')}
                  data-testid="sheet-btn-add-tag"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />Add
                </Button>
              </div>
              {tagDuplicate ? (
                <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />Tag already exists — try a different label
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground mt-1.5">Tags help you filter and group related tasks.</p>
              )}
            </div>

            {/* Category */}
            <div>
              <SectionLabel icon={<Inbox className="h-3.5 w-3.5" />}>Category</SectionLabel>
              <Input
                value={category}
                onChange={e => { setCategory(e.target.value); markDirty(); }}
                placeholder="Group this task — e.g. field-ops, admin, finance, reporting"
                className="h-10 text-[14px]"
              />
              <p className="text-[12px] text-muted-foreground mt-1.5">Used to group tasks in the overview panels.</p>
            </div>

            {/* Dependencies */}
            <div>
              <SectionLabel icon={<Link2 className="h-3.5 w-3.5" />}>Dependencies</SectionLabel>

              {/* Existing deps list */}
              {dependencies.length > 0 && (
                <div className="space-y-1 mb-3 rounded-xl border bg-muted/30 p-2">
                  {dependencies.map((dep, i) => (
                    <div key={i} className="flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-muted/50 transition-colors group/dep">
                      {dep.type === 'date'       ? <Calendar   className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                       : dep.type === 'user'     ? <User       className="h-3.5 w-3.5 text-violet-500 flex-shrink-0" />
                       : dep.type === 'department' ? <Building2 className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                       : <Link2 className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />}
                      <span className="text-[13px] flex-1 text-foreground leading-snug">
                        {dep.type === 'date'       ? `After ${dep.value}`
                         : dep.type === 'user'     ? dep.userName ?? dep.label
                         : dep.type === 'department' ? `${dep.deptName ?? dep.label} sign-off`
                         : dep.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wide hidden group-hover/dep:inline">
                        {dep.type}
                      </span>
                      <button
                        type="button"
                        onClick={() => { setDependencies(prev => prev.filter((_, idx) => idx !== i)); markDirty(); }}
                        className="text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover/dep:opacity-100"
                        data-testid={`remove-dep-${i}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Type selector */}
              <div className="flex gap-1 mb-2 flex-wrap">
                {([ ['custom','Custom','#6B7280'], ['date','Date','#3B82F6'], ['user','User','#8B5CF6'], ['department','Department','#F97316'] ] as [DependencyType, string, string][]).map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => { setDepType(t); setDepText(''); setDepDate(''); setDepSelectedUser(null); setDepUserSearch(''); setDepDeptId(''); }}
                    className={cn(
                      'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all',
                      depType === t
                        ? 'bg-[#1D3461] text-white border-[#1D3461]'
                        : 'bg-muted text-muted-foreground border-transparent hover:border-border'
                    )}
                  >
                    {t === 'custom'     ? '📝' : t === 'date' ? '📅' : t === 'user' ? '👤' : '🏢'} {label}
                  </button>
                ))}
              </div>

              {/* Type-specific input */}
              <div className="flex gap-2">
                {depType === 'custom' && (
                  <Input
                    placeholder="e.g. 'Site survey complete', 'Approval received'"
                    value={depText}
                    onChange={e => { setDepText(e.target.value); if (depDuplicate) setDepDuplicate(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDep(); } }}
                    className={cn('h-10 text-[14px] flex-1', depDuplicate && 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10')}
                    data-testid="sheet-input-dep-custom"
                  />
                )}
                {depType === 'date' && (
                  <Input
                    type="date"
                    value={depDate}
                    onChange={e => { setDepDate(e.target.value); if (depDuplicate) setDepDuplicate(false); }}
                    className={cn('h-10 text-[14px] flex-1', depDuplicate && 'border-amber-400 bg-amber-50/50 dark:bg-amber-900/10')}
                    data-testid="sheet-input-dep-date"
                  />
                )}
                {depType === 'user' && (
                  <div className="flex-1 relative">
                    <Input
                      placeholder="Search user…"
                      value={depUserSearch}
                      onChange={e => { setDepUserSearch(e.target.value); setDepSelectedUser(null); }}
                      className="h-10 text-[14px]"
                      data-testid="sheet-input-dep-user"
                    />
                    {depUserSearch && !depSelectedUser && (
                      <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-xl shadow-lg max-h-44 overflow-y-auto">
                        {allProfiles
                          .filter(p => p.full_name.toLowerCase().includes(depUserSearch.toLowerCase()))
                          .slice(0, 10)
                          .map(p => (
                            <button
                              key={p.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-[13px] hover:bg-muted"
                              onClick={() => { setDepSelectedUser({ id: p.id, name: p.full_name }); setDepUserSearch(p.full_name); }}
                            >
                              {p.full_name}
                              <span className="ml-1.5 text-[10px] text-muted-foreground">{p.role}</span>
                            </button>
                          ))}
                      </div>
                    )}
                    {depSelectedUser && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      </div>
                    )}
                  </div>
                )}
                {depType === 'department' && (
                  <select
                    value={depDeptId}
                    onChange={e => { setDepDeptId(e.target.value); if (depDuplicate) setDepDuplicate(false); }}
                    className="h-10 flex-1 rounded-md border bg-background px-3 text-[14px]"
                    data-testid="sheet-select-dep-dept"
                  >
                    <option value="">Select department…</option>
                    {depAllDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddDep}
                  disabled={
                    depType === 'custom'     ? !depText.trim() :
                    depType === 'date'       ? !depDate :
                    depType === 'user'       ? !depSelectedUser :
                    !depDeptId
                  }
                  className="h-10 px-4 text-sm bg-[#1D3461] hover:bg-[#0F2041] text-white disabled:opacity-40"
                  data-testid="sheet-btn-add-dep"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" />Add
                </Button>
              </div>
              {depDuplicate ? (
                <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />This dependency is already listed
                </p>
              ) : (
                <p className="text-[12px] text-muted-foreground mt-1.5">Conditions, approvals, dates, people, or teams that must be ready before this task can start.</p>
              )}
            </div>

          </TabsContent>

          {/* ── Tab: Subtasks ── */}
          <TabsContent value="subtasks" className="flex-1 overflow-y-auto m-0 px-6 py-6 bg-background">
            {subtasks.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground">{doneSubs} of {subtasks.length} completed</span>
                  <span className="text-sm font-bold text-[#1D3461]">{subtasks.length > 0 ? Math.round((doneSubs / subtasks.length) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${subtasks.length > 0 ? Math.round((doneSubs / subtasks.length) * 100) : 0}%` }}
                  />
                </div>
              </div>
            )}
            {subtasks.length > 0 && (
              <div className="space-y-1 rounded-xl border bg-card p-2 mb-4">
                {subtasks.map((sub, idx) => {
                  const subDone = sub.status === 'done';
                  return (
                    <div key={sub.id} className="flex items-center gap-3 py-2 px-2.5 rounded-lg hover:bg-muted/50 transition-colors" data-testid={`sheet-subtask-${sub.id}`}>
                      <button
                        type="button"
                        onClick={() => onSubtaskStatusChange(sub.id, subDone ? 'todo' : 'done')}
                        className={cn(
                          'h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                          subDone ? 'bg-emerald-500 border-emerald-500' : 'border-muted-foreground/40 hover:border-emerald-500',
                        )}
                      >
                        {subDone && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </button>
                      <span className="text-[11px] text-muted-foreground w-5 flex-shrink-0 font-medium">{idx + 1}.</span>
                      <span className={cn('text-[14px] flex-1', subDone && 'line-through text-muted-foreground')}>{sub.title}</span>
                      {sub.priority !== 'medium' && (
                        <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full font-semibold', PRIORITY_CFG[sub.priority].color)}>{PRIORITY_CFG[sub.priority].label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {subtasks.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <ListChecks className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No subtasks yet. Add one below to break this task into steps.</p>
              </div>
            )}
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Add a subtask…"
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                className="h-10 text-[14px] flex-1"
                data-testid="sheet-input-subtask"
              />
              <Button size="sm" variant="outline" onClick={handleAddSubtask} disabled={!newSubtaskTitle.trim() || addingSubtask} className="h-10 px-4 text-sm">
                {addingSubtask ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5 mr-1" />Add</>}
              </Button>
            </div>
          </TabsContent>

          {/* ── Tab: People & Tools ── */}
          <TabsContent value="people" className="flex-1 overflow-y-auto m-0 px-6 py-6 space-y-6 bg-background">

            {/* Assignees */}
            <div>
              <SectionLabel icon={<Users className="h-3.5 w-3.5" />}>Assignees</SectionLabel>
              <div className="flex flex-wrap gap-2 mb-2">
                {task.assignedToName && (
                  <div className="flex items-center gap-2 bg-[#1D3461]/10 border border-[#1D3461]/20 px-3 py-2 rounded-xl">
                    <div className="h-7 w-7 rounded-full bg-[#1D3461] flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                      {task.assignedToName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground leading-none">{task.assignedToName}</p>
                      <p className="text-[11px] text-muted-foreground leading-none mt-0.5">Primary</p>
                    </div>
                  </div>
                )}
                {coAssignees.map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-muted/60 border border-border px-3 py-2 rounded-xl">
                    <div className="h-7 w-7 rounded-full bg-muted-foreground/20 flex items-center justify-center text-muted-foreground text-[11px] font-bold flex-shrink-0">
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-sm font-medium text-foreground">{a.name}</p>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => { setCoAssignees(prev => prev.filter(x => x.id !== a.id)); markDirty(); }}
                        className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                        data-testid={`remove-co-assignee-${a.id}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div className="space-y-1">
                  <Input
                    placeholder="Search and add co-assignee…"
                    value={coUserSearch}
                    onChange={e => setCoUserSearch(e.target.value)}
                    className="h-10 text-sm"
                    data-testid="sheet-input-co-assignee"
                  />
                  {coUserSearch && (
                    <div className="rounded-xl border border-border bg-background max-h-48 overflow-y-auto shadow-md">
                      {allProfiles
                        .filter(p =>
                          p.id !== task.assignedTo &&
                          !coAssignees.some(a => a.id === p.id) &&
                          (p.full_name ?? '').toLowerCase().includes(coUserSearch.toLowerCase())
                        )
                        .slice(0, 8)
                        .map(p => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setCoAssignees(prev => [...prev, { id: p.id, name: p.full_name ?? 'Unknown' }]);
                              setCoUserSearch('');
                              markDirty();
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-muted/60 transition-colors text-left"
                            data-testid={`sheet-co-option-${p.id}`}
                          >
                            <div className="h-8 w-8 rounded-full bg-[#1D3461]/10 flex items-center justify-center text-[#1D3461] text-xs font-bold flex-shrink-0">
                              {(p.full_name ?? '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{p.full_name ?? 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground capitalize">{p.role}</p>
                            </div>
                            <Plus className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tools & Resources */}
            <div>
              <SectionLabel icon={<Wrench className="h-3.5 w-3.5" />}>Tools &amp; Resources</SectionLabel>
              <Textarea
                value={tools}
                onChange={e => { setTools(e.target.value); markDirty(); }}
                placeholder={`List tools, software, links, or resources needed — e.g.\n• KoboToolbox form: https://...\n• Vehicle request form\n• Field supervisor contact: +249...`}
                className="resize-none text-[14px] leading-relaxed min-h-[130px] bg-sky-50/40 dark:bg-sky-900/10 border-sky-200/60 dark:border-sky-700/30 focus:border-sky-400/60"
                data-testid="sheet-input-tools"
              />
              <p className="text-[12px] text-muted-foreground mt-1.5">Any links, system access, equipment, or contacts required to complete this task.</p>
            </div>

            {/* File Attachments */}
            <div>
              <SectionLabel icon={<Paperclip className="h-3.5 w-3.5" />}>Attachments</SectionLabel>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleAttachmentUpload}
                data-testid="sheet-input-attachment-file"
              />
              {attachments.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  {attachments.map((att, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-lg px-3 py-2 group">
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#1D3461] hover:underline flex-1 min-w-0 truncate"
                        data-testid={`attachment-link-${idx}`}
                      >
                        {att.name}
                      </a>
                      {att.size && (
                        <span className="text-[10px] text-muted-foreground flex-shrink-0">
                          {att.size < 1024 ? `${att.size}B` : att.size < 1048576 ? `${(att.size / 1024).toFixed(1)}KB` : `${(att.size / 1048576).toFixed(1)}MB`}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => { setAttachments(prev => prev.filter((_, i) => i !== idx)); markDirty(); }}
                        className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
                        data-testid={`remove-attachment-${idx}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-dashed border-border/70 hover:border-[#1D3461]/40 hover:text-[#1D3461] w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                data-testid="button-add-attachment"
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                {uploading ? 'Uploading…' : 'Attach a file'}
              </Button>
              <p className="text-[12px] text-muted-foreground mt-1.5">Attach photos, reports, or documents relevant to this task. Files are stored securely.</p>
            </div>

          </TabsContent>

          {/* ── Tab: Reward ── */}
          {(task.completionRewardAmount || isAdmin || isManager) && (
            <TabsContent value="reward" className="flex-1 overflow-y-auto m-0 px-6 py-6 bg-background">
              <div className="max-w-sm mx-auto mt-4">
                <div className="rounded-2xl border bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200/60 dark:border-emerald-700/30 p-6 text-center mb-6">
                  <DollarSign className="h-10 w-10 mx-auto text-emerald-500 mb-2" />
                  {(isAdmin || isManager) ? (
                    <>
                      <p className="text-sm font-medium text-foreground mb-4">Set the reward amount credited to the assignee's wallet when this task is marked done.</p>
                      <div className="flex gap-2">
                        <Input
                          type="number" min="0" step="0.01" placeholder="Amount"
                          value={rewardAmount}
                          onChange={e => { setRewardAmount(e.target.value); markDirty(); }}
                          className="h-10 text-sm flex-1"
                        />
                        <Select value={rewardCurrency} onValueChange={v => { setRewardCurrency(v); markDirty(); }}>
                          <SelectTrigger className="h-10 w-24 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {['USD', 'SDG', 'EUR', 'GBP'].map(c => <SelectItem key={c} value={c} className="text-sm">{c}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-3xl font-bold text-emerald-600 mt-1">{task.completionRewardCurrency} {task.completionRewardAmount?.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground mt-2">Credited to your wallet when task is marked done.</p>
                    </>
                  )}
                </div>
              </div>
            </TabsContent>
          )}

        </Tabs>{/* ── end tabbed body ── */}

        {/* ── Sticky footer — always visible ── */}
        <div className={cn(
          'px-6 py-3.5 border-t flex items-center justify-between gap-3 flex-shrink-0 transition-colors',
          dirty ? 'bg-[#0F2041]/5 dark:bg-[#1D3461]/10 shadow-[0_-1px_6px_rgba(0,0,0,0.08)]' : 'bg-card shadow-[0_-1px_4px_rgba(0,0,0,0.04)]',
        )}>
          <Button
            type="button"
            variant="ghost" size="sm"
            onClick={() => { setDirty(false); onClose(); }}
            className={cn('text-sm transition-colors', dirty ? 'text-muted-foreground hover:text-destructive hover:bg-destructive/8' : 'text-muted-foreground/40')}
          >
            {dirty ? 'Discard changes' : 'Close'}
          </Button>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-[11px] text-[#1D3461]/60 font-medium flex items-center gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-[#1D3461]/60 animate-pulse" />
                Unsaved changes
              </span>
            )}
            <Button
              type="button"
              onClick={handleSave}
              disabled={!title.trim() || isSaving || !dirty}
              className={cn(
                'text-white px-6 text-sm transition-all',
                dirty ? 'bg-[#1D3461] hover:bg-[#0F2041] shadow-sm' : 'bg-[#1D3461]/25 cursor-not-allowed',
              )}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save Changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Assigned Project Task Card ──────────────────────────────────────────────

interface ProjectTaskCardProps {
  task: AssignedProjectTask;
  onStatusChange: (id: string, status: string) => void;
  isUpdating: boolean;
}

function useProjectTaskAcknowledge(taskId: string, userId: string | undefined) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !taskId) { setLoading(false); return; }
    supabase
      .from('field_task_comments')
      .select('id, body')
      .eq('task_id', taskId)
      .eq('author_id', userId)
      .then(({ data }) => {
        const rows = data ?? [];
        setAcknowledged(rows.some(r => r.body === '__ack__'));
        const noteRow = rows.find(r => r.body !== '__ack__');
        setComment(noteRow?.body ?? '');
        setLoading(false);
      });
  }, [taskId, userId]);

  const acknowledge = async () => {
    if (!userId || !taskId) return;
    const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
    const { error } = await supabase.from('field_task_comments').insert({
      task_id: taskId,
      author_id: userId,
      author_name: prof?.full_name ?? 'User',
      body: '__ack__',
    });
    if (!error) setAcknowledged(true);
  };

  const saveComment = async (text: string, authorName?: string) => {
    if (!userId || !taskId) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    const { data: existing } = await supabase
      .from('field_task_comments')
      .select('id')
      .eq('task_id', taskId)
      .eq('author_id', userId)
      .neq('body', '__ack__')
      .limit(1);

    if (existing && existing.length > 0) {
      await supabase.from('field_task_comments').update({ body: trimmed }).eq('id', existing[0].id);
    } else {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', userId).single();
      await supabase.from('field_task_comments').insert({
        task_id: taskId,
        author_id: userId,
        author_name: authorName ?? prof?.full_name ?? 'User',
        body: trimmed,
      });
    }
    setComment(trimmed);
  };

  return { acknowledged, acknowledge, comment, saveComment, loading };
}

function ProjectTaskCard({ task, onStatusChange, isUpdating }: ProjectTaskCardProps) {
  const navigate = useNavigate();
  const { currentUser } = useUser();
  const dueDateStr = typeof task.dueDate === 'string' ? task.dueDate : null;
  const statusStr = typeof task.status === 'string' ? task.status : 'todo';
  const overdue = isOverdue(dueDateStr, statusStr);
  const isDone = statusStr === 'done';
  const isInProgress = statusStr === 'inprogress';
  const pCfg = PRIORITY_CFG[task.priority as PersonalTaskPriority] ?? PRIORITY_CFG.medium;
  const [showComment, setShowComment] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const { acknowledged, acknowledge, comment, saveComment } = useProjectTaskAcknowledge(task.id, currentUser?.id);

  const borderColor = isDone ? 'border-l-emerald-500'
    : isInProgress ? 'border-l-[#1D3461]'
    : overdue ? 'border-l-red-500'
    : 'border-l-slate-300';

  return (
    <div
      className={cn(
        'rounded-lg border border-l-4 bg-card hover:shadow-sm transition-all duration-150',
        borderColor,
        isDone && 'opacity-60',
      )}
      data-testid={`project-task-card-${task.id}`}
    >
      <div className="group flex items-start gap-3 px-3 py-2.5">
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
            {dueDateStr && (
              <span className={cn(
                'text-[10px] flex items-center gap-0.5',
                overdue ? 'text-red-600 font-semibold' : (isValid(parseISO(dueDateStr)) && isToday(parseISO(dueDateStr))) ? 'text-amber-600 font-medium' : 'text-muted-foreground',
              )}>
                <Calendar className="h-2.5 w-2.5" />
                {overdue && '⚠ '}{fmtDate(dueDateStr)}
              </span>
            )}
            {acknowledged && (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                <Check className="h-2.5 w-2.5" /> Acknowledged
              </span>
            )}
            {comment && (
              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                <StickyNote className="h-2.5 w-2.5" /> Note
              </span>
            )}
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Acknowledge button */}
          {!acknowledged && (
            <button
              type="button"
              onClick={acknowledge}
              className="text-[10px] font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Acknowledge this task"
              data-testid={`project-task-ack-${task.id}`}
            >
              <Eye className="h-3 w-3" /> Ack
            </button>
          )}
          {/* Comment toggle */}
          <button
            type="button"
            onClick={() => { setShowComment(v => !v); setCommentDraft(comment); }}
            className={cn(
              'text-muted-foreground hover:text-[#1D3461] p-1 rounded-lg transition-all',
              showComment && 'bg-[#1D3461]/10 text-[#1D3461]',
              !showComment && 'opacity-0 group-hover:opacity-100',
            )}
            title={showComment ? 'Close comment' : 'Add note'}
            data-testid={`project-task-comment-${task.id}`}
          >
            <StickyNote className="h-3.5 w-3.5" />
          </button>
          {/* Inline status actions */}
          {!isDone && !isInProgress && (
            <button
              type="button"
              onClick={() => onStatusChange(task.id, 'inprogress')}
              className="text-[10px] font-medium text-[#1D3461] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
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
              className="text-[10px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              data-testid={`project-task-done-${task.id}`}
            >
              <CheckCircle2 className="h-3 w-3" /> Done
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(`/projects/${task.projectId}?tab=field_tasks`)}
            className="text-[10px] text-muted-foreground hover:text-[#1D3461] p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Open in project"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Collapsible comment panel */}
      {showComment && (
        <div className="px-3 pb-3 pt-0 ml-8 border-t border-dashed border-muted/70 mt-1">
          <div className="flex gap-2 mt-2">
            <Textarea
              value={commentDraft}
              onChange={e => setCommentDraft(e.target.value)}
              placeholder="Add a private note about this task…"
              rows={2}
              className="resize-none text-xs flex-1 bg-amber-50/50 dark:bg-amber-900/10 border-amber-200/60"
              data-testid={`project-task-comment-input-${task.id}`}
            />
            <Button
              size="sm"
              className="h-auto px-3 text-xs bg-[#1D3461] hover:bg-[#0F2041] text-white self-start mt-0.5"
              onClick={async () => { await saveComment(commentDraft); setShowComment(false); }}
              data-testid={`project-task-comment-save-${task.id}`}
            >
              Save
            </Button>
          </div>
          {comment && (
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-1.5 italic">Saved: "{comment}"</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Edit Dialog ─────────────────────────────────────────────────────────────

interface EditDialogProps {
  task: PersonalTask | null;
  onClose: () => void;
  onSave: (id: string, updates: Partial<CreatePersonalTask>) => Promise<void>;
  isSaving: boolean;
  isAdmin: boolean;
  isManager?: boolean;
}

function EditPersonalTaskDialog({ task, onClose, onSave, isSaving, isAdmin, isManager = false }: EditDialogProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [priority, setPriority] = useState<PersonalTaskPriority>(task?.priority ?? 'medium');
  const [status, setStatus] = useState<PersonalTaskStatus>(task?.status ?? 'todo');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? '');
  const [category, setCategory] = useState(task?.category ?? 'personal');
  const [notes, setNotes] = useState(task?.notes ?? '');
  const [rewardAmount, setRewardAmount] = useState(task?.completionRewardAmount ? String(task.completionRewardAmount) : '');
  const [rewardCurrency, setRewardCurrency] = useState(task?.completionRewardCurrency ?? 'USD');

  if (!task) return null;

  const handleSave = async () => {
    const canEditReward = isAdmin || isManager;
    const reward = canEditReward ? (rewardAmount ? parseFloat(rewardAmount) : null) : task.completionRewardAmount;
    const currency = canEditReward ? (reward ? rewardCurrency : null) : task.completionRewardCurrency;
    await onSave(task.id, {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      status,
      dueDate: dueDate || null,
      category: category || 'personal',
      notes: notes.trim() || null,
      completionRewardAmount: reward,
      completionRewardCurrency: currency,
    });
    onClose();
  };

  return (
    <Dialog open={!!task} onOpenChange={onClose}>
      <DialogContent className="max-w-xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CheckSquare className="h-4 w-4 text-[#1D3461]" />
            Edit Personal Task
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
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
          {/* Completion Reward — admin / manager only */}
          {(isAdmin || isManager) ? (
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completion Reward (optional)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Amount"
                  value={rewardAmount}
                  onChange={e => setRewardAmount(e.target.value)}
                  className="h-9 flex-1"
                  data-testid="input-edit-reward-amount"
                />
                <Select value={rewardCurrency} onValueChange={setRewardCurrency}>
                  <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['USD', 'SDG', 'EUR', 'GBP'].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[10px] text-muted-foreground">Credited to wallet when task is marked done.</p>
            </div>
          ) : task.completionRewardAmount ? (
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Completion Reward</Label>
              <p className="text-sm font-medium text-emerald-600">{task.completionRewardCurrency} {task.completionRewardAmount.toFixed(2)}</p>
              <p className="text-[10px] text-muted-foreground">Reward set by admin. Credited to wallet on completion.</p>
            </div>
          ) : null}
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

// ── New Task Dialog ──────────────────────────────────────────────────────────

interface NewTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (task: CreatePersonalTask) => Promise<void>;
  isCreating: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  currentUserId: string;
  currentUserName: string;
  currentUserDepartmentId: string | null;
}

function NewTaskDialog({ open, onClose, onCreate, isCreating, isAdmin, isSuperAdmin, currentUserId, currentUserName, currentUserDepartmentId }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [assignMode, setAssignMode] = useState<'self' | 'other' | 'dept'>('self');
  const [selectedUsers, setSelectedUsers] = useState<{ id: string; name: string }[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardCurrency, setRewardCurrency] = useState('USD');
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [depType, setDepType]               = useState<DependencyType>('custom');
  const [depText, setDepText]               = useState('');
  const [depDate, setDepDate]               = useState('');
  const [depUserSearch, setDepUserSearch]   = useState('');
  const [depSelectedUser, setDepSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [depDeptId, setDepDeptId]           = useState('');
  const [depDuplicate, setDepDuplicate]     = useState(false);
  const [dialogAttachments, setDialogAttachments] = useState<{ name: string; url: string; uploadedAt: string; size?: number; type?: string }[]>([]);
  const [dialogUploading, setDialogUploading] = useState(false);
  const dialogFileRef = useRef<HTMLInputElement>(null);

  // Load all departments once to build the managed-dept hierarchy
  const { data: allDepts = [] } = useQuery({
    queryKey: ['all-depts-hierarchy-task'],
    queryFn: async () => {
      const { data } = await supabase
        .from('departments')
        .select('id, name, parent_department_id, manager_user_id');
      return (data ?? []) as { id: string; name: string; parent_department_id: string | null; manager_user_id: string | null }[];
    },
    enabled: open,
    staleTime: 60_000,
  });

  // Compute the set of department IDs this user can assign into:
  // - Super Admin  → null (no filter, all allowed)
  // - Dept Manager → their dept + all sub-depts recursively
  // - Everyone else → [] (empty, cannot assign to others)
  const managedDeptIds = useMemo(() => {
    if (isSuperAdmin) return null;
    const direct = allDepts
      .filter(d => d.manager_user_id === currentUserId)
      .map(d => d.id);
    if (direct.length === 0) return [];
    const result = new Set<string>(direct);
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of allDepts) {
        if (!result.has(d.id) && d.parent_department_id && result.has(d.parent_department_id)) {
          result.add(d.id);
          changed = true;
        }
      }
    }
    return Array.from(result);
  }, [allDepts, currentUserId, isSuperAdmin]);

  // true if this user is allowed to assign tasks to others
  const isManager = isSuperAdmin || (managedDeptIds !== null && managedDeptIds.length > 0);

  // Departments the user can bulk-assign to (for "Dept" mode — super admin only)
  const departments = useMemo(() =>
    isSuperAdmin ? allDepts : (managedDeptIds ?? []).map(id => allDepts.find(d => d.id === id)!).filter(Boolean),
  [allDepts, isSuperAdmin, managedDeptIds]);

  // People the user can assign tasks to
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['profiles-for-task-assign', isSuperAdmin, managedDeptIds?.join(',') ?? 'all'],
    queryFn: async () => {
      if (!isSuperAdmin && managedDeptIds !== null && managedDeptIds.length === 0) return [];
      let q = supabase.from('profiles').select('id, full_name, role, status, department_id').order('full_name');
      if (!isSuperAdmin && managedDeptIds !== null && managedDeptIds.length > 0) {
        q = q.in('department_id', managedDeptIds);
      }
      const { data } = await q;
      return (data ?? []) as { id: string; full_name: string; role: string; status: string; department_id: string | null }[];
    },
    enabled: open && isManager,
    staleTime: 5 * 60_000,
  });

  // All profiles for dep-type 'user' picker (no scope restriction)
  const { data: depAllUsers = [] } = useQuery({
    queryKey: ['all-profiles-for-dep-new'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []) as { id: string; full_name: string; role: string }[];
    },
    enabled: open && depType === 'user',
    staleTime: 5 * 60_000,
  });

  const filteredUsers = users.filter(u =>
    u.id !== currentUserId &&
    !selectedUsers.some(s => s.id === u.id) &&
    (!userSearch || (u.full_name ?? '').toLowerCase().includes(userSearch.toLowerCase()))
  );

  const addUser = (u: { id: string; full_name: string }) => {
    setSelectedUsers(prev => [...prev, { id: u.id, name: u.full_name ?? 'Unknown' }]);
    setUserSearch('');
  };

  const removeUser = (id: string) => {
    setSelectedUsers(prev => prev.filter(u => u.id !== id));
  };

  const reset = () => {
    setTitle(''); setDescription(''); setPriority('medium');
    setDueDate(''); setNotes(''); setAssignMode('self');
    setSelectedUsers([]); setUserSearch(''); setSelectedDeptId('');
    setRewardAmount(''); setRewardCurrency('USD');
    setDependencies([]); setDepType('custom'); setDepText(''); setDepDate('');
    setDepUserSearch(''); setDepSelectedUser(null); setDepDeptId(''); setDepDuplicate(false);
    setDialogAttachments([]);
    setTaskType(null);
  };

  const handleDialogAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDialogUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `task-attachments/new/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('chat-files').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);
      setDialogAttachments(prev => [...prev, { name: file.name, url: urlData.publicUrl, uploadedAt: new Date().toISOString(), size: file.size, type: file.type || ext }]);
    } catch (err) {
      console.error('Attachment upload error:', err);
    } finally {
      setDialogUploading(false);
      if (dialogFileRef.current) dialogFileRef.current.value = '';
    }
  };

  const handleClose = () => { reset(); onClose(); };

  const handleAddDep = () => {
    let dep: Dependency;
    switch (depType) {
      case 'custom': {
        if (!depText.trim()) return;
        dep = { type: 'custom', label: depText.trim(), value: depText.trim() };
        break;
      }
      case 'date': {
        if (!depDate) return;
        dep = { type: 'date', label: depDate, value: depDate };
        break;
      }
      case 'user': {
        if (!depSelectedUser) return;
        dep = { type: 'user', label: depSelectedUser.name, userId: depSelectedUser.id, userName: depSelectedUser.name };
        break;
      }
      case 'department': {
        if (!depDeptId) return;
        const dept = allDepts.find(d => d.id === depDeptId);
        if (!dept) return;
        dep = { type: 'department', label: dept.name, deptId: dept.id, deptName: dept.name };
        break;
      }
      default: return;
    }
    const isDup = dependencies.some(d =>
      d.type === dep.type &&
      (dep.type === 'custom' ? d.value === dep.value :
       dep.type === 'date'   ? d.value === dep.value :
       dep.type === 'user'   ? d.userId === dep.userId :
       d.deptId === dep.deptId)
    );
    if (isDup) { setDepDuplicate(true); return; }
    setDependencies(prev => [...prev, dep]);
    setDepText(''); setDepDate(''); setDepSelectedUser(null); setDepUserSearch(''); setDepDeptId('');
    setDepDuplicate(false);
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    const primaryUser = assignMode === 'other' && selectedUsers.length > 0 ? selectedUsers[0] : null;
    const coAssignees = assignMode === 'other' && selectedUsers.length > 1
      ? selectedUsers.slice(1).map(u => ({ id: u.id, name: u.name }))
      : [];
    const reward = rewardAmount ? parseFloat(rewardAmount) : null;

    if (assignMode === 'dept' && selectedDeptId) {
      const { data: members } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('department_id', selectedDeptId);
      for (const member of (members ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
        await onCreate({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
          taskType: taskType ?? null,
          assignedTo: member.id,
          assignedToName: member.full_name,
          assignedToEmail: member.email,
          targetDepartmentId: selectedDeptId,
          completionRewardAmount: reward,
          completionRewardCurrency: reward ? rewardCurrency : null,
          dependencies: dependencies.length > 0 ? dependencies : undefined,
          attachments: dialogAttachments.length > 0 ? dialogAttachments : undefined,
        });
      }
    } else {
      await onCreate({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
        taskType: taskType ?? null,
        assignedTo: primaryUser?.id ?? null,
        assignedToName: primaryUser?.name ?? null,
        coAssignees: coAssignees.length > 0 ? coAssignees : [],
        completionRewardAmount: reward,
        completionRewardCurrency: reward ? rewardCurrency : null,
        dependencies: dependencies.length > 0 ? dependencies : undefined,
        attachments: dialogAttachments.length > 0 ? dialogAttachments : undefined,
      });
    }
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Plus className="h-4 w-4 text-[#1D3461]" />
            New Task
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1 max-h-[70vh] overflow-y-auto pr-1">
          {/* Title */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Task title <span className="text-red-500">*</span></Label>
            <Input
              placeholder="What needs to be done?"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit(); }}
              autoFocus
              data-testid="input-new-task-title"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Description</Label>
            <Textarea
              placeholder="Add more details…"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="resize-none text-sm min-h-[72px]"
              data-testid="input-new-task-description"
            />
          </div>

          {/* Task Type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Task Type <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex gap-2">
              {([
                { value: null, label: 'General', icon: <Circle className="h-3.5 w-3.5" /> },
                { value: 'project-task' as TaskType, label: 'Project Task', icon: <FolderOpen className="h-3.5 w-3.5" /> },
                { value: 'day-to-day' as TaskType, label: 'Day-to-Day', icon: <RefreshCw className="h-3.5 w-3.5" /> },
              ] as { value: TaskType | null; label: string; icon: React.ReactNode }[]).map(opt => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setTaskType(opt.value)}
                  data-testid={`task-type-${opt.value ?? 'general'}`}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                    taskType === opt.value
                      ? 'bg-[#1D3461] text-white border-[#1D3461]'
                      : 'bg-muted/50 text-muted-foreground border-border hover:border-[#1D3461]/40',
                  )}
                >
                  {opt.icon}{opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority + Due date row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Priority</Label>
              <Select value={priority} onValueChange={v => setPriority(v as PersonalTaskPriority)}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-new-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high', 'critical'] as PersonalTaskPriority[]).map(p => (
                    <SelectItem key={p} value={p} className="text-sm">{PRIORITY_CFG[p].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="h-9 text-sm"
                data-testid="input-new-task-due-date"
              />
            </div>
          </div>

          {/* Assign to */}
          <div className="space-y-2">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              Assign to
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => { setAssignMode('self'); setSelectedUsers([]); }}
                data-testid="button-assign-myself"
                className={cn(
                  'flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-all',
                  assignMode === 'self'
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'bg-muted/50 text-muted-foreground border-border hover:border-[#1D3461]/40'
                )}
              >
                <User className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Myself</span>
              </button>
              <button
                onClick={() => isManager && setAssignMode('other')}
                data-testid="button-assign-other"
                disabled={!isManager}
                title={!isManager ? 'Only department managers can assign tasks to others' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-all',
                  assignMode === 'other'
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'bg-muted/50 text-muted-foreground border-border hover:border-[#1D3461]/40',
                  !isManager && 'opacity-40 cursor-not-allowed'
                )}
              >
                <Users className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Someone else</span>
              </button>
              <button
                onClick={() => isSuperAdmin && setAssignMode('dept')}
                data-testid="button-assign-dept"
                disabled={!isSuperAdmin}
                title={!isSuperAdmin ? 'Only Super Admin can assign to entire departments' : undefined}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-all',
                  assignMode === 'dept'
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'bg-muted/50 text-muted-foreground border-border hover:border-[#1D3461]/40',
                  !isSuperAdmin && 'opacity-40 cursor-not-allowed'
                )}
              >
                <Building2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Dept</span>
              </button>
            </div>

            {/* Myself preview */}
            {assignMode === 'self' && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 border border-border/50 text-sm text-muted-foreground">
                <div className="h-6 w-6 rounded-full bg-[#1D3461] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {currentUserName.charAt(0).toUpperCase()}
                </div>
                <span className="truncate">{currentUserName}</span>
                <span className="ml-auto text-xs opacity-60">(you)</span>
              </div>
            )}

            {/* Department assign */}
            {assignMode === 'dept' && isAdmin && (
              <div className="space-y-1.5">
                <Select value={selectedDeptId || 'none'} onValueChange={v => setSelectedDeptId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select department…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select department…</SelectItem>
                    {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {selectedDeptId && (
                  <p className="text-[10px] text-muted-foreground">A copy of this task will be assigned to each member of the selected department.</p>
                )}
              </div>
            )}

            {/* Someone else: multi-user search */}
            {assignMode === 'other' && isAdmin && (
              <div className="space-y-2">
                {/* Selected user chips */}
                {selectedUsers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedUsers.map((u, idx) => (
                      <span
                        key={u.id}
                        className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                          idx === 0
                            ? 'bg-[#1D3461] text-white'
                            : 'bg-muted text-muted-foreground border border-border',
                        )}
                      >
                        {idx === 0 && <span className="opacity-70 text-[9px] mr-0.5">primary</span>}
                        {u.name}
                        <button
                          type="button"
                          onClick={() => removeUser(u.id)}
                          className="ml-0.5 opacity-70 hover:opacity-100"
                          data-testid={`remove-assignee-${u.id}`}
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  placeholder={selectedUsers.length === 0 ? 'Search team member…' : 'Add another assignee…'}
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-user-search"
                />
                {(userSearch || selectedUsers.length === 0) && (
                  <div className="rounded-lg border border-border bg-background max-h-48 overflow-y-auto">
                    {loadingUsers ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">Loading…</div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">No team members found</div>
                    ) : (
                      filteredUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => addUser(u)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
                          data-testid={`option-user-${u.id}`}
                        >
                          <div className="h-6 w-6 rounded-full bg-[#1D3461]/10 flex items-center justify-center text-[#1D3461] text-xs font-bold flex-shrink-0">
                            {(u.full_name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{u.full_name ?? 'Unknown'}</p>
                            <p className="text-xs text-muted-foreground capitalize">{u.role}</p>
                          </div>
                          <Plus className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                )}
                {selectedUsers.length > 1 && (
                  <p className="text-[10px] text-muted-foreground">
                    First person is the primary assignee. Others are co-assignees and will also see this task.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Completion Reward (admin / super admin / dept manager only) */}
          {(isAdmin || isManager) && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Trophy className="h-3.5 w-3.5 text-emerald-600" />
                Completion Reward <span className="text-muted-foreground font-normal">(optional — credited to wallet on completion)</span>
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={rewardAmount}
                    onChange={e => setRewardAmount(e.target.value)}
                    className="h-8 text-sm"
                    data-testid="input-reward-amount"
                  />
                </div>
                <Input
                  placeholder="USD"
                  value={rewardCurrency}
                  onChange={e => setRewardCurrency(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-reward-currency"
                />
              </div>
            </div>
          )}

          {/* Dependencies — any user can add */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-blue-500" />
              Dependencies <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>

            {/* Existing deps list */}
            {dependencies.length > 0 && (
              <div className="space-y-0.5 rounded-lg border bg-muted/30 p-1.5">
                {dependencies.map((dep, i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 group/dep">
                    {dep.type === 'date'         ? <Calendar   className="h-3 w-3 text-blue-500 flex-shrink-0" />
                     : dep.type === 'user'       ? <User       className="h-3 w-3 text-violet-500 flex-shrink-0" />
                     : dep.type === 'department' ? <Building2  className="h-3 w-3 text-orange-500 flex-shrink-0" />
                     : <Link2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    <span className="text-xs flex-1 leading-snug">
                      {dep.type === 'date'         ? `After ${dep.value}`
                       : dep.type === 'user'       ? dep.userName ?? dep.label
                       : dep.type === 'department' ? `${dep.deptName ?? dep.label} sign-off`
                       : dep.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDependencies(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover/dep:opacity-100"
                      data-testid={`new-task-remove-dep-${i}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Type selector pills */}
            <div className="flex gap-1 flex-wrap">
              {([ ['custom','Custom'], ['date','Date'], ['user','User'], ['department','Department'] ] as [DependencyType, string][]).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setDepType(t); setDepText(''); setDepDate(''); setDepSelectedUser(null); setDepUserSearch(''); setDepDeptId(''); }}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all',
                    depType === t
                      ? 'bg-[#1D3461] text-white border-[#1D3461]'
                      : 'bg-muted text-muted-foreground border-transparent hover:border-border'
                  )}
                >
                  {t === 'custom' ? '📝' : t === 'date' ? '📅' : t === 'user' ? '👤' : '🏢'} {label}
                </button>
              ))}
            </div>

            {/* Type-specific input row */}
            <div className="flex gap-2">
              {depType === 'custom' && (
                <Input
                  placeholder="e.g. 'Site survey complete', 'Approval received'"
                  value={depText}
                  onChange={e => { setDepText(e.target.value); if (depDuplicate) setDepDuplicate(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddDep(); } }}
                  className={cn('h-8 text-sm flex-1', depDuplicate && 'border-amber-400')}
                  data-testid="input-new-task-dep-custom"
                />
              )}
              {depType === 'date' && (
                <Input
                  type="date"
                  value={depDate}
                  onChange={e => { setDepDate(e.target.value); if (depDuplicate) setDepDuplicate(false); }}
                  className={cn('h-8 text-sm flex-1', depDuplicate && 'border-amber-400')}
                  data-testid="input-new-task-dep-date"
                />
              )}
              {depType === 'user' && (
                <div className="flex-1 relative">
                  <Input
                    placeholder="Search user…"
                    value={depUserSearch}
                    onChange={e => { setDepUserSearch(e.target.value); setDepSelectedUser(null); }}
                    className="h-8 text-sm"
                    data-testid="input-new-task-dep-user"
                  />
                  {depUserSearch && !depSelectedUser && (
                    <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-popover border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                      {depAllUsers
                        .filter(p => p.full_name.toLowerCase().includes(depUserSearch.toLowerCase()))
                        .slice(0, 10)
                        .map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted"
                            onClick={() => { setDepSelectedUser({ id: p.id, name: p.full_name }); setDepUserSearch(p.full_name); }}
                          >
                            {p.full_name}
                            <span className="ml-1 text-[10px] text-muted-foreground">{p.role}</span>
                          </button>
                        ))}
                    </div>
                  )}
                  {depSelectedUser && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <Check className="h-3 w-3 text-green-500" />
                    </div>
                  )}
                </div>
              )}
              {depType === 'department' && (
                <select
                  value={depDeptId}
                  onChange={e => { setDepDeptId(e.target.value); if (depDuplicate) setDepDuplicate(false); }}
                  className="h-8 flex-1 rounded-md border bg-background px-2 text-sm"
                  data-testid="select-new-task-dep-dept"
                >
                  <option value="">Select department…</option>
                  {allDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleAddDep}
                disabled={
                  depType === 'custom'     ? !depText.trim() :
                  depType === 'date'       ? !depDate :
                  depType === 'user'       ? !depSelectedUser :
                  !depDeptId
                }
                className="h-8 px-3 text-xs bg-[#1D3461] hover:bg-[#0F2041] text-white disabled:opacity-40"
                data-testid="btn-new-task-add-dep"
              >
                <Plus className="h-3 w-3 mr-1" />Add
              </Button>
            </div>
            {depDuplicate && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />Already listed
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea
              placeholder="Any additional notes…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="resize-none text-sm min-h-[56px]"
              data-testid="input-new-task-notes"
            />
          </div>

          {/* File Attachments */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Paperclip className="h-3 w-3" /> Attachments
            </Label>
            <input
              ref={dialogFileRef}
              type="file"
              className="hidden"
              onChange={handleDialogAttachment}
              data-testid="newtask-input-attachment-file"
            />
            {dialogAttachments.length > 0 && (
              <div className="space-y-1">
                {dialogAttachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-muted/40 border border-border/60 rounded-lg px-2.5 py-1.5 group">
                    <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs text-[#1D3461] flex-1 truncate">{att.name}</span>
                    {att.size && <span className="text-[10px] text-muted-foreground flex-shrink-0">{att.size < 1048576 ? `${(att.size / 1024).toFixed(0)}KB` : `${(att.size / 1048576).toFixed(1)}MB`}</span>}
                    <button type="button" onClick={() => setDialogAttachments(prev => prev.filter((_, i) => i !== idx))}
                      className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button type="button" variant="outline" size="sm"
              className="h-7 text-xs gap-1.5 border-dashed border-border/70 w-full"
              onClick={() => dialogFileRef.current?.click()}
              disabled={dialogUploading}
              data-testid="newtask-button-add-attachment"
            >
              {dialogUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {dialogUploading ? 'Uploading…' : 'Attach file'}
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || isCreating || (assignMode === 'other' && selectedUsers.length === 0) || (assignMode === 'dept' && !selectedDeptId)}
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
            data-testid="button-create-task-submit"
          >
            {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            {assignMode === 'other' && selectedUsers[0] ? `Assign to ${selectedUsers[0].name.split(' ')[0]}`
              : assignMode === 'dept' && selectedDeptId ? 'Assign to Dept'
              : 'Create Task'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Planning Hub ─────────────────────────────────────────────────────────────

// Planning tip data — one per day, rotating by day-of-year
const PLANNING_TIPS = [
  {
    icon: '🐸', vizType: 'frog',
    title: 'Eat the Frog First',
    text: 'Tackle your hardest or most important task first thing each day. Once it\'s done, everything else feels easier.',
    tag: 'Productivity', difficulty: 'Easy', timeToTry: '2 min',
    keyTakeaway: 'Start hard, end easy — a done frog beats ten pending ones.',
    from: '#f59e0b', to: '#ea580c',
    tagBg: 'bg-amber-100 dark:bg-amber-900/40',
    tagColor: 'text-amber-700 dark:text-amber-300',
  },
  {
    icon: '⏱', vizType: 'twomin',
    title: '2-Minute Rule',
    text: 'If a task takes less than 2 minutes to complete, do it immediately instead of adding it to your list.',
    tag: 'GTD', difficulty: 'Easy', timeToTry: '< 2 min',
    keyTakeaway: 'Every tiny task cleared is mental bandwidth reclaimed.',
    from: '#10b981', to: '#0891b2',
    tagBg: 'bg-emerald-100 dark:bg-emerald-900/40',
    tagColor: 'text-emerald-700 dark:text-emerald-300',
  },
  {
    icon: '📊', vizType: 'matrix',
    title: 'Eisenhower Matrix',
    text: 'Sort tasks by Urgency and Importance. Do urgent+important now, schedule important tasks, delegate urgent ones, drop the rest.',
    tag: 'Prioritisation', difficulty: 'Medium', timeToTry: '10 min',
    keyTakeaway: 'Busyness ≠ importance. Protect your Important-not-Urgent quadrant.',
    from: '#3b82f6', to: '#1D3461',
    tagBg: 'bg-blue-100 dark:bg-blue-900/40',
    tagColor: 'text-blue-700 dark:text-blue-300',
  },
  {
    icon: '⏰', vizType: 'blocks',
    title: 'Time Blocking',
    text: 'Reserve fixed slots in your calendar for focused work on specific tasks. Protect those blocks from meetings and interruptions.',
    tag: 'Focus', difficulty: 'Medium', timeToTry: '15 min',
    keyTakeaway: 'Unplanned time evaporates. Blocked time gets work done.',
    from: '#7c3aed', to: '#4f46e5',
    tagBg: 'bg-violet-100 dark:bg-violet-900/40',
    tagColor: 'text-violet-700 dark:text-violet-300',
  },
  {
    icon: '🔁', vizType: 'review',
    title: 'Weekly Review',
    text: 'Set aside 30 minutes every Friday to review what got done, reschedule anything overdue, and plan the following week.',
    tag: 'Habit', difficulty: 'Medium', timeToTry: '30 min',
    keyTakeaway: '30 minutes of review saves 5 hours of confusion next week.',
    from: '#0ea5e9', to: '#6366f1',
    tagBg: 'bg-sky-100 dark:bg-sky-900/40',
    tagColor: 'text-sky-700 dark:text-sky-300',
  },
  {
    icon: '🎯', vizType: 'mit',
    title: 'MIT — Most Important Tasks',
    text: 'Every morning, identify your 3 Most Important Tasks. Complete those first before touching anything else.',
    tag: 'Focus', difficulty: 'Easy', timeToTry: '5 min',
    keyTakeaway: 'Three tasks done well beats ten tasks done poorly.',
    from: '#e11d48', to: '#9333ea',
    tagBg: 'bg-rose-100 dark:bg-rose-900/40',
    tagColor: 'text-rose-700 dark:text-rose-300',
  },
];

// ── Per-tip interactive mini visualisations ───────────────────────────────────
function TipVisual({ vizType, from, to }: { vizType: string; from: string; to: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [active, setActive] = useState<'yes' | 'no' | null>(null);
  const [checked, setChecked] = useState<Set<number>>(new Set([0, 1]));
  const [done, setDone] = useState<Set<number>>(new Set());

  // 1. Eat the Frog — energy level bar chart across the day
  if (vizType === 'frog') {
    const bars = [
      { label: '8 AM', energy: 92, note: 'Peak zone 🐸' },
      { label: '10 AM', energy: 75, note: 'Still strong' },
      { label: '12 PM', energy: 54, note: 'Fading fast' },
      { label: '2 PM', energy: 35, note: 'Post-lunch dip' },
      { label: '4 PM', energy: 48, note: 'Small recovery' },
    ];
    return (
      <div className="mt-4 space-y-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
          <span>⚡</span> Mental Energy Through the Day
        </p>
        {bars.map((b, i) => (
          <div
            key={b.label}
            className="flex items-center gap-3 cursor-default group"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="text-[11px] font-semibold w-10 text-right text-muted-foreground">{b.label}</span>
            <div className="flex-1 h-5 rounded-full bg-black/6 dark:bg-white/10 overflow-hidden relative">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${b.energy}%`,
                  background: `linear-gradient(90deg, ${from}, ${to})`,
                  opacity: hovered === i ? 1 : 0.75,
                }}
              />
              {hovered === i && (
                <span className="absolute inset-0 flex items-center px-2.5 text-[10px] font-bold text-white">{b.note}</span>
              )}
            </div>
            <span className="text-[11px] font-bold w-8" style={{ color: from }}>{b.energy}%</span>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground mt-1">Hover a bar — tackle the 🐸 at 8 AM when energy peaks.</p>
      </div>
    );
  }

  // 2. 2-Minute Rule — decision flowchart
  if (vizType === 'twomin') {
    return (
      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <span>🔀</span> Decision Flow — New Task Arrives
        </p>
        <div className="flex flex-col items-center gap-2">
          {/* Trigger node */}
          <div
            className="rounded-xl border-2 px-4 py-2 text-sm font-bold text-center w-full"
            style={{ borderColor: from, color: from, background: `${from}12` }}
          >
            📥 New task lands on your plate
          </div>
          {/* Arrow */}
          <div className="w-0.5 h-4" style={{ background: from }} />
          {/* Decision diamond */}
          <div
            className="relative flex items-center justify-center rounded-xl border-2 px-4 py-2 text-sm font-bold w-full text-center"
            style={{ borderColor: to, color: to, background: `${to}12` }}
          >
            ⏱ Does it take &lt; 2 minutes?
          </div>
          {/* Two branches */}
          <div className="w-full flex gap-3 mt-1">
            <button
              type="button"
              onMouseEnter={() => setActive('yes')}
              onMouseLeave={() => setActive(null)}
              className="flex-1 rounded-xl border-2 p-3 text-center transition-all duration-200 cursor-default"
              style={{
                borderColor: '#10b981',
                background: active === 'yes' ? '#10b98122' : '#10b98108',
              }}
            >
              <p className="text-base font-black text-emerald-600">✅ YES</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">Do it RIGHT NOW</p>
              <p className="text-[10px] text-muted-foreground mt-1">Don't add to list — just act.</p>
            </button>
            <button
              type="button"
              onMouseEnter={() => setActive('no')}
              onMouseLeave={() => setActive(null)}
              className="flex-1 rounded-xl border-2 p-3 text-center transition-all duration-200 cursor-default"
              style={{
                borderColor: '#f59e0b',
                background: active === 'no' ? '#f59e0b22' : '#f59e0b08',
              }}
            >
              <p className="text-base font-black text-amber-600">📋 NO</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 font-semibold mt-0.5">Add to task list</p>
              <p className="text-[10px] text-muted-foreground mt-1">Schedule with priority & date.</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Eisenhower Matrix — 2×2 interactive grid
  if (vizType === 'matrix') {
    const quads = [
      { label: 'DO NOW', sub: 'Urgent + Important', icon: '🔥', color: '#ef4444', bg: '#fef2f2', dark: '#450a0a', q: 0 },
      { label: 'SCHEDULE', sub: 'Not Urgent + Important', icon: '📅', color: '#3b82f6', bg: '#eff6ff', dark: '#1e1b4b', q: 1 },
      { label: 'DELEGATE', sub: 'Urgent + Not Important', icon: '🤝', color: '#f59e0b', bg: '#fffbeb', dark: '#451a03', q: 2 },
      { label: 'ELIMINATE', sub: 'Not Urgent + Not Important', icon: '🗑️', color: '#6b7280', bg: '#f9fafb', dark: '#111827', q: 3 },
    ];
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><span>🧭</span> Task Quadrants</p>
          <div className="flex gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">← Low Urgency <span className="font-bold">High →</span></span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {quads.map((q) => (
            <button
              key={q.q}
              type="button"
              onMouseEnter={() => setHovered(q.q)}
              onMouseLeave={() => setHovered(null)}
              className="rounded-xl p-3 text-left border-2 transition-all duration-200 cursor-default"
              style={{
                borderColor: hovered === q.q ? q.color : `${q.color}40`,
                background: hovered === q.q ? `${q.color}18` : `${q.color}08`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-base">{q.icon}</span>
                <span className="text-xs font-black tracking-wide" style={{ color: q.color }}>{q.label}</span>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">{q.sub}</p>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Hover each quadrant to explore — aim for more blue, less red.</p>
      </div>
    );
  }

  // 4. Time Blocking — visual day schedule
  if (vizType === 'blocks') {
    const schedule = [
      { time: '8–10', label: 'Deep Work', icon: '🧠', w: 2, color: '#7c3aed' },
      { time: '10–11', label: 'Team Standup', icon: '🤝', w: 1, color: '#f59e0b' },
      { time: '11–12', label: 'Deep Work', icon: '🧠', w: 1, color: '#7c3aed' },
      { time: '12–1', label: 'Lunch Break', icon: '🥗', w: 1, color: '#10b981' },
      { time: '1–3', label: 'Meetings', icon: '📞', w: 2, color: '#0ea5e9' },
      { time: '3–5', label: 'Email & Admin', icon: '📧', w: 2, color: '#6366f1' },
    ];
    return (
      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <span>🗓️</span> Sample Blocked Day
        </p>
        <div className="space-y-2">
          {schedule.map((s, i) => (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 border transition-all duration-200 cursor-default text-left"
              style={{
                borderColor: hovered === i ? s.color : `${s.color}40`,
                background: hovered === i ? `${s.color}18` : `${s.color}08`,
              }}
            >
              <span className="text-sm w-5">{s.icon}</span>
              <span className="text-[11px] font-bold text-muted-foreground w-12 flex-shrink-0">{s.time}</span>
              <div className="flex-1 h-4 rounded-full overflow-hidden bg-black/5 dark:bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${(s.w / 2) * 100}%`, background: s.color, opacity: hovered === i ? 1 : 0.6 }}
                />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: s.color }}>{s.label}</span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Guard 🧠 blocks fiercely — they're your highest-value time.</p>
      </div>
    );
  }

  // 5. Weekly Review — checklist with progress
  if (vizType === 'review') {
    const items = [
      { icon: '✅', label: 'Review all completed tasks' },
      { icon: '📅', label: 'Reschedule overdue items' },
      { icon: '🎯', label: 'Set next week\'s 3 MITs' },
      { icon: '🗑️', label: 'Delete or delegate stale tasks' },
      { icon: '📊', label: 'Check progress against goals' },
    ];
    const pct = Math.round((checked.size / items.length) * 100);
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5"><span>📋</span> Friday Review Checklist</p>
          <span className="text-xs font-black" style={{ color: from }}>{pct}% done</span>
        </div>
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-black/6 dark:bg-white/10 mb-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${from}, ${to})` }}
          />
        </div>
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setChecked(prev => {
                const next = new Set(prev);
                next.has(i) ? next.delete(i) : next.add(i);
                return next;
              })}
              className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 border transition-all duration-200 text-left cursor-pointer"
              style={{
                borderColor: checked.has(i) ? from : '#e5e7eb',
                background: checked.has(i) ? `${from}12` : 'transparent',
              }}
            >
              <div
                className="h-4 w-4 rounded flex items-center justify-center flex-shrink-0 border-2 transition-all"
                style={{
                  borderColor: checked.has(i) ? from : '#9ca3af',
                  background: checked.has(i) ? from : 'transparent',
                }}
              >
                {checked.has(i) && <span className="text-white text-[9px] font-black">✓</span>}
              </div>
              <span className="text-xs font-semibold" style={{ color: checked.has(i) ? from : undefined, textDecoration: checked.has(i) ? 'line-through' : 'none', opacity: checked.has(i) ? 0.7 : 1 }}>
                {item.icon} {item.label}
              </span>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Click items to check off — this is a live demo!</p>
      </div>
    );
  }

  // 6. MIT — Top 3 ranked tasks
  if (vizType === 'mit') {
    const tasks = [
      { rank: 1, label: 'Finish field report for Khartoum site', impact: 'High' },
      { rank: 2, label: 'Submit MMP update before 5 PM', impact: 'High' },
      { rank: 3, label: 'Review coordinator feedback notes', impact: 'Medium' },
    ];
    const rankColors = ['#e11d48', '#f59e0b', '#3b82f6'];
    return (
      <div className="mt-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <span>⭐</span> Your 3 Most Important Tasks Today
        </p>
        <div className="space-y-2">
          {tasks.map((t, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setDone(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
              className="w-full flex items-center gap-3 rounded-xl p-3 border-2 transition-all duration-200 text-left cursor-pointer"
              style={{
                borderColor: done.has(i) ? '#10b981' : rankColors[i],
                background: done.has(i) ? '#10b98112' : `${rankColors[i]}0e`,
              }}
            >
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center text-white font-black text-sm flex-shrink-0"
                style={{ background: done.has(i) ? '#10b981' : rankColors[i] }}
              >
                {done.has(i) ? '✓' : `#${t.rank}`}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold leading-tight" style={{ textDecoration: done.has(i) ? 'line-through' : 'none', opacity: done.has(i) ? 0.5 : 1 }}>{t.label}</p>
                <span className="text-[10px] font-bold" style={{ color: done.has(i) ? '#10b981' : rankColors[i] }}>
                  {done.has(i) ? '✅ Done!' : `Impact: ${t.impact}`}
                </span>
              </div>
            </button>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Tap tasks to mark done — tackle #1 before anything else.</p>
      </div>
    );
  }

  return null;
}

interface PlanningHubProps {
  allTasks: Array<{ dueDate?: string | null; status: string; priority?: string }>;
}

function PlanningHub({ allTasks }: PlanningHubProps) {
  const [open, setOpen] = useState(false);
  const dailyIdx = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
    return dayOfYear % PLANNING_TIPS.length;
  }, []);
  const [tipIdx, setTipIdx] = useState(dailyIdx);
  const [transitioning, setTransitioning] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [progress, setProgress] = useState(0);

  // ── Outlook Calendar integration ─────────────────────────────────────────
  const {
    isConnected: outlookConnected,
    isConnecting: outlookConnecting,
    isFetchingEvents: outlookFetching,
    error: outlookError,
    events: outlookEvents,
    connect: connectOutlook,
    disconnect: disconnectOutlook,
    fetchMyEvents,
    hasClientId: outlookConfigured,
  } = useOutlookCalendar();

  useEffect(() => {
    if (!outlookConnected || !open) return;
    const today = startOfToday();
    fetchMyEvents(today, addDays(today, 14));
  }, [outlookConnected, open, fetchMyEvents]);

  const meetingsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    outlookEvents.forEach(evt => {
      const dateKey = evt.start.split('T')[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(evt);
    });
    return map;
  }, [outlookEvents]);

  // Navigate with fade-slide animation
  const navigate = useCallback((newIdx: number) => {
    setTransitioning(true);
    setProgress(0);
    setTimeout(() => {
      setTipIdx(newIdx);
      setTransitioning(false);
    }, 180);
  }, []);

  // Auto-advance every 10 seconds with smooth progress bar
  useEffect(() => {
    if (!autoPlay || !open) { setProgress(0); return; }
    const DURATION = 10000;
    const TICK = 80;
    let elapsed = 0;
    const id = setInterval(() => {
      elapsed += TICK;
      setProgress(Math.min((elapsed / DURATION) * 100, 100));
      if (elapsed >= DURATION) {
        elapsed = 0;
        setTransitioning(true);
        setTimeout(() => {
          setTipIdx(i => (i + 1) % PLANNING_TIPS.length);
          setProgress(0);
          setTransitioning(false);
        }, 180);
      }
    }, TICK);
    return () => clearInterval(id);
  }, [autoPlay, open, tipIdx]);

  // Keyboard ← → navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') navigate((tipIdx - 1 + PLANNING_TIPS.length) % PLANNING_TIPS.length);
      if (e.key === 'ArrowRight') navigate((tipIdx + 1) % PLANNING_TIPS.length);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, tipIdx, navigate]);

  // ── Workload chart data (next 7 days + past overdue bucket) ──────────────
  const workloadData = useMemo(() => {
    const today = startOfToday();
    const days = eachDayOfInterval({ start: today, end: addDays(today, 6) });

    const overdueBucket = { label: 'Overdue', count: 0, color: '#ef4444', isOverdue: true };
    allTasks.forEach(t => {
      if (!t.dueDate || t.status === 'done' || t.status === 'cancelled') return;
      try {
        const d = parseISO(t.dueDate);
        if (!isValid(d)) return;
        if (isBefore(startOfDay(d), today)) overdueBucket.count++;
      } catch { /* skip */ }
    });

    const dayBuckets = days.map(day => {
      const label = isToday(day) ? 'Today' : format(day, 'EEE d');
      const count = allTasks.filter(t => {
        if (!t.dueDate || t.status === 'done' || t.status === 'cancelled') return false;
        try {
          const d = parseISO(t.dueDate);
          return isValid(d) && startOfDay(d).getTime() === startOfDay(day).getTime();
        } catch { return false; }
      }).length;
      const color = isToday(day) ? '#f59e0b' : '#1D3461';
      return { label, count, color, isOverdue: false };
    });

    return overdueBucket.count > 0 ? [overdueBucket, ...dayBuckets] : dayBuckets;
  }, [allTasks]);

  // ── Priority distribution donut ─────────────────────────────────────────
  const priorityData = useMemo(() => {
    const active = allTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    active.forEach(t => { if (t.priority && counts[t.priority] !== undefined) counts[t.priority]++; });
    return [
      { name: 'Critical', value: counts.critical, color: '#ef4444' },
      { name: 'High',     value: counts.high,     color: '#f97316' },
      { name: 'Medium',   value: counts.medium,   color: '#f59e0b' },
      { name: 'Low',      value: counts.low,       color: '#3b82f6' },
    ].filter(d => d.value > 0);
  }, [allTasks]);

  // ── 7-day visual timeline ────────────────────────────────────────────────
  const timelineDays = useMemo(() => {
    const today = startOfToday();
    return eachDayOfInterval({ start: today, end: addDays(today, 13) }).map(day => {
      const tasks = allTasks.filter(t => {
        if (!t.dueDate || t.status === 'done' || t.status === 'cancelled') return false;
        try {
          const d = parseISO(t.dueDate);
          return isValid(d) && startOfDay(d).getTime() === startOfDay(day).getTime();
        } catch { return false; }
      });
      return { day, tasks, isToday: isToday(day) };
    });
  }, [allTasks]);

  const tip = PLANNING_TIPS[tipIdx];
  const total = allTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length;

  // Smart CTA — contextual message from the user's real task data
  const smartCta = useMemo(() => {
    const today = startOfToday();
    const active = allTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
    const overdue = active.filter(t => {
      if (!t.dueDate) return false;
      try { return isBefore(startOfDay(parseISO(t.dueDate)), today); } catch { return false; }
    }).length;
    const critical = active.filter(t => t.priority === 'critical').length;
    const noDate = active.filter(t => !t.dueDate).length;
    const vz = tip.vizType;
    if (vz === 'frog' && active.length > 0)
      return `💡 Apply now: You have ${active.length} active task${active.length !== 1 ? 's' : ''} — pick the hardest one and put it first tomorrow.`;
    if (vz === 'twomin' && noDate > 0)
      return `💡 Apply now: ${noDate} task${noDate !== 1 ? 's have' : ' has'} no due date — check which ones take under 2 minutes and clear them now.`;
    if (vz === 'matrix' && critical > 0)
      return `💡 Apply now: ${critical} critical task${critical !== 1 ? 's are' : ' is'} flagged — map them to the Matrix and decide what to do right now.`;
    if (vz === 'blocks')
      return '💡 Apply now: Open your calendar and block one 2-hour deep-work slot for tomorrow morning.';
    if (vz === 'review')
      return '💡 Apply now: Spend 5 minutes right now reviewing your overdue and this-week tasks above.';
    if (vz === 'mit' && active.length > 0)
      return `💡 Apply now: From your ${active.length} active tasks, pick your top 3 for tomorrow and write them down.`;
    if (overdue > 0)
      return `💡 You have ${overdue} overdue task${overdue !== 1 ? 's' : ''} — this method can help you tackle them today.`;
    return null;
  }, [tip.vizType, allTasks]);

  return (
    <div className="rounded-xl border bg-gradient-to-br from-violet-50/60 to-indigo-50/40 dark:from-violet-950/20 dark:to-indigo-950/20 border-violet-200/50 dark:border-violet-800/30">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left"
      >
        <div className="h-7 w-7 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center flex-shrink-0">
          <GanttChartSquare className="h-4 w-4 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">Planning Tools</p>
          <p className="text-[11px] text-muted-foreground">Workload chart · Timeline · Priority view · Methodology tips</p>
        </div>
        <div className="flex items-center gap-2">
          {total > 0 && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{total} active tasks</Badge>}
          {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-violet-200/50 dark:border-violet-800/30 p-4 space-y-5">

          {/* Tabs for the three chart tools */}
          <Tabs defaultValue="workload" className="w-full">
            <TabsList className="grid w-full grid-cols-3 h-8 text-xs">
              <TabsTrigger value="workload" className="text-xs gap-1"><BarChart2 className="h-3 w-3" />Workload</TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs gap-1"><Calendar className="h-3 w-3" />Timeline</TabsTrigger>
              <TabsTrigger value="priority" className="text-xs gap-1"><Flag className="h-3 w-3" />Priority</TabsTrigger>
            </TabsList>

            {/* ── Workload chart ── */}
            <TabsContent value="workload" className="mt-3 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  <strong>Workload chart</strong> shows how many tasks are due each day over the next 7 days.
                  Use this to spot overloaded days and reschedule tasks for a more even workload.
                  Today is highlighted in amber; overdue tasks appear in red.
                </p>
              </div>
              {workloadData.every(d => d.count === 0) ? (
                <div className="flex items-center justify-center h-28 text-sm text-muted-foreground">
                  No upcoming tasks with due dates — assign dates to see your workload
                </div>
              ) : (
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={workloadData} barSize={24} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                        formatter={(v: number) => [`${v} task${v !== 1 ? 's' : ''}`, 'Due']}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {workloadData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} opacity={entry.count === 0 ? 0.3 : 1} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground text-center">
                Tip: If one day is much heavier than others, drag tasks to earlier days to balance your workload
              </p>
            </TabsContent>

            {/* ── Timeline strip ── */}
            <TabsContent value="timeline" className="mt-3 space-y-3">

              {/* Outlook connect/status bar */}
              <div className={cn(
                'flex items-center justify-between gap-2 rounded-xl px-3 py-2 border',
                outlookConnected
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-50 dark:bg-slate-900/30 border-slate-200 dark:border-slate-700',
              )}>
                <div className="flex items-center gap-2">
                  <span className="text-base">📅</span>
                  {outlookConnected ? (
                    <div>
                      <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">Outlook Connected</p>
                      <p className="text-[10px] text-muted-foreground">Meetings shown in orange on the timeline</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[11px] font-bold text-foreground">Connect Outlook Calendar</p>
                      <p className="text-[10px] text-muted-foreground">
                        {outlookConfigured ? 'See your meetings alongside tasks in the timeline' : 'VITE_MICROSOFT_CLIENT_ID not set — contact admin'}
                      </p>
                    </div>
                  )}
                </div>
                {outlookConnected ? (
                  <div className="flex items-center gap-1.5">
                    {outlookFetching && <Loader2 className="h-3.5 w-3.5 text-emerald-500 animate-spin" />}
                    <button
                      type="button"
                      onClick={() => { const today = startOfToday(); fetchMyEvents(today, addDays(today, 14)); }}
                      className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 transition-colors"
                      title="Refresh meetings"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => disconnectOutlook()}
                      className="text-[10px] font-semibold text-muted-foreground hover:text-red-500 transition-colors px-1.5 py-0.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : outlookConfigured ? (
                  <button
                    type="button"
                    onClick={() => connectOutlook()}
                    disabled={outlookConnecting}
                    className="flex items-center gap-1.5 rounded-lg bg-[#0078d4] hover:bg-[#106ebe] text-white text-[11px] font-bold px-3 py-1.5 transition-colors disabled:opacity-60"
                  >
                    {outlookConnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>🪟</span>}
                    {outlookConnecting ? 'Connecting…' : 'Sign in with Microsoft'}
                  </button>
                ) : null}
              </div>

              {/* Outlook error */}
              {outlookError && (
                <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center gap-1.5 px-1">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />{outlookError}
                </p>
              )}

              {/* Legend */}
              <div className="flex items-center gap-4 px-0.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Info className="h-3 w-3 text-violet-500" />
                  <strong className="text-foreground">14-day timeline</strong> — hover a column for details
                </div>
                <div className="flex items-center gap-3 ml-auto">
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="h-2 w-2 rounded-full bg-[#1D3461] inline-block" /> Tasks
                  </span>
                  {outlookConnected && (
                    <>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-orange-400 inline-block" /> Meetings
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-purple-400 inline-block" /> OOO
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Day columns */}
              <div className="overflow-x-auto pb-1">
                <div className="flex gap-1 min-w-max">
                  {timelineDays.map(({ day, tasks: dt, isToday: t }) => {
                    const dayKey = format(day, 'yyyy-MM-dd');
                    const dayMeetings = meetingsByDay[dayKey] ?? [];
                    const busyMeetings = dayMeetings.filter(m => m.status === 'busy' || m.status === 'tentative');
                    const oooMeetings  = dayMeetings.filter(m => m.status === 'oof');
                    const totalLoad    = dt.length + busyMeetings.length + oooMeetings.length;
                    const isHeavy      = totalLoad >= 5;

                    return (
                      <UITooltip key={day.toString()}>
                        <TooltipTrigger asChild>
                          <div className={cn(
                            'flex flex-col items-center gap-0.5 cursor-default rounded-lg px-1 py-1 transition-colors hover:bg-muted/60',
                            isHeavy && 'ring-1 ring-red-200 dark:ring-red-800 bg-red-50/40 dark:bg-red-950/10 rounded-lg',
                          )}>
                            <span className={cn('text-[9px] font-bold', t ? 'text-amber-600' : 'text-muted-foreground')}>
                              {t ? 'TODAY' : format(day, 'EEE')}
                            </span>
                            <span className={cn('text-[10px] font-black', t ? 'text-amber-600' : 'text-foreground')}>
                              {format(day, 'd')}
                            </span>
                            {/* Tasks box */}
                            <div className={cn(
                              'w-8 min-h-[36px] rounded-md border flex flex-col items-center justify-center gap-0.5 p-0.5',
                              t ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30'
                                : dt.length > 0 ? 'border-[#1D3461]/30 bg-[#1D3461]/5'
                                : 'border-border bg-card',
                            )}>
                              {dt.length === 0 ? (
                                <div className="h-1.5 w-1.5 rounded-full bg-muted" />
                              ) : (
                                <>
                                  {Array.from({ length: Math.min(dt.length, 3) }).map((_, i) => (
                                    <div key={i} className={cn('h-1.5 w-1.5 rounded-full', t ? 'bg-amber-500' : 'bg-[#1D3461]')} />
                                  ))}
                                  {dt.length > 3 && <span className="text-[7px] text-muted-foreground">+{dt.length - 3}</span>}
                                </>
                              )}
                            </div>
                            {/* Meetings box (only when connected) */}
                            {outlookConnected && (
                              <div className={cn(
                                'w-8 min-h-[28px] rounded-md border flex flex-col items-center justify-center gap-0.5 p-0.5',
                                dayMeetings.length > 0
                                  ? 'border-orange-200 bg-orange-50 dark:bg-orange-950/20'
                                  : 'border-dashed border-slate-200 dark:border-slate-700 bg-transparent',
                              )}>
                                {dayMeetings.length === 0 ? (
                                  <div className="h-1.5 w-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
                                ) : (
                                  <>
                                    {busyMeetings.slice(0, 2).map((_, i) => (
                                      <div key={`b${i}`} className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                                    ))}
                                    {oooMeetings.slice(0, 1).map((_, i) => (
                                      <div key={`o${i}`} className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                                    ))}
                                    {dayMeetings.length > 3 && <span className="text-[7px] text-muted-foreground">+{dayMeetings.length - 3}</span>}
                                  </>
                                )}
                              </div>
                            )}
                            {/* Count badges */}
                            {(dt.length > 0 || dayMeetings.length > 0) && (
                              <div className="flex items-center gap-0.5">
                                {dt.length > 0 && (
                                  <span className={cn('text-[8px] font-bold', t ? 'text-amber-600' : 'text-[#1D3461]')}>{dt.length}T</span>
                                )}
                                {outlookConnected && dayMeetings.length > 0 && (
                                  <span className="text-[8px] font-bold text-orange-500">{dayMeetings.length}M</span>
                                )}
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-[220px] p-3 space-y-1.5">
                          <p className="font-bold text-xs">{format(day, 'EEEE, MMM d')}</p>
                          {dt.length > 0 && (
                            <p className="text-[11px]">📌 <strong>{dt.length}</strong> task{dt.length !== 1 ? 's' : ''} due</p>
                          )}
                          {dayMeetings.length > 0 && (
                            <div className="space-y-1 border-t pt-1">
                              <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wide">📅 Meetings ({dayMeetings.length})</p>
                              {dayMeetings.slice(0, 4).map(m => (
                                <p key={m.id} className="text-[10px] text-muted-foreground leading-tight">
                                  · {m.isAllDay ? 'All day' : m.start.includes('T') ? format(parseISO(m.start), 'h:mm a') : ''} — {m.subject}
                                </p>
                              ))}
                              {dayMeetings.length > 4 && <p className="text-[10px] text-muted-foreground">+{dayMeetings.length - 4} more</p>}
                            </div>
                          )}
                          {dt.length === 0 && dayMeetings.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">Free day 🎉</p>
                          )}
                        </TooltipContent>
                      </UITooltip>
                    );
                  })}
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground text-center">
                T = tasks · M = meetings · Days with 5+ items flagged in red · Aim for 3–5 tasks/day
              </p>
            </TabsContent>

            {/* ── Priority donut ── */}
            <TabsContent value="priority" className="mt-3 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  <strong>Priority breakdown</strong> of your active tasks. Ideally, most of your tasks should be
                  medium or low priority — if critical/high tasks dominate, that signals high pressure or poor
                  planning ahead of deadlines.
                </p>
              </div>
              {priorityData.length === 0 ? (
                <div className="flex items-center justify-center h-28 text-sm text-muted-foreground">
                  No active tasks — great job!
                </div>
              ) : (
                <div className="flex items-center gap-6">
                  <div className="h-28 w-28 flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={priorityData} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={48}>
                          {priorityData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0' }}
                          formatter={(v: number, n: string) => [`${v} task${v !== 1 ? 's' : ''}`, n]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {priorityData.map(d => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                        <span className="text-xs text-foreground flex-1">{d.name}</span>
                        <span className="text-xs font-bold text-foreground">{d.value}</span>
                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ backgroundColor: d.color, width: `${Math.round((d.value / priorityData.reduce((s, x) => s + x.value, 0)) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                    <p className="text-[10px] text-muted-foreground pt-1">
                      {priorityData.find(d => d.name === 'Critical' && d.value > 0)
                        ? '⚠ Critical tasks detected — handle these today'
                        : '✓ Priority distribution looks healthy'}
                    </p>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* ── Planning Methodology Tips ─────────────────────────────── */}
          <div className="border-t border-violet-200/40 dark:border-violet-800/30 pt-4">

            {/* ── Section header row ── */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-violet-500" />
                <span className="text-[11px] font-black tracking-widest uppercase text-muted-foreground">Planning Methodology</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => navigate((tipIdx - 1 + PLANNING_TIPS.length) % PLANNING_TIPS.length)}
                  className="h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground text-xs transition-colors"
                >‹</button>
                {PLANNING_TIPS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => navigate(i)}
                    className={cn(
                      'rounded-full transition-all duration-200',
                      i === tipIdx ? 'h-2.5 w-2.5 bg-violet-500' : 'h-1.5 w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60',
                    )}
                    aria-label={PLANNING_TIPS[i].title}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => navigate((tipIdx + 1) % PLANNING_TIPS.length)}
                  className="h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground text-xs transition-colors"
                >›</button>
                <button
                  type="button"
                  onClick={() => { setAutoPlay(v => !v); setProgress(0); }}
                  className="ml-1 h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center text-muted-foreground text-[10px] transition-colors"
                  title={autoPlay ? 'Pause auto-advance' : 'Resume auto-advance'}
                >
                  {autoPlay ? '⏸' : '▶'}
                </button>
              </div>
            </div>

            {/* Thin progress bar */}
            {autoPlay && (
              <div className="h-0.5 w-full bg-muted rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full bg-violet-400 transition-none rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {/* Main tip card — fades and slides on change */}
            <div
              className="relative rounded-2xl overflow-hidden p-px"
              style={{ background: `linear-gradient(135deg, ${tip.from}, ${tip.to})` }}
            >
              <div
                className="relative rounded-2xl bg-white dark:bg-[#0f1117] p-5 transition-all duration-180"
                style={{ opacity: transitioning ? 0 : 1, transform: transitioning ? 'translateX(8px)' : 'translateX(0)' }}
              >
                {/* Top row — icon + meta */}
                <div className="flex gap-4 items-start">
                  {/* Large icon blob */}
                  <div
                    className="flex-shrink-0 h-16 w-16 rounded-2xl flex items-center justify-center text-4xl shadow-md"
                    style={{ background: `linear-gradient(135deg, ${tip.from}28, ${tip.to}3a)` }}
                  >
                    {tip.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Badge row */}
                    <div className="flex items-center flex-wrap gap-1.5 mb-2">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${tip.tagBg} ${tip.tagColor}`}>
                        {tip.tag}
                      </span>
                      {/* Difficulty badge */}
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        tip.difficulty === 'Easy'
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                          : tip.difficulty === 'Medium'
                          ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                          : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                      }`}>
                        {tip.difficulty === 'Easy' ? '🟢' : tip.difficulty === 'Medium' ? '🟡' : '🔴'} {tip.difficulty}
                      </span>
                      {/* Time badge */}
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        ⏱ {tip.timeToTry}
                      </span>
                      {tipIdx === dailyIdx && (
                        <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400">
                          ✦ Today's Tip
                        </span>
                      )}
                    </div>

                    {/* Title */}
                    <p
                      className="text-xl font-black leading-tight mb-2"
                      style={{ background: `linear-gradient(135deg, ${tip.from}, ${tip.to})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                    >
                      {tip.title}
                    </p>
                    {/* Body text */}
                    <p className="text-sm text-muted-foreground leading-relaxed">{tip.text}</p>
                  </div>
                </div>

                {/* Smart CTA — personalised to the user's task data */}
                {smartCta && (
                  <div
                    className="mt-4 rounded-xl px-4 py-3 text-sm font-semibold"
                    style={{ background: `${tip.from}14`, borderLeft: `3px solid ${tip.from}` }}
                  >
                    <span style={{ color: tip.from }}>{smartCta}</span>
                  </div>
                )}

                {/* Interactive chart / visual */}
                <TipVisual vizType={tip.vizType} from={tip.from} to={tip.to} />

                {/* Key Takeaway callout */}
                <div
                  className="mt-4 rounded-2xl p-4 flex gap-3 items-start"
                  style={{ background: `linear-gradient(135deg, ${tip.from}18, ${tip.to}10)`, border: `1px solid ${tip.from}30` }}
                >
                  <span className="text-xl flex-shrink-0">💡</span>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: tip.from }}>Key Takeaway</p>
                    <p className="text-sm font-bold text-foreground leading-snug">{tip.keyTakeaway}</p>
                  </div>
                </div>

                {/* Decorative orb */}
                <div
                  className="pointer-events-none absolute right-0 top-0 h-24 w-24 rounded-bl-3xl opacity-10"
                  style={{ background: `radial-gradient(circle at top right, ${tip.from}, transparent 70%)` }}
                />
              </div>
            </div>
          </div>

          {/* ── How to use this page ─────────────────────────────────── */}
          <div className="border-t border-violet-200/40 dark:border-violet-800/30 pt-3">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-3.5 w-3.5 text-[#1D3461]" />
              <span className="text-xs font-semibold text-foreground">How to use My Tasks</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { icon: '📌', title: 'Personal vs Project tasks', body: 'Personal tasks are yours alone — created and managed only by you. Project tasks are assigned to you by a project manager or admin.' },
                { icon: '🎯', title: 'Quick-add at any time', body: 'Type in the quick-add bar and press Enter to instantly create a personal task. Set priority and due date before submitting.' },
                { icon: '📋', title: 'List vs Board view', body: 'Use List view for a focused, prioritised view. Switch to Board to see tasks as Kanban columns — great for visualising flow.' },
                { icon: '🔔', title: 'Filter & focus', body: 'Use the filter bar to zoom into Today, This Week, or Overdue tasks. The overdue badge in the sidebar tracks your attention areas.' },
              ].map(item => (
                <div key={item.title} className="flex gap-2 rounded-lg bg-white/50 dark:bg-black/20 border border-violet-100/50 p-2.5">
                  <span className="text-base leading-none flex-shrink-0">{item.icon}</span>
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">{item.title}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── Smart Insights Panel ────────────────────────────────────────────────────

interface InsightItem {
  id: string;
  icon: React.ReactNode;
  text: string;
  sub?: string;
  color: string;
  action?: { label: string; filter: FilterType };
}

interface SmartInsightsPanelProps {
  stats: { dueToday: number; dueWeek: number; overdue: number; done: number };
  totalPersonal: number;
  totalProject: number;
  onFilter: (f: FilterType) => void;
  onDismiss: () => void;
}

function SmartInsightsPanel({ stats, totalPersonal, totalProject, onFilter, onDismiss }: SmartInsightsPanelProps) {
  const total = totalPersonal + totalProject;
  const insights: InsightItem[] = [];

  if (stats.overdue > 0)
    insights.push({ id: 'overdue', icon: <AlertTriangle className="h-4 w-4" />, text: `${stats.overdue} task${stats.overdue > 1 ? 's are' : ' is'} overdue`, sub: 'Review and reschedule to stay on track', color: 'border-red-200 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300', action: { label: 'View overdue', filter: 'overdue' } });

  if (stats.dueToday > 0)
    insights.push({ id: 'today', icon: <Target className="h-4 w-4" />, text: `${stats.dueToday} task${stats.dueToday > 1 ? 's' : ''} due today`, sub: 'Focus on these first for a productive day', color: 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300', action: { label: 'Focus today', filter: 'today' } });

  if (stats.overdue === 0 && stats.done > 3)
    insights.push({ id: 'streak', icon: <Trophy className="h-4 w-4" />, text: `${stats.done} tasks completed — great work!`, sub: 'You\'re keeping pace and making progress', color: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300' });

  if (total > 0 && stats.overdue === 0 && stats.dueToday === 0)
    insights.push({ id: 'clear', icon: <Zap className="h-4 w-4" />, text: 'All caught up!', sub: 'No overdue or due-today tasks — momentum is strong', color: 'border-[#1D3461]/20 bg-[#1D3461]/5 dark:bg-[#1D3461]/20 text-[#1D3461] dark:text-blue-300' });

  insights.push({ id: 'tip-board', icon: <LayoutGrid className="h-4 w-4" />, text: 'Try the Kanban Board view', sub: 'Switch to board mode to see tasks as columns — great for visualising flow', color: 'border-violet-200 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300' });

  if (insights.length === 0) return null;

  return (
    <div className="relative">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3.5 w-3.5 text-[#1D3461]" />
        <span className="text-xs font-semibold text-[#1D3461] dark:text-blue-300 uppercase tracking-wide">Smart Insights</span>
        <button type="button" onClick={onDismiss} className="ml-auto text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-none">
        {insights.slice(0, 4).map(ins => (
          <div key={ins.id} className={cn('flex-shrink-0 w-64 rounded-xl border p-3 space-y-1', ins.color)}>
            <div className="flex items-center gap-2 font-medium text-sm">
              {ins.icon}
              <span className="leading-snug">{ins.text}</span>
            </div>
            {ins.sub && <p className="text-[11px] opacity-80 leading-snug pl-6">{ins.sub}</p>}
            {ins.action && (
              <button
                type="button"
                onClick={() => onFilter(ins.action!.filter)}
                className="text-[11px] font-semibold underline underline-offset-2 pl-6 opacity-90 hover:opacity-100"
              >
                {ins.action.label} →
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Kanban Board View ───────────────────────────────────────────────────────

interface BoardViewProps {
  tasks: PersonalTask[];
  onStatusChange: (id: string, status: PersonalTaskStatus, prev: PersonalTaskStatus) => void;
  onEdit: (task: PersonalTask) => void;
  onDelete: (id: string) => void;
}

const BOARD_COLS: { key: PersonalTaskStatus; label: string; colBg: string; dot: string }[] = [
  { key: 'todo',       label: 'To Do',       colBg: 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700',      dot: 'bg-slate-400' },
  { key: 'inprogress', label: 'In Progress',  colBg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',          dot: 'bg-[#1D3461]' },
  { key: 'done',       label: 'Done',         colBg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-500' },
];

function BoardView({ tasks, onStatusChange, onEdit, onDelete }: BoardViewProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {BOARD_COLS.map(col => {
        const colTasks = tasks.filter(t => t.status === col.key);
        return (
          <div key={col.key} className={cn('rounded-xl border p-3 space-y-2 min-h-[160px]', col.colBg)}>
            <div className="flex items-center gap-2 mb-3">
              <div className={cn('h-2 w-2 rounded-full', col.dot)} />
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{col.label}</span>
              <span className="ml-auto text-xs font-bold text-muted-foreground bg-white/70 dark:bg-black/20 px-1.5 py-0.5 rounded-full">
                {colTasks.length}
              </span>
            </div>
            {colTasks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-6 opacity-40">
                <Circle className="h-6 w-6 mb-1" />
                <p className="text-xs">Empty</p>
              </div>
            )}
            {colTasks.map(task => {
              const pCfg = PRIORITY_CFG[task.priority] ?? PRIORITY_CFG.medium;
              const overdue = isOverdue(task.dueDate, task.status);
              return (
                <div key={task.id} className="group bg-card rounded-lg border shadow-sm p-2.5 space-y-1.5 hover:shadow-md transition-shadow cursor-default">
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      onClick={() => onStatusChange(task.id, task.status === 'done' ? 'todo' : 'done', task.status)}
                      className={cn(
                        'mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all',
                        task.status === 'done' ? 'border-emerald-500 bg-emerald-500' : 'border-muted-foreground/40 hover:border-emerald-500',
                      )}
                    >
                      {task.status === 'done' && <CheckCircle2 className="h-2.5 w-2.5 text-white" />}
                    </button>
                    <p className={cn('text-xs font-medium leading-snug flex-1', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</p>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground p-0.5 flex-shrink-0">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        {col.key !== 'inprogress' && (
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, 'inprogress', task.status)}>
                            <PlayCircle className="h-3.5 w-3.5 mr-1.5 text-[#1D3461]" /> Start
                          </DropdownMenuItem>
                        )}
                        {col.key !== 'done' && (
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, 'done', task.status)}>
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-emerald-600" /> Mark Done
                          </DropdownMenuItem>
                        )}
                        {col.key !== 'todo' && (
                          <DropdownMenuItem onClick={() => onStatusChange(task.id, 'todo', task.status)}>
                            <Circle className="h-3.5 w-3.5 mr-1.5" /> Reopen
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onEdit(task)}><Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(task.id)} className="text-destructive focus:text-destructive">
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap pl-6">
                    <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', pCfg.color)}>{pCfg.label}</span>
                    {task.dueDate && (
                      <span className={cn('text-[10px] flex items-center gap-0.5', overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
                        <Calendar className="h-2.5 w-2.5" />{fmtDate(task.dueDate)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ── Team Snapshot (admin only) ───────────────────────────────────────────────

function useTeamTaskSnapshot() {
  return useQuery({
    queryKey: ['team_task_snapshot'],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_field_tasks')
        .select('assigned_to, assigned_to_name, status')
        .not('assigned_to', 'is', null);
      return (data ?? []) as { assigned_to: string; assigned_to_name: string | null; status: string }[];
    },
    staleTime: 2 * 60_000,
  });
}

function TeamSnapshot() {
  const { data: rows = [], isLoading } = useTeamTaskSnapshot();
  const [collapsed, setCollapsed] = useState(false);

  const byMember = useMemo(() => {
    const map = new Map<string, { name: string; total: number; done: number; overdue: number; inprogress: number }>();
    rows.forEach(r => {
      const key = r.assigned_to;
      const entry = map.get(key) ?? { name: r.assigned_to_name ?? 'Unknown', total: 0, done: 0, overdue: 0, inprogress: 0 };
      entry.total++;
      if (r.status === 'done') entry.done++;
      else if (r.status === 'inprogress') entry.inprogress++;
      map.set(key, entry);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 10);
  }, [rows]);

  const teamTotal = rows.length;
  const teamDone = rows.filter(r => r.status === 'done').length;
  const teamPct = teamTotal > 0 ? Math.round((teamDone / teamTotal) * 100) : 0;
  const healthColor = teamPct >= 70 ? 'text-emerald-600' : teamPct >= 40 ? 'text-amber-600' : 'text-red-600';
  const healthBg   = teamPct >= 70 ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200' : teamPct >= 40 ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200' : 'bg-red-50 dark:bg-red-950/30 border-red-200';

  return (
    <div className={cn('rounded-xl border p-4 space-y-3', healthBg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className={cn('h-4 w-4', healthColor)} />
          <span className="text-sm font-semibold text-foreground">Team Task Health</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{byMember.length} members</Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn('text-sm font-bold', healthColor)}>{teamPct}% complete</span>
          <button type="button" onClick={() => setCollapsed(c => !c)} className="text-muted-foreground hover:text-foreground">
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <Progress value={teamPct} className="h-1.5" />
      {!collapsed && (
        <>
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading team data…
            </div>
          ) : byMember.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No assigned project tasks found</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {byMember.map(m => {
                const pct = m.total > 0 ? Math.round((m.done / m.total) * 100) : 0;
                const memberColor = pct >= 70 ? 'text-emerald-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600';
                return (
                  <div key={m.name} className="flex items-center gap-2.5 bg-white/60 dark:bg-black/20 rounded-lg px-2.5 py-2 border border-white/80 dark:border-white/10">
                    <div className="h-7 w-7 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {m.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{m.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Progress value={pct} className="h-1 flex-1" />
                        <span className={cn('text-[10px] font-bold flex-shrink-0', memberColor)}>{pct}%</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[10px] font-semibold text-foreground">{m.done}/{m.total}</p>
                      {m.inprogress > 0 && <p className="text-[9px] text-[#1D3461]">{m.inprogress} active</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Calendar View ───────────────────────────────────────────────────────────

interface CalendarViewProps {
  tasks: PersonalTask[];
  onOpenTask: (id: string) => void;
}
function TaskCalendarView({ tasks, onOpenTask }: CalendarViewProps) {
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const tasksByDate = useMemo(() => {
    const m: Record<string, PersonalTask[]> = {};
    tasks.forEach(t => {
      if (t.dueDate) {
        const key = typeof t.dueDate === 'string' ? t.dueDate.slice(0, 10) : '';
        if (key) { if (!m[key]) m[key] = []; m[key].push(t); }
      }
    });
    return m;
  }, [tasks]);

  const firstDay = startOfMonth(viewMonth);
  const lastDay  = endOfMonth(viewMonth);
  const padStart = getDay(firstDay);
  const days     = eachDayOfInterval({ start: firstDay, end: lastDay });

  const PRIORITY_DOT: Record<string, string> = {
    urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-amber-400', low: 'bg-blue-400',
  };

  return (
    <div className="select-none">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={() => setViewMonth(m => subMonths(m, 1))}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        <span className="text-sm font-bold">{format(viewMonth, 'MMMM yyyy')}</span>
        <button type="button" onClick={() => setViewMonth(m => addMonths(m, 1))}
          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} className="text-[11px] text-center font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: padStart }).map((_, i) => (
          <div key={`p${i}`} className="min-h-[72px] rounded-lg bg-muted/10" />
        ))}
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd');
          const dayTasks = tasksByDate[key] || [];
          const today = isToday(day);
          return (
            <div key={key}
              className={cn('min-h-[72px] rounded-lg border p-1 bg-card transition-colors', today ? 'border-[#1D3461] ring-1 ring-[#1D3461]/20' : 'border-border/50 hover:border-border')}>
              <div className={cn('text-[11px] font-bold w-5 h-5 rounded-full flex items-center justify-center mb-0.5 mx-auto', today ? 'bg-[#1D3461] text-white' : 'text-muted-foreground')}>
                {format(day, 'd')}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map(t => (
                  <button key={t.id} type="button" onClick={() => onOpenTask(t.id)}
                    className="w-full flex items-center gap-0.5 text-left text-[10px] leading-tight bg-[#1D3461]/10 text-[#1D3461] dark:text-blue-300 rounded px-1 py-0.5 hover:bg-[#1D3461]/20 transition-colors truncate">
                    <div className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', PRIORITY_DOT[t.priority ?? 'medium'] || 'bg-muted-foreground')} />
                    <span className="truncate">{t.title}</span>
                  </button>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[10px] text-muted-foreground pl-1">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
        {/* Trailing empty cells to complete last row */}
        {Array.from({ length: days.length > 0 ? (6 - getDay(lastDay)) : 0 }).map((_, i) => (
          <div key={`post${i}`} className="min-h-[72px] rounded-lg bg-muted/10" />
        ))}
      </div>
      {tasks.filter(t => !t.dueDate).length > 0 && (
        <p className="text-[11px] text-muted-foreground mt-3 text-center">
          {tasks.filter(t => !t.dueDate).length} task{tasks.filter(t => !t.dueDate).length !== 1 ? 's' : ''} without due date not shown
        </p>
      )}
    </div>
  );
}

// ── Proof Submission Dialog ──────────────────────────────────────────────────
interface ProofTaskDialogProps {
  taskId: string;
  taskTitle: string;
  prevStatus: PersonalTaskStatus;
  onClose: () => void;
  onConfirm: (id: string, proofNote: string | null, proofFileUrl: string | null, prevStatus: PersonalTaskStatus) => void;
}

function ProofTaskDialog({ taskId, taskTitle, prevStatus, onClose, onConfirm }: ProofTaskDialogProps) {
  const [note, setNote] = useState('');
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useUser();
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `task-proofs/${currentUser?.id ?? 'anon'}/${taskId}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('chat-files').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);
      setFileUrl(publicUrl);
      toast({ title: 'File uploaded' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            Submit Completion Proof
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-4">
          <div className="text-sm text-muted-foreground bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30 rounded-lg p-3">
            <p className="font-medium text-amber-800 dark:text-amber-400 mb-1">Proof required</p>
            <p>This task requires proof of completion before it can be marked done.</p>
            <p className="font-semibold mt-1 text-foreground">"{taskTitle}"</p>
          </div>
          <div className="space-y-2">
            <Label>Completion note</Label>
            <Textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Describe how you completed this task…"
              rows={3}
              data-testid="input-proof-note"
            />
          </div>
          <div className="space-y-2">
            <Label>Supporting file (optional)</Label>
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} data-testid="button-proof-upload">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Paperclip className="h-4 w-4 mr-2" />}
                {fileUrl ? 'Change file' : 'Attach file'}
              </Button>
              {fileUrl && <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />File attached</span>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => onConfirm(taskId, note || null, fileUrl, prevStatus)}
            disabled={uploading}
            data-testid="button-proof-submit"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Submit & Mark Done
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
  const { hasAnyRole } = useAuthorization();
  const navigate = useNavigate();
  const userId = currentUser?.id;
  const isAdmin = hasAnyRole(['super_admin', 'admin']);
  const isSuperAdmin = hasAnyRole(['super_admin']);

  // Check if this user manages any department → gives them reward+assign rights
  const { data: isCurrentUserManager = false } = useQuery({
    queryKey: ['is-dept-manager', userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data } = await supabase.from('departments').select('id').eq('manager_user_id', userId).limit(1);
      return (data?.length ?? 0) > 0;
    },
    enabled: !!userId && !isAdmin,
    staleTime: 5 * 60_000,
  });
  const canSetReward = isAdmin || isCurrentUserManager;

  const { tasks: allPersonalTasks, isLoading: loadingPersonal, createTask, updateTask, deleteTask, isCreating, isUpdating } = usePersonalTasks(userId);
  // Exclude subtasks (parent_task_id set) from the main task list — they are shown inside the parent
  const personalTasks = useMemo(() => allPersonalTasks.filter(t => !t.parentTaskId), [allPersonalTasks]);
  const { data: projectTasks = [], isLoading: loadingProject, refetch: refetchProject } = useAssignedProjectTasks(userId);
  const { data: delegatedTasks = [] } = useCreatedByMeTasks(isAdmin ? userId : undefined);
  const updateProjectTaskStatus = useUpdateProjectTaskStatus();

  const qc = useQueryClient();

  // Materialise daily recurring tasks on first mount; invalidate task list on success
  useEffect(() => {
    if (!userId) return;
    materialiseDailyTasks({
      userId,
      userRole: currentUser?.role ?? null,
      userDepartmentId: currentUser?.departmentId ?? null,
      userEmail: currentUser?.email ?? null,
      userName: currentUser?.fullName ?? null,
    }).then(() => {
      // Ensure newly created recurring tasks appear immediately in the list
      qc.invalidateQueries({ queryKey: ['personal_tasks'] });
    }).catch(() => {/* non-critical */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const [viewMode, setViewMode] = useState<'briefing' | 'list'>(() => {
    try { return (localStorage.getItem('pact_mytasks_viewmode') as 'briefing' | 'list') ?? 'list'; } catch { return 'list'; }
  });
  const setAndPersistViewMode = (m: 'briefing' | 'list') => {
    try { localStorage.setItem('pact_mytasks_viewmode', m); } catch {}
    setViewMode(m);
  };

  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [personalView, setPersonalView] = useState<'list' | 'board' | 'calendar'>('list');
  const [projectView, setProjectView] = useState<'list' | 'board'>('list');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkIds, setBulkIds] = useState<Set<string>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>('created');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [showInsights, setShowInsightsRaw] = useState<boolean>(() => {
    try { return localStorage.getItem('pact_mytasks_insights') !== 'false'; } catch { return true; }
  });
  const setShowInsights = (v: boolean) => {
    try { localStorage.setItem('pact_mytasks_insights', v ? 'true' : 'false'); } catch {}
    setShowInsightsRaw(v);
  };
  const [showTeam, setShowTeam] = useState(true);
  const [showDeptOverview, setShowDeptOverview] = useState(false);
  // Proof submission dialog
  const [proofTask, setProofTask] = useState<{ id: string; title: string; prevStatus: PersonalTaskStatus } | null>(null);

  // Dept overview query (admin only)
  const { data: deptOverviewStats = [], isLoading: deptOverviewLoading, refetch: refetchDeptOverview } = useQuery({
    queryKey: ['task_overview_by_dept_mytasks'],
    queryFn: async () => {
      const [deptRes, taskRes] = await Promise.all([
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('personal_tasks')
          .select('target_department_id, status, due_date')
          .not('target_department_id', 'is', null),
      ]);
      const depts = (deptRes.data ?? []) as { id: string; name: string }[];
      const tasks = (taskRes.data ?? []) as { target_department_id: string; status: string; due_date: string | null }[];
      const now = new Date();
      return depts.map(dept => {
        const dTasks = tasks.filter(t => t.target_department_id === dept.id);
        const overdue = dTasks.filter(t => {
          if (!t.due_date || t.status === 'done' || t.status === 'cancelled') return false;
          return new Date(t.due_date) < now;
        }).length;
        return {
          deptId: dept.id,
          deptName: dept.name,
          total: dTasks.length,
          inprogress: dTasks.filter(t => t.status === 'inprogress').length,
          done: dTasks.filter(t => t.status === 'done').length,
          overdue,
        };
      }).filter(d => d.total > 0);
    },
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const today = format(new Date(), 'EEEE, d MMMM yyyy');

  // Stats (computed before search filter so counts stay accurate)
  const stats = useMemo(() => {
    const safeDate = (s: unknown) => {
      if (!s || typeof s !== 'string') return null;
      try { const d = parseISO(s); return isValid(d) ? d : null; } catch { return null; }
    };
    const safeStatus = (s: unknown) => (typeof s === 'string' ? s : '');
    const pDueToday = personalTasks.filter(t => { const d = safeDate(t.dueDate); return d && isToday(d) && t.status !== 'done' && t.status !== 'cancelled'; }).length;
    const pDueWeek  = personalTasks.filter(t => { const d = safeDate(t.dueDate); return d && isThisWeek(d, { weekStartsOn: 0 }) && t.status !== 'done' && t.status !== 'cancelled'; }).length;
    const pOverdue  = personalTasks.filter(t => isOverdue(t.dueDate, t.status)).length;
    const ptDueToday = projectTasks.filter(t => { const d = safeDate(t.dueDate); const s = safeStatus(t.status); return d && isToday(d) && s !== 'done' && s !== 'cancelled'; }).length;
    const ptDueWeek  = projectTasks.filter(t => { const d = safeDate(t.dueDate); const s = safeStatus(t.status); return d && isThisWeek(d, { weekStartsOn: 0 }) && s !== 'done' && s !== 'cancelled'; }).length;
    const ptOverdue  = projectTasks.filter(t => isOverdue(typeof t.dueDate === 'string' ? t.dueDate : null, safeStatus(t.status))).length;
    const done = personalTasks.filter(t => t.status === 'done').length
      + projectTasks.filter(t => String(t.status) === 'done').length;
    return {
      dueToday: pDueToday + ptDueToday,
      dueWeek:  pDueWeek  + ptDueWeek,
      overdue:  pOverdue  + ptOverdue,
      done,
    };
  }, [personalTasks, projectTasks]);

  const q = searchQuery.toLowerCase().trim();

  // Filtered lists (filter + search)
  const allTags = useMemo(() => {
    const s = new Set<string>();
    personalTasks.forEach(t => (t.tags ?? []).forEach((tag: string) => s.add(tag)));
    return Array.from(s).sort();
  }, [personalTasks]);

  const allCategories = useMemo(() => {
    const s = new Set<string>();
    personalTasks.forEach(t => { if (t.category) s.add(t.category); });
    return Array.from(s).sort();
  }, [personalTasks]);

  const filteredPersonal = useMemo(() =>
    personalTasks
      .filter(t => matchFilter(t.dueDate, t.status, filter))
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q) || (t.category ?? '').toLowerCase().includes(q))
      .filter(t => tagFilter === 'all' || (t.tags ?? []).includes(tagFilter))
      .filter(t => categoryFilter === 'all' || (t.category ?? '') === categoryFilter),
    [personalTasks, filter, q, tagFilter, categoryFilter],
  );

  const filteredProject = useMemo(() =>
    projectTasks
      .filter(t => matchFilter(String(t.dueDate ?? ''), String(t.status ?? ''), filter))
      .filter(t => !q || String(t.title ?? '').toLowerCase().includes(q) || String(t.description ?? '').toLowerCase().includes(q) || t.projectName.toLowerCase().includes(q)),
    [projectTasks, filter, q],
  );

  // Sort personal tasks
  const sortedPersonal = useMemo(() => {
    const arr = [...filteredPersonal];
    switch (sortBy) {
      case 'priority':
        return arr.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2));
      case 'due':
        return arr.sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        });
      case 'title':
        return arr.sort((a, b) => a.title.localeCompare(b.title));
      default: // 'created' — newest first
        return arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
  }, [filteredPersonal, sortBy]);

  // Group personal tasks
  const groupedPersonal = useMemo(() => {
    if (groupBy === 'priority') {
      return (['critical', 'high', 'medium', 'low'] as PersonalTaskPriority[])
        .map(p => ({ key: p, label: PRIORITY_CFG[p].label, dot: PRIORITY_CFG[p].dot, tasks: sortedPersonal.filter(t => t.priority === p) }))
        .filter(g => g.tasks.length > 0);
    }
    if (groupBy === 'status') {
      return (['todo', 'inprogress', 'done', 'cancelled'] as PersonalTaskStatus[])
        .map(s => ({ key: s, label: STATUS_CFG[s].label, dot: '', tasks: sortedPersonal.filter(t => t.status === s) }))
        .filter(g => g.tasks.length > 0);
    }
    return [{ key: 'all', label: '', dot: '', tasks: sortedPersonal }];
  }, [sortedPersonal, groupBy]);

  // Resolved selected task for detail sheet
  const selectedTask = useMemo(() => allPersonalTasks.find(t => t.id === selectedTaskId) ?? null, [allPersonalTasks, selectedTaskId]);
  const selectedTaskSubtasks = useMemo(() => selectedTask ? allPersonalTasks.filter(t => t.parentTaskId === selectedTask.id) : [], [allPersonalTasks, selectedTask]);

  const handleQuickAdd = async (title: string, priority: PersonalTaskPriority, dueDate: string, taskType: TaskType | null) => {
    try {
      await createTask({ title, priority, dueDate: dueDate || null, category: 'personal', taskType: taskType ?? null });
      toast({ title: 'Task added' });
    } catch {
      toast({ title: 'Failed to add task', variant: 'destructive' });
    }
  };

  const handleNewTaskCreate = async (task: CreatePersonalTask) => {
    try {
      await createTask({ ...task, category: task.assignedTo ? 'delegated' : 'personal' });
      const assignedName = task.assignedToName;
      toast({ title: assignedName ? `Task assigned to ${assignedName}` : 'Task created' });
    } catch {
      toast({ title: 'Failed to create task', variant: 'destructive' });
      throw new Error('Failed to create task');
    }
  };

  const handleStatusChange = async (id: string, status: PersonalTaskStatus, prevStatus: PersonalTaskStatus) => {
    // Intercept: if marking done and proof is required but not yet submitted, show proof dialog
    if (status === 'done') {
      const task = personalTasks.find(t => t.id === id) ?? allPersonalTasks.find(t => t.id === id);
      if (task?.proofRequired && !task.proofSubmittedAt) {
        setProofTask({ id, title: task.title, prevStatus });
        return;
      }
    }
    try {
      const task = personalTasks.find(t => t.id === id) ?? allPersonalTasks.find(t => t.id === id);
      const result = await updateTask(
        id,
        { status, title: task?.title, priority: task?.priority },
        prevStatus,
        {
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          taskPriority: task?.priority,
        },
      );
      if (status === 'done') {
        const hasReward = !!(task?.completionRewardAmount && task.completionRewardAmount > 0);
        if (hasReward && result?.creditOk) {
          // Credit confirmed — fetch updated wallet balance
          const { data: wallet } = await supabase
            .from('wallets')
            .select('total_earned, currency')
            .eq('user_id', currentUser?.id)
            .maybeSingle();
          const currency = (wallet?.currency as string) ?? task?.completionRewardCurrency ?? 'USD';
          const balance = wallet ? `${currency} ${Number(wallet.total_earned).toFixed(2)}` : null;
          toast({
            title: '✓ Task completed! Reward credited.',
            description: balance ? `Wallet balance: ${balance}` : undefined,
          });
        } else if (hasReward && !result?.creditOk) {
          toast({
            title: '✓ Task completed.',
            description: 'Reward credit could not be processed — please contact admin.',
            variant: 'destructive',
          });
        } else {
          toast({ title: '✓ Task completed!' });
        }
      }
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const handleProofConfirm = async (id: string, proofNote: string | null, proofFileUrl: string | null, prevStatus: PersonalTaskStatus) => {
    setProofTask(null);
    try {
      const task = personalTasks.find(t => t.id === id) ?? allPersonalTasks.find(t => t.id === id);
      // Save proof info and mark done
      const result = await updateTask(
        id,
        { status: 'done', title: task?.title, priority: task?.priority, proofNote, proofFileUrl, proofSubmittedAt: new Date().toISOString() },
        prevStatus,
        { userId: currentUser?.id, userEmail: currentUser?.email, taskPriority: task?.priority },
      );
      const hasReward = !!(task?.completionRewardAmount && task.completionRewardAmount > 0);
      if (hasReward && result?.creditOk) {
        const { data: wallet } = await supabase.from('wallets').select('total_earned, currency').eq('user_id', currentUser?.id).maybeSingle();
        const currency = (wallet?.currency as string) ?? task?.completionRewardCurrency ?? 'USD';
        toast({ title: '✓ Task completed! Reward credited.', description: wallet ? `Wallet balance: ${currency} ${Number(wallet.total_earned).toFixed(2)}` : undefined });
      } else {
        toast({ title: '✓ Task completed with proof!' });
      }
    } catch {
      toast({ title: 'Failed to complete task', variant: 'destructive' });
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
      // Find the current task to pass prevStatus so completion-reward logic fires correctly
      const currentTask = personalTasks.find(t => t.id === id) ?? allPersonalTasks.find(t => t.id === id);
      const result = await updateTask(
        id,
        updates,
        currentTask?.status,
        {
          userId: currentUser?.id,
          userEmail: currentUser?.email,
          taskPriority: currentTask?.priority,
        },
      );
      // Show appropriate toast based on whether reward was credited
      if (updates.status === 'done' && currentTask?.status !== 'done') {
        const hasReward = !!(currentTask?.completionRewardAmount && currentTask.completionRewardAmount > 0);
        if (hasReward && result?.creditOk) {
          toast({ title: '✓ Task completed! Reward credited.' });
        } else if (hasReward && !result?.creditOk) {
          toast({ title: '✓ Task completed.', description: 'Reward credit could not be processed.', variant: 'destructive' });
        } else {
          toast({ title: '✓ Task completed!' });
        }
      } else {
        toast({ title: 'Task updated' });
      }
    } catch {
      toast({ title: 'Failed to update', variant: 'destructive' });
    }
  };

  const FILTERS: { key: FilterType; label: string; count?: number }[] = [
    { key: 'all',     label: 'All',      count: personalTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length + projectTasks.filter(t => String(t.status) !== 'done').length },
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
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center bg-muted/60 border border-border/60 rounded-lg p-0.5 h-8 gap-0.5">
            <button
              type="button"
              onClick={() => setAndPersistViewMode('briefing')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 h-full text-[11px] font-semibold rounded-md transition-all',
                viewMode === 'briefing' ? 'bg-[#1D3461] text-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              title="Daily Briefing view"
              data-testid="button-view-briefing"
            >
              <Sparkles className="h-3 w-3" /> Briefing
            </button>
            <button
              type="button"
              onClick={() => setAndPersistViewMode('list')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 h-full text-[11px] font-semibold rounded-md transition-all',
                viewMode === 'list' ? 'bg-[#1D3461] text-white shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}
              title="Full list view"
              data-testid="button-view-list"
            >
              <LayoutList className="h-3 w-3" /> List
            </button>
          </div>
          <Button
            size="sm"
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white gap-1.5"
            onClick={() => setShowNewTask(true)}
            data-testid="button-new-task"
          >
            <Plus className="h-3.5 w-3.5" />
            New Task
          </Button>
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
      </div>

      {/* Quick Navigation */}
      <ConnectedPagesBar exclude="my-tasks" />

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

      {/* ── Smart Insights ── */}
      {showInsights && (
        <SmartInsightsPanel
          stats={stats}
          totalPersonal={personalTasks.length}
          totalProject={projectTasks.length}
          onFilter={setFilter}
          onDismiss={() => setShowInsights(false)}
        />
      )}

      {/* ── Planning Hub ── */}
      <PlanningHub allTasks={[
        ...personalTasks,
        ...projectTasks.map(t => ({
          dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
          status: typeof t.status === 'string' ? t.status : 'todo',
          priority: typeof t.priority === 'string' ? t.priority : 'medium',
        })),
      ]} />

      {/* ── Daily Briefing View ── */}
      {viewMode === 'briefing' && (
        <DailyBriefing
          personalTasks={personalTasks}
          allPersonalTasks={allPersonalTasks}
          projectTasks={projectTasks}
          currentUserFullName={currentUser?.fullName}
          currentUserId={currentUser?.id}
          currentUserEmail={currentUser?.email}
          isLoading={loadingPersonal}
          onMarkPersonalDone={async (id, prevStatus) => {
            await handleStatusChange(id, 'done', prevStatus);
          }}
          onMarkProjectDone={async (id) => {
            await handleProjectTaskStatusChange(id, 'done');
          }}
          onOpenNewTask={() => setShowNewTask(true)}
        />
      )}

      {/* ── Main Task Tabs ── */}
      {viewMode === 'list' && <Tabs defaultValue="assigned" className="space-y-0">
        <div className="flex items-center justify-between gap-3 mb-3">
          <TabsList className="h-10 bg-muted/50 border border-border/60 rounded-xl p-1 gap-1">
            <TabsTrigger
              value="assigned"
              className="rounded-lg px-4 text-sm font-semibold data-[state=active]:bg-[#1D3461] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
              data-testid="tab-assigned"
            >
              <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
              Assigned to Me
              {projectTasks.filter(t => String(t.status) !== 'done').length > 0 && (
                <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20">
                  {projectTasks.filter(t => String(t.status) !== 'done').length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="personal"
              className="rounded-lg px-4 text-sm font-semibold data-[state=active]:bg-[#1D3461] data-[state=active]:text-white data-[state=active]:shadow-sm transition-all"
              data-testid="tab-personal"
            >
              <Star className="h-3.5 w-3.5 mr-1.5" />
              Personal Tasks
              {personalTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length > 0 && (
                <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/20">
                  {personalTasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <Button size="sm" variant="ghost" className="text-muted-foreground h-8 text-xs"
            onClick={() => refetchProject()} data-testid="button-refresh-tasks-inner">
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>

        {/* ── Assigned to Me Tab ── */}
        <TabsContent value="assigned" className="space-y-3 mt-0">
          {/* Search + filter */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search project tasks by title or project…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-muted/40 border-muted"
                data-testid="input-search-tasks"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              {FILTERS.map(f => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)}
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
                    <span className={cn('inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold',
                      filter === f.key ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>
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
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">Field tasks from active projects where you are assigned · click to view in project</p>
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center h-7 bg-muted/60 border border-border/60 rounded-lg p-0.5 gap-0.5">
                <button
                  type="button"
                  onClick={() => setProjectView('list')}
                  className={cn('flex items-center gap-1 px-2 h-full text-[10px] font-semibold rounded-md transition-all', projectView === 'list' ? 'bg-[#1D3461] text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  title="List view" data-testid="assigned-view-list"
                >
                  <LayoutList className="h-3 w-3" /> List
                </button>
                <button
                  type="button"
                  onClick={() => setProjectView('board')}
                  className={cn('flex items-center gap-1 px-2 h-full text-[10px] font-semibold rounded-md transition-all', projectView === 'board' ? 'bg-[#1D3461] text-white shadow-sm' : 'text-muted-foreground hover:text-foreground')}
                  title="Board view" data-testid="assigned-view-board"
                >
                  <LayoutGrid className="h-3 w-3" /> Board
                </button>
              </div>
              <a href="/projects" className="text-xs text-[#1D3461] hover:underline flex items-center gap-0.5 flex-shrink-0">
                All Projects <ArrowRight className="h-3 w-3" />
              </a>
            </div>
          </div>

          {loadingProject ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProject.length === 0 ? (
            <div className="flex flex-col items-center py-10 border-2 border-dashed rounded-xl gap-2">
              <Inbox className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">
                {filter === 'all' ? 'No project tasks assigned to you' : `No project tasks for "${FILTERS.find(f => f.key === filter)?.label}"`}
              </p>
            </div>
          ) : projectView === 'board' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {(['todo', 'inprogress', 'done'] as const).map(col => {
                const colTasks = filteredProject.filter((t: any) => String(t.status) === col);
                const colLabel = col === 'todo' ? 'To Do' : col === 'inprogress' ? 'In Progress' : 'Done';
                const colBg = col === 'todo' ? 'bg-slate-50 dark:bg-slate-900/40 border-slate-200' : col === 'inprogress' ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200' : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200';
                const dot = col === 'todo' ? 'bg-slate-400' : col === 'inprogress' ? 'bg-[#1D3461]' : 'bg-emerald-500';
                return (
                  <div key={col} className={cn('rounded-xl border p-3 space-y-2 min-h-[120px]', colBg)}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className={cn('h-2 w-2 rounded-full', dot)} />
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{colLabel}</span>
                      <span className="ml-auto text-xs font-bold text-muted-foreground bg-white/70 dark:bg-black/20 px-1.5 py-0.5 rounded-full">{colTasks.length}</span>
                    </div>
                    {colTasks.length === 0 ? (
                      <div className="flex items-center justify-center py-4 opacity-40">
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {colTasks.map((task: any) => (
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
                );
              })}
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
        </TabsContent>

        {/* ── Personal Tasks Tab ── */}
        <TabsContent value="personal" className="space-y-3 mt-0">
          {/* Quick Add */}
          <QuickAddBar onAdd={handleQuickAdd} isCreating={isCreating} />

          {/* Search + Tag/Category filter for personal tasks */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search personal tasks by title, tag, or category…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm bg-muted/40 border-muted"
                data-testid="input-search-personal-tasks"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              {FILTERS.map(f => (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                  className={cn(
                    'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all border',
                    filter === f.key
                      ? 'bg-[#1D3461] text-white border-[#1D3461] shadow-sm'
                      : 'bg-card text-muted-foreground border-border hover:border-[#1D3461]/40 hover:text-[#1D3461]',
                  )}
                  data-testid={`filter-personal-${f.key}`}
                >
                  {f.label}
                  {(f.count ?? 0) > 0 && (
                    <span className={cn('inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[9px] font-bold',
                      filter === f.key ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground')}>
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
            {(allTags.length > 0 || allCategories.length > 0) && (
              <div className="flex items-center gap-2 flex-wrap">
                {allCategories.length > 0 && (
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="h-8 w-auto text-xs gap-1.5 border border-border/70 bg-card hover:bg-muted transition-colors rounded-lg px-2.5 shadow-sm" data-testid="select-category-filter">
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All categories</SelectItem>
                      {allCategories.map(c => <SelectItem key={c} value={c} className="text-xs capitalize">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {allTags.length > 0 && (
                  <Select value={tagFilter} onValueChange={setTagFilter}>
                    <SelectTrigger className="h-8 w-auto text-xs gap-1.5 border border-border/70 bg-card hover:bg-muted transition-colors rounded-lg px-2.5 shadow-sm" data-testid="select-tag-filter">
                      <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                      <SelectValue placeholder="Tag" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">All tags</SelectItem>
                      {allTags.map(t => <SelectItem key={t} value={t} className="text-xs">#{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                {(tagFilter !== 'all' || categoryFilter !== 'all') && (
                  <button type="button" onClick={() => { setTagFilter('all'); setCategoryFilter('all'); }}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5 h-8 px-2">
                    <X className="h-3 w-3" />Clear filters
                  </button>
                )}
              </div>
            )}
          </div>

      {/* ── Personal Tasks Section ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500 fill-amber-400" />
              My Personal Tasks
              <span className="text-sm font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{filteredPersonal.length}</span>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    Personal tasks are private to you and not visible to anyone else.
                    Click any task title to open the full detail panel. Switch to Board view for a visual Kanban layout.
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </h2>
            <p className="text-xs text-muted-foreground ml-6 mt-0.5">Private to you only — click a task title to open details · toggle List or Board view</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Sort */}
            <Select value={sortBy} onValueChange={v => setSortBy(v as SortBy)}>
              <SelectTrigger
                className="h-8 w-auto text-xs gap-1.5 border border-border/70 bg-card hover:bg-muted transition-colors rounded-lg px-2.5 font-medium shadow-sm"
                data-testid="select-sort-by"
              >
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created" className="text-xs">Newest first</SelectItem>
                <SelectItem value="due" className="text-xs">Due date</SelectItem>
                <SelectItem value="priority" className="text-xs">Priority</SelectItem>
                <SelectItem value="title" className="text-xs">Title A–Z</SelectItem>
              </SelectContent>
            </Select>
            {/* Group */}
            <Select value={groupBy} onValueChange={v => setGroupBy(v as GroupBy)}>
              <SelectTrigger
                className="h-8 w-auto text-xs gap-1.5 border border-border/70 bg-card hover:bg-muted transition-colors rounded-lg px-2.5 font-medium shadow-sm"
                data-testid="select-group-by"
              >
                <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">No grouping</SelectItem>
                <SelectItem value="priority" className="text-xs">Group by Priority</SelectItem>
                <SelectItem value="status" className="text-xs">Group by Status</SelectItem>
              </SelectContent>
            </Select>
            {/* View toggle pill */}
            <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0 h-8 shadow-sm border border-border/50">
              <button
                type="button"
                onClick={() => setPersonalView('list')}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-full text-xs font-semibold rounded-md transition-all',
                  personalView === 'list'
                    ? 'bg-[#1D3461] text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title="List view"
              >
                <LayoutList className="h-3.5 w-3.5" />
                <span>List</span>
              </button>
              <button
                type="button"
                onClick={() => setPersonalView('board')}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-full text-xs font-semibold rounded-md transition-all',
                  personalView === 'board'
                    ? 'bg-[#1D3461] text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title="Kanban board view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Board</span>
              </button>
              <button
                type="button"
                onClick={() => setPersonalView('calendar')}
                className={cn(
                  'flex items-center gap-1.5 px-3 h-full text-xs font-semibold rounded-md transition-all',
                  personalView === 'calendar'
                    ? 'bg-[#1D3461] text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                title="Calendar view"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Cal</span>
              </button>
            </div>
            {/* Bulk select toggle */}
            <button
              type="button"
              onClick={() => { setBulkMode(v => !v); setBulkIds(new Set()); }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold rounded-lg border transition-all',
                bulkMode
                  ? 'bg-[#1D3461] text-white border-[#1D3461] shadow-sm'
                  : 'bg-card text-muted-foreground border-border/70 hover:border-[#1D3461]/40 hover:text-[#1D3461]',
              )}
              title="Bulk select tasks"
              data-testid="toggle-bulk-mode"
            >
              <ListChecks className="h-3.5 w-3.5" />
              <span>Select</span>
            </button>
          </div>
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

        {/* ── Bulk Action Bar ── */}
        {bulkMode && bulkIds.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 bg-[#1D3461] text-white rounded-xl shadow-lg animate-in slide-in-from-top-2">
            <span className="text-xs font-semibold flex-1">{bulkIds.size} task{bulkIds.size !== 1 ? 's' : ''} selected</span>
            <button type="button"
              onClick={async () => {
                for (const id of bulkIds) {
                  const t = personalTasks.find(x => x.id === id);
                  if (t && t.status !== 'done') await handleStatusChange(id, 'done', t.status as PersonalTaskStatus);
                }
                setBulkIds(new Set()); setBulkMode(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-xs font-semibold transition-colors">
              <CheckCircle2 className="h-3.5 w-3.5" />Mark Done
            </button>
            <button type="button"
              onClick={async () => {
                if (!confirm(`Delete ${bulkIds.size} task${bulkIds.size !== 1 ? 's' : ''}?`)) return;
                for (const id of bulkIds) await handleDelete(id);
                setBulkIds(new Set()); setBulkMode(false);
              }}
              className="flex items-center gap-1 px-2.5 py-1 bg-red-500/80 hover:bg-red-500 rounded-lg text-xs font-semibold transition-colors">
              <Trash2 className="h-3.5 w-3.5" />Delete
            </button>
            <button type="button" onClick={() => setBulkIds(new Set())}
              className="p-1 rounded-lg hover:bg-white/20 transition-colors" title="Deselect all">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {bulkMode && filteredPersonal.length > 0 && (
          <div className="flex items-center gap-2 px-1">
            <input type="checkbox" checked={bulkIds.size === filteredPersonal.length} onChange={e => setBulkIds(e.target.checked ? new Set(filteredPersonal.map(t => t.id)) : new Set())} className="h-3.5 w-3.5 rounded accent-[#1D3461]" />
            <span className="text-xs text-muted-foreground">Select all ({filteredPersonal.length})</span>
          </div>
        )}

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
        ) : personalView === 'calendar' ? (
          <TaskCalendarView tasks={filteredPersonal} onOpenTask={id => setSelectedTaskId(id)} />
        ) : personalView === 'board' ? (
          <BoardView
            tasks={filteredPersonal}
            onStatusChange={(id, s, prev) => handleStatusChange(id, s, prev)}
            onEdit={setEditingTask}
            onDelete={handleDelete}
          />
        ) : (
          <div className="space-y-3">
            {groupedPersonal.map(group => (
              <div key={group.key}>
                {groupBy !== 'none' && (
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    {group.dot && <div className={cn('h-2 w-2 rounded-full flex-shrink-0', group.dot)} />}
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                    <span className="text-[10px] text-muted-foreground">({group.tasks.length})</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                )}
                <div className="space-y-2">
                  {group.tasks.map(task => (
                    <div key={task.id} className={cn('flex items-start gap-2', bulkMode && 'pl-1')}>
                      {bulkMode && (
                        <div className="pt-3 flex-shrink-0">
                          <input type="checkbox" checked={bulkIds.has(task.id)}
                            onChange={() => setBulkIds(prev => { const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; })}
                            className="h-3.5 w-3.5 rounded accent-[#1D3461]" />
                        </div>
                      )}
                    <PersonalTaskCard
                      task={task}
                      subtasks={allPersonalTasks.filter(t => t.parentTaskId === task.id)}
                      onStatusChange={(s, prev) => handleStatusChange(task.id, s, prev)}
                      onEdit={() => setEditingTask(task)}
                      onDelete={() => handleDelete(task.id)}
                      onOpenDetail={() => setSelectedTaskId(task.id)}
                      onCreateSubtask={async (title) => {
                        await createTask({ title, priority: task.priority, category: task.category ?? 'personal', parentTaskId: task.id });
                      }}
                      onSubtaskStatusChange={(id, s, prev) => handleStatusChange(id, s, prev)}
                    />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
        </TabsContent>
      </Tabs>}

      {/* ── Team Task Health (admin only) ── */}
      {isAdmin && (
        <div className="space-y-2">
          {/* ── Team Task Health ── */}
          <button
            type="button"
            onClick={() => setShowTeam(v => !v)}
            className="flex items-center gap-2 w-full group rounded-xl border border-border/60 bg-card hover:bg-muted/50 px-4 py-2.5 transition-colors shadow-sm"
          >
            <div className="h-7 w-7 rounded-lg bg-[#1D3461]/10 flex items-center justify-center flex-shrink-0">
              <Users className="h-4 w-4 text-[#1D3461]" />
            </div>
            <span className="text-sm font-semibold text-foreground">Team Task Health</span>
            <span className="text-[11px] font-semibold text-[#1D3461] bg-[#1D3461]/10 border border-[#1D3461]/20 px-2 py-0.5 rounded-full">Admin</span>
            <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
              {showTeam ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {showTeam && <TeamSnapshot />}

          {/* ── Department Task Overview (collapsible, admin only) ── */}
          <button
            type="button"
            onClick={() => { setShowDeptOverview(v => !v); if (!showDeptOverview) refetchDeptOverview(); }}
            className="flex items-center gap-2 w-full group rounded-xl border border-border/60 bg-card hover:bg-muted/50 px-4 py-2.5 transition-colors shadow-sm"
            data-testid="button-toggle-dept-overview"
          >
            <div className="h-7 w-7 rounded-lg bg-[#1D3461]/10 flex items-center justify-center flex-shrink-0">
              <Building2 className="h-4 w-4 text-[#1D3461]" />
            </div>
            <span className="text-sm font-semibold text-foreground">Task Overview by Department</span>
            <span className="text-[11px] font-semibold text-[#1D3461] bg-[#1D3461]/10 border border-[#1D3461]/20 px-2 py-0.5 rounded-full">Admin</span>
            <span className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
              {showDeptOverview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {showDeptOverview && (
            <div className="rounded-xl border border-border/60 bg-background p-3 space-y-2">
              {deptOverviewLoading ? (
                <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : deptOverviewStats.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No department tasks found. Assign tasks to departments using the New Task dialog.</p>
              ) : (
                <div className="space-y-2.5">
                  {deptOverviewStats.map(s => {
                    const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
                    return (
                      <div key={s.deptId} className="rounded-lg border bg-muted/20 p-2.5">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3 w-3 text-[#1D3461]" />
                            <span className="text-xs font-medium">{s.deptName}</span>
                            {s.overdue > 0 && (
                              <Badge className="text-[9px] px-1.5 py-0 bg-red-100 text-red-700">{s.overdue} overdue</Badge>
                            )}
                          </div>
                          <span className="text-[10px] font-bold text-muted-foreground">{s.done}/{s.total} done</span>
                        </div>
                        <Progress value={pct} className="h-1.5 mb-1.5" />
                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-0.5"><Circle className="h-2.5 w-2.5 text-slate-400" />{s.total - s.done - s.inprogress} todo</span>
                          <span className="flex items-center gap-0.5"><Circle className="h-2.5 w-2.5 text-[#1D3461]" />{s.inprogress} in progress</span>
                          <span className="flex items-center gap-0.5"><CheckCircle2 className="h-2.5 w-2.5 text-emerald-600" />{s.done} done</span>
                          {s.overdue > 0 && <span className="flex items-center gap-0.5 text-red-600"><AlertTriangle className="h-2.5 w-2.5" />{s.overdue} overdue</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Link to full Task Admin page (Templates · Payroll) ── */}
          <button
            type="button"
            onClick={() => navigate('/task-admin')}
            className="flex items-center gap-2 text-xs font-semibold text-[#1D3461] bg-[#1D3461]/6 hover:bg-[#1D3461]/12 border border-[#1D3461]/20 px-3 py-2 rounded-lg transition-colors mt-1"
            data-testid="link-task-admin"
          >
            <DollarSign className="h-3.5 w-3.5" />
            Open Task Admin (Templates · Payroll)
          </button>
        </div>
      )}

      {/* ── Delegated by me (admin only) ── */}
      {isAdmin && delegatedTasks.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-[#1D3461]" />
            <h3 className="text-sm font-semibold text-foreground">Delegated by Me</h3>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{delegatedTasks.length}</Badge>
          </div>
          <div className="space-y-2">
            {delegatedTasks.map(task => (
              <div key={task.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3 hover:bg-muted/30 transition-colors">
                <div className={cn('mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0', task.status === 'done' ? 'bg-emerald-500 border-emerald-500' : 'border-[#1D3461]/40')} />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className={cn('text-sm font-medium leading-tight', task.status === 'done' && 'line-through text-muted-foreground')}>{task.title}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {task.assignedToName ?? 'Unknown'}
                    </span>
                    {task.dueDate && (
                      <span className="text-xs text-muted-foreground">
                        · Due {task.dueDate}
                      </span>
                    )}
                    <Badge className={cn('text-[10px] px-1.5 py-0', PRIORITY_CFG[task.priority ?? 'medium']?.color ?? 'bg-amber-100 text-amber-700')}>
                      {PRIORITY_CFG[task.priority ?? 'medium']?.label ?? 'Medium'}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                      {task.status}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Re-show insights ── */}
      {!showInsights && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowInsights(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-[#1D3461] transition-colors"
          >
            <Sparkles className="h-3 w-3" /> Show smart insights
          </button>
        </div>
      )}

      {/* ── Task Detail Sheet ── */}
      <TaskDetailSheet
        task={selectedTask}
        subtasks={selectedTaskSubtasks}
        onClose={() => setSelectedTaskId(null)}
        onSave={handleEditSave}
        onCreateSubtask={async (title) => {
          if (!selectedTask) return;
          await createTask({ title, priority: selectedTask.priority, category: selectedTask.category ?? 'personal', parentTaskId: selectedTask.id });
        }}
        onSubtaskStatusChange={(id, s) => handleStatusChange(id, s as PersonalTaskStatus, s === 'done' ? 'todo' : 'done')}
        onDelete={() => { if (selectedTaskId) { handleDelete(selectedTaskId); setSelectedTaskId(null); } }}
        isSaving={isUpdating}
        isAdmin={isAdmin}
        isManager={canSetReward}
      />

      {/* ── Edit dialog ── */}
      <EditPersonalTaskDialog
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleEditSave}
        isSaving={isUpdating}
        isAdmin={isAdmin}
        isManager={canSetReward}
      />

      {/* ── New Task dialog ── */}
      <NewTaskDialog
        open={showNewTask}
        onClose={() => setShowNewTask(false)}
        onCreate={handleNewTaskCreate}
        isCreating={isCreating}
        isAdmin={isAdmin}
        isSuperAdmin={isSuperAdmin}
        currentUserId={userId ?? ''}
        currentUserName={currentUser?.fullName ?? 'Me'}
        currentUserDepartmentId={currentUser?.departmentId ?? null}
      />

      {/* ── Proof Submission Dialog ── */}
      {proofTask && (
        <ProofTaskDialog
          taskId={proofTask.id}
          taskTitle={proofTask.title}
          prevStatus={proofTask.prevStatus}
          onClose={() => setProofTask(null)}
          onConfirm={handleProofConfirm}
        />
      )}
    </div>
  );
}
