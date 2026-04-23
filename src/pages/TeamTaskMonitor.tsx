import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, differenceInDays, isToday, isPast, isSameDay, addWeeks, subWeeks, addMonths, subMonths } from 'date-fns';
import { Users, CheckSquare, AlertTriangle, TrendingUp, Calendar, ChevronLeft, ChevronRight, X, Plus, Clock, CheckCircle2, BarChart2, MessageSquare, Bell, Phone, Mail, Filter, Search, RefreshCw, Eye, User, Layers, ChevronDown, ChevronUp, Flag, Briefcase, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/user/UserContext';
import { useNotifications } from '@/context/notifications/NotificationContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/toast';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string | null;
  role: string | null;
  email: string | null;
  phone_number: string | null;
  department_id: string | null;
  status: string | null;
  avatar_url: string | null;
}
interface PersonalTask {
  id: string;
  user_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  title: string;
  description: string | null;
  notes: string | null;
  status: string;
  priority: string | null;
  due_date: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}
interface ProjectFieldTask {
  id: string;
  project_id: string;
  title: string;
  status: string;
  priority: string | null;
  assigned_to: string | null;
  due_date: string | null;
  created_at: string;
}
interface Department {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const EXEC_ROLES = ['super_admin', 'superadmin', 'admin', 'ceo', 'coo', 'cto', 'country_director', 'countrydirector', 'Admin', 'SuperAdmin', 'hr_manager'];
function isExecRole(role: string | null): boolean {
  if (!role) return false;
  return EXEC_ROLES.some(r => r.toLowerCase() === role.toLowerCase());
}
function priorityColor(p: string | null) {
  if (!p) return 'bg-slate-100 text-slate-500';
  switch (p.toLowerCase()) {
    case 'critical': return 'bg-red-100 text-red-700';
    case 'high': return 'bg-orange-100 text-orange-700';
    case 'medium': return 'bg-amber-100 text-amber-700';
    case 'low': return 'bg-blue-100 text-blue-700';
    default: return 'bg-slate-100 text-slate-500';
  }
}
function statusColor(s: string) {
  switch (s.toLowerCase()) {
    case 'done': case 'completed': case 'complete': return 'bg-emerald-100 text-emerald-700';
    case 'in_progress': case 'in-progress': case 'inprogress': return 'bg-blue-100 text-blue-700';
    case 'todo': case 'pending': case 'open': return 'bg-slate-100 text-slate-600';
    case 'rejected': case 'cancelled': return 'bg-red-100 text-red-700';
    case 'delayed': return 'bg-orange-100 text-orange-700';
    default: return 'bg-slate-100 text-slate-500';
  }
}
function statusLabel(s: string) {
  switch (s.toLowerCase()) {
    case 'in_progress': return 'In Progress';
    case 'todo': return 'To Do';
    default: return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
function isDone(s: string) { return ['done', 'completed', 'complete'].includes(s.toLowerCase()); }
function isOverdue(t: PersonalTask | ProjectFieldTask) {
  if (!t.due_date) return false;
  if ('status' in t && isDone(t.status)) return false;
  return isPast(new Date(t.due_date + 'T23:59:59'));
}
function initials(name: string) { return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase(); }
function safeDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const dd = new Date(d);
  return isNaN(dd.getTime()) ? null : dd;
}

function buildNudgeMessage(metrics: { emp: { full_name: string | null }; allTasks: PersonalTask[]; projectTasksForEmp: ProjectFieldTask[] }): string {
  const overdueTasks = [
    ...metrics.allTasks.filter(isOverdue),
    ...metrics.projectTasksForEmp.filter(isOverdue),
  ];
  if (overdueTasks.length === 0) return '';
  const firstName = metrics.emp.full_name?.split(' ')[0]?.trim() || 'there';
  const taskLines = overdueTasks
    .slice(0, 5)
    .map((t, i) => {
      const due = t.due_date ? `(was due ${format(new Date(t.due_date), 'd MMM yyyy')})` : '(no due date set)';
      return `${i + 1}. "${t.title}" ${due}`;
    })
    .join('\n');
  const more = overdueTasks.length > 5 ? `\n...and ${overdueTasks.length - 5} more.` : '';
  const msg = `Hi ${firstName}, you have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} that need your attention:\n\n${taskLines}${more}\n\nPlease review and update these as soon as possible. Thank you!`;
  return msg.slice(0, 500);
}

// ─── Data Fetching ────────────────────────────────────────────────────────────
async function fetchTeamTaskData() {
  const [
    { data: profilesRaw },
    { data: tasksRaw },
    { data: projectTasksRaw },
    { data: deptsRaw },
  ] = await Promise.all([
    supabase.from('profiles').select('id, full_name, role, email, phone_number, department_id, status, avatar_url').neq('status', 'inactive').order('full_name'),
    supabase.from('personal_tasks').select('id, user_id, assigned_to, assigned_to_name, title, description, notes, status, priority, due_date, category, created_at, updated_at').limit(2000),
    supabase.from('project_field_tasks').select('id, project_id, title, status, priority, assigned_to, due_date, created_at').limit(1000),
    supabase.from('departments').select('id, name'),
  ]);
  return {
    profiles: (profilesRaw ?? []) as Profile[],
    tasks: (tasksRaw ?? []) as PersonalTask[],
    projectTasks: (projectTasksRaw ?? []) as ProjectFieldTask[],
    depts: (deptsRaw ?? []) as Department[],
  };
}

// ─── Per-employee metrics ──────────────────────────────────────────────────────
function buildEmployeeMetrics(profiles: Profile[], tasks: PersonalTask[], projectTasks: ProjectFieldTask[], depts: Department[], weekStart: Date, weekEnd: Date) {
  const deptMap: Record<string, string> = {};
  depts.forEach(d => { deptMap[d.id] = d.name; });

  return profiles.map(emp => {
    const myTasks = tasks.filter(t => t.user_id === emp.id || t.assigned_to === emp.id);
    const myProjectTasks = projectTasks.filter(t => t.assigned_to === emp.id);
    const allTasks = [...myTasks, ...myProjectTasks.map(t => ({ ...t, user_id: emp.id, description: null, notes: null, assigned_to_name: null, category: null, updated_at: t.created_at } as PersonalTask))];

    const total = allTasks.length;
    const completed = allTasks.filter(t => isDone(t.status)).length;
    const inProgress = allTasks.filter(t => ['in_progress','in-progress','inprogress'].includes(t.status.toLowerCase())).length;
    const overdue = allTasks.filter(t => isOverdue(t)).length;
    const todo = allTasks.filter(t => ['todo','pending','open'].includes(t.status.toLowerCase())).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // This week tasks (due within current week)
    const thisWeekTasks = allTasks.filter(t => {
      const d = safeDate(t.due_date);
      if (!d) return false;
      return d >= weekStart && d <= weekEnd;
    });
    const thisWeekCount = thisWeekTasks.length;

    // Daily counts for the 7 days of this week
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
    const dayTaskCounts = weekDays.map(day => ({
      day,
      count: allTasks.filter(t => {
        const d = safeDate(t.due_date);
        return d ? isSameDay(d, day) : false;
      }).length,
    }));

    const efficiency = completionRate >= 70 && overdue === 0 ? 'high' : completionRate >= 40 ? 'medium' : 'low';

    return {
      emp,
      dept: deptMap[emp.department_id ?? ''] ?? '—',
      total,
      completed,
      inProgress,
      overdue,
      todo,
      completionRate,
      thisWeekCount,
      dayTaskCounts,
      efficiency,
      allTasks: myTasks,
      projectTasksForEmp: myProjectTasks,
    };
  }).filter(m => m.total > 0);
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TeamTaskMonitor() {
  const { currentUser } = useUser();
  const { addNotification } = useNotifications();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEmp, setSelectedEmp] = useState<ReturnType<typeof buildEmployeeMetrics>[number] | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', notes: '', priority: 'medium', due_date: '', category: 'daily', status: 'todo' });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  // T12 — pagination so very large teams stay snappy
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;
  // Reset to first page when filters change
  useEffect(() => { setPage(0); }, [search, deptFilter, statusFilter]);

  const [waTarget, setWaTarget] = useState<ReturnType<typeof buildEmployeeMetrics>[number] | null>(null);
  const [waMsg, setWaMsg] = useState('');
  const [waSending, setWaSending] = useState(false);

  const role = currentUser?.role ?? '';
  const isExec = isExecRole(role);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['team-task-monitor'],
    queryFn: fetchTeamTaskData,
    staleTime: 30000,
  });

