import { useState, useMemo, useEffect, useRef } from 'react';
import {
  format, isToday, isBefore, parseISO, isValid, startOfDay,
  addDays, differenceInCalendarDays,
} from 'date-fns';
import {
  Calendar, CheckCircle2, ChevronLeft, ChevronRight, Clock, Lock,
  LayoutDashboard, ListTodo, MoreHorizontal, Plus,
  Search, AlertCircle, Loader2, X, Trash2, Edit2, Check,
  Columns2, Sun, Sparkles, Target,
  RefreshCw, TrendingUp, Briefcase, User, Lightbulb,
  CheckSquare, Circle, Zap, ChevronDown, ChevronUp,
  Inbox, Archive, Star, AlertTriangle, Flag,
  Brain, Coffee, Moon, ArrowRight, BarChart3, Users, Layers, Paperclip, Pencil,
} from 'lucide-react';
import { useTaskNotifications, statusToEvent } from '@/hooks/useTaskNotifications';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
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
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
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

function recurrenceLabel(task: { recurrence?: string; recurrenceEndDate?: string | null }): string {
  const freq: Record<string, string> = {
    'daily':         'Repeats daily',
    'every_2_days':  'Repeats every 2 days',
    'every-2-days':  'Repeats every 2 days',
    'every_3_days':  'Repeats every 3 days',
    'every-3-days':  'Repeats every 3 days',
    'weekly':        'Repeats weekly',
    'monthly':       'Repeats monthly',
    'weekdays':      'Repeats Mon–Fri',
    'biweekly':      'Repeats bi-weekly',
    'specific_days': 'Repeats on specific days',
  };
  const base = freq[task.recurrence ?? ''] ?? 'Repeats';
  if (task.recurrenceEndDate) {
    try {
      const d = parseISO(task.recurrenceEndDate);
      if (isValid(d)) return `${base} · ends ${format(d, 'd MMM yyyy')}`;
    } catch {}
  }
  return base;
}

