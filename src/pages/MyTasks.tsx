import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  format, isToday, isThisWeek, isBefore, parseISO, isValid,
  startOfDay, addDays, eachDayOfInterval, startOfToday, isAfter,
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
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
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
import {
  usePersonalTasks, useAssignedProjectTasks, useUpdateProjectTaskStatus, useCreatedByMeTasks,
  materialiseDailyTasks,
  type PersonalTask, type PersonalTaskPriority, type PersonalTaskStatus, type CreatePersonalTask,
  type AssignedProjectTask,
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
  subtasks: PersonalTask[];
  onStatusChange: (status: PersonalTaskStatus, prev: PersonalTaskStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreateSubtask?: (title: string) => Promise<void>;
  onSubtaskStatusChange?: (id: string, status: PersonalTaskStatus, prev: PersonalTaskStatus) => void;
}

function PersonalTaskCard({
  task, subtasks, onStatusChange, onEdit, onDelete,
  onCreateSubtask, onSubtaskStatusChange,
}: PersonalTaskCardProps) {
  const pCfg = PRIORITY_CFG[task.priority] ?? PRIORITY_CFG.medium;
  const sCfg = STATUS_CFG[task.status] ?? STATUS_CFG.todo;
  const overdue = isOverdue(task.dueDate, task.status);
  const isDone = task.status === 'done';
  const isInProgress = task.status === 'inprogress';
  const [subtaskOpen, setSubtaskOpen] = useState(false);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [addingSubtask, setAddingSubtask] = useState(false);

  const doneSubs = subtasks.filter(s => s.status === 'done').length;
  const totalSubs = subtasks.length;
  const subProgress = totalSubs > 0 ? Math.round((doneSubs / totalSubs) * 100) : 0;

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
    <div className={cn(
      'rounded-lg border border-l-4 bg-card hover:shadow-sm transition-all',
      sCfg.border,
      isDone && 'opacity-60',
    )}>
      {/* Main row */}
      <div className="group flex items-start gap-3 px-3 py-2.5">
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
                overdue ? 'text-red-600 font-semibold' : (isValid(parseISO(task.dueDate)) && isToday(parseISO(task.dueDate))) ? 'text-amber-600 font-medium' : 'text-muted-foreground',
              )}>
                <Calendar className="h-2.5 w-2.5" />
                {overdue && '⚠ '}{fmtDate(task.dueDate)}
              </span>
            )}
            {task.category && task.category !== 'personal' && (
              <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">{task.category}</span>
            )}
            {task.completionRewardAmount && task.completionRewardAmount > 0 && (
              <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <span>+{task.completionRewardCurrency} {task.completionRewardAmount}</span>
              </span>
            )}
            {task.recurrence && task.recurrence !== 'none' && (
              <span className="text-[9px] bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full capitalize">{task.recurrence}</span>
            )}
          </div>
          {/* Subtask progress bar */}
          {totalSubs > 0 && (
            <button
              type="button"
              onClick={() => setSubtaskOpen(v => !v)}
              className="mt-1.5 flex items-center gap-1.5 group/sub hover:opacity-80 transition-opacity"
              data-testid={`subtask-toggle-${task.id}`}
            >
              <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden w-24">
                <div className="h-full bg-[#1D3461] rounded-full transition-all" style={{ width: `${subProgress}%` }} />
              </div>
              <span className="text-[9px] text-muted-foreground">
                {doneSubs}/{totalSubs} subtasks
              </span>
              {subtaskOpen
                ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground" />
                : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
              }
            </button>
          )}
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

        {/* Subtask expand toggle (when no subtasks yet, show as icon) */}
        {onCreateSubtask && (
          <button
            type="button"
            onClick={() => setSubtaskOpen(v => !v)}
            className={cn(
              'opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-[#1D3461] p-0.5 flex-shrink-0',
              subtaskOpen && 'opacity-100 text-[#1D3461]',
            )}
            title={subtaskOpen ? 'Hide subtasks' : 'Show subtasks'}
            data-testid={`subtask-expand-${task.id}`}
          >
            <ListChecks className="h-3.5 w-3.5" />
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

      {/* Subtask panel */}
      {subtaskOpen && (
        <div className="px-3 pb-2.5 pt-0 ml-8 border-t border-dashed border-muted space-y-1" data-testid={`subtask-panel-${task.id}`}>
          {subtasks.length === 0 && (
            <p className="text-[10px] text-muted-foreground py-1">No subtasks yet.</p>
          )}
          {subtasks.map(sub => {
            const subDone = sub.status === 'done';
            return (
              <div key={sub.id} className="flex items-center gap-2 py-0.5 group/sub" data-testid={`subtask-item-${sub.id}`}>
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
                <span className={cn('text-xs flex-1', subDone && 'line-through text-muted-foreground')}>{sub.title}</span>
                {sub.dueDate && (
                  <span className="text-[9px] text-muted-foreground">{fmtDate(sub.dueDate)}</span>
                )}
              </div>
            );
          })}
          {/* Quick-add subtask */}
          {onCreateSubtask && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Plus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                placeholder="Add subtask…"
                value={newSubtaskTitle}
                onChange={e => setNewSubtaskTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddSubtask(); }}
                className="flex-1 text-xs bg-muted/40 border border-muted rounded px-2 py-0.5 outline-none focus:border-[#1D3461]/40"
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

// ── Assigned Project Task Card ──────────────────────────────────────────────

interface ProjectTaskCardProps {
  task: AssignedProjectTask;
  onStatusChange: (id: string, status: string) => void;
  isUpdating: boolean;
}

function ProjectTaskCard({ task, onStatusChange, isUpdating }: ProjectTaskCardProps) {
  const navigate = useNavigate();
  const dueDateStr = typeof task.dueDate === 'string' ? task.dueDate : null;
  const statusStr = typeof task.status === 'string' ? task.status : 'todo';
  const overdue = isOverdue(dueDateStr, statusStr);
  const isDone = statusStr === 'done';
  const isInProgress = statusStr === 'inprogress';
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
          {dueDateStr && (
            <span className={cn(
              'text-[10px] flex items-center gap-0.5',
              overdue ? 'text-red-600 font-semibold' : (isValid(parseISO(dueDateStr)) && isToday(parseISO(dueDateStr))) ? 'text-amber-600 font-medium' : 'text-muted-foreground',
            )}>
              <Calendar className="h-2.5 w-2.5" />
              {overdue && '⚠ '}{fmtDate(dueDateStr)}
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
  isAdmin: boolean;
}

function EditPersonalTaskDialog({ task, onClose, onSave, isSaving, isAdmin }: EditDialogProps) {
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
    // Only admins may modify reward fields; non-admin saves preserve the existing reward unchanged
    const reward = isAdmin ? (rewardAmount ? parseFloat(rewardAmount) : null) : task.completionRewardAmount;
    const currency = isAdmin ? (reward ? rewardCurrency : null) : task.completionRewardCurrency;
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
          {/* Completion Reward — admin only */}
          {isAdmin ? (
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
  currentUserId: string;
  currentUserName: string;
}

function NewTaskDialog({ open, onClose, onCreate, isCreating, isAdmin, currentUserId, currentUserName }: NewTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [assignMode, setAssignMode] = useState<'self' | 'other' | 'dept'>('self');
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [rewardAmount, setRewardAmount] = useState('');
  const [rewardCurrency, setRewardCurrency] = useState('USD');

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['profiles-for-task-assign'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role, status').order('full_name');
      return (data ?? []) as { id: string; full_name: string; role: string; status: string }[];
    },
    enabled: isAdmin && open,
    staleTime: 5 * 60_000,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-list'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: isAdmin && open,
    staleTime: 60_000,
  });

  const filteredUsers = users.filter(u =>
    u.id !== currentUserId && (!userSearch || (u.full_name ?? '').toLowerCase().includes(userSearch.toLowerCase()))
  );

  const reset = () => {
    setTitle(''); setDescription(''); setPriority('medium');
    setDueDate(''); setNotes(''); setAssignMode('self');
    setSelectedUser(null); setUserSearch(''); setSelectedDeptId('');
    setRewardAmount(''); setRewardCurrency('USD');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    const assignTo = assignMode === 'other' && selectedUser ? selectedUser : null;
    const reward = rewardAmount ? parseFloat(rewardAmount) : null;

    if (assignMode === 'dept' && selectedDeptId) {
      // Fetch department members (including email for notification)
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
          assignedTo: member.id,
          assignedToName: member.full_name,
          assignedToEmail: member.email,
          targetDepartmentId: selectedDeptId,
          completionRewardAmount: reward,
          completionRewardCurrency: reward ? rewardCurrency : null,
        });
      }
    } else {
      await onCreate({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        dueDate: dueDate || null,
        notes: notes.trim() || null,
        assignedTo: assignTo?.id ?? null,
        assignedToName: assignTo?.name ?? null,
        completionRewardAmount: reward,
        completionRewardCurrency: reward ? rewardCurrency : null,
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
                onClick={() => { setAssignMode('self'); setSelectedUser(null); }}
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
                onClick={() => isAdmin && setAssignMode('other')}
                data-testid="button-assign-other"
                disabled={!isAdmin}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-all',
                  assignMode === 'other'
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'bg-muted/50 text-muted-foreground border-border hover:border-[#1D3461]/40',
                  !isAdmin && 'opacity-40 cursor-not-allowed'
                )}
              >
                <Users className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">Someone else</span>
              </button>
              <button
                onClick={() => isAdmin && setAssignMode('dept')}
                data-testid="button-assign-dept"
                disabled={!isAdmin}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-all',
                  assignMode === 'dept'
                    ? 'bg-[#1D3461] text-white border-[#1D3461]'
                    : 'bg-muted/50 text-muted-foreground border-border hover:border-[#1D3461]/40',
                  !isAdmin && 'opacity-40 cursor-not-allowed'
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

            {/* Someone else: user search */}
            {assignMode === 'other' && isAdmin && (
              <div className="space-y-2">
                <Input
                  placeholder="Search team member…"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="h-8 text-sm"
                  data-testid="input-user-search"
                />
                {selectedUser && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-sm">
                    <div className="h-6 w-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {selectedUser.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-emerald-800 dark:text-emerald-200 font-medium truncate">{selectedUser.name}</span>
                    <button onClick={() => setSelectedUser(null)} className="ml-auto text-emerald-600 hover:text-emerald-800">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {!selectedUser && (
                  <div className="rounded-lg border border-border bg-background max-h-60 overflow-y-auto">
                    {loadingUsers ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">Loading…</div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="p-3 text-sm text-muted-foreground text-center">No team members found</div>
                    ) : (
                      filteredUsers.map(u => (
                        <button
                          key={u.id}
                          onClick={() => { setSelectedUser({ id: u.id, name: u.full_name ?? 'Unknown' }); setUserSearch(''); }}
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
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Completion Reward (admin only) */}
          {isAdmin && (
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
        </div>

        <DialogFooter className="gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!title.trim() || isCreating || (assignMode === 'other' && !selectedUser) || (assignMode === 'dept' && !selectedDeptId)}
            className="bg-[#1D3461] hover:bg-[#0F2041] text-white"
            data-testid="button-create-task-submit"
          >
            {isCreating ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            {assignMode === 'other' && selectedUser ? `Assign to ${selectedUser.name.split(' ')[0]}`
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
            <TabsContent value="timeline" className="mt-3 space-y-2">
              <div className="flex items-start gap-2">
                <Info className="h-3.5 w-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-snug">
                  <strong>14-day timeline</strong> shows each day as a column.
                  Each coloured dot is one task due that day — hover/tap to see the count.
                  Use this to spot busy stretches and plan your week visually.
                </p>
              </div>
              <div className="overflow-x-auto pb-1">
                <div className="flex gap-1.5 min-w-max">
                  {timelineDays.map(({ day, tasks: dt, isToday: t }) => (
                    <div key={day.toString()} className="flex flex-col items-center gap-1">
                      <span className={cn('text-[9px] font-medium', t ? 'text-amber-600' : 'text-muted-foreground')}>
                        {t ? 'TODAY' : format(day, 'EEE')}
                      </span>
                      <span className={cn('text-[10px] font-bold', t ? 'text-amber-600' : 'text-foreground')}>
                        {format(day, 'd')}
                      </span>
                      <div className={cn(
                        'w-9 min-h-[40px] rounded-md border flex flex-col items-center justify-center gap-0.5 p-1',
                        t ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/30' : 'border-border bg-card',
                        dt.length > 0 && !t && 'border-[#1D3461]/30 bg-[#1D3461]/5',
                      )}>
                        {dt.length === 0 ? (
                          <div className="h-1.5 w-1.5 rounded-full bg-muted" />
                        ) : (
                          <>
                            {Array.from({ length: Math.min(dt.length, 4) }).map((_, i) => (
                              <div key={i} className={cn('h-1.5 w-1.5 rounded-full', t ? 'bg-amber-500' : 'bg-[#1D3461]')} />
                            ))}
                            {dt.length > 4 && <span className="text-[8px] text-muted-foreground">+{dt.length - 4}</span>}
                          </>
                        )}
                      </div>
                      {dt.length > 0 && (
                        <span className={cn('text-[9px] font-semibold', t ? 'text-amber-600' : 'text-[#1D3461]')}>{dt.length}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                Each dot = one task. Aim for no more than 3–5 tasks per day for sustainable pace.
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

            {/* Section label + controls row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-xs font-bold tracking-wide uppercase text-foreground/70">Planning Methodology</span>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">· ← → keys to navigate</span>
              </div>

              {/* Controls: play/pause + dot nav + arrows */}
              <div className="flex items-center gap-1.5">
                {/* Play / Pause */}
                <button
                  type="button"
                  onClick={() => { setAutoPlay(v => !v); setProgress(0); }}
                  className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors text-xs"
                  aria-label={autoPlay ? 'Pause auto-play' : 'Resume auto-play'}
                  title={autoPlay ? 'Pause' : 'Play'}
                >
                  {autoPlay ? '⏸' : '▶'}
                </button>
                <button
                  type="button"
                  onClick={() => navigate((tipIdx - 1 + PLANNING_TIPS.length) % PLANNING_TIPS.length)}
                  className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
                  aria-label="Previous tip"
                >‹</button>
                {PLANNING_TIPS.map((_t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => navigate(i)}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: i === tipIdx ? '20px' : '6px',
                      background: i === tipIdx ? tip.from : '#d1d5db',
                    }}
                    aria-label={`Tip ${i + 1}: ${PLANNING_TIPS[i].title}`}
                    title={PLANNING_TIPS[i].title}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => navigate((tipIdx + 1) % PLANNING_TIPS.length)}
                  className="h-6 w-6 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors"
                  aria-label="Next tip"
                >›</button>
              </div>
            </div>

            {/* Auto-advance progress bar */}
            {autoPlay && (
              <div className="h-0.5 rounded-full bg-black/5 dark:bg-white/10 mb-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-none"
                  style={{ width: `${progress}%`, background: `linear-gradient(90deg, ${tip.from}, ${tip.to})` }}
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

// ── Main Page ───────────────────────────────────────────────────────────────

export default function MyTasks() {
  const { toast } = useToast();
  const { currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  const navigate = useNavigate();
  const userId = currentUser?.id;
  const isAdmin = hasAnyRole(['super_admin', 'admin']);

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

  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [personalView, setPersonalView] = useState<'list' | 'board'>('list');
  const [showInsights, setShowInsightsRaw] = useState<boolean>(() => {
    try { return localStorage.getItem('pact_mytasks_insights') !== 'false'; } catch { return true; }
  });
  const setShowInsights = (v: boolean) => {
    try { localStorage.setItem('pact_mytasks_insights', v ? 'true' : 'false'); } catch {}
    setShowInsightsRaw(v);
  };
  const [showTeam, setShowTeam] = useState(true);
  const [showDeptOverview, setShowDeptOverview] = useState(false);

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
  const filteredPersonal = useMemo(() =>
    personalTasks
      .filter(t => matchFilter(t.dueDate, t.status, filter))
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q) || (t.category ?? '').toLowerCase().includes(q)),
    [personalTasks, filter, q],
  );

  const filteredProject = useMemo(() =>
    projectTasks
      .filter(t => matchFilter(String(t.dueDate ?? ''), String(t.status ?? ''), filter))
      .filter(t => !q || String(t.title ?? '').toLowerCase().includes(q) || String(t.description ?? '').toLowerCase().includes(q) || t.projectName.toLowerCase().includes(q)),
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

      {/* ── Planning Hub ── */}
      <PlanningHub allTasks={[
        ...personalTasks,
        ...projectTasks.map(t => ({
          dueDate: typeof t.dueDate === 'string' ? t.dueDate : null,
          status: typeof t.status === 'string' ? t.status : 'todo',
          priority: typeof t.priority === 'string' ? t.priority : 'medium',
        })),
      ]} />

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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-[#1D3461]" />
              Project Tasks Assigned to Me
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{filteredProject.length}</Badge>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    These are field tasks from active projects where you are the assigned team member.
                    Click a task to navigate to the project. Status changes made here are reflected in the project's field tasks view.
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </h2>
            <p className="text-[11px] text-muted-foreground ml-6">Tasks assigned to you across all active projects — click any task to navigate to its project</p>
          </div>
          <a href="/projects" className="text-xs text-[#1D3461] hover:underline flex items-center gap-0.5 flex-shrink-0">
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
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              My Personal Tasks
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{filteredPersonal.length}</Badge>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    Personal tasks are private to you and not visible to anyone else.
                    Use the quick-add bar above to create one. Switch to Board view for a visual Kanban layout.
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </h2>
            <p className="text-[11px] text-muted-foreground ml-6">Private to you only — use the quick-add bar above · toggle ☰ List or ⊞ Board view</p>
          </div>
          <div className="flex items-center gap-2">
            {personalTasks.filter(t => t.status === 'done').length > 0 && (
              <span className="text-xs text-muted-foreground">
                {personalTasks.filter(t => t.status === 'done').length} completed
              </span>
            )}
            <div className="flex items-center border rounded-lg overflow-hidden h-7">
              <button
                type="button"
                onClick={() => setPersonalView('list')}
                className={cn('flex items-center gap-1 px-2.5 h-full text-[11px] font-medium transition-colors', personalView === 'list' ? 'bg-[#1D3461] text-white' : 'bg-card text-muted-foreground hover:bg-muted')}
                title="List view"
              >
                <LayoutList className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPersonalView('board')}
                className={cn('flex items-center gap-1 px-2.5 h-full text-[11px] font-medium transition-colors', personalView === 'board' ? 'bg-[#1D3461] text-white' : 'bg-card text-muted-foreground hover:bg-muted')}
                title="Kanban board view"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
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
        ) : personalView === 'board' ? (
          <BoardView
            tasks={filteredPersonal}
            onStatusChange={(id, s, prev) => handleStatusChange(id, s, prev)}
            onEdit={setEditingTask}
            onDelete={handleDelete}
          />
        ) : (
          <div className="space-y-1.5">
            {filteredPersonal.map(task => (
              <PersonalTaskCard
                key={task.id}
                task={task}
                subtasks={allPersonalTasks.filter(t => t.parentTaskId === task.id)}
                onStatusChange={(s, prev) => handleStatusChange(task.id, s, prev)}
                onEdit={() => setEditingTask(task)}
                onDelete={() => handleDelete(task.id)}
                onCreateSubtask={async (title) => {
                  await createTask({ title, priority: task.priority, category: task.category ?? 'personal', parentTaskId: task.id });
                }}
                onSubtaskStatusChange={(id, s, prev) => handleStatusChange(id, s, prev)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Team Task Health (admin only) ── */}
      {isAdmin && (
        <div className="space-y-2">
          {/* ── Team Task Health ── */}
          <button
            type="button"
            onClick={() => setShowTeam(v => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-foreground w-full group"
          >
            <Users className="h-4 w-4 text-[#1D3461]" />
            Team Task Health
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Admin View</Badge>
            <span className="ml-auto text-muted-foreground group-hover:text-foreground">
              {showTeam ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {showTeam && <TeamSnapshot />}

          {/* ── Department Task Overview (collapsible, admin only) ── */}
          <button
            type="button"
            onClick={() => { setShowDeptOverview(v => !v); if (!showDeptOverview) refetchDeptOverview(); }}
            className="flex items-center gap-2 text-sm font-semibold text-foreground w-full group mt-2"
            data-testid="button-toggle-dept-overview"
          >
            <Building2 className="h-4 w-4 text-[#1D3461]" />
            Task Overview by Department
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Admin View</Badge>
            <span className="ml-auto text-muted-foreground group-hover:text-foreground">
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
            className="flex items-center gap-1.5 text-xs text-[#1D3461] hover:underline font-medium mt-1"
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

      {/* ── Edit dialog ── */}
      <EditPersonalTaskDialog
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleEditSave}
        isSaving={isUpdating}
        isAdmin={isAdmin}
      />

      {/* ── New Task dialog ── */}
      <NewTaskDialog
        open={showNewTask}
        onClose={() => setShowNewTask(false)}
        onCreate={handleNewTaskCreate}
        isCreating={isCreating}
        isAdmin={isAdmin}
        currentUserId={userId ?? ''}
        currentUserName={currentUser?.fullName ?? 'Me'}
      />
    </div>
  );
}