  const today = new Date();
  const weekStart = startOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(addWeeks(today, weekOffset), { weekStartsOn: 1 });

  const empMetrics = useMemo(() => {
    if (!data) return [];
    return buildEmployeeMetrics(data.profiles, data.tasks, data.projectTasks, data.depts, weekStart, weekEnd)
      .sort((a, b) => b.overdue - a.overdue || b.total - a.total);
  }, [data, weekOffset]);

  const depts = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    data?.depts?.forEach(d => { if (!seen.has(d.id)) { seen.add(d.id); out.push(d); } });
    return out;
  }, [data]);

  const filtered = useMemo(() => {
    return empMetrics.filter(m => {
      const nameMatch = search === '' || (m.emp.full_name ?? '').toLowerCase().includes(search.toLowerCase());
      const deptMatch = deptFilter === 'all' || m.dept === deptFilter;
      const statusMatch = statusFilter === 'all' ||
        (statusFilter === 'overdue' && m.overdue > 0) ||
        (statusFilter === 'at-risk' && m.overdue > 0) ||
        (statusFilter === 'ok' && m.overdue === 0);
      return nameMatch && deptMatch && statusMatch;
    });
  }, [empMetrics, search, deptFilter, statusFilter]);

  // KPI totals
  const kpi = useMemo(() => {
    const all = empMetrics;
    return {
      employees: all.length,
      thisWeek: all.reduce((s, m) => s + m.thisWeekCount, 0),
      overdue: all.reduce((s, m) => s + m.overdue, 0),
      completed: all.reduce((s, m) => s + m.completed, 0),
      inProgress: all.reduce((s, m) => s + m.inProgress, 0),
      avgCompletion: all.length > 0 ? Math.round(all.reduce((s, m) => s + m.completionRate, 0) / all.length) : 0,
    };
  }, [empMetrics]);

  // ── Create task mutation ────────────────────────────────────────────────────
  const createTaskMutation = useMutation({
    mutationFn: async ({ empId, empName }: { empId: string; empName: string }) => {
      const { data: newTask, error } = await supabase.from('personal_tasks').insert({
        user_id: empId,
        assigned_to: empId,
        assigned_to_name: empName,
        title: taskForm.title,
        description: taskForm.description || null,
        notes: taskForm.notes || null,
        priority: taskForm.priority,
        due_date: taskForm.due_date || null,
        category: taskForm.category,
        status: taskForm.status,
      }).select().single();
      if (error) throw error;
      return { newTask, empId, empName };
    },
    onSuccess: ({ empId, empName }) => {
      qc.invalidateQueries({ queryKey: ['team-task-monitor'] });
      // In-app notification to assignee
      addNotification({
        userId: empId,
        title: 'New Task Assigned',
        message: `${currentUser?.fullName ?? 'A manager'} assigned you: "${taskForm.title}"`,
        type: 'info',
        link: '/my-tasks',
      });
      // In-app notification to self
      if (currentUser?.id) {
        addNotification({
          userId: currentUser.id,
          title: 'Task Created',
          message: `Task "${taskForm.title}" created for ${empName}`,
          type: 'success',
        });
      }
      // Email notification via edge function
      supabase.functions.invoke('dispatch-notification', {
        body: {
          event: 'task_assigned',
          recipient_user_id: empId,
          data: { task_title: taskForm.title, assigned_by: currentUser?.fullName ?? 'Manager', due_date: taskForm.due_date || 'No due date' },
        },
      }).catch(console.warn);
      toast({ title: 'Task created', description: `Assigned to ${empName}`, variant: 'success' });
      setTaskForm({ title: '', description: '', notes: '', priority: 'medium', due_date: '', category: 'daily', status: 'todo' });
      setShowCreateTask(false);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // ── Update task status mutation ─────────────────────────────────────────────
  const updateStatusMutation = useMutation({
    mutationFn: async ({ taskId, status, empId }: { taskId: string; status: string; empId: string }) => {
      const { error } = await supabase.from('personal_tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', taskId);
      if (error) throw error;
      return { taskId, status, empId };
    },
    onSuccess: ({ status, empId }) => {
      qc.invalidateQueries({ queryKey: ['team-task-monitor'] });
      const label = statusLabel(status);
      addNotification({
        userId: empId,
        title: `Task ${label}`,
        message: `Your task status was updated to "${label}" by ${currentUser?.fullName ?? 'a manager'}`,
        type: status === 'done' || status === 'completed' ? 'success' : status === 'rejected' ? 'warning' : 'info',
        link: '/my-tasks',
      });
    },
  });

  // ── WhatsApp nudge ──────────────────────────────────────────────────────────
  // T14 — Per-employee 1-hour cooldown to prevent nudge spam.
  const NUDGE_COOLDOWN_MS = 60 * 60 * 1000;
  const lastNudgedRef = useRef<Map<string, number>>(new Map());

  const openNudge = (m: any) => {
    const last = lastNudgedRef.current.get(m.emp.id) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < NUDGE_COOLDOWN_MS) {
      const minsLeft = Math.ceil((NUDGE_COOLDOWN_MS - elapsed) / 60000);
      toast({
        title: 'Recently nudged',
        description: `You already messaged ${m.emp.full_name ?? 'this employee'} less than an hour ago. Try again in ${minsLeft} min.`,
      });
      return;
    }
    setWaTarget(m);
    setWaMsg(buildNudgeMessage(m));
  };

  const handleSendWhatsApp = async () => {
    if (!waTarget || !waMsg.trim()) return;
    setWaSending(true);
    try {
      const { data: waData, error: waError } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          user_ids: [waTarget.emp.id],
          event_type: 'reminder',
          data: {
            message: waMsg.trim(),
            message_ar: waMsg.trim(),
          },
        },
      });
      if (waError) throw new Error(waError.message);
      if (waData?.skipped || waData?.sent === 0) {
        if (waData?.skipped) {
          toast({ title: 'No phone number', description: `${waTarget.emp.full_name ?? 'Employee'} has no phone number on file.`, variant: 'destructive' });
        } else {
          toast({ title: 'Delivery failed', description: `WhatsApp message could not be delivered to ${waTarget.emp.full_name ?? 'employee'}.`, variant: 'destructive' });
        }
      } else {
        const partialNote = waData?.failed > 0 ? ` (${waData.failed} failed)` : '';
        toast({ title: 'WhatsApp sent', description: `Message delivered to ${waTarget.emp.full_name ?? 'employee'}${partialNote}.`, variant: 'success' });
        // T14 — record last successful nudge for cooldown
        lastNudgedRef.current.set(waTarget.emp.id, Date.now());
        setWaTarget(null);
        setWaMsg('');
      }
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err.message, variant: 'destructive' });
    } finally {
      setWaSending(false);
    }
  };

  // ── Calendar helpers ────────────────────────────────────────────────────────
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(calendarMonth);
    const monthEnd = endOfMonth(calendarMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const firstDow = monthStart.getDay(); // 0=Sun
    const paddingBefore = firstDow === 0 ? 6 : firstDow - 1;
    return { days, paddingBefore };
  }, [calendarMonth]);

  const getTasksForDay = useCallback((day: Date, empId: string) => {
    if (!data) return [];
    const personal = data.tasks.filter(t =>
      (t.user_id === empId || t.assigned_to === empId) &&
      t.due_date && isSameDay(new Date(t.due_date), day)
    );
    const proj = data.projectTasks.filter(t =>
      t.assigned_to === empId &&
      t.due_date && isSameDay(new Date(t.due_date), day)
    );
    return [...personal, ...proj.map(t => ({ ...t, user_id: empId, description: null, notes: null, assigned_to_name: null, category: null, updated_at: t.created_at }))];
  }, [data]);

  const maxDayCount = useMemo(() => {
    if (!selectedEmp) return 1;
    const allDays = calendarDays.days.map(d => getTasksForDay(d, selectedEmp.emp.id).length);
    return Math.max(1, ...allDays);
  }, [selectedEmp, calendarDays, getTasksForDay]);

  if (!isExec) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
        <Eye className="h-12 w-12 opacity-20" />
        <p className="text-lg font-semibold">Executive Access Only</p>
        <p className="text-sm">This section is restricted to CEO, COO, CTO, and Admin roles.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
        <span>Loading team task data…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-1">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-[#1D3461] flex items-center justify-center">
              <Users className="h-4 w-4 text-white" />
            </div>
            Team Task Monitor
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time task load visibility across all team members — personal tasks, project tasks, and workload calendar
          </p>
        </div>
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          <Badge variant="outline" className="text-[10px] font-semibold bg-[#1D3461]/10 text-[#1D3461] border-[#1D3461]/30">
            {role} View
          </Badge>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {/* ── KPI Strip ── */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Employees Tracked', value: kpi.employees, icon: Users, color: 'text-[#1D3461]', bg: 'bg-[#1D3461]/5 border-[#1D3461]/20' },
          { label: 'Tasks This Week', value: kpi.thisWeek, icon: Calendar, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200' },
          { label: 'Overdue', value: kpi.overdue, icon: AlertTriangle, color: kpi.overdue > 0 ? 'text-red-600' : 'text-emerald-600', bg: kpi.overdue > 0 ? 'bg-red-50 dark:bg-red-900/20 border-red-200' : 'bg-emerald-50 border-emerald-200' },
          { label: 'In Progress', value: kpi.inProgress, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200' },
          { label: 'Completed', value: kpi.completed, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200' },
          { label: 'Avg Completion', value: `${kpi.avgCompletion}%`, icon: TrendingUp, color: kpi.avgCompletion >= 70 ? 'text-emerald-600' : kpi.avgCompletion >= 40 ? 'text-amber-600' : 'text-red-600', bg: 'bg-muted/40 border-border' },
        ].map(k => (
          <div key={k.label} className={cn('rounded-xl border p-3 flex flex-col gap-1', k.bg)}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium leading-tight">{k.label}</span>
              <k.icon className={cn('h-3.5 w-3.5', k.color)} />
            </div>
            <span className={cn('text-xl font-bold', k.color)}>{k.value}</span>
          </div>
        ))}
      </div>

      {/* ── Week Navigator ── */}
      <div className="flex items-center gap-3 bg-card border rounded-xl px-4 py-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Week View</span>
        <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold min-w-[200px] text-center">
          {format(weekStart, 'dd MMM')} — {format(weekEnd, 'dd MMM yyyy')}
          {weekOffset === 0 && <span className="ml-2 text-[10px] bg-[#1D3461] text-white px-2 py-px rounded-full">This Week</span>}
        </span>
        <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
        {weekOffset !== 0 && (
          <button onClick={() => setWeekOffset(0)} className="text-[11px] text-[#1D3461] hover:underline ml-auto">
            Back to this week
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 border rounded-lg px-2 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input className="text-xs bg-transparent outline-none w-28" placeholder="Search employee…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {depts.map(d => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="overdue">Has Overdue</SelectItem>
              <SelectItem value="ok">On Track</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Employee Workload Table ── */}
      <div className="bg-card border rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b bg-muted/30">
          <BarChart2 className="h-4 w-4 text-[#1D3461]" />
          <span className="font-bold text-sm">Team Workload — {filtered.length} employees</span>
          <span className="ml-auto text-[10px] text-muted-foreground">Click a row to expand task details</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground text-sm">No employees match the current filter</div>
        ) : (
          <div className="divide-y">
            {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((m, idx) => {
              const weekDays = m.dayTaskCounts;
              const maxCount = Math.max(1, ...weekDays.map(d => d.count));
              const isExpanded = expandedRows.has(m.emp.id);
              const empTasks = m.allTasks.filter(t =>
                taskStatusFilter === 'all' ? true :
                taskStatusFilter === 'overdue' ? isOverdue(t) :
                t.status.toLowerCase() === taskStatusFilter
              );

              return (
                <div key={m.emp.id}>
                  {/* Main row */}
                  <div
                    className={cn('px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer', isExpanded && 'bg-[#1D3461]/5')}
                    onClick={() => setExpandedRows(prev => {
                      const next = new Set(prev);
                      next.has(m.emp.id) ? next.delete(m.emp.id) : next.add(m.emp.id);
                      return next;
                    })}
                    data-testid={`team-task-row-${m.emp.id}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      {/* Employee info */}
                      <div className="flex items-center gap-3 min-w-[200px]">
                        <div className="h-9 w-9 rounded-full bg-[#1D3461]/10 flex items-center justify-center text-[#1D3461] font-bold text-[11px] flex-shrink-0 border-2 border-[#1D3461]/20">
                          {initials(m.emp.full_name ?? '?')}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{m.emp.full_name ?? '—'}</p>
                          <p className="text-[10px] text-muted-foreground">{m.emp.role ?? '—'} · {m.dept}</p>
                          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                            {m.emp.phone_number && (
                              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                                <Phone className="h-2.5 w-2.5" />{m.emp.phone_number}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 7-day heatmap */}
                      <div className="flex items-end gap-1 flex-shrink-0">
                        {weekDays.map(({ day, count }) => (
                          <div key={day.toISOString()} className="flex flex-col items-center gap-0.5">
                            <div
                              className={cn(
                                'w-6 rounded-t-sm transition-all',
                                count === 0 ? 'bg-muted/60 h-1' :
                                isToday(day) ? 'bg-[#1D3461]' :
                                'bg-[#1D3461]/60'
                              )}
                              style={{ height: count > 0 ? `${Math.max(4, (count / maxCount) * 32)}px` : '4px' }}
                            />
                            <span className={cn('text-[8px] font-medium', isToday(day) ? 'text-[#1D3461]' : 'text-muted-foreground')}>
                              {format(day, 'EEE')[0]}
                            </span>
                            {count > 0 && <span className="text-[8px] font-bold text-foreground">{count}</span>}
                          </div>
                        ))}
                      </div>

                      {/* Metrics pills */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-center px-2 py-1 rounded-lg bg-muted/40 min-w-[40px]">
                          <div className="text-sm font-bold">{m.total}</div>
                          <div className="text-[9px] text-muted-foreground">Total</div>
                        </div>
                        <div className="text-center px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 min-w-[40px]">
                          <div className="text-sm font-bold text-emerald-700">{m.completed}</div>
                          <div className="text-[9px] text-muted-foreground">Done</div>
                        </div>
                        <div className="text-center px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 min-w-[40px]">
                          <div className="text-sm font-bold text-blue-700">{m.inProgress}</div>
                          <div className="text-[9px] text-muted-foreground">Active</div>
                        </div>
                        <div className={cn('text-center px-2 py-1 rounded-lg min-w-[40px]', m.overdue > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-muted/40')}>
                          <div className={cn('text-sm font-bold', m.overdue > 0 ? 'text-red-600' : 'text-muted-foreground')}>{m.overdue}</div>
                          <div className="text-[9px] text-muted-foreground">Overdue</div>
                        </div>
                        <div className="text-center px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20 min-w-[40px]">
                          <div className="text-sm font-bold text-amber-700">{m.thisWeekCount}</div>
                          <div className="text-[9px] text-muted-foreground">This Wk</div>
                        </div>
                      </div>

                      {/* Completion rate */}
                      <div className="min-w-[80px]">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-muted-foreground">Completion</span>
                          <span className="text-[10px] font-bold">{m.completionRate}%</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{
                            width: `${m.completionRate}%`,
                            background: m.completionRate >= 70 ? '#10b981' : m.completionRate >= 40 ? '#f59e0b' : '#ef4444',
                          }} />
                        </div>
                        <div className="mt-1">
                          <span className={cn('text-[9px] px-1.5 py-px rounded-full font-bold',
                            m.efficiency === 'high' ? 'bg-emerald-100 text-emerald-700' :
                            m.efficiency === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          )}>
                            {m.efficiency === 'high' ? '⚡ High' : m.efficiency === 'medium' ? '⚠ Med' : '↓ Low'}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 sm:ml-auto flex-shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedEmp(m); setCalendarMonth(new Date()); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-[#1D3461] hover:bg-[#1D3461]/10 transition-all"
                          title="Open calendar view"
                          data-testid={`btn-calendar-${m.emp.id}`}
                        >
                          <Calendar className="h-4 w-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedEmp(m); setShowCreateTask(true); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 transition-all"
                          title="Create task for this employee"
                          data-testid={`btn-create-task-${m.emp.id}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); openNudge(m); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-700 hover:bg-emerald-50 transition-all"
                          title="Send WhatsApp message"
                          data-testid={`btn-whatsapp-${m.emp.id}`}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded task list */}
                  {isExpanded && (
                    <div className="border-t bg-muted/10 px-4 py-3 space-y-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-muted-foreground">All Tasks for {m.emp.full_name?.split(' ')[0]}</span>
                        <div className="flex items-center gap-1 ml-auto flex-wrap">
                          {['all','todo','in_progress','done','overdue'].map(s => (
                            <button key={s} onClick={() => setTaskStatusFilter(s)}
                              className={cn('text-[10px] px-2 py-px rounded-full border transition-colors',
                                taskStatusFilter === s ? 'bg-[#1D3461] text-white border-[#1D3461]' : 'bg-card text-muted-foreground border-border hover:border-[#1D3461]'
                              )}>
                              {s === 'in_progress' ? 'In Progress' : s.charAt(0).toUpperCase() + s.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Personal tasks */}
                      {empTasks.length === 0 && (
                        <p className="text-xs text-muted-foreground italic py-2">No tasks match the filter</p>
                      )}
                      <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {empTasks.map(task => (
                          <div key={task.id} className="flex items-start gap-2 bg-card border rounded-lg px-3 py-2 group">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-medium truncate">{task.title}</span>
                                {isOverdue(task) && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-px rounded-full font-bold">OVERDUE</span>}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={cn('text-[9px] px-1.5 py-px rounded-full font-medium', statusColor(task.status))}>{statusLabel(task.status)}</span>
                                {task.priority && <span className={cn('text-[9px] px-1.5 py-px rounded-full font-medium', priorityColor(task.priority))}>{task.priority}</span>}
                                {task.due_date && <span className="text-[9px] text-muted-foreground">Due: {format(new Date(task.due_date), 'dd MMM yyyy')}</span>}
                                {task.category && <span className="text-[9px] text-muted-foreground bg-muted px-1 py-px rounded">{task.category}</span>}
                              </div>
                              {task.notes && <p className="text-[10px] text-muted-foreground mt-0.5 truncate italic">📝 {task.notes}</p>}
                            </div>
                            {/* Quick status update */}
                            <Select value={task.status} onValueChange={val => updateStatusMutation.mutate({ taskId: task.id, status: val, empId: m.emp.id })}>
                              <SelectTrigger className="h-6 text-[10px] w-24 opacity-0 group-hover:opacity-100 transition-opacity">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="todo">To Do</SelectItem>
                                <SelectItem value="in_progress">In Progress</SelectItem>
                                <SelectItem value="done">Done</SelectItem>
                                <SelectItem value="delayed">Delayed</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>

                      {/* Project tasks for this employee */}
                      {m.projectTasksForEmp.length > 0 && (
                        <div>
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <Briefcase className="h-3 w-3 text-purple-600" />
                            <span className="text-[11px] font-semibold text-purple-600">Project Tasks ({m.projectTasksForEmp.length})</span>
                          </div>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {m.projectTasksForEmp.map(pt => (
                              <div key={pt.id} className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/10 border border-purple-100 rounded-lg px-3 py-1.5">
                                <span className="text-xs font-medium flex-1 truncate">{pt.title}</span>
                                <span className={cn('text-[9px] px-1.5 py-px rounded-full', statusColor(pt.status))}>{statusLabel(pt.status)}</span>
                                {pt.due_date && <span className="text-[9px] text-muted-foreground">{format(new Date(pt.due_date), 'dd MMM')}</span>}
                                {isOverdue(pt) && <span className="text-[9px] bg-red-100 text-red-600 px-1 py-px rounded-full font-bold">OD</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => Math.max(0, p - 1))}
                data-testid="btn-team-prev-page"
              >
                Previous
              </Button>
              <span className="text-muted-foreground">Page {page + 1} of {Math.ceil(filtered.length / PAGE_SIZE)}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={(page + 1) * PAGE_SIZE >= filtered.length}
                onClick={() => setPage(p => p + 1)}
                data-testid="btn-team-next-page"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── WhatsApp Nudge Dialog ── */}
      <Dialog open={!!waTarget} onOpenChange={open => { if (!open) { setWaTarget(null); setWaMsg(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <MessageSquare className="h-4 w-4" />
              Send WhatsApp to {waTarget?.emp.full_name ?? ''}
            </DialogTitle>
          </DialogHeader>
          {waTarget && (
            <div className="space-y-3 pt-1">
              <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                {waTarget.emp.phone_number
                  ? <span>{waTarget.emp.phone_number}</span>
                  : <span className="text-amber-600">No phone number on file — message may not deliver</span>
                }
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Message</label>
                  {waTarget.overdue > 0 && waMsg && (
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Pre-filled from {waTarget.overdue} overdue task{waTarget.overdue > 1 ? 's' : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => setWaMsg('')}
                        className="text-[10px] text-muted-foreground underline hover:text-foreground transition-colors"
                        data-testid="btn-wa-clear-message"
                      >
                        Clear
                      </button>
                    </span>
                  )}
                </div>
                <Textarea
                  value={waMsg}
                  onChange={e => setWaMsg(e.target.value)}
                  placeholder="Type your message to this employee…"
                  rows={waTarget.overdue > 0 ? 7 : 4}
                  maxLength={500}
                  data-testid={`input-wa-message-${waTarget.emp.id}`}
                />
                <p className="text-[10px] text-muted-foreground text-right">{waMsg.length}/500</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setWaTarget(null); setWaMsg(''); }}
                  className="flex-1 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  disabled={waSending || !waMsg.trim()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid={`btn-wa-send-${waTarget.emp.id}`}
                >
                  {waSending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Employee Calendar Dialog ── */}
      <Dialog open={!!selectedEmp && !showCreateTask} onOpenChange={open => { if (!open) setSelectedEmp(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedEmp && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-[#1D3461]/10 flex items-center justify-center text-[#1D3461] font-bold text-[11px]">
                    {initials(selectedEmp.emp.full_name ?? '?')}
                  </div>
                  <div>
                    <div className="text-base font-bold">{selectedEmp.emp.full_name}</div>
                    <div className="text-xs font-normal text-muted-foreground">{selectedEmp.emp.role} · {selectedEmp.dept}</div>
                  </div>
                  <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                    {selectedEmp.emp.email && (
                      <a href={`mailto:${selectedEmp.emp.email}`} className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors" title="Send email">
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    )}
                    {selectedEmp.emp.phone_number && (
                      <a href={`tel:${selectedEmp.emp.phone_number}`} className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 transition-colors" title="Call">
                        <Phone className="h-3.5 w-3.5" />
                      </a>
                    )}
                    <Button size="sm" className="h-7 text-xs gap-1 bg-[#1D3461] hover:bg-[#1D3461]/90" onClick={() => setShowCreateTask(true)}>
                      <Plus className="h-3 w-3" /> Add Task
                    </Button>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {/* KPI row */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: 'Total', value: selectedEmp.total, color: 'text-foreground' },
                  { label: 'Done', value: selectedEmp.completed, color: 'text-emerald-600' },
                  { label: 'Overdue', value: selectedEmp.overdue, color: selectedEmp.overdue > 0 ? 'text-red-600' : 'text-emerald-600' },
                  { label: 'Completion', value: `${selectedEmp.completionRate}%`, color: selectedEmp.completionRate >= 70 ? 'text-emerald-600' : 'text-amber-600' },
                ].map(k => (
                  <div key={k.label} className="bg-muted/30 rounded-xl p-3 text-center border">
                    <div className={cn('text-xl font-bold', k.color)}>{k.value}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Monthly calendar */}
              <div className="bg-card border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <button onClick={() => setCalendarMonth(m => subMonths(m, 1))} className="p-1 rounded hover:bg-muted">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-bold">{format(calendarMonth, 'MMMM yyyy')}</span>
                  <button onClick={() => setCalendarMonth(m => addMonths(m, 1))} className="p-1 rounded hover:bg-muted">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-3">
                  <div className="grid grid-cols-7 gap-0.5 mb-1">
                    {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
                      <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-0.5">
                    {Array.from({ length: calendarDays.paddingBefore }).map((_, i) => (
                      <div key={`pad-${i}`} />
                    ))}
                    {calendarDays.days.map(day => {
                      const dayTasks = getTasksForDay(day, selectedEmp.emp.id);
                      const hasOverdue = dayTasks.some(t => isOverdue(t));
                      const intensity = maxDayCount > 0 ? dayTasks.length / maxDayCount : 0;
                      return (
                        <div key={day.toISOString()}
                          className={cn(
                            'rounded-lg p-1 min-h-[44px] flex flex-col items-center gap-0.5 cursor-default transition-colors',
                            isToday(day) ? 'bg-[#1D3461] text-white' :
                            dayTasks.length > 0 && hasOverdue ? 'bg-red-50 dark:bg-red-900/20 border border-red-200' :
                            dayTasks.length > 0 ? 'bg-[#1D3461]/10 border border-[#1D3461]/20' :
                            'hover:bg-muted/40'
                          )}>
                          <span className={cn('text-[11px] font-semibold', isToday(day) ? 'text-white' : 'text-foreground')}>
                            {format(day, 'd')}
                          </span>
                          {dayTasks.length > 0 && (
                            <div className="flex flex-wrap gap-px justify-center">
                              {dayTasks.slice(0, 3).map((t, ti) => (
                                <div key={ti} className={cn('h-1.5 w-1.5 rounded-full', isDone(t.status) ? 'bg-emerald-400' : isOverdue(t) ? 'bg-red-500' : 'bg-[#1D3461]')} />
                              ))}
                              {dayTasks.length > 3 && <span className="text-[8px] text-muted-foreground">+{dayTasks.length - 3}</span>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 border-t bg-muted/20 flex-wrap">
                  {[
                    { dot: 'bg-[#1D3461]', label: 'Upcoming' },
                    { dot: 'bg-emerald-400', label: 'Done' },
                    { dot: 'bg-red-500', label: 'Overdue' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1">
                      <div className={cn('h-2 w-2 rounded-full', l.dot)} />
                      <span className="text-[10px] text-muted-foreground">{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* All tasks list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold">All Tasks</span>
                  <div className="flex items-center gap-1">
                    {['all','todo','in_progress','done','overdue'].map(s => (
                      <button key={s} onClick={() => setTaskStatusFilter(s)}
                        className={cn('text-[10px] px-2 py-px rounded-full border transition-colors',
                          taskStatusFilter === s ? 'bg-[#1D3461] text-white border-[#1D3461]' : 'text-muted-foreground border-border hover:border-[#1D3461]'
                        )}>
                        {s === 'in_progress' ? 'Active' : s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {selectedEmp.allTasks
                    .filter(t =>
                      taskStatusFilter === 'all' ? true :
                      taskStatusFilter === 'overdue' ? isOverdue(t) :
                      t.status.toLowerCase() === taskStatusFilter
                    )
                    .sort((a, b) => {
                      if (isOverdue(a) && !isOverdue(b)) return -1;
                      if (!isOverdue(a) && isOverdue(b)) return 1;
                      return 0;
                    })
                    .map(task => (
                      <div key={task.id} className="bg-card border rounded-xl px-3 py-2.5">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-semibold">{task.title}</span>
                              {isOverdue(task) && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-px rounded-full font-bold">OVERDUE</span>}
                            </div>
                            {task.description && <p className="text-[10px] text-muted-foreground mt-0.5">{task.description}</p>}
                            {task.notes && <p className="text-[10px] text-muted-foreground mt-0.5 italic">📝 {task.notes}</p>}
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={cn('text-[9px] px-1.5 py-px rounded-full', statusColor(task.status))}>{statusLabel(task.status)}</span>
                              {task.priority && <span className={cn('text-[9px] px-1.5 py-px rounded-full', priorityColor(task.priority))}><Flag className="h-2 w-2 inline mr-0.5" />{task.priority}</span>}
                              {task.due_date && <span className={cn('text-[9px]', isOverdue(task) ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>📅 {format(new Date(task.due_date), 'dd MMM yyyy')}</span>}
                              {task.category && <span className="text-[9px] bg-muted text-muted-foreground px-1.5 py-px rounded">{task.category}</span>}
                            </div>
                          </div>
                          <Select value={task.status} onValueChange={val => updateStatusMutation.mutate({ taskId: task.id, status: val, empId: selectedEmp.emp.id })}>
                            <SelectTrigger className="h-6 text-[10px] w-24 flex-shrink-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="todo">To Do</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="delayed">Delayed</SelectItem>
                              <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                </div>
                {/* Project tasks in calendar view */}
                {selectedEmp.projectTasksForEmp.length > 0 && (
                  <div className="mt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Briefcase className="h-3.5 w-3.5 text-purple-600" />
                      <span className="text-xs font-semibold text-purple-600">Project Tasks</span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {selectedEmp.projectTasksForEmp.map(pt => (
                        <div key={pt.id} className="bg-purple-50 dark:bg-purple-900/10 border border-purple-100 rounded-xl px-3 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium">{pt.title}</span>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={cn('text-[9px] px-1.5 py-px rounded-full', statusColor(pt.status))}>{statusLabel(pt.status)}</span>
                                {pt.due_date && <span className={cn('text-[9px]', isOverdue(pt) ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>📅 {format(new Date(pt.due_date), 'dd MMM yyyy')}</span>}
                              </div>
                            </div>
                            {isOverdue(pt) && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-px rounded-full font-bold flex-shrink-0">OVERDUE</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create Task Dialog ── */}
      <Dialog open={showCreateTask} onOpenChange={open => { if (!open) { setShowCreateTask(false); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-[#1D3461]" />
              Create Task {selectedEmp ? `for ${selectedEmp.emp.full_name?.split(' ')[0]}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Task Title *</label>
              <Input
                placeholder="What needs to be done?"
                value={taskForm.title}
                onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))}
                className="text-sm"
                data-testid="input-task-title"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Description</label>
              <Textarea
                placeholder="Detailed instructions or context…"
                value={taskForm.description}
                onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))}
                className="text-sm min-h-[70px]"
                data-testid="input-task-description"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes / Daily Log</label>
              <Textarea
                placeholder="Manager notes, ad-hoc context, or daily log entry…"
                value={taskForm.notes}
                onChange={e => setTaskForm(f => ({ ...f, notes: e.target.value }))}
                className="text-sm min-h-[50px]"
                data-testid="input-task-notes"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Priority</label>
                <Select value={taskForm.priority} onValueChange={v => setTaskForm(f => ({ ...f, priority: v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-task-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Category</label>
                <Select value={taskForm.category} onValueChange={v => setTaskForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="h-8 text-xs" data-testid="select-task-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="ad_hoc">Ad Hoc</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Due Date</label>
                <Input
                  type="date"
                  value={taskForm.due_date}
                  onChange={e => setTaskForm(f => ({ ...f, due_date: e.target.value }))}
                  className="h-8 text-xs"
                  data-testid="input-task-due-date"
                />
              </div>
            </div>

            {/* Assignee */}
            {!selectedEmp && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1 block">Assign To</label>
                <Select onValueChange={val => {
                  const emp = empMetrics.find(m => m.emp.id === val);
                  if (emp) setSelectedEmp(emp);
                }}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select employee…" />
                  </SelectTrigger>
                  <SelectContent>
                    {empMetrics.map(m => (
                      <SelectItem key={m.emp.id} value={m.emp.id}>{m.emp.full_name ?? m.emp.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-xl p-3">
              <div className="flex items-start gap-2">
                <Bell className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold text-blue-700">Notifications will be sent</p>
                  <p className="text-[10px] text-blue-600 mt-0.5">
                    The employee will receive an in-app notification and email when this task is created.
                    {selectedEmp?.emp.phone_number && ' WhatsApp notification requires API setup.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowCreateTask(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-[#1D3461] hover:bg-[#1D3461]/90"
                disabled={!taskForm.title.trim() || !selectedEmp || createTaskMutation.isPending}
                onClick={() => {
                  if (!selectedEmp || !taskForm.title.trim()) return;
                  createTaskMutation.mutate({ empId: selectedEmp.emp.id, empName: selectedEmp.emp.full_name ?? selectedEmp.emp.id });
                }}
                data-testid="button-submit-task"
              >
                {createTaskMutation.isPending ? 'Creating…' : 'Create & Notify'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── WhatsApp Notice ── */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <MessageSquare className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-emerald-700">WhatsApp Notifications</p>
            <p className="text-xs text-emerald-600 mt-1">
              Phone numbers are already stored for team members. To enable real WhatsApp message delivery for task notifications (created, due, overdue, status changes), a Twilio or Meta WhatsApp Business API key is needed.
              Once configured, all task events will automatically send WhatsApp messages to the registered phone number of each employee.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