function RecurringBadge({ task, compact = false }: { task: { recurrence?: string; recurrenceEndDate?: string | null }; compact?: boolean }) {
  if (!task.recurrence || task.recurrence === 'none') return null;
  const label = recurrenceLabel(task);
  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            data-testid="badge-recurring"
            className="inline-flex items-center text-teal-600 cursor-default"
          >
            <RefreshCw className="w-2.5 h-2.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid="badge-recurring"
          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded-full cursor-default"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          Repeats
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function initials(name?: string | null) {
  if (!name) return 'ME';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Quick Add Dialog ─────────────────────────────────────────────────────────

interface QuickAddDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (data: {
    title: string;
    priority: PersonalTaskPriority;
    status: PersonalTaskStatus;
    dueDate: string;
    description: string;
    taskType: 'project-task' | 'day-to-day' | null;
    category: string | null;
    notes: string;
    assignedToUserId?: string | null;
    assignedToUserName?: string | null;
    targetDeptId?: string | null;
    rewardAmount?: number | null;
    structuredDeps?: Array<{ type: string; label: string; requiresAck: boolean }>;
    planningQuadrant?: QuadrantKey | null;
    recurrence?: string;
    recurrenceDays?: number[];
    recurrenceMonthlyDay?: number | null;
    recurrenceEndDate?: string | null;
    estimatedHours?: number | null;
  }) => void;
  isCreating: boolean;
  currentUserFullName?: string | null;
  currentUserId?: string | null;
  currentUserRole?: string | null;
}
type DepTab = 'custom' | 'date' | 'user' | 'department';
type AssignTab = 'myself' | 'someone' | 'dept';

function QuickAddDialog({ open, onClose, onCreate, isCreating, currentUserFullName, currentUserId, currentUserRole }: QuickAddDialogProps) {
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [taskTypeKey, setTaskTypeKey] = useState<'general' | 'project' | 'daytoday'>('general');
  const [priority, setPriority]     = useState<PersonalTaskPriority>('medium');
  const [dueDate, setDueDate]       = useState('');
  const [notes, setNotes]           = useState('');
  const [reward, setReward]         = useState('');
  const [depTab, setDepTab]         = useState<DepTab>('custom');
  const [depInput, setDepInput]     = useState('');
  const [depDateInput, setDepDateInput] = useState('');
  const [deps, setDeps]             = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Assign To state ────────────────────────────────────────────────────────
  const [assignTab, setAssignTab]           = useState<AssignTab>('myself');
  const [assignedUser, setAssignedUser]     = useState<{ id: string; full_name: string } | null>(null);
  const [assignedDept, setAssignedDept]     = useState<{ id: string; name: string } | null>(null);
  const [assignSearch, setAssignSearch]     = useState('');

  // Fetch departments this user manages
  const { data: managedDepts = [] } = useQuery({
    queryKey: ['managed-depts', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];
      const { data } = await supabase.from('departments').select('id, name').eq('manager_user_id', currentUserId);
      return data ?? [];
    },
    enabled: open && !!currentUserId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Role-based permissions ─────────────────────────────────────────────────
  const isExec = useMemo(() => {
    const role = currentUserRole?.toLowerCase() ?? '';
    if (role === 'superadmin' || role === 'admin') return true;
    const execDeptNames = ['ceo', 'coo', 'cto'];
    return (managedDepts as { id: string; name: string }[]).some(d => execDeptNames.includes(d.name.toLowerCase()));
  }, [currentUserRole, managedDepts]);

  const isDeptManager = (managedDepts as { id: string; name: string }[]).length > 0;
  const canAssignOthers = isExec || isDeptManager;

  // Fetch all departments (for execs) or only managed (for dept mgrs)
  const { data: departments = [] } = useQuery({
    queryKey: ['dialog-departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return data ?? [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  // Depts the current user can assign to
  const assignableDepts = useMemo(() => {
    if (isExec) return departments as { id: string; name: string }[];
    if (isDeptManager) return managedDepts as { id: string; name: string }[];
    return [];
  }, [isExec, isDeptManager, departments, managedDepts]);

  // Fetch members of managed dept(s) for dept manager "Someone else" list
  const managedDeptIds = (managedDepts as { id: string; name: string }[]).map(d => d.id);
  const { data: deptMembers = [] } = useQuery({
    queryKey: ['dept-members', managedDeptIds.join(',')],
    queryFn: async () => {
      if (!managedDeptIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name, role').in('department_id', managedDeptIds).order('full_name');
      return (data ?? []).filter((u: { full_name: string | null }) => u.full_name?.trim());
    },
    enabled: open && isDeptManager && !isExec,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch all users
  const { data: allUsers = [] } = useQuery({
    queryKey: ['dialog-users'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []).filter((u: { full_name: string | null }) => u.full_name?.trim());
    },
    enabled: open && isExec,
    staleTime: 5 * 60 * 1000,
  });

  // User list for "Someone else" tab
  const assignableUsers = useMemo(() => {
    const pool = isExec ? allUsers : deptMembers;
    return (pool as { id: string; full_name: string | null; role: string | null }[])
      .filter(u => u.id !== currentUserId)
      .filter(u => !assignSearch || u.full_name?.toLowerCase().includes(assignSearch.toLowerCase()))
      .slice(0, 25);
  }, [isExec, allUsers, deptMembers, currentUserId, assignSearch]);

  // Dep user search (still used in dependencies tab)
  const { data: depUsers = [] } = useQuery({
    queryKey: ['dialog-dep-users'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []).filter((u: { full_name: string | null }) => u.full_name?.trim());
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const filteredDepUsers = useMemo(() =>
    (depUsers as { id: string; full_name: string | null; role: string | null }[])
      .filter(u => !userSearch || u.full_name?.toLowerCase().includes(userSearch.toLowerCase()))
      .slice(0, 20),
    [depUsers, userSearch]
  );

  // Structured deps (with type + requiresAck)
  const [structuredDeps, setStructuredDeps] = useState<Array<{ type: string; label: string; requiresAck: boolean }>>([]);
  const [planningQuadrant, setPlanningQuadrant] = useState<QuadrantKey | null>(null);

  // Recurrence state
  const [recurrenceOn,           setRecurrenceOn]           = useState(false);
  const [recurrence,             setRecurrence]             = useState('daily');
  const [recurrenceDaysQA,       setRecurrenceDaysQA]       = useState<number[]>([]);
  const [recurrenceMonthlyDayQA, setRecurrenceMonthlyDayQA] = useState(1);
  const [recurrenceEndDate,      setRecurrenceEndDate]      = useState('');
  const toggleDayQA = (d: number) =>
    setRecurrenceDaysQA(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

  // Time tracking state (estimated only — actual is auto-calculated from start/end timestamps)
  const [estimatedHoursQA, setEstimatedHoursQA] = useState('');

  const reset = () => {
    setTitle(''); setDescription(''); setTaskTypeKey('general');
    setPriority('medium'); setDueDate(''); setNotes('');
    setReward(''); setDepInput(''); setDepDateInput(''); setDeps([]);
    setUserSearch(''); setAttachments([]);
    setAssignTab('myself'); setAssignedUser(null); setAssignedDept(null); setAssignSearch('');
    setStructuredDeps([]);
    setPlanningQuadrant(null);
    setRecurrenceOn(false); setRecurrence('daily');
    setRecurrenceDaysQA([]); setRecurrenceMonthlyDayQA(1); setRecurrenceEndDate('');
    setEstimatedHoursQA('');
  };

  const addDep = (label: string, type: string = 'custom', requiresAck = false) => {
    const v = label.trim();
    if (!v || structuredDeps.some(d => d.label === v)) return;
    setStructuredDeps(prev => [...prev, { type, label: v, requiresAck }]);
    setDeps(prev => [...prev, v]);
    setDepInput('');
    setDepDateInput('');
  };

  const removeDep = (idx: number) => {
    setStructuredDeps(prev => prev.filter((_, i) => i !== idx));
    setDeps(prev => prev.filter((_, i) => i !== idx));
  };

  const submit = () => {
    if (!title.trim()) return;
    if (recurrenceOn && (recurrence === 'weekly' || recurrence === 'specific_days') && recurrenceDaysQA.length === 0) return;
    const typeMap = {
      general:  { taskType: null as null,                    category: 'personal' },
      project:  { taskType: 'project-task' as const,        category: 'project'  },
      daytoday: { taskType: 'day-to-day'   as const,        category: 'recurring'},
    };
    const { taskType, category } = typeMap[taskTypeKey];
    const rewardAmount = reward ? parseFloat(reward) : null;
    onCreate({
      title: title.trim(), priority, status: 'todo', dueDate, description, taskType, category, notes,
      assignedToUserId:   assignTab === 'someone' ? (assignedUser?.id ?? null) : null,
      assignedToUserName: assignTab === 'someone' ? (assignedUser?.full_name ?? null) : null,
      targetDeptId:       assignTab === 'dept' ? (assignedDept?.id ?? null) : null,
      rewardAmount,
      structuredDeps,
      planningQuadrant,
      recurrence: recurrenceOn ? recurrence : 'none',
      recurrenceDays: (recurrence === 'weekly' || recurrence === 'specific_days') && recurrenceOn ? recurrenceDaysQA : [],
      recurrenceMonthlyDay: recurrence === 'monthly' && recurrenceOn ? recurrenceMonthlyDayQA : null,
      recurrenceEndDate: recurrenceOn && recurrenceEndDate ? recurrenceEndDate : null,
      estimatedHours: estimatedHoursQA ? parseFloat(estimatedHoursQA) : null,
    });
    reset();
  };

  const initial = (currentUserFullName ?? 'U')[0].toUpperCase();
  const TASK_TYPES = [
    { key: 'general'  as const, label: 'General',      Icon: CheckSquare },
    { key: 'project'  as const, label: 'Project Task', Icon: Briefcase   },
    { key: 'daytoday' as const, label: 'Day-to-Day',   Icon: RefreshCw   },
  ];
  const PRIORITIES = [
    { value: 'critical' as const, label: '🔴 Urgent' },
    { value: 'high'     as const, label: '🟠 High'   },
    { value: 'medium'   as const, label: '🔵 Medium'  },
    { value: 'low'      as const, label: '⚫ Low'      },
  ];

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl">
        {/* ── Header ── */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-[#1D3461] flex items-center justify-center shrink-0">
            <Plus className="w-4 h-4 text-white" />
          </div>
          <DialogTitle className="text-base font-bold text-slate-800 m-0 p-0">New Task</DialogTitle>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-5 py-4 flex flex-col gap-4">

            {/* Title */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
                Task title <span className="text-red-500 normal-case tracking-normal">*</span>
              </label>
              <input
                autoFocus
                placeholder="What needs to be done?"
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) submit(); }}
                data-testid="input-task-title"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all font-medium"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Description</label>
              <textarea
                placeholder="Add more details..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all resize-none"
              />
            </div>

            {/* Task Type */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
                Task Type <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                {TASK_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => {
                      setTaskTypeKey(t.key);
                      // Auto-enable recurrence when Day-to-Day is selected
                      if (t.key === 'daytoday') setRecurrenceOn(true);
                    }}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border text-xs font-semibold transition-all',
                      taskTypeKey === t.key
                        ? 'bg-[#1D3461] text-white border-[#1D3461] shadow-sm'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50',
                    )}
                  >
                    <t.Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Planning Quadrant Picker */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1 block flex items-center gap-1.5">
                Planning Quadrant
                <span className="text-slate-400 font-normal normal-case tracking-normal">(optional — auto if skipped)</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { key: 'do'       as QuadrantKey, label: 'Do Now',           sub: 'Urgent + Important',   dot: 'bg-red-500',   active: 'bg-red-50 border-red-400 text-red-700'   },
                  { key: 'schedule' as QuadrantKey, label: 'Schedule',         sub: 'Important, Not Urgent', dot: 'bg-blue-500',  active: 'bg-blue-50 border-blue-400 text-blue-700' },
                  { key: 'delegate' as QuadrantKey, label: 'Delegate',         sub: 'Urgent, Not Important', dot: 'bg-amber-400', active: 'bg-amber-50 border-amber-400 text-amber-700' },
                  { key: 'drop'     as QuadrantKey, label: 'Consider Dropping',sub: 'Low Priority, Not Urgent', dot: 'bg-slate-400', active: 'bg-slate-100 border-slate-400 text-slate-700' },
                ]).map(q => {
                  const isSelected = planningQuadrant === q.key;
                  return (
                    <button
                      key={q.key}
                      type="button"
                      onClick={() => setPlanningQuadrant(isSelected ? null : q.key)}
                      data-testid={`quadrant-picker-${q.key}`}
                      className={cn(
                        'flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all',
                        isSelected ? q.active + ' border-2' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600',
                      )}
                    >
                      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', q.dot)} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold leading-tight">{q.label}</p>
                        <p className="text-[10px] text-slate-400 leading-tight truncate">{q.sub}</p>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              {planningQuadrant && (
                <button type="button" onClick={() => setPlanningQuadrant(null)} className="mt-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
                  ✕ Clear selection (auto-assign)
                </button>
              )}
            </div>

            {/* Repeat / Recurrence */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3" /> Repeat
                </label>
                <button type="button" onClick={() => setRecurrenceOn(v => !v)} data-testid="toggle-recurrence"
                  className={cn('w-9 h-5 rounded-full transition-colors relative shrink-0', recurrenceOn ? 'bg-[#1D3461]' : 'bg-slate-200')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', recurrenceOn ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
              </div>
              {recurrenceOn && (
                <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  {/* Frequency options — 8 buttons, 4-column grid */}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Frequency</p>
                    <div className="grid grid-cols-4 gap-1">
                      {([
                        { key: 'daily',         label: 'Daily'       },
                        { key: 'every_2_days',  label: 'Every 2d'   },
                        { key: 'every_3_days',  label: 'Every 3d'   },
                        { key: 'weekdays',      label: 'Mon–Fri'    },
                        { key: 'weekly',        label: 'Weekly'      },
                        { key: 'biweekly',      label: 'Bi-weekly'  },
                        { key: 'monthly',       label: 'Monthly'     },
                        { key: 'specific_days', label: 'Specific'   },
                      ] as const).map(r => (
                        <button key={r.key} type="button" onClick={() => setRecurrence(r.key)} data-testid={`recurrence-freq-${r.key}`}
                          className={cn('px-1.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all text-center',
                            recurrence === r.key ? 'bg-[#1D3461] text-white border-[#1D3461]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Weekly / Specific days: day-of-week pills */}
                  {(recurrence === 'weekly' || recurrence === 'specific_days') && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">On days</p>
                      <div className="flex gap-1">
                        {['S','M','T','W','T','F','S'].map((d, i) => (
                          <button key={i} type="button" onClick={() => toggleDayQA(i)} data-testid={`recurrence-day-${i}`}
                            className={cn('w-7 h-7 rounded-full text-[10px] font-bold border transition-all',
                              recurrenceDaysQA.includes(i) ? 'bg-[#1D3461] text-white border-[#1D3461]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
                            {d}
                          </button>
                        ))}
                      </div>
                      {recurrenceDaysQA.length === 0 && (
                        <p className="text-[10px] text-amber-600 mt-1">Select at least one day</p>
                      )}
                    </div>
                  )}
                  {/* Monthly: day-of-month */}
                  {recurrence === 'monthly' && (
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-slate-600 shrink-0">On day</p>
                      <input type="number" min={1} max={31} value={recurrenceMonthlyDayQA}
                        onChange={e => setRecurrenceMonthlyDayQA(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-16 h-8 rounded-lg border border-slate-200 text-sm px-2 bg-white text-center focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20" />
                      <p className="text-[11px] text-slate-400">of each month</p>
                    </div>
                  )}
                  {/* Ends on */}
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-slate-600 shrink-0">Ends on</p>
                    <input type="date" value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)}
                      className="flex-1 h-8 rounded-lg border border-slate-200 text-sm px-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20" />
                    {recurrenceEndDate && (
                      <button type="button" onClick={() => setRecurrenceEndDate('')} className="text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!recurrenceEndDate && <p className="text-[10px] text-slate-400">optional</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Priority + Due date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Priority</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as PersonalTaskPriority)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white"
                >
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Due date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white"
                />
              </div>
            </div>

            {/* Time tracking — Estimated only; Actual is auto-calculated when task is completed */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block flex items-center gap-1">
                <Clock className="w-3 h-3" /> Estimated hrs
              </label>
              <input type="number" min="0" step="0.25" placeholder="0.0"
                value={estimatedHoursQA} onChange={e => setEstimatedHoursQA(e.target.value)}
                data-testid="input-estimated-hours"
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white" />
              <p className="text-[10px] text-slate-400 mt-1">Actual hours are tracked automatically when the task is started and completed.</p>
            </div>

            {/* Assign to */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Assign to</label>
              {/* Tabs — only show others if authorized */}
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => { setAssignTab('myself'); setAssignedUser(null); setAssignedDept(null); }}
                  data-testid="assign-tab-myself"
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                    assignTab === 'myself' ? 'bg-[#1D3461] text-white shadow-sm' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                  )}>
                  <User className="w-3 h-3" /> Myself
                </button>
                {canAssignOthers && (
                  <button
                    onClick={() => { setAssignTab('someone'); setAssignedDept(null); }}
                    data-testid="assign-tab-someone"
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                      assignTab === 'someone' ? 'bg-[#1D3461] text-white shadow-sm' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                    )}>
                    <Users className="w-3 h-3" /> Someone else
                  </button>
                )}
                {canAssignOthers && assignableDepts.length > 0 && (
                  <button
                    onClick={() => { setAssignTab('dept'); setAssignedUser(null); }}
                    data-testid="assign-tab-dept"
                    className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                      assignTab === 'dept' ? 'bg-[#1D3461] text-white shadow-sm' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                    )}>
                    <Briefcase className="w-3 h-3" /> Dept
                  </button>
                )}
              </div>

              {/* ── Myself ── */}
              {assignTab === 'myself' && (
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-7 h-7 rounded-full bg-[#1D3461] flex items-center justify-center shrink-0">
                    <span className="text-white text-[11px] font-bold">{initial}</span>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 flex-1">{currentUserFullName ?? 'You'}</span>
                  <span className="text-[11px] text-slate-400 font-medium">(you)</span>
                </div>
              )}

              {/* ── Someone else ── */}
              {assignTab === 'someone' && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      placeholder={isExec ? 'Search anyone…' : 'Search your department…'}
                      value={assignSearch}
                      onChange={e => setAssignSearch(e.target.value)}
                      data-testid="assign-user-search"
                      className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400"
                    />
                  </div>
                  {assignedUser && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b border-emerald-100">
                      <div className="w-6 h-6 rounded-full bg-emerald-200 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-emerald-700">{assignedUser.full_name[0].toUpperCase()}</span>
                      </div>
                      <span className="text-xs font-semibold text-emerald-800 flex-1">{assignedUser.full_name}</span>
                      <button onClick={() => setAssignedUser(null)} className="text-emerald-400 hover:text-red-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="max-h-36 overflow-y-auto">
                    {assignableUsers.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No users found</p>
                    ) : assignableUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => { setAssignedUser({ id: u.id, full_name: u.full_name ?? '' }); setAssignSearch(''); }}
                        data-testid={`assign-user-${u.id}`}
                        className={cn('w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0',
                          assignedUser?.id === u.id ? 'bg-emerald-50' : ''
                        )}>
                        <div className="w-6 h-6 rounded-full bg-[#1D3461]/10 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-[#1D3461]">{(u.full_name ?? 'U')[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{u.full_name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{u.role}</p>
                        </div>
                        {assignedUser?.id === u.id && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                  {!isExec && isDeptManager && (
                    <p className="text-[10px] text-slate-400 px-3 py-1.5 border-t border-slate-100 bg-slate-50">
                      Showing your department members only
                    </p>
                  )}
                </div>
              )}

              {/* ── Dept ── */}
              {assignTab === 'dept' && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  {assignedDept && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
                      <Briefcase className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="text-xs font-semibold text-blue-800 flex-1">{assignedDept.name}</span>
                      <button onClick={() => setAssignedDept(null)} className="text-blue-400 hover:text-red-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="max-h-36 overflow-y-auto">
                    {assignableDepts.map(dept => (
                      <button
                        key={dept.id}
                        onClick={() => setAssignedDept({ id: dept.id, name: dept.name })}
                        data-testid={`assign-dept-${dept.id}`}
                        className={cn('w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0',
                          assignedDept?.id === dept.id ? 'bg-blue-50' : ''
                        )}>
                        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <Briefcase className="w-3 h-3 text-blue-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 flex-1">{dept.name}</span>
                        {assignedDept?.id === dept.id && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-600 px-3 py-1.5 border-t border-amber-100 bg-amber-50">
                    The dept manager will be notified to assign a team member
                  </p>
                </div>
              )}
            </div>

            {/* Completion Reward */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-500" />
                Completion Reward
                <span className="text-slate-400 font-normal normal-case tracking-normal">(optional — credited to wallet on completion)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={reward}
                  onChange={e => setReward(e.target.value)}
                  data-testid="input-reward"
                  className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white"
                />
                <div className="h-10 px-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center text-sm font-semibold text-slate-500">
                  USD
                </div>
              </div>
            </div>

            {/* Dependencies */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
                <ArrowRight className="w-3 h-3 text-slate-400" />
                Dependencies
                <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
              </label>
              {/* Sub-tabs */}
              <div className="flex gap-1.5 mb-2">
                {([
                  { key: 'custom'     as DepTab, label: 'Custom'     },
                  { key: 'date'       as DepTab, label: 'Date'       },
                  { key: 'user'       as DepTab, label: 'User'       },
                  { key: 'department' as DepTab, label: 'Department' },
                ]).map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setDepTab(t.key); setUserSearch(''); }}
                    data-testid={`dep-tab-${t.key}`}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                      depTab === t.key
                        ? 'bg-[#1D3461] text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200',
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* ── Custom: free text ── */}
              {depTab === 'custom' && (
                <div className="flex gap-2">
                  <input
                    placeholder="e.g. 'Site survey complete', 'Approval received'"
                    value={depInput}
                    onChange={e => setDepInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addDep(depInput); } }}
                    data-testid="input-dependency-custom"
                    className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all"
                  />
                  <button onClick={() => addDep(depInput)} data-testid="button-add-dep-custom"
                    className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#1D3461] hover:bg-[#0F2041] text-white text-xs font-semibold transition-colors shrink-0">
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              )}

              {/* ── Date: date picker ── */}
              {depTab === 'date' && (
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={depDateInput}
                    onChange={e => setDepDateInput(e.target.value)}
                    data-testid="input-dependency-date"
                    className="flex-1 h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white"
                  />
                  <button
                    onClick={() => depDateInput && addDep(`Date: ${depDateInput}`)}
                    data-testid="button-add-dep-date"
                    disabled={!depDateInput}
                    className="flex items-center gap-1.5 h-10 px-4 rounded-xl bg-[#1D3461] hover:bg-[#0F2041] text-white text-xs font-semibold transition-colors shrink-0 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add
                  </button>
                </div>
              )}

              {/* ── User: searchable list ── */}
              {depTab === 'user' && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      placeholder="Search users…"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      data-testid="input-dependency-user-search"
                      className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <p className="text-[10px] text-amber-700 bg-amber-50 px-3 py-1.5 border-b border-amber-100">
                    ⏳ Added users must <strong>acknowledge &amp; confirm</strong> before this task can start
                  </p>
                  <div className="max-h-32 overflow-y-auto">
                    {filteredDepUsers.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No users found</p>
                    ) : filteredDepUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => addDep(`User: ${u.full_name}`, 'user', true)}
                        data-testid={`dep-user-${u.id}`}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0"
                      >
                        <div className="w-6 h-6 rounded-full bg-[#1D3461]/10 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-[#1D3461]">{(u.full_name ?? 'U')[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">{u.full_name}</p>
                          <p className="text-[10px] text-slate-400 truncate">{u.role}</p>
                        </div>
                        <Plus className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Department: list ── */}
              {depTab === 'department' && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <p className="text-[10px] text-blue-700 bg-blue-50 px-3 py-1.5 border-b border-blue-100">
                    🏢 The dept manager must <strong>approve &amp; assign</strong> a team member to this task
                  </p>
                  <div className="max-h-32 overflow-y-auto">
                    {departments.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">Loading…</p>
                    ) : (departments as { id: string; name: string }[]).map(dept => (
                      <button
                        key={dept.id}
                        onClick={() => addDep(`Dept: ${dept.name}`, 'department', true)}
                        data-testid={`dep-dept-${dept.id}`}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0"
                      >
                        <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                          <Briefcase className="w-3 h-3 text-blue-600" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 flex-1">{dept.name}</span>
                        <Plus className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dep tags list — with acknowledgment indicators */}
              {structuredDeps.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {structuredDeps.map((d, i) => (
                    <span key={i} className={cn(
                      'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium',
                      d.type === 'user' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                      d.type === 'department' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                      'bg-[#1D3461]/10 text-[#1D3461]'
                    )}>
                      {d.type === 'user' && <span title="Awaiting user acknowledgment">⏳</span>}
                      {d.type === 'department' && <span title="Awaiting dept manager approval">🏢</span>}
                      {d.label}
                      <button onClick={() => removeDep(i)} className="opacity-50 hover:opacity-100 hover:text-red-600 transition-all ml-0.5">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Attachments */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
                <Paperclip className="w-3 h-3 text-slate-400" />
                Attachments
                <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <input
                type="file"
                multiple
                ref={fileInputRef}
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  setAttachments(prev => [...prev, ...files]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-attach-file"
                className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-dashed border-slate-300 hover:border-[#1D3461] text-slate-400 hover:text-[#1D3461] text-xs font-semibold transition-all"
              >
                <Paperclip className="w-3.5 h-3.5" /> Click to attach files
              </button>
              {attachments.length > 0 && (
                <div className="flex flex-col gap-1 mt-2">
                  {attachments.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
                      <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="text-xs text-slate-600 font-medium flex-1 truncate">{f.name}</span>
                      <span className="text-[10px] text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Notes</label>
              <textarea
                placeholder="Any additional notes..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all resize-none"
              />
            </div>

          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-100 bg-slate-50/80 shrink-0">
          <button
            onClick={() => { reset(); onClose(); }}
            className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-white transition-all"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!title.trim() || isCreating}
            data-testid="button-create-task"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1D3461] hover:bg-[#0F2041] text-white text-sm font-semibold transition-all disabled:opacity-50 shadow-sm"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Task
          </button>
        </div>
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
  currentUserId?: string | null;
  currentUserRole?: string | null;
}
function EditDialog({ task, onClose, onSave, onDelete, isUpdating, currentUserId, currentUserRole }: EditDialogProps) {
  const [title, setTitle]           = useState('');
  const [description, setDescription] = useState('');
  const [taskTypeKey, setTaskTypeKey] = useState<'general' | 'project' | 'daytoday'>('general');
  const [priority, setPriority]     = useState<PersonalTaskPriority>('medium');
  const [status, setStatus]         = useState<PersonalTaskStatus>('todo');
  const [dueDate, setDueDate]       = useState('');
  const [notes, setNotes]           = useState('');
  const [reward, setReward]         = useState('');
  const [planningQuadrant, setPlanningQuadrant] = useState<QuadrantKey | null>(null);

  // Permission: who can manually override actual_hours
  const canEditActualHours = ['admin', 'superadmin', 'ceo', 'coo', 'cto'].includes((currentUserRole ?? '').toLowerCase());

  // Time tracking state (EditDialog)
  const [editEstimatedHours, setEditEstimatedHours] = useState('');
  const [editActualHours,    setEditActualHours]    = useState('');

  // Recurrence state (EditDialog)
  const [editRecurrenceOn,           setEditRecurrenceOn]           = useState(false);
  const [editRecurrence,             setEditRecurrence]             = useState('daily');
  const [editRecurrenceDays,         setEditRecurrenceDays]         = useState<number[]>([]);
  const [editRecurrenceMonthlyDay,   setEditRecurrenceMonthlyDay]   = useState(1);
  const [editRecurrenceEndDate,      setEditRecurrenceEndDate]      = useState('');
  const toggleDayEdit = (d: number) =>
    setEditRecurrenceDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));

  // Assign To state (same pattern as QuickAddDialog)
  const [assignTab, setAssignTab]       = useState<AssignTab>('myself');
  const [assignedUser, setAssignedUser] = useState<{ id: string; full_name: string } | null>(null);
  const [assignedDept, setAssignedDept] = useState<{ id: string; name: string } | null>(null);
  const [assignSearch, setAssignSearch] = useState('');

  const isOpen = !!task;

  // Managed depts
  const { data: managedDepts = [] } = useQuery({
    queryKey: ['managed-depts-edit', currentUserId],
    queryFn: async () => {
      if (!currentUserId) return [];
      const { data } = await supabase.from('departments').select('id, name').eq('manager_user_id', currentUserId);
      return data ?? [];
    },
    enabled: isOpen && !!currentUserId,
    staleTime: 5 * 60 * 1000,
  });

  const isExec = useMemo(() => {
    const role = currentUserRole?.toLowerCase() ?? '';
    if (role === 'superadmin' || role === 'admin') return true;
    return (managedDepts as { id: string; name: string }[]).some(d => ['ceo','coo','cto'].includes(d.name.toLowerCase()));
  }, [currentUserRole, managedDepts]);

  const isDeptManager = (managedDepts as { id: string; name: string }[]).length > 0;
  const canAssignOthers = isExec || isDeptManager;

  const { data: departments = [] } = useQuery({
    queryKey: ['edit-dialog-departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name').order('name');
      return data ?? [];
    },
    enabled: isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const assignableDepts = useMemo(() => {
    if (isExec) return departments as { id: string; name: string }[];
    if (isDeptManager) return managedDepts as { id: string; name: string }[];
    return [];
  }, [isExec, isDeptManager, departments, managedDepts]);

  const managedDeptIds = (managedDepts as { id: string; name: string }[]).map(d => d.id);
  const { data: deptMembers = [] } = useQuery({
    queryKey: ['edit-dept-members', managedDeptIds.join(',')],
    queryFn: async () => {
      if (!managedDeptIds.length) return [];
      const { data } = await supabase.from('profiles').select('id, full_name, role').in('department_id', managedDeptIds).order('full_name');
      return (data ?? []).filter((u: { full_name: string | null }) => u.full_name?.trim());
    },
    enabled: isOpen && isDeptManager && !isExec,
    staleTime: 5 * 60 * 1000,
  });
  const { data: allUsers = [] } = useQuery({
    queryKey: ['edit-dialog-users'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, role').order('full_name');
      return (data ?? []).filter((u: { full_name: string | null }) => u.full_name?.trim());
    },
    enabled: isOpen && isExec,
    staleTime: 5 * 60 * 1000,
  });
  const assignableUsers = useMemo(() => {
    const pool = isExec ? allUsers : deptMembers;
    return (pool as { id: string; full_name: string | null; role: string | null }[])
      .filter(u => u.id !== currentUserId)
      .filter(u => !assignSearch || u.full_name?.toLowerCase().includes(assignSearch.toLowerCase()))
      .slice(0, 25);
  }, [isExec, allUsers, deptMembers, currentUserId, assignSearch]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setPriority(task.priority);
      setStatus(task.status);
      setDueDate(task.dueDate ?? '');
      setDescription(task.description ?? '');
      setNotes(task.notes ?? '');
      setReward(task.completionRewardAmount ? String(task.completionRewardAmount) : '');
      setPlanningQuadrant(task.planningQuadrant ?? null);
      // Time tracking
      setEditEstimatedHours(task.estimatedHours != null ? String(task.estimatedHours) : '');
      setEditActualHours(task.actualHours != null ? String(task.actualHours) : '');
      // Recurrence
      const hasRecurrence = !!(task.recurrence && task.recurrence !== 'none');
      setEditRecurrenceOn(hasRecurrence);
      setEditRecurrence(hasRecurrence ? task.recurrence : 'daily');
      setEditRecurrenceDays(task.recurrenceDays ?? []);
      setEditRecurrenceMonthlyDay(task.recurrenceMonthlyDay ?? 1);
      setEditRecurrenceEndDate(task.recurrenceEndDate ?? '');
      // Task type
      if (task.taskType === 'project-task') setTaskTypeKey('project');
      else if (task.taskType === 'day-to-day') setTaskTypeKey('daytoday');
      else setTaskTypeKey('general');
      // Assign
      if (task.assignedTo && task.assignedTo !== task.userId) {
        setAssignTab('someone');
        setAssignedUser({ id: task.assignedTo, full_name: task.assignedToName ?? task.assignedTo });
      } else if (task.targetDepartmentId) {
        setAssignTab('dept');
        const dept = (departments as { id: string; name: string }[]).find(d => d.id === task.targetDepartmentId);
        if (dept) setAssignedDept(dept);
      } else {
        setAssignTab('myself');
      }
    }
  }, [task, departments]);

  if (!task) return null;

  const TASK_TYPES = [
    { key: 'general'  as const, label: 'General',      Icon: CheckSquare },
    { key: 'project'  as const, label: 'Project Task', Icon: Briefcase   },
    { key: 'daytoday' as const, label: 'Day-to-Day',   Icon: RefreshCw   },
  ];
  const PRIORITIES = [
    { value: 'critical' as const, label: '🔴 Urgent' },
    { value: 'high'     as const, label: '🟠 High'   },
    { value: 'medium'   as const, label: '🔵 Medium'  },
    { value: 'low'      as const, label: '⚫ Low'     },
  ];
  const STATUSES = [
    { value: 'todo'       as const, label: '📋 To Do'      },
    { value: 'inprogress' as const, label: '⚡ In Progress' },
    { value: 'done'       as const, label: '✅ Done'        },
    { value: 'cancelled'  as const, label: '🚫 Cancelled'   },
  ];

  const handleSave = () => {
    if (!title.trim()) return;
    if (editRecurrenceOn && (editRecurrence === 'weekly' || editRecurrence === 'specific_days') && editRecurrenceDays.length === 0) return;
    const typeMap = { general: null as null, project: 'project-task' as const, daytoday: 'day-to-day' as const };
    onSave(task.id, {
      title: title.trim(), priority, status,
      dueDate: dueDate || null, description: description || null,
      notes: notes || null,
      taskType: typeMap[taskTypeKey],
      completionRewardAmount: reward ? parseFloat(reward) : null,
      completionRewardCurrency: reward ? 'USD' : null,
      assignedTo: assignTab === 'someone' ? (assignedUser?.id ?? null) : null,
      assignedToName: assignTab === 'someone' ? (assignedUser?.full_name ?? null) : null,
      targetDepartmentId: assignTab === 'dept' ? (assignedDept?.id ?? null) : null,
      planningQuadrant: planningQuadrant ?? null,
      recurrence: editRecurrenceOn ? editRecurrence : 'none',
      recurrenceDays: (editRecurrence === 'weekly' || editRecurrence === 'specific_days') && editRecurrenceOn ? editRecurrenceDays : [],
      recurrenceMonthlyDay: editRecurrence === 'monthly' && editRecurrenceOn ? editRecurrenceMonthlyDay : null,
      recurrenceEndDate: editRecurrenceOn && editRecurrenceEndDate ? editRecurrenceEndDate : null,
      estimatedHours: editEstimatedHours ? parseFloat(editEstimatedHours) : null,
      // Only privileged roles can manually override actual_hours
      ...(canEditActualHours && { actualHours: editActualHours ? parseFloat(editActualHours) : null }),
    });
    onClose();
  };

  return (
    <Dialog open={!!task} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-2xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100 shrink-0 bg-gradient-to-r from-[#0F2041] to-[#1D3461]">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
            <Pencil className="w-4 h-4 text-white" />
          </div>
          <DialogTitle className="text-base font-bold text-white m-0 p-0">Edit Task</DialogTitle>
          <button onClick={onClose} className="ml-auto text-white/60 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-5 py-4 flex flex-col gap-4">

            {/* Title */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">
                Task title <span className="text-red-500 normal-case tracking-normal">*</span>
              </label>
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSave(); }}
                placeholder="What needs to be done?"
                data-testid="edit-input-title"
                className="w-full h-10 px-3.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all font-medium"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Description</label>
              <textarea
                placeholder="Add more details..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all resize-none"
              />
            </div>

            {/* Task Type */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Task Type</label>
              <div className="flex gap-2">
                {TASK_TYPES.map(t => (
                  <button key={t.key} onClick={() => {
                    setTaskTypeKey(t.key);
                    if (t.key === 'daytoday') setEditRecurrenceOn(true);
                  }}
                    className={cn('flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl border text-xs font-semibold transition-all',
                      taskTypeKey === t.key ? 'bg-[#1D3461] text-white border-[#1D3461] shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    )}>
                    <t.Icon className="w-3.5 h-3.5" />{t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Planning Quadrant Picker */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1 block">
                Planning Quadrant
                <span className="text-slate-400 font-normal normal-case tracking-normal ml-1">(optional — auto if skipped)</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  { key: 'do'       as QuadrantKey, label: 'Do Now',            sub: 'Urgent + Important',      dot: 'bg-red-500',   active: 'bg-red-50 border-red-400 text-red-700'      },
                  { key: 'schedule' as QuadrantKey, label: 'Schedule',          sub: 'Important, Not Urgent',   dot: 'bg-blue-500',  active: 'bg-blue-50 border-blue-400 text-blue-700'   },
                  { key: 'delegate' as QuadrantKey, label: 'Delegate',          sub: 'Urgent, Not Important',   dot: 'bg-amber-400', active: 'bg-amber-50 border-amber-400 text-amber-700'},
                  { key: 'drop'     as QuadrantKey, label: 'Consider Dropping', sub: 'Low Priority, Not Urgent',dot: 'bg-slate-400', active: 'bg-slate-100 border-slate-400 text-slate-700'},
                ]).map(q => {
                  const isSel = planningQuadrant === q.key;
                  return (
                    <button key={q.key} type="button" onClick={() => setPlanningQuadrant(isSel ? null : q.key)} data-testid={`edit-quadrant-${q.key}`}
                      className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all',
                        isSel ? q.active + ' border-2' : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600')}>
                      <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', q.dot)} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold leading-tight">{q.label}</p>
                        <p className="text-[10px] text-slate-400 leading-tight truncate">{q.sub}</p>
                      </div>
                      {isSel && <Check className="w-3 h-3 shrink-0 ml-auto" />}
                    </button>
                  );
                })}
              </div>
              {planningQuadrant && (
                <button type="button" onClick={() => setPlanningQuadrant(null)} className="mt-1 text-[11px] text-slate-400 hover:text-slate-600 transition-colors">
                  ✕ Clear selection (auto-assign)
                </button>
              )}
            </div>

            {/* Repeat / Recurrence — EditDialog */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3" /> Repeat
                </label>
                <button type="button" onClick={() => setEditRecurrenceOn(v => !v)} data-testid="edit-toggle-recurrence"
                  className={cn('w-9 h-5 rounded-full transition-colors relative shrink-0', editRecurrenceOn ? 'bg-[#1D3461]' : 'bg-slate-200')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', editRecurrenceOn ? 'translate-x-4' : 'translate-x-0.5')} />
                </button>
              </div>
              {editRecurrenceOn && (
                <div className="flex flex-col gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Frequency</p>
                    <div className="grid grid-cols-4 gap-1">
                      {([
                        { key: 'daily',         label: 'Daily'     },
                        { key: 'every_2_days',  label: 'Every 2d'  },
                        { key: 'every_3_days',  label: 'Every 3d'  },
                        { key: 'weekdays',      label: 'Mon–Fri'   },
                        { key: 'weekly',        label: 'Weekly'    },
                        { key: 'biweekly',      label: 'Bi-weekly' },
                        { key: 'monthly',       label: 'Monthly'   },
                        { key: 'specific_days', label: 'Specific'  },
                      ] as const).map(r => (
                        <button key={r.key} type="button" onClick={() => setEditRecurrence(r.key)} data-testid={`edit-recurrence-freq-${r.key}`}
                          className={cn('px-1.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all text-center',
                            editRecurrence === r.key ? 'bg-[#1D3461] text-white border-[#1D3461]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300')}>
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {(editRecurrence === 'weekly' || editRecurrence === 'specific_days') && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">On days</p>
                      <div className="flex gap-1">
                        {['S','M','T','W','T','F','S'].map((d, i) => (
                          <button key={i} type="button" onClick={() => toggleDayEdit(i)} data-testid={`edit-recurrence-day-${i}`}
                            className={cn('w-7 h-7 rounded-full text-[10px] font-bold border transition-all',
                              editRecurrenceDays.includes(i) ? 'bg-[#1D3461] text-white border-[#1D3461]' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300')}>
                            {d}
                          </button>
                        ))}
                      </div>
                      {editRecurrenceDays.length === 0 && (
                        <p className="text-[10px] text-amber-600 mt-1">Select at least one day</p>
                      )}
                    </div>
                  )}
                  {editRecurrence === 'monthly' && (
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] text-slate-600 shrink-0">On day</p>
                      <input type="number" min={1} max={31} value={editRecurrenceMonthlyDay}
                        onChange={e => setEditRecurrenceMonthlyDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-16 h-8 rounded-lg border border-slate-200 text-sm px-2 bg-white text-center focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20" />
                      <p className="text-[11px] text-slate-400">of each month</p>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] text-slate-600 shrink-0">Ends on</p>
                    <input type="date" value={editRecurrenceEndDate} onChange={e => setEditRecurrenceEndDate(e.target.value)}
                      className="flex-1 h-8 rounded-lg border border-slate-200 text-sm px-2 bg-white focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20" />
                    {editRecurrenceEndDate && (
                      <button type="button" onClick={() => setEditRecurrenceEndDate('')} className="text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {!editRecurrenceEndDate && <p className="text-[10px] text-slate-400">optional</p>}
                  </div>
                </div>
              )}
            </div>

            {/* Priority + Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Priority</label>
                <select value={priority} onChange={e => setPriority(e.target.value as PersonalTaskPriority)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white">
                  {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Status</label>
                <select value={status} onChange={e => setStatus(e.target.value as PersonalTaskStatus)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white">
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Due Date */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Due date</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white" />
            </div>

            {/* Time tracking */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2.5">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Clock className="w-3 h-3" /> Time Tracking
              </p>
              <div className="grid grid-cols-2 gap-3">
                {/* Estimated hours — always editable */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Estimated hrs</label>
                  <input type="number" min="0" step="0.25" placeholder="0.0"
                    value={editEstimatedHours} onChange={e => setEditEstimatedHours(e.target.value)}
                    data-testid="edit-input-estimated-hours"
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white" />
                </div>
                {/* Actual hours — read-only except admin/CEO/COO/CTO */}
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1">
                    Actual hrs
                    {!canEditActualHours && <Lock className="w-2.5 h-2.5 text-slate-400" />}
                  </label>
                  {canEditActualHours ? (
                    <input type="number" min="0" step="0.25" placeholder="0.0"
                      value={editActualHours} onChange={e => setEditActualHours(e.target.value)}
                      data-testid="edit-input-actual-hours"
                      className="w-full h-9 px-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white" />
                  ) : (
                    <div className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white flex items-center text-sm text-slate-600" data-testid="display-actual-hours">
                      {task?.actualHours != null ? `${task.actualHours}h` : <span className="text-slate-300">Auto-tracked</span>}
                    </div>
                  )}
                </div>
              </div>
              {/* Timestamps */}
              {(task?.startedAt || task?.completedAt) && (
                <div className="flex flex-col gap-0.5 pt-1 border-t border-slate-200">
                  {task?.startedAt && (
                    <p className="text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-500">Started:</span>{' '}
                      {format(parseISO(task.startedAt), 'dd MMM yyyy, HH:mm')}
                    </p>
                  )}
                  {task?.completedAt && (
                    <p className="text-[10px] text-slate-400">
                      <span className="font-semibold text-slate-500">Completed:</span>{' '}
                      {format(parseISO(task.completedAt), 'dd MMM yyyy, HH:mm')}
                    </p>
                  )}
                </div>
              )}
              {!canEditActualHours && (
                <p className="text-[10px] text-slate-400">Actual hours are auto-calculated from start → completion time. Only Admin, CEO, COO, or CTO can override.</p>
              )}
            </div>

            {/* Assign to */}
            {canAssignOthers && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Assign to</label>
                <div className="flex gap-2 mb-2">
                  {(['myself', 'someone', 'dept'] as AssignTab[]).filter(t => t === 'myself' || canAssignOthers).map(tab => (
                    <button key={tab} onClick={() => { setAssignTab(tab); if (tab !== 'someone') setAssignedUser(null); if (tab !== 'dept') setAssignedDept(null); }}
                      className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
                        assignTab === tab ? 'bg-[#1D3461] text-white shadow-sm' : 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                      )}>
                      {tab === 'myself' && <><User className="w-3 h-3" />Myself</>}
                      {tab === 'someone' && <><Users className="w-3 h-3" />Someone else</>}
                      {tab === 'dept' && assignableDepts.length > 0 && <><Briefcase className="w-3 h-3" />Dept</>}
                    </button>
                  ))}
                </div>
                {assignTab === 'someone' && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50">
                      <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <input placeholder={isExec ? 'Search anyone…' : 'Search your department…'} value={assignSearch} onChange={e => setAssignSearch(e.target.value)}
                        className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400" />
                    </div>
                    {assignedUser && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border-b border-emerald-100">
                        <div className="w-6 h-6 rounded-full bg-emerald-200 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-emerald-700">{assignedUser.full_name[0].toUpperCase()}</span>
                        </div>
                        <span className="text-xs font-semibold text-emerald-800 flex-1">{assignedUser.full_name}</span>
                        <button onClick={() => setAssignedUser(null)}><X className="w-3.5 h-3.5 text-emerald-400 hover:text-red-500" /></button>
                      </div>
                    )}
                    <div className="max-h-32 overflow-y-auto">
                      {assignableUsers.map(u => (
                        <button key={u.id} onClick={() => { setAssignedUser({ id: u.id, full_name: u.full_name ?? '' }); setAssignSearch(''); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
                          <div className="w-6 h-6 rounded-full bg-[#1D3461]/10 flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-bold text-[#1D3461]">{(u.full_name ?? 'U')[0].toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{u.full_name}</p>
                            <p className="text-[10px] text-slate-400">{u.role}</p>
                          </div>
                          {assignedUser?.id === u.id && <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {assignTab === 'dept' && assignableDepts.length > 0 && (
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    {assignedDept && (
                      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-100">
                        <Briefcase className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="text-xs font-semibold text-blue-800 flex-1">{assignedDept.name}</span>
                        <button onClick={() => setAssignedDept(null)}><X className="w-3.5 h-3.5 text-blue-400 hover:text-red-500" /></button>
                      </div>
                    )}
                    <div className="max-h-32 overflow-y-auto">
                      {assignableDepts.map(dept => (
                        <button key={dept.id} onClick={() => setAssignedDept({ id: dept.id, name: dept.name })}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0">
                          <div className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                            <Briefcase className="w-3 h-3 text-blue-600" />
                          </div>
                          <span className="text-xs font-semibold text-slate-700 flex-1">{dept.name}</span>
                          {assignedDept?.id === dept.id && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Existing dependencies (read-only view) */}
            {task.dependencies?.length > 0 && (
              <div>
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
                  <ArrowRight className="w-3 h-3 text-slate-400" /> Dependencies
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {task.dependencies.map((d, i) => (
                    <span key={i} className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#1D3461]/10 text-xs text-[#1D3461] font-medium">
                      {typeof d === 'string' ? d : (d as { label?: string }).label ?? String(d)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Completion Reward */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-amber-500" />
                Completion Reward
                <span className="text-slate-400 font-normal normal-case tracking-normal">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input type="number" min="0" step="0.01" placeholder="0.00" value={reward} onChange={e => setReward(e.target.value)}
                  className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all bg-white" />
                <div className="h-10 px-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center text-sm font-semibold text-slate-500">USD</div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1.5 block">Notes</label>
              <textarea placeholder="Add internal notes…" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 focus:border-[#1D3461] transition-all resize-none" />
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100 bg-white shrink-0">
          <button
            onClick={() => { onDelete(task.id); onClose(); }}
            data-testid="edit-button-delete"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || isUpdating}
            data-testid="edit-button-save"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1D3461] hover:bg-[#0F2041] text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save Changes
          </button>
        </div>
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
            <RecurringBadge task={task} />
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
                <RecurringBadge task={task} compact />
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
            <RecurringBadge task={task} />
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
                <div className="flex items-center gap-1.5 shrink-0">
                  <RecurringBadge task={task} />
                  <div className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                    {cfg.label}
                  </div>
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
            <RecurringBadge task={task} />
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

// ── Planning Companion (full-page view) ───────────────────────────────────────

const DAILY_TIPS: { icon: string; tip: string; category: string }[] = [
  { icon: '🎯', tip: 'Start your day with the hardest task — your energy and focus peak in the morning.', category: 'Focus' },
  { icon: '⏱️', tip: 'Use the 2-minute rule: if a task takes less than 2 minutes, do it right now.', category: 'Efficiency' },
  { icon: '🔗', tip: 'Batch similar tasks together to reduce context-switching and keep your brain in one mode.', category: 'Productivity' },
  { icon: '📅', tip: 'Block 30 minutes at the end of each day to plan tomorrow\'s top 3 priorities.', category: 'Planning' },
  { icon: '🛑', tip: 'Say no to tasks that don\'t align with your key goals this week — your time is finite.', category: 'Focus' },
  { icon: '👥', tip: 'Delegate tasks that others can do 80% as well as you — your time is better spent on high-impact work.', category: 'Delegation' },
  { icon: '🏆', tip: 'Focus on outcomes, not activity — a task completed matters more than being busy all day.', category: 'Mindset' },
  { icon: '🧘', tip: 'Take a 5-minute break every 50 minutes — short rests restore focus and prevent burnout.', category: 'Wellbeing' },
  { icon: '📝', tip: 'Write your top 3 priorities before checking messages — protect your agenda from the start.', category: 'Planning' },
  { icon: '🔴', tip: 'Review overdue tasks first each morning — clearing blockers creates momentum and reduces stress.', category: 'Efficiency' },
  { icon: '🔇', tip: 'Protect deep work time by muting notifications for 2-hour blocks — focus compounds.', category: 'Focus' },
  { icon: '🚀', tip: 'A task not started is 100% incomplete — even 10 minutes of progress is infinitely better than zero.', category: 'Action' },
  { icon: '📢', tip: 'Communicate early when a deadline is at risk — surprises hurt more than delays.', category: 'Communication' },
  { icon: '🎉', tip: 'Celebrate small wins — checking off tasks builds momentum and reinforces good habits.', category: 'Mindset' },
  { icon: '⚡', tip: 'Do your most impactful task before lunch — afternoons are better suited for meetings and reviews.', category: 'Productivity' },
  { icon: '🔋', tip: 'Match task difficulty to your energy level — save creative work for your peak hours.', category: 'Wellbeing' },
  { icon: '📊', tip: 'Review your weekly completion rate every Friday — patterns show you where to improve.', category: 'Review' },
  { icon: '🌱', tip: 'Break large goals into small steps — a 10-step plan is far more achievable than one giant leap.', category: 'Planning' },
  { icon: '🧠', tip: 'Write tasks as actions (verb + noun): "Call Ahmed" is clearer than "Ahmed call" and easier to start.', category: 'Clarity' },
  { icon: '🔑', tip: 'Find the one task that would make everything else easier — do that first.', category: 'Focus' },
  { icon: '🗂️', tip: 'Keep your task list under 10 items per day — longer lists lead to decision fatigue.', category: 'Organization' },
];

const MOTIVATIONAL_QUOTES: { text: string; author: string }[] = [
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'You don\'t have to be great to start, but you have to start to be great.', author: 'Zig Ziglar' },
  { text: 'Do what you can, with what you have, where you are.', author: 'Theodore Roosevelt' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'Excellence is not a destination but a continuous journey that never ends.', author: 'Brian Tracy' },
  { text: 'The most urgent thing is seldom the most important.', author: 'Dwight D. Eisenhower' },
  { text: 'A goal without a plan is just a wish.', author: 'Antoine de Saint-Exupéry' },
  { text: 'Don\'t watch the clock; do what it does. Keep going.', author: 'Sam Levenson' },
  { text: 'Your work is going to fill a large part of your life — make it great.', author: 'Steve Jobs' },
  { text: 'Effort only fully releases its reward after a person refuses to quit.', author: 'Napoleon Hill' },
  { text: 'Productivity is never an accident. It is always the result of commitment to excellence.', author: 'Paul J. Meyer' },
  { text: 'Don\'t count the days. Make the days count.', author: 'Muhammad Ali' },
  { text: 'The key is not to prioritize your schedule, but to schedule your priorities.', author: 'Stephen Covey' },
  { text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall' },
  { text: 'Success is the sum of small efforts repeated day in and day out.', author: 'Robert Collier' },
  { text: 'Either you run the day, or the day runs you.', author: 'Jim Rohn' },
  { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
  { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { text: 'What you do today can improve all your tomorrows.', author: 'Ralph Marston' },
  { text: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { text: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
];

type QuadrantKey = 'do' | 'schedule' | 'delegate' | 'drop';

const QUADRANT_CFG: Record<QuadrantKey, {
  label: string; subtitle: string; emoji: string;
  headerBg: string; headerText: string; bg: string;
  border: string; chip: string; dot: string;
}> = {
  do: {
    label: 'Do Now', subtitle: 'Urgent + Important',
    emoji: '🔴',
    headerBg: 'bg-red-500', headerText: 'text-white',
    bg: 'bg-red-50 dark:bg-red-950/20',
    border: 'border-red-200 dark:border-red-800',
    chip: 'bg-red-100 text-red-700 border border-red-200',
    dot: 'bg-red-500',
  },
  schedule: {
    label: 'Schedule', subtitle: 'Important, Not Urgent',
    emoji: '🔵',
    headerBg: 'bg-blue-500', headerText: 'text-white',
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    border: 'border-blue-200 dark:border-blue-800',
    chip: 'bg-blue-100 text-blue-700 border border-blue-200',
    dot: 'bg-blue-500',
  },
  delegate: {
    label: 'Delegate', subtitle: 'Urgent, Not Important',
    emoji: '🟡',
    headerBg: 'bg-amber-400', headerText: 'text-amber-900',
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    border: 'border-amber-200 dark:border-amber-800',
    chip: 'bg-amber-100 text-amber-700 border border-amber-200',
    dot: 'bg-amber-400',
  },
  drop: {
    label: 'Consider Dropping', subtitle: 'Low Priority, Not Urgent',
    emoji: '⚫',
    headerBg: 'bg-slate-400', headerText: 'text-white',
    bg: 'bg-slate-50 dark:bg-slate-800/30',
    border: 'border-slate-200 dark:border-slate-700',
    chip: 'bg-slate-100 text-slate-600 border border-slate-200',
    dot: 'bg-slate-400',
  },
};

type SubViewKey = 'cards' | 'kanban' | 'timeline' | 'planner' | 'inbox';
interface PlanningCompanionProps {
  tasks: PersonalTask[];
  projectTasks: { id: string | number; title: string | null; priority: string | null; dueDate: string | null; status: string | null; projectName: string | null; category: string | null }[];
  isLoading: boolean;
  onMarkPersonalDone: (id: string, status: PersonalTaskStatus) => Promise<void>;
  onMarkProjectDone: (id: string) => Promise<void>;
  onOpenNewTask: () => void;
  currentUserFullName?: string | null;
  overallPct: number;
  totalDone: number;
  totalAll: number;
  overdueCount: number;
  onSwitchView: (view: SubViewKey) => void;
}

function PlanningCompanion({
  tasks, projectTasks, isLoading,
  onMarkPersonalDone, onMarkProjectDone, onOpenNewTask,
  currentUserFullName, overallPct, totalDone, totalAll, overdueCount,
  onSwitchView,
}: PlanningCompanionProps) {
  const now = new Date();
  const hour = now.getHours();
  const dayIdx = Math.floor(Date.now() / 86400000);
  const dailyTip = DAILY_TIPS[dayIdx % DAILY_TIPS.length];
  const quote = MOTIVATIONAL_QUOTES[dayIdx % MOTIVATIONAL_QUOTES.length];
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const GreetIcon = hour < 12 ? Coffee : hour < 17 ? Sun : Moon;
  const dateLabel = format(now, 'EEEE, d MMMM yyyy');

  const [markingDone, setMarkingDone] = useState<Set<string>>(new Set());

  type PlanItem = { id: string; title: string; project: string; priority: string; dueDate: string | null; type: 'personal' | 'project'; status: string; quadrant: QuadrantKey };

  const allCategorized = useMemo((): PlanItem[] => {
    function classify(dueDate: string | null | undefined, priority: string, status: string, manual?: QuadrantKey | null): QuadrantKey {
      if (manual === 'do' || manual === 'schedule' || manual === 'delegate' || manual === 'drop') return manual;
      const isHigh = priority === 'critical' || priority === 'high';
      const ov = dueDate && isValid(parseISO(dueDate)) && isBefore(parseISO(dueDate), startOfDay(now)) && status !== 'done' && status !== 'cancelled';
      const td = dueDate && isValid(parseISO(dueDate)) && isToday(parseISO(dueDate));
      if (isHigh && (ov || td)) return 'do';
      if (isHigh) return 'schedule';
      if (ov || td) return 'delegate';
      return 'drop';
    }
    const personal = tasks
      .filter(t => t.status !== 'done' && t.status !== 'cancelled')
      .map(t => ({
        id: t.id,
        title: String(t.title),
        project: t.category ?? 'Personal',
        priority: t.priority,
        dueDate: t.dueDate ?? null,
        type: 'personal' as const,
        status: t.status,
        quadrant: classify(t.dueDate, t.priority, t.status, t.planningQuadrant),
      }));
    const project = projectTasks
      .filter(t => t.status !== 'done' && t.status !== 'cancelled')
      .map(t => ({
        id: String(t.id),
        title: String(t.title ?? 'Project task'),
        project: t.projectName ?? 'Project',
        priority: t.priority ?? 'medium',
        dueDate: t.dueDate ?? null,
        type: 'project' as const,
        status: t.status ?? 'todo',
        quadrant: classify(t.dueDate, t.priority ?? 'medium', t.status ?? 'todo'),
      }));
    return [...personal, ...project];
  }, [tasks, projectTasks]);

  const quadrants = useMemo(() => ({
    do: allCategorized.filter(t => t.quadrant === 'do'),
    schedule: allCategorized.filter(t => t.quadrant === 'schedule'),
    delegate: allCategorized.filter(t => t.quadrant === 'delegate'),
    drop: allCategorized.filter(t => t.quadrant === 'drop'),
  }), [allCategorized]);

  const focusTask = quadrants.do[0] ?? quadrants.schedule[0] ?? null;

  async function handleMark(item: PlanItem) {
    setMarkingDone(prev => new Set(prev).add(item.id));
    try {
      if (item.type === 'personal') await onMarkPersonalDone(item.id, item.status as PersonalTaskStatus);
      else await onMarkProjectDone(item.id);
    } finally {
      setMarkingDone(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  }

  const firstName = currentUserFullName?.split(' ')[0] ?? 'there';

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-[#1D3461]/40" />
    </div>
  );

  return (
    <div className="flex-1 overflow-auto min-h-0 bg-slate-50 dark:bg-slate-900">
      <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col gap-6">

        {/* ── Hero greeting ─────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-gradient-to-r from-[#0F2041] to-[#1D3461] px-6 py-5 flex items-center gap-5 shadow-lg">
          <div className="shrink-0 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
            <GreetIcon className="w-6 h-6 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-sm font-medium">{dateLabel}</p>
            <h2 className="text-white text-xl font-bold mt-0.5">{greeting}, {firstName}!</h2>
            <p className="text-white/60 text-xs mt-1">
              {totalAll === 0
                ? 'Your task list is clear — great time to plan ahead.'
                : `You have ${totalAll - totalDone} tasks remaining${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}.`}
            </p>
          </div>
          {/* Progress ring area */}
          <div className="shrink-0 text-right">
            <div className="text-3xl font-black text-white">{overallPct}%</div>
            <div className="text-white/60 text-xs">done today</div>
            <div className="mt-1.5 w-32 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-300 to-emerald-400 rounded-full transition-all duration-700" style={{ width: `${overallPct}%` }} />
            </div>
          </div>
        </div>

        {/* ── Stat chips ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          {((['do', 'schedule', 'delegate', 'drop'] as QuadrantKey[])).map(k => {
            const cfg = QUADRANT_CFG[k];
            const count = quadrants[k].length;
            return (
              <div key={k} className={cn('rounded-xl border p-3 flex items-center gap-3', cfg.bg, cfg.border)}>
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0', cfg.headerBg, cfg.headerText)}>
                  {cfg.emoji}
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-black text-slate-800 dark:text-slate-100">{count}</div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide truncate">{cfg.label}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Main layout: left + right ─────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-5">

          {/* Left: Focus + Quadrant cards */}
          <div className="col-span-2 flex flex-col gap-5">

            {/* Focus Now */}
            <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 overflow-hidden shadow-sm">
              <div className="px-5 py-3 bg-gradient-to-r from-[#1D3461] to-[#0F2041] flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-bold text-white uppercase tracking-widest">Focus Right Now</span>
              </div>
              {focusTask ? (
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className={cn('w-1.5 rounded-full self-stretch shrink-0', focusTask.quadrant === 'do' ? 'bg-red-500' : 'bg-blue-500')} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', QUADRANT_CFG[focusTask.quadrant].chip)}>
                          {focusTask.quadrant === 'do' ? '⚡ Urgent' : '📋 Important'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">{focusTask.project}</span>
                      </div>
                      <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug">{focusTask.title}</h3>
                      {focusTask.dueDate && isValid(parseISO(focusTask.dueDate)) && (
                        <p className={cn('text-xs mt-1 font-medium flex items-center gap-1',
                          isBefore(parseISO(focusTask.dueDate), startOfDay(now)) ? 'text-red-500' : 'text-slate-400'
                        )}>
                          <Clock className="w-3 h-3" />
                          {isBefore(parseISO(focusTask.dueDate), startOfDay(now)) ? 'Overdue · ' : ''}
                          {format(parseISO(focusTask.dueDate), 'd MMM yyyy')}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => handleMark(focusTask)}
                          disabled={markingDone.has(focusTask.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D3461] hover:bg-[#0F2041] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                          data-testid="button-focus-done"
                        >
                          {markingDone.has(focusTask.id) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Mark Done
                        </button>
                        <button onClick={onOpenNewTask} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors" data-testid="button-add-from-focus">
                          <Plus className="w-3 h-3" /> Add Task
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 flex flex-col items-center text-center gap-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">All caught up!</p>
                  <p className="text-xs text-slate-400">No urgent tasks right now. Great work.</p>
                  <button onClick={onOpenNewTask} className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors" data-testid="button-add-from-empty-focus">
                    <Plus className="w-3 h-3" /> Add a Task
                  </button>
                </div>
              )}
            </div>

            {/* 2×2 Quadrant grid */}
            <div className="grid grid-cols-2 gap-4">
              {(['do', 'schedule', 'delegate', 'drop'] as QuadrantKey[]).map(k => {
                const cfg = QUADRANT_CFG[k];
                const items = quadrants[k];
                return (
                  <div key={k} className={cn('rounded-2xl border overflow-hidden shadow-sm', cfg.bg, cfg.border)}>
                    <div className={cn('px-4 py-2.5 flex items-center justify-between', cfg.headerBg, cfg.headerText)}>
                      <div>
                        <p className="text-xs font-black uppercase tracking-wide">{cfg.emoji} {cfg.label}</p>
                        <p className="text-[10px] opacity-80">{cfg.subtitle}</p>
                      </div>
                      <span className={cn('text-sm font-black opacity-90', cfg.headerText)}>{items.length}</span>
                    </div>
                    <div className="p-3 flex flex-col gap-2 min-h-[90px]">
                      {items.length === 0 ? (
                        <p className="text-xs text-slate-400 italic text-center py-4">No tasks here</p>
                      ) : (
                        <>
                          {items.slice(0, 5).map(item => {
                            const due = item.dueDate && isValid(parseISO(item.dueDate)) ? parseISO(item.dueDate) : null;
                            const isOverdue = due ? isBefore(due, startOfDay(now)) : false;
                            return (
                              <div key={item.id} className="group flex items-start gap-2 rounded-lg bg-white/70 border border-white/80 px-2.5 py-2 hover:bg-white hover:shadow-sm transition-all">
                                <div className={cn('w-1.5 h-1.5 rounded-full shrink-0 mt-1.5', cfg.dot)} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">{item.title}</p>
                                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                    {due && (
                                      <span className={cn('text-[10px] flex items-center gap-0.5 font-medium', isOverdue ? 'text-red-500' : 'text-slate-400')}>
                                        <Clock className="w-2.5 h-2.5" />
                                        {isOverdue ? 'Overdue · ' : ''}{format(due, 'd MMM')}
                                      </span>
                                    )}
                                    {item.priority && item.priority !== 'medium' && item.priority !== 'normal' && (
                                      <span className={cn('text-[10px] px-1.5 py-0 rounded-full font-semibold border',
                                        (item.priority === 'high' || item.priority === 'urgent') ? 'bg-red-50 text-red-600 border-red-200' : 'bg-slate-50 text-slate-400 border-slate-200'
                                      )}>
                                        {item.priority}
                                      </span>
                                    )}
                                    {item.project && item.project !== 'Personal' && (
                                      <span className="text-[10px] text-slate-400 truncate max-w-[90px]" title={item.project}>{item.project}</span>
                                    )}
                                    {item.type === 'personal' && (
                                      <span className="text-[10px] text-slate-400 italic">personal</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleMark(item)}
                                  disabled={markingDone.has(item.id)}
                                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-white/60 mt-0.5"
                                  title="Mark done"
                                  data-testid={`button-quadrant-done-${item.id}`}
                                >
                                  {markingDone.has(item.id) ? <Loader2 className="w-3 h-3 animate-spin text-slate-400" /> : <CheckCircle2 className="w-3 h-3 text-slate-400 hover:text-emerald-500" />}
                                </button>
                              </div>
                            );
                          })}
                          {items.length > 5 && (
                            <button
                              onClick={() => onSwitchView?.('cards')}
                              className="text-[10px] text-slate-500 font-semibold mt-0.5 hover:text-[#1D3461] transition-colors text-left"
                              data-testid={`button-quadrant-more-${k}`}
                            >
                              +{items.length - 5} more · view all →
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Right column: Tip + Quote + Stats */}
          <div className="flex flex-col gap-4">

            {/* Today's Tip */}
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-amber-400 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-900" />
                <span className="text-xs font-black text-amber-900 uppercase tracking-widest">Today's Tip</span>
                <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-300 text-amber-900 font-bold">{dailyTip.category}</span>
              </div>
              <div className="p-4">
                <div className="text-2xl mb-2">{dailyTip.icon}</div>
                <p className="text-sm text-amber-900 leading-relaxed font-medium">{dailyTip.tip}</p>
              </div>
            </div>

            {/* Motivational Quote */}
            <div className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-[#1D3461] flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-300" />
                <span className="text-xs font-black text-white uppercase tracking-widest">Daily Motivation</span>
              </div>
              <div className="p-4">
                <p className="text-sm text-indigo-900 dark:text-indigo-200 leading-relaxed font-medium italic">"{quote.text}"</p>
                <p className="text-[11px] text-indigo-500 font-bold mt-2">— {quote.author}</p>
              </div>
            </div>

            {/* Progress card */}
            <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 overflow-hidden shadow-sm">
              <div className="px-4 py-3 bg-slate-700 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-slate-200" />
                <span className="text-xs font-black text-white uppercase tracking-widest">Today's Progress</span>
              </div>
              <div className="p-4 flex flex-col gap-3">
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-semibold text-slate-500">Completion</span>
                    <span className={cn('text-sm font-black', overallPct === 100 ? 'text-emerald-600' : 'text-[#1D3461]')}>{overallPct}%</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full transition-all duration-700" style={{ width: `${overallPct}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-700 p-2">
                    <div className="text-lg font-black text-slate-700 dark:text-slate-100">{totalAll - totalDone}</div>
                    <div className="text-[9px] text-slate-400 uppercase font-semibold tracking-wide">Active</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/30 p-2">
                    <div className="text-lg font-black text-emerald-600">{totalDone}</div>
                    <div className="text-[9px] text-emerald-500 uppercase font-semibold tracking-wide">Done</div>
                  </div>
                  <div className={cn('rounded-xl p-2', overdueCount > 0 ? 'bg-red-50 dark:bg-red-900/30' : 'bg-slate-50 dark:bg-slate-700')}>
                    <div className={cn('text-lg font-black', overdueCount > 0 ? 'text-red-600' : 'text-slate-400')}>{overdueCount}</div>
                    <div className={cn('text-[9px] uppercase font-semibold tracking-wide', overdueCount > 0 ? 'text-red-400' : 'text-slate-400')}>Overdue</div>
                  </div>
                </div>
                {overdueCount > 0 && (
                  <div className="flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <p className="text-xs text-red-600 font-medium">{overdueCount} task{overdueCount > 1 ? 's' : ''} past due — address these first.</p>
                  </div>
                )}
              </div>
            </div>

            {/* Task Views quick access */}
            <div className="rounded-2xl border border-slate-200 bg-white dark:bg-slate-800 dark:border-slate-700 overflow-hidden shadow-sm">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-700 border-b border-slate-100 dark:border-slate-600 flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest">Task Views</span>
                <span className="ml-auto text-[10px] text-slate-400">Open a view →</span>
              </div>
              <div className="p-3 grid grid-cols-5 gap-2">
                {([
                  { key: 'cards'    as SubViewKey, label: 'Task Cards',    Icon: ListTodo, color: 'text-blue-600',   bg: 'bg-blue-50   hover:bg-blue-100   dark:bg-blue-900/20' },
                  { key: 'kanban'   as SubViewKey, label: 'Kanban',        Icon: Columns2, color: 'text-purple-600', bg: 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20' },
                  { key: 'timeline' as SubViewKey, label: 'Timeline',      Icon: Calendar, color: 'text-teal-600',   bg: 'bg-teal-50   hover:bg-teal-100   dark:bg-teal-900/20' },
                  { key: 'planner'  as SubViewKey, label: 'Planner',       Icon: Sun,      color: 'text-amber-600', bg: 'bg-amber-50  hover:bg-amber-100  dark:bg-amber-900/20' },
                  { key: 'inbox'    as SubViewKey, label: 'Inbox',         Icon: Inbox,    color: 'text-slate-600', bg: 'bg-slate-50  hover:bg-slate-100  dark:bg-slate-700' },
                ]).map(v => (
                  <button
                    key={v.key}
                    onClick={() => onSwitchView(v.key)}
                    data-testid={`planning-open-${v.key}`}
                    className={cn('flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors', v.bg)}
                  >
                    <v.Icon className={cn('w-5 h-5', v.color)} />
                    <span className={cn('text-[10px] font-bold leading-tight text-center', v.color)}>{v.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick add */}
            <button
              onClick={onOpenNewTask}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#1D3461] text-slate-400 hover:text-[#1D3461] font-semibold text-sm transition-all"
              data-testid="button-planning-add"
            >
              <Plus className="w-4 h-4" /> Add New Task
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}

// ── Inbox View ────────────────────────────────────────────────────────────────

const INBOX_CAT_CFG: Record<string, { initials: string; bg: string; from: string }> = {
  project:   { initials: 'PR', bg: 'bg-blue-700',   from: 'Project' },
  personal:  { initials: 'ME', bg: 'bg-purple-600', from: 'Personal' },
  recurring: { initials: 'RC', bg: 'bg-teal-600',   from: 'Recurring' },
};

const INBOX_PRIO_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-amber-400', low: 'bg-sky-400',
};

type InboxFolder = 'all' | 'overdue' | 'today' | 'high' | 'project' | 'personal' | 'recurring' | 'done';

interface InboxViewProps {
  tasks: PersonalTask[];
  isLoading: boolean;
  isUpdating: boolean;
  onEdit: (task: PersonalTask) => void;
  onToggleDone: (task: PersonalTask) => void;
  onSave: (id: string, data: Partial<PersonalTask>) => Promise<void>;
  onAddTask: () => void;
}

function InboxView({ tasks, isLoading, isUpdating, onEdit, onToggleDone, onSave, onAddTask }: InboxViewProps) {
  const [activeFolder, setActiveFolder] = useState<InboxFolder>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteText, setNoteText]   = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const nonCancelled = useMemo(() => tasks.filter(t => t.status !== 'cancelled'), [tasks]);

  const folderTasks = useMemo(() => {
    switch (activeFolder) {
      case 'overdue':  return nonCancelled.filter(t => isOverdue(t.dueDate, t.status));
      case 'today':    return nonCancelled.filter(t => {
        if (!t.dueDate) return false;
        try { const d = parseISO(t.dueDate); return isValid(d) && isToday(d); } catch { return false; }
      });
      case 'high':     return nonCancelled.filter(t => t.priority === 'critical' || t.priority === 'high');
      case 'project':  return nonCancelled.filter(t => (t.category ?? '').toLowerCase() === 'project');
      case 'personal': return nonCancelled.filter(t => (t.category ?? '').toLowerCase() === 'personal');
      case 'recurring':return nonCancelled.filter(t => !!t.dailyTaskDate || !!(t.recurrence && t.recurrence !== 'none'));
      case 'done':     return tasks.filter(t => t.status === 'done');
      default:         return nonCancelled;
    }
  }, [tasks, nonCancelled, activeFolder]);

  const selected = useMemo(() => {
    const found = selectedId ? folderTasks.find(t => t.id === selectedId) : null;
    return found ?? folderTasks[0] ?? null;
  }, [selectedId, folderTasks]);

  useEffect(() => {
    setNoteText(selected?.notes ?? '');
  }, [selected?.id]);

  const navItems: { key: InboxFolder; icon: typeof Inbox; label: string; count: number }[] = [
    { key: 'all',       icon: Inbox,         label: 'All Tasks',     count: nonCancelled.length },
    { key: 'overdue',   icon: AlertTriangle,  label: 'Overdue',       count: nonCancelled.filter(t => isOverdue(t.dueDate, t.status)).length },
    { key: 'today',     icon: Clock,          label: 'Due Today',     count: nonCancelled.filter(t => { try { const d = parseISO(t.dueDate ?? ''); return isValid(d) && isToday(d); } catch { return false; } }).length },
    { key: 'high',      icon: Flag,           label: 'High Priority', count: nonCancelled.filter(t => t.priority === 'critical' || t.priority === 'high').length },
    { key: 'project',   icon: Briefcase,      label: 'Project',       count: nonCancelled.filter(t => (t.category ?? '').toLowerCase() === 'project').length },
    { key: 'personal',  icon: User,           label: 'Personal',      count: nonCancelled.filter(t => (t.category ?? '').toLowerCase() === 'personal').length },
    { key: 'recurring', icon: RefreshCw,      label: 'Recurring',     count: nonCancelled.filter(t => !!t.dailyTaskDate || !!(t.recurrence && t.recurrence !== 'none')).length },
    { key: 'done',      icon: Archive,        label: 'Done',          count: tasks.filter(t => t.status === 'done').length },
  ];

  const getAvatarCfg = (task: PersonalTask) => {
    const key = (task.category ?? '').toLowerCase();
    return INBOX_CAT_CFG[key] ?? {
      initials: (task.category ?? task.title).substring(0, 2).toUpperCase(),
      bg: 'bg-slate-500',
      from: task.category ?? 'Task',
    };
  };

  const getDueLabel = (task: PersonalTask): { label: string; overdue: boolean } => {
    if (!task.dueDate) return { label: '', overdue: false };
    try {
      const d = parseISO(task.dueDate);
      if (!isValid(d)) return { label: '', overdue: false };
      if (isToday(d)) return { label: 'Today', overdue: false };
      return { label: format(d, 'MMM dd'), overdue: isOverdue(task.dueDate, task.status) };
    } catch { return { label: '', overdue: false }; }
  };

  const handleSaveNote = async () => {
    if (!selected || savingNote) return;
    setSavingNote(true);
    try { await onSave(selected.id, { notes: noteText }); } finally { setSavingNote(false); }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 overflow-hidden bg-white">

      {/* ── Left folder nav ── */}
      <aside className="w-[180px] bg-[#fafaf9] border-r border-slate-100 flex flex-col shrink-0">
        <div className="p-2 flex-1 overflow-y-auto pt-3">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeFolder === item.key;
            return (
              <button
                key={item.key}
                onClick={() => { setActiveFolder(item.key); setSelectedId(null); }}
                data-testid={`inbox-folder-${item.key}`}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-0.5 text-left transition-colors',
                  isActive ? 'bg-[#e8edf5] text-[#1D3461]' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-[12px] font-medium">{item.label}</span>
                {item.count > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 rounded-full',
                    isActive ? 'bg-[#1D3461] text-white' : 'text-slate-400',
                  )}>{item.count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t border-slate-100">
          <button
            onClick={onAddTask}
            data-testid="inbox-new-task"
            className="w-full flex items-center gap-1.5 justify-center py-2 bg-[#1D3461] text-white rounded-lg text-[12px] font-semibold hover:bg-[#0F2041] transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Task
          </button>
        </div>
      </aside>

      {/* ── Task list ── */}
      <div className="w-[320px] border-r border-slate-100 flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
          <span className="text-[13px] font-bold text-slate-700 flex-1">
            {navItems.find(n => n.key === activeFolder)?.label ?? 'All Tasks'}
            <span className="text-slate-400 font-normal text-[12px] ml-1">({folderTasks.length})</span>
          </span>
        </div>

        {/* Overdue banner */}
        {activeFolder === 'all' && nonCancelled.filter(t => isOverdue(t.dueDate, t.status)).length > 0 && (
          <div className="bg-red-50 border-b border-red-100 px-4 py-1.5 text-[11px] text-red-700 font-medium flex items-center gap-1.5 shrink-0">
            <AlertTriangle className="w-3 h-3 shrink-0" />
            {nonCancelled.filter(t => isOverdue(t.dueDate, t.status)).length} overdue — action needed
          </div>
        )}

        {folderTasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
            <CheckCircle2 className="w-10 h-10 text-emerald-200 mb-3" />
            <p className="text-sm font-semibold text-slate-500">All clear here!</p>
            <p className="text-xs text-slate-400 mt-1">No tasks in this folder.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
            {folderTasks.map(task => {
              const av = getAvatarCfg(task);
              const { label: dueLabel, overdue: overdueFlag } = getDueLabel(task);
              const isSelected = selected?.id === task.id;
              const isDone = task.status === 'done';
              const taskOverdue = isOverdue(task.dueDate, task.status);
              return (
                <div
                  key={task.id}
                  onClick={() => setSelectedId(task.id)}
                  data-testid={`inbox-row-${task.id}`}
                  className={cn(
                    'px-4 py-3 cursor-pointer transition-colors group',
                    isSelected ? 'bg-[#e8edf5]' : 'hover:bg-slate-50',
                    isDone && 'opacity-60',
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0', av.bg)}>
                      {av.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        {taskOverdue && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
                        <span className={cn('text-[12px] truncate', taskOverdue ? 'font-bold text-red-700' : 'font-medium text-slate-600')}>
                          {av.from}
                        </span>
                      </div>
                    </div>
                    <span className={cn('text-[10px] shrink-0', overdueFlag ? 'text-red-600 font-bold' : 'text-slate-400')}>
                      {dueLabel}
                    </span>
                  </div>
                  <div className="pl-9">
                    <p className={cn('text-[12px] truncate', isDone ? 'line-through text-slate-400' : 'font-semibold text-slate-800')}>{task.title}</p>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{task.description ?? task.notes ?? 'No description added'}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', INBOX_PRIO_DOT[task.priority] ?? 'bg-slate-300')} />
                      {(task.tags ?? []).slice(0, 2).map(tag => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Reading pane ── */}
      {selected ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Actions toolbar */}
          <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
            <button
              onClick={() => onToggleDone(selected)}
              disabled={isUpdating}
              data-testid="inbox-mark-done"
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50',
                selected.status === 'done'
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : 'bg-[#1D3461] text-white hover:bg-[#0F2041]',
              )}
            >
              <CheckCircle2 className="w-4 h-4" />
              {selected.status === 'done' ? 'Mark Incomplete' : 'Mark Done'}
            </button>
            <button
              onClick={() => onEdit(selected)}
              data-testid="inbox-edit-task"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[12px] hover:bg-slate-50 transition-colors"
            >
              <Edit2 className="w-4 h-4" /> Edit
            </button>
            <button
              className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 ml-auto"
              onClick={() => onEdit(selected)}
              data-testid="inbox-more-actions"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Task content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Overdue alert */}
            {isOverdue(selected.dueDate, selected.status) && (
              <div className="flex items-center gap-2 mb-4 text-red-600 bg-red-50 rounded-lg px-4 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="text-[12px] font-semibold">
                  This task is overdue{selected.dueDate && ` since ${(() => { try { return format(parseISO(selected.dueDate), 'dd MMM yyyy'); } catch { return selected.dueDate; } })()}`}
                </span>
              </div>
            )}

            {/* Title */}
            <h2 className="text-[20px] font-bold text-slate-900 leading-snug mb-4">{selected.title}</h2>

            {/* Meta row */}
            <div className="flex items-center gap-4 text-[12px] mb-5 pb-5 border-b border-slate-100 flex-wrap">
              {(() => {
                const av = getAvatarCfg(selected);
                const { label: dueLabel, overdue: overdueFlag } = getDueLabel(selected);
                return (
                  <>
                    <div className="flex items-center gap-2">
                      <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0', av.bg)}>
                        {av.initials}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-700">{av.from}</p>
                        <p className="text-slate-400 text-[10px] capitalize">{selected.category ?? 'General'} task</p>
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-4 text-slate-500">
                      {dueLabel && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>Due: <span className={cn('font-semibold', overdueFlag ? 'text-red-600' : '')}>{dueLabel}</span></span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <div className={cn('w-2 h-2 rounded-full', INBOX_PRIO_DOT[selected.priority] ?? 'bg-slate-300')} />
                        <span className="capitalize">{PRIORITY_CFG[selected.priority as keyof typeof PRIORITY_CFG]?.label ?? selected.priority} priority</span>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Tags */}
            {(selected.tags ?? []).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-5">
                {(selected.tags ?? []).map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-medium">{tag}</span>
                ))}
              </div>
            )}

            {/* Description */}
            {selected.description && (
              <div className="bg-slate-50 rounded-xl p-5 mb-5">
                <p className="text-[14px] text-slate-700 leading-relaxed">{selected.description}</p>
              </div>
            )}

            {/* Notes area */}
            <div className="border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 mb-2">Notes / Comments</p>
              <textarea
                className="w-full bg-transparent text-[13px] text-slate-700 outline-none resize-none placeholder:text-slate-300"
                rows={4}
                placeholder="Add a note about this task…"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                data-testid="inbox-note-textarea"
              />
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                <span className="text-[10px] text-slate-400">Notes are saved to this task</span>
                <button
                  onClick={handleSaveNote}
                  disabled={savingNote || noteText === (selected.notes ?? '')}
                  data-testid="inbox-save-note"
                  className="px-4 py-1.5 bg-[#1D3461] text-white rounded-lg text-[12px] font-semibold hover:bg-[#0F2041] transition-colors disabled:opacity-40"
                >
                  {savingNote ? 'Saving…' : 'Save Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-center px-8">
          <div>
            <Inbox className="w-12 h-12 text-slate-200 mb-4 mx-auto" />
            <p className="text-sm font-semibold text-slate-400">Select a task to view details</p>
          </div>
        </div>
      )}
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
  const [mainView, setMainView] = useState<'cards' | 'timeline' | 'planner' | 'kanban' | 'inbox' | 'planning'>('planning');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'personal' | 'project' | 'recurring'>('all');
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

  // Helper: a task is "recurring" if it was generated from a template (dailyTaskDate)
  // OR if the user explicitly set a recurrence schedule on it
  const isRecurringTask = (t: PersonalTask) =>
    !!t.dailyTaskDate || (!!t.recurrence && t.recurrence !== 'none');

  // Category counts for sidebar
  const recurringTasks = tasks.filter(isRecurringTask);
  const personalTasks  = tasks.filter(t => !isRecurringTask(t) && t.category !== 'project-task');

  // Category-filtered tasks (on top of status/search filter)
  const categoryFiltered = useMemo(() => {
    if (categoryFilter === 'all') return filteredTasks;
    if (categoryFilter === 'personal') return filteredTasks.filter(t => !isRecurringTask(t) && t.category !== 'project-task');
    if (categoryFilter === 'project') return filteredTasks.filter(t => t.category === 'project-task');
    if (categoryFilter === 'recurring') return filteredTasks.filter(isRecurringTask);
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
  const handleCreate = async (data: {
    title: string; priority: PersonalTaskPriority; status: PersonalTaskStatus;
    dueDate: string; description: string;
    taskType: 'project-task' | 'day-to-day' | null;
    category: string | null; notes: string;
    assignedToUserId?: string | null;
    assignedToUserName?: string | null;
    targetDeptId?: string | null;
    rewardAmount?: number | null;
    structuredDeps?: Array<{ type: string; label: string; requiresAck: boolean }>;
    planningQuadrant?: QuadrantKey | null;
    recurrence?: string;
    recurrenceDays?: number[];
    recurrenceMonthlyDay?: number | null;
    recurrenceEndDate?: string | null;
    estimatedHours?: number | null;
  }) => {
    try {
      await createTask({
        title: data.title, priority: data.priority, status: data.status,
        dueDate: data.dueDate || null, description: data.description || null,
        taskType: data.taskType, category: data.category,
        notes: data.notes || null,
        assignedTo: data.assignedToUserId ?? null,
        assignedToName: data.assignedToUserName ?? null,
        targetDepartmentId: data.targetDeptId ?? null,
        completionRewardAmount: data.rewardAmount ?? null,
        completionRewardCurrency: data.rewardAmount ? 'USD' : null,
        dependencies: data.structuredDeps?.length
          ? data.structuredDeps.map(d => ({ label: d.label, type: d.type, requiresAck: d.requiresAck }))
          : undefined,
        planningQuadrant: data.planningQuadrant ?? null,
        recurrence: data.recurrence ?? 'none',
        recurrenceDays: data.recurrenceDays ?? [],
        recurrenceMonthlyDay: data.recurrenceMonthlyDay ?? null,
        recurrenceEndDate: data.recurrenceEndDate ?? null,
        estimatedHours: data.estimatedHours ?? null,
      });
      // Notify assigned user if task was delegated to someone else
      if (data.assignedToUserId && data.assignedToUserId !== userId) {
        notify({ event: 'task_assigned', taskId: '', taskTitle: data.title, recipientUserId: data.assignedToUserId, dueDate: data.dueDate || null });
      }
      setShowAdd(false);
      toast({ title: data.assignedToUserName ? `Task assigned to ${data.assignedToUserName}` : 'Task created' });
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
            <h1 className="text-lg font-bold tracking-tight text-[#0F2041]">My Tasks</h1>
            <div className="h-5 w-px bg-slate-200 shrink-0" />
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
              <span>{stats.all} active</span>
              <span className="text-slate-300">·</span>
              <span>{stats.done} done</span>
              {stats.overdue > 0 && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-red-500 font-semibold">{stats.overdue} overdue</span>
                </>
              )}
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

        {/* ── Workspace ── */}
        <div className="flex-1 flex overflow-hidden">

          {/* ══ CENTER: Main task content area ══ */}
          <div className="flex-1 flex flex-col overflow-hidden min-w-0">

            {/* ── View Navigation — always visible ── */}
            <div className="border-b border-slate-200 bg-white shrink-0 shadow-sm">

              {/* Row 1 — Primary view tabs */}
              <div className="h-11 flex items-center px-3 gap-0.5 overflow-x-auto scrollbar-none">
                {([
                  { key: 'planning'  as const, label: 'Planning',     Icon: Brain    },
                  { key: 'cards'     as const, label: 'Task Cards',   Icon: ListTodo },
                  { key: 'kanban'    as const, label: 'Kanban',       Icon: Columns2 },
                  { key: 'timeline'  as const, label: 'Timeline',     Icon: Calendar },
                  { key: 'planner'   as const, label: 'Daily Planner',Icon: Sun      },
                  { key: 'inbox'     as const, label: 'Inbox',        Icon: Inbox    },
                ] as const).map(v => {
                  const isActive = mainView === v.key;
                  return (
                    <button
                      key={v.key}
                      onClick={() => setMainView(v.key)}
                      data-testid={`view-switch-${v.key}`}
                      className={cn(
                        'relative flex items-center gap-1.5 px-3.5 h-full text-[12px] font-semibold transition-all whitespace-nowrap shrink-0 border-b-2',
                        isActive
                          ? 'border-[#1D3461] text-[#1D3461] bg-[#1D3461]/[0.04]'
                          : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50',
                      )}
                    >
                      <v.Icon className={cn('w-3.5 h-3.5 shrink-0', isActive ? 'text-[#1D3461]' : 'text-slate-400')} />
                      {v.label}
                    </button>
                  );
                })}

                {/* Week navigation — timeline view only (pushed to right) */}
                {mainView === 'timeline' && (
                  <div className="flex items-center gap-1.5 ml-auto shrink-0 pl-2">
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

              {/* Row 2 — Filter chips (cards + planner views only) */}
              {(mainView === 'cards' || mainView === 'planner') && (
                <div className="h-9 flex items-center px-4 gap-1 border-t border-slate-100 overflow-x-auto scrollbar-none bg-slate-50/60">
                  {CATEGORY_NAV.map(cat => {
                    const Icon = cat.icon;
                    const isActive = categoryFilter === cat.key;
                    return (
                      <button
                        key={cat.key}
                        onClick={() => setCategoryFilter(cat.key)}
                        data-testid={`category-filter-${cat.key}`}
                        className={cn(
                          'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all whitespace-nowrap shrink-0',
                          isActive ? 'bg-[#1D3461] text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-white',
                        )}
                      >
                        <Icon className="w-3 h-3" />
                        {cat.label}
                        <span className={cn('text-[10px] font-bold', isActive ? 'text-white/70' : 'text-slate-400')}>{cat.count}</span>
                      </button>
                    );
                  })}
                  {mainView === 'cards' && <div className="w-px h-4 bg-slate-200 mx-1 shrink-0" />}
                  {mainView === 'cards' && FILTER_CHIPS.map(chip => (
                    <button
                      key={chip.key}
                      onClick={() => setFilterKey(chip.key)}
                      data-testid={`filter-chip-${chip.key}`}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[11px] font-medium transition-all whitespace-nowrap border shrink-0',
                        filterKey === chip.key
                          ? 'bg-[#1D3461] text-white border-[#1D3461]'
                          : chip.alert && chip.count > 0
                            ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50',
                      )}
                    >
                      {chip.label}
                      {chip.count > 0 && (
                        <span className={cn('ml-1 font-bold', filterKey === chip.key ? 'text-white/80' : chip.alert ? 'text-red-600' : 'text-slate-400')}>
                          {chip.count}
                        </span>
                      )}
                    </button>
                  ))}
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

            {/* ── INBOX VIEW ── */}
            {mainView === 'inbox' && (
              <InboxView
                tasks={tasks}
                isLoading={isLoading}
                isUpdating={isUpdating}
                onEdit={setEditingTask}
                onToggleDone={handleToggleDone}
                onSave={handleSave}
                onAddTask={() => setShowAdd(true)}
              />
            )}

            {/* ── PLANNING VIEW ── */}
            {mainView === 'planning' && (
              <PlanningCompanion
                tasks={tasks}
                projectTasks={projectTasks}
                isLoading={isLoading}
                onMarkPersonalDone={handleMarkPersonalDone}
                onMarkProjectDone={handleMarkProjectDone}
                onOpenNewTask={() => setShowAdd(true)}
                currentUserFullName={currentUser?.fullName}
                overallPct={overallPct}
                totalDone={totalDone}
                totalAll={totalAll}
                overdueCount={stats.overdue}
                onSwitchView={setMainView}
              />
            )}
          </div>
        </div>
      </main>

      {/* Dialogs */}
      <QuickAddDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreate={handleCreate}
        isCreating={isCreating}
        currentUserFullName={currentUser?.fullName}
        currentUserId={currentUser?.id}
        currentUserRole={currentUser?.role}
      />
      <EditDialog
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onSave={handleSave}
        onDelete={handleDelete}
        isUpdating={isUpdating}
        currentUserId={currentUser?.id}
        currentUserRole={currentUser?.role}
      />
    </div>
  );
}
