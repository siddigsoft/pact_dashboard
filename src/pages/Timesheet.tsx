import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  format, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks,
  eachDayOfInterval, isToday, isSameDay,
} from 'date-fns';
import {
  Clock, Plus, Edit2, Trash2, Loader2, CheckCircle2, ChevronLeft,
  ChevronRight, Briefcase, Search, Calendar,
  AlertCircle, Send, X, MessageSquare, ClipboardCheck, RotateCcw,
  Coffee, FileText, ListTodo, TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAuthorization } from '@/hooks/use-authorization';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Weekly timesheet parent record */
interface WeeklyTimesheet {
  id: string;
  user_id: string;
  week_start: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'revision';
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  reject_comment: string | null;
  created_at: string;
  updated_at: string;
  /** Joined from profiles for review tab */
  user_name?: string;
}

/** Per-day timesheet entry (child of WeeklyTimesheet) */
interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  project_id: string | null;
  task_type: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  hours: number;
  description: string | null;
  is_billable: boolean;
  created_at: string;
  updated_at: string;
  /** Joined */
  project_name?: string;
}

interface Project { id: string; name: string; }
interface Profile { id: string; full_name: string | null; reports_to: string | null; }

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; badge: string; icon: JSX.Element }> = {
  draft:    { label: 'Draft',     badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',          icon: <FileText className="h-3 w-3" /> },
  pending:  { label: 'Submitted', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',       icon: <Clock className="h-3 w-3" /> },
  approved: { label: 'Approved',  badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', icon: <CheckCircle2 className="h-3 w-3" /> },
  rejected: { label: 'Rejected',  badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',              icon: <X className="h-3 w-3" /> },
  revision: { label: 'Revision',  badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',  icon: <RotateCcw className="h-3 w-3" /> },
};

const TASK_TYPES = [
  { value: 'project',     label: 'Project Work' },
  { value: 'field_visit', label: 'Field Visit' },
  { value: 'training',    label: 'Training' },
  { value: 'admin',       label: 'Administrative' },
  { value: 'meeting',     label: 'Meeting' },
  { value: 'report',      label: 'Report Writing' },
  { value: 'other',       label: 'Other' },
];

const CACHE = { staleTime: 2 * 60_000, gcTime: 5 * 60_000, refetchOnWindowFocus: false } as const;

const BLANK_FORM = {
  date: format(new Date(), 'yyyy-MM-dd'),
  hours: '',
  start_time: '',
  end_time: '',
  break_minutes: '0',
  project_id: '',
  task_type: 'project',
  description: '',
  is_billable: true,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function weekStartStr(d: Date) {
  return format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd');
}

function calcHoursFromTimes(start: string, end: string, breakMins: number): number | null {
  if (!start || !end) return null;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const totalMins = (eh * 60 + em) - (sh * 60 + sm) - breakMins;
  if (totalMins <= 0) return null;
  return Math.round(totalMins / 15) * 0.25;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Timesheet() {
  const { currentUser } = useAppContext();
  const { toast } = useToast();
  const { hasAnyRole } = useAuthorization();
  const qc = useQueryClient();

  const isSupervisor = hasAnyRole([
    'super_admin', 'SuperAdmin', 'superAdmin',
    'admin', 'Admin',
    'supervisor', 'Supervisor',
    'finance', 'Finance',
    'fom', 'FOM',
  ]);

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [editEntry, setEditEntry]       = useState<TimesheetEntry | null>(null);
  const [form, setForm]                 = useState({ ...BLANK_FORM });
  const [saving, setSaving]             = useState(false);
  const [search, setSearch]             = useState('');
  const [activeTab, setActiveTab]       = useState<'my-week' | 'my-history' | 'review' | 'task-hours'>('my-week');
  const [rejectDialog, setRejectDialog] = useState<{ id: string; name: string } | null>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [reviewAction, setReviewAction] = useState<'rejected' | 'revision' | null>(null);
  const [submittingWeek, setSubmittingWeek] = useState(false);

  const userId = currentUser?.id ?? '';
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const wStartStr = weekStartStr(weekStart);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['ts-projects'],
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').eq('status', 'active').order('name');
      return (data ?? []) as Project[];
    },
  });

  const { data: profiles = [] } = useQuery<Profile[]>({
    queryKey: ['ts-profiles'],
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, reports_to').order('full_name');
      return (data ?? []) as Profile[];
    },
  });

  /**
   * Fetch the weekly parent timesheet for the current user and selected week.
   * Returns null when none exists yet (employee hasn't started logging).
   */
  const { data: weeklyTimesheet, isLoading: loadingWeek } = useQuery<WeeklyTimesheet | null>({
    queryKey: ['ts-weekly', userId, wStartStr],
    enabled: !!userId,
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase
        .from('timesheets')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start', wStartStr)
        .maybeSingle();
      return (data as WeeklyTimesheet | null) ?? null;
    },
  });

  /**
   * Fetch per-day entries for the current week's timesheet parent.
   * Empty when no parent exists yet.
   */
  const { data: weekEntries = [], isLoading: loadingEntries } = useQuery<TimesheetEntry[]>({
    queryKey: ['ts-entries', weeklyTimesheet?.id ?? 'none'],
    enabled: !!weeklyTimesheet?.id,
    ...CACHE,
    queryFn: async () => {
      if (!weeklyTimesheet?.id) return [];
      const { data } = await supabase
        .from('timesheet_entries')
        .select('*')
        .eq('timesheet_id', weeklyTimesheet.id)
        .order('date');
      return (data ?? []) as TimesheetEntry[];
    },
  });

  /**
   * Fetch historical weekly timesheets (parent records with total hours derived).
   */
  const { data: myHistory = [], isLoading: loadingHistory } = useQuery<WeeklyTimesheet[]>({
    queryKey: ['ts-history', userId],
    enabled: !!userId && activeTab === 'my-history',
    ...CACHE,
    queryFn: async () => {
      const { data } = await supabase
        .from('timesheets')
        .select('*')
        .eq('user_id', userId)
        .order('week_start', { ascending: false })
        .limit(52);
      return (data ?? []) as WeeklyTimesheet[];
    },
  });

  /** Review: submitted timesheets from direct reports (or all for admins) */
  const directReportIds = useMemo(
    () => profiles.filter(p => p.reports_to === userId).map(p => p.id),
    [profiles, userId]
  );

  const { data: pendingReview = [], isLoading: loadingReview } = useQuery<WeeklyTimesheet[]>({
    queryKey: ['ts-review', userId, directReportIds],
    enabled: isSupervisor && activeTab === 'review',
    ...CACHE,
    queryFn: async () => {
      const isAdmin = hasAnyRole(['super_admin', 'SuperAdmin', 'superAdmin', 'admin', 'Admin']);
      if (!isAdmin && directReportIds.length === 0) return [];

      let q = supabase
        .from('timesheets')
        .select('*')
        .in('status', ['pending', 'revision'])
        .order('week_start', { ascending: false })
        .limit(200);

      if (!isAdmin) {
        q = q.in('user_id', directReportIds);
      }

      const { data } = await q;
      const pm: Record<string, string> = Object.fromEntries(profiles.map(p => [p.id, p.full_name ?? 'Unknown']));
      return ((data ?? []) as WeeklyTimesheet[]).map(ts => ({
        ...ts,
        user_name: pm[ts.user_id] ?? 'Unknown',
      }));
    },
  });

  /** Fetch tasks that have at least estimated or actual hours logged */
  const [taskHoursUser, setTaskHoursUser] = useState<string>('');
  const { data: taskHoursRows = [], isLoading: loadingTaskHours } = useQuery<{
    id: string; title: string; status: string; due_date: string | null;
    estimated_hours: number | null; actual_hours: number | null;
    assigned_to_name: string | null; user_id: string;
    started_at: string | null; completed_at: string | null;
  }[]>({
    queryKey: ['ts-task-hours', userId, taskHoursUser, activeTab],
    enabled: !!userId && activeTab === 'task-hours',
    ...CACHE,
    queryFn: async () => {
      const isAdmin = hasAnyRole(['super_admin', 'SuperAdmin', 'superAdmin', 'admin', 'Admin']);
      let q = supabase
        .from('personal_tasks')
        .select('id, title, status, due_date, estimated_hours, actual_hours, assigned_to_name, user_id, started_at, completed_at')
        .or('estimated_hours.not.is.null,actual_hours.not.is.null')
        .order('due_date', { ascending: false })
        .limit(300);
      if (isAdmin && taskHoursUser) {
        q = q.eq('user_id', taskHoursUser);
      } else if (!isAdmin) {
        q = q.eq('user_id', userId);
      }
      const { data } = await q;
      return (data ?? []) as typeof taskHoursRows;
    },
  });

  // ── Derived ────────────────────────────────────────────────────────────────

  const projMap = useMemo(() => Object.fromEntries(projects.map(p => [p.id, p.name])), [projects]);

  const weekEntriesEnriched = useMemo(() =>
    weekEntries.map(e => ({
      ...e,
      project_name: e.project_id ? (projMap[e.project_id] ?? '—') : '—',
    })), [weekEntries, projMap]);

  const weekTotal = useMemo(() =>
    weekEntriesEnriched.reduce((s, e) => s + Number(e.hours), 0), [weekEntriesEnriched]);

  const weekStatus = weeklyTimesheet?.status ?? 'empty';
  const canEditWeek = !weeklyTimesheet || weekStatus === 'draft' || weekStatus === 'revision';
  const canSubmitWeek = weekEntriesEnriched.length > 0 && (weekStatus === 'draft' || weekStatus === 'revision' || weekStatus === 'empty');

  // ── Cache invalidation helpers ─────────────────────────────────────────────

  const invalidateWeek = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['ts-weekly', userId, wStartStr] });
    qc.invalidateQueries({ queryKey: ['ts-entries'] });
  }, [qc, userId, wStartStr]);

  const invalidateHistory = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['ts-history', userId] });
  }, [qc, userId]);

  const invalidateReview = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['ts-review', userId] });
  }, [qc, userId]);

  const invalidateAll = useCallback(() => {
    invalidateWeek();
    invalidateHistory();
    invalidateReview();
  }, [invalidateWeek, invalidateHistory, invalidateReview]);

  // ── Ensure weekly timesheet parent exists ──────────────────────────────────

  async function ensureWeeklyTimesheet(): Promise<string> {
    if (weeklyTimesheet?.id) return weeklyTimesheet.id;

    // Upsert a new weekly parent
    const { data, error } = await supabase
      .from('timesheets')
      .upsert({ user_id: userId, week_start: wStartStr, status: 'draft' }, { onConflict: 'user_id,week_start' })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    qc.invalidateQueries({ queryKey: ['ts-weekly', userId, wStartStr] });
    return data.id;
  }

  // ── Entry dialog ───────────────────────────────────────────────────────────

  function openNew(date?: string) {
    setEditEntry(null);
    setForm({ ...BLANK_FORM, date: date ?? format(new Date(), 'yyyy-MM-dd') });
    setDialogOpen(true);
  }

  function openEdit(entry: TimesheetEntry) {
    setEditEntry(entry);
    setForm({
      date: entry.date,
      hours: String(entry.hours),
      start_time: entry.start_time ?? '',
      end_time: entry.end_time ?? '',
      break_minutes: String(entry.break_minutes ?? 0),
      project_id: entry.project_id ?? '',
      task_type: entry.task_type,
      description: entry.description ?? '',
      is_billable: entry.is_billable,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    let h = parseFloat(form.hours);
    if (form.start_time && form.end_time) {
      const computed = calcHoursFromTimes(form.start_time, form.end_time, parseInt(form.break_minutes) || 0);
      if (computed !== null) h = computed;
    }
    if (!form.date || isNaN(h) || h <= 0 || h > 24) {
      toast({ title: 'Please enter a valid date and hours (0.25–24)', variant: 'destructive' });
      return;
    }
    // Enforce that the entry date belongs to the currently selected week
    const entryWeekStart = weekStartStr(parseISO(form.date));
    if (entryWeekStart !== wStartStr) {
      toast({ title: 'Date is outside the selected week', description: 'Navigate to that week before logging hours for it.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      if (editEntry) {
        const { error } = await supabase.from('timesheet_entries').update({
          date: form.date,
          hours: h,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          break_minutes: parseInt(form.break_minutes) || 0,
          project_id: form.project_id || null,
          task_type: form.task_type,
          description: form.description || null,
          is_billable: form.is_billable,
          updated_at: now,
        }).eq('id', editEntry.id);
        if (error) throw new Error(error.message);
        toast({ title: 'Entry updated' });
      } else {
        // Ensure parent timesheet exists first
        const timesheetId = await ensureWeeklyTimesheet();
        const { error } = await supabase.from('timesheet_entries').insert({
          timesheet_id: timesheetId,
          date: form.date,
          hours: h,
          start_time: form.start_time || null,
          end_time: form.end_time || null,
          break_minutes: parseInt(form.break_minutes) || 0,
          project_id: form.project_id || null,
          task_type: form.task_type,
          description: form.description || null,
          is_billable: form.is_billable,
          created_at: now,
          updated_at: now,
        });
        if (error) throw new Error(error.message);
        toast({ title: 'Hours logged' });
      }
      setDialogOpen(false);
      invalidateAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entryId: string) {
    const { error } = await supabase.from('timesheet_entries').delete().eq('id', entryId);
    if (error) { toast({ title: 'Error deleting entry', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Entry deleted' });
    invalidateAll();
  }

  // ── Weekly timesheet submission ────────────────────────────────────────────

  async function submitWeek() {
    if (weekEntriesEnriched.length === 0) {
      toast({ title: 'No entries to submit — log some hours first', variant: 'destructive' });
      return;
    }
    setSubmittingWeek(true);
    try {
      let tsId = weeklyTimesheet?.id;
      if (!tsId) {
        tsId = await ensureWeeklyTimesheet();
      }
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('timesheets')
        .update({ status: 'pending', submitted_at: now, updated_at: now })
        .eq('id', tsId);
      if (error) throw new Error(error.message);
      toast({ title: 'Timesheet submitted for approval' });
      invalidateAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: 'Error submitting', description: msg, variant: 'destructive' });
    } finally {
      setSubmittingWeek(false);
    }
  }

  // ── Supervisor actions ─────────────────────────────────────────────────────

  async function handleApprove(timesheetId: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('timesheets')
      .update({ status: 'approved', approved_by: userId, approved_at: now, updated_at: now })
      .eq('id', timesheetId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Timesheet approved' });
    invalidateAll();
  }

  async function handleApproveAll() {
    const now = new Date().toISOString();
    const ids = pendingReview.map(ts => ts.id);
    if (ids.length === 0) return;
    const { error } = await supabase
      .from('timesheets')
      .update({ status: 'approved', approved_by: userId, approved_at: now, updated_at: now })
      .in('id', ids);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `${ids.length} timesheet(s) approved` });
    invalidateAll();
  }

  async function handleRejectOrRevision(timesheetId: string, newStatus: 'rejected' | 'revision') {
    // Rejection requires a non-empty comment so employees understand why
    if (newStatus === 'rejected' && !rejectComment.trim()) {
      toast({ title: 'Please provide a reason for rejection', variant: 'destructive' });
      return;
    }
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('timesheets')
      .update({ status: newStatus, reject_comment: rejectComment.trim() || null, updated_at: now })
      .eq('id', timesheetId);
    if (error) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); return; }
    toast({ title: newStatus === 'rejected' ? 'Timesheet rejected' : 'Revision requested' });
    setRejectDialog(null);
    setRejectComment('');
    setReviewAction(null);
    invalidateAll();
  }

  // ── Auto-calculate hours from time fields ──────────────────────────────────

  function handleTimeChange(field: 'start_time' | 'end_time' | 'break_minutes', value: string) {
    const updated = { ...form, [field]: value };
    const h = calcHoursFromTimes(updated.start_time, updated.end_time, parseInt(updated.break_minutes) || 0);
    setForm({ ...updated, hours: h !== null ? String(h) : form.hours });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Clock className="h-6 w-6 text-blue-500" />
            Timesheet
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Log hours, submit weekly timesheets &amp; track approvals
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => { setActiveTab(v as typeof activeTab); setSearch(''); }}>
        <TabsList className="bg-white dark:bg-slate-900 border shadow-sm rounded-xl p-1">
          <TabsTrigger value="my-week" className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white">
            <Calendar className="h-3.5 w-3.5" />This Week
          </TabsTrigger>
          <TabsTrigger value="my-history" className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white">
            <Clock className="h-3.5 w-3.5" />My History
          </TabsTrigger>
          {isSupervisor && (
            <TabsTrigger value="review" className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white">
              <ClipboardCheck className="h-3.5 w-3.5" />Review
              {pendingReview.length > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
                  {pendingReview.length}
                </span>
              )}
            </TabsTrigger>
          )}
          <TabsTrigger value="task-hours" className="text-xs rounded-lg gap-1.5 data-[state=active]:bg-[#0F2041] data-[state=active]:text-white">
            <ListTodo className="h-3.5 w-3.5" />Task Hours
          </TabsTrigger>
        </TabsList>

        {/* ── MY WEEK ──────────────────────────────────────────────────────── */}
        <TabsContent value="my-week" className="mt-4">
          <WeekView
            weekStart={weekStart}
            weekEnd={weekEnd}
            weekDays={weekDays}
            entries={weekEntriesEnriched}
            weekTotal={weekTotal}
            weekStatus={weekStatus}
            weeklyTimesheet={weeklyTimesheet ?? null}
            canEdit={canEditWeek}
            canSubmit={canSubmitWeek}
            loading={loadingWeek || loadingEntries}
            submittingWeek={submittingWeek}
            onPrevWeek={() => setWeekStart(w => subWeeks(w, 1))}
            onNextWeek={() => setWeekStart(w => addWeeks(w, 1))}
            onAddEntry={openNew}
            onEditEntry={openEdit}
            onDeleteEntry={handleDelete}
            onSubmitWeek={submitWeek}
          />
        </TabsContent>

        {/* ── MY HISTORY ───────────────────────────────────────────────────── */}
        <TabsContent value="my-history" className="mt-4 space-y-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8 text-sm" placeholder="Search weeks…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-history-search" />
          </div>
          {loadingHistory
            ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            : myHistory.length === 0
              ? <EmptyState icon={<Clock className="h-10 w-10" />} msg="No timesheet history yet." action={<Button variant="outline" onClick={() => { setActiveTab('my-week'); openNew(); }}>Log your first hours</Button>} />
              : <HistoryList timesheets={myHistory.filter(ts => !search.trim() || STATUS_CFG[ts.status]?.label.toLowerCase().includes(search.toLowerCase()) || format(parseISO(ts.week_start), 'dd MMM yyyy').includes(search))} />
          }
        </TabsContent>

        {/* ── REVIEW ───────────────────────────────────────────────────────── */}
        {isSupervisor && (
          <TabsContent value="review" className="mt-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8 text-sm w-52" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-review-search" />
              </div>
              {pendingReview.length > 0 && (
                <Button size="sm" variant="outline" className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                  onClick={handleApproveAll} data-testid="btn-approve-all">
                  <CheckCircle2 className="h-3.5 w-3.5" />Approve All ({pendingReview.length})
                </Button>
              )}
            </div>
            {loadingReview
              ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              : pendingReview.length === 0
                ? <EmptyState icon={<ClipboardCheck className="h-10 w-10" />} msg="No pending timesheets to review." />
                : (
                  <div className="space-y-2">
                    {pendingReview
                      .filter(ts => !search.trim() ||
                        (ts.user_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
                        format(parseISO(ts.week_start), 'dd MMM yyyy').includes(search))
                      .map(ts => (
                        <ReviewCard
                          key={ts.id}
                          timesheet={ts}
                          onApprove={() => handleApprove(ts.id)}
                          onReject={() => { setRejectDialog({ id: ts.id, name: ts.user_name ?? '' }); setReviewAction('rejected'); }}
                          onRevision={() => { setRejectDialog({ id: ts.id, name: ts.user_name ?? '' }); setReviewAction('revision'); }}
                        />
                      ))}
                  </div>
                )
            }
          </TabsContent>
        )}

        {/* ── TASK HOURS ───────────────────────────────────────────────────── */}
        <TabsContent value="task-hours" className="mt-4">
          {/* Admin user filter */}
          {hasAnyRole(['super_admin', 'SuperAdmin', 'superAdmin', 'admin', 'Admin']) && (
            <div className="flex items-center gap-3 mb-4">
              <Select value={taskHoursUser || '__all__'} onValueChange={v => setTaskHoursUser(v === '__all__' ? '' : v)}>
                <SelectTrigger className="w-56 h-9 text-sm" data-testid="select-task-hours-user">
                  <SelectValue placeholder="All team members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All team members</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? p.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{taskHoursRows.length} task{taskHoursRows.length !== 1 ? 's' : ''} with hours logged</span>
            </div>
          )}

          {loadingTaskHours
            ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            : taskHoursRows.length === 0
              ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <ListTodo className="h-10 w-10 opacity-30" />
                  <p className="text-sm font-medium">No tasks with hours logged yet.</p>
                  <p className="text-xs">Add estimated or actual hours when creating or editing a task.</p>
                </div>
              )
              : (() => {
                  const totalEst  = taskHoursRows.reduce((s, r) => s + (r.estimated_hours ?? 0), 0);
                  const totalAct  = taskHoursRows.reduce((s, r) => s + (r.actual_hours ?? 0), 0);
                  const variance  = totalAct - totalEst;
                  return (
                    <div className="space-y-4">
                      {/* Summary strip */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: 'Total Estimated', value: totalEst, icon: <Clock className="h-4 w-4 text-blue-500" /> },
                          { label: 'Total Actual',    value: totalAct, icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
                          { label: 'Variance',        value: variance,
                            icon: variance > 0 ? <TrendingUp className="h-4 w-4 text-amber-500" />
                                : variance < 0 ? <TrendingDown className="h-4 w-4 text-green-500" />
                                : <Minus className="h-4 w-4 text-slate-400" />,
                            color: variance > 0 ? 'text-amber-600' : variance < 0 ? 'text-green-600' : 'text-slate-500',
                          },
                        ].map(card => (
                          <div key={card.label} className="bg-white dark:bg-slate-900 border rounded-xl p-3 flex flex-col gap-1 shadow-sm">
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">{card.icon}{card.label}</div>
                            <p className={cn('text-xl font-bold', (card as { color?: string }).color)}>
                              {(card.value >= 0 ? '' : '-')}{Math.abs(card.value).toFixed(1)}h
                              {card.label === 'Variance' && card.value > 0 && <span className="text-xs font-normal ml-1">over</span>}
                              {card.label === 'Variance' && card.value < 0 && <span className="text-xs font-normal ml-1">under</span>}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Table */}
                      <div className="bg-white dark:bg-slate-900 border rounded-xl shadow-sm overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-slate-50 dark:bg-slate-800">
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Task</th>
                              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                              <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Due</th>
                              <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Est.</th>
                              <th className="text-right px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Actual</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">+/-</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {taskHoursRows.map(row => {
                              const est  = row.estimated_hours ?? 0;
                              const act  = row.actual_hours ?? 0;
                              const diff = act - est;
                              const hasEst = row.estimated_hours != null;
                              const hasAct = row.actual_hours != null;
                              return (
                                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" data-testid={`row-task-hours-${row.id}`}>
                                  <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200 max-w-[240px]">
                                    <p className="truncate">{row.title}</p>
                                    {row.assigned_to_name && (
                                      <p className="text-xs text-muted-foreground truncate">{row.assigned_to_name}</p>
                                    )}
                                  </td>
                                  <td className="px-3 py-2.5">
                                    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide',
                                      row.status === 'done'        ? 'bg-emerald-100 text-emerald-700' :
                                      row.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                                      row.status === 'todo'        ? 'bg-slate-100 text-slate-600' :
                                      'bg-amber-100 text-amber-700'
                                    )}>
                                      {row.status.replace('_', ' ')}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2.5 text-slate-500 text-xs whitespace-nowrap">
                                    {row.due_date ? format(parseISO(row.due_date), 'dd MMM') : '—'}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-600">
                                    {hasEst ? `${est.toFixed(1)}h` : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-600">
                                    {hasAct ? `${act.toFixed(1)}h` : <span className="text-slate-300">—</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-mono text-xs">
                                    {(hasEst && hasAct) ? (
                                      <span className={cn('font-semibold', diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-green-600' : 'text-slate-400')}>
                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}h
                                      </span>
                                    ) : <span className="text-slate-300">—</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="border-t bg-slate-50 dark:bg-slate-800 font-semibold">
                              <td className="px-4 py-2.5 text-xs text-slate-600" colSpan={3}>Totals ({taskHoursRows.length} tasks)</td>
                              <td className="px-3 py-2.5 text-right font-mono text-xs text-blue-700">{totalEst.toFixed(1)}h</td>
                              <td className="px-3 py-2.5 text-right font-mono text-xs text-emerald-700">{totalAct.toFixed(1)}h</td>
                              <td className={cn('px-4 py-2.5 text-right font-mono text-xs font-bold', variance > 0 ? 'text-amber-600' : variance < 0 ? 'text-green-600' : 'text-slate-400')}>
                                {variance > 0 ? '+' : ''}{variance.toFixed(1)}h
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()
          }
        </TabsContent>
      </Tabs>

      {/* ── Log / Edit Entry Dialog ──────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editEntry ? 'Edit Entry' : 'Log Hours'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Date *</Label>
              <Input
                type="date"
                value={form.date}
                min={wStartStr}
                max={format(weekEnd, 'yyyy-MM-dd')}
                onChange={e => setForm(p => ({ ...p, date: e.target.value }))}
                data-testid="input-ts-date"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Week: {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label>Start Time</Label>
                <Input type="time" value={form.start_time} onChange={e => handleTimeChange('start_time', e.target.value)} data-testid="input-ts-start" />
              </div>
              <div>
                <Label>End Time</Label>
                <Input type="time" value={form.end_time} onChange={e => handleTimeChange('end_time', e.target.value)} data-testid="input-ts-end" />
              </div>
              <div>
                <Label className="flex items-center gap-1"><Coffee className="h-3 w-3" />Break (min)</Label>
                <Input type="number" min={0} max={480} step={5} value={form.break_minutes}
                  onChange={e => handleTimeChange('break_minutes', e.target.value)} data-testid="input-ts-break" />
              </div>
            </div>
            <div>
              <Label>
                Hours *{' '}
                {form.start_time && form.end_time && <span className="text-xs text-muted-foreground ml-1">(auto-calculated)</span>}
              </Label>
              <Input type="number" min={0.25} max={24} step={0.25} value={form.hours}
                onChange={e => setForm(p => ({ ...p, hours: e.target.value }))} placeholder="e.g. 4.5" data-testid="input-ts-hours" />
            </div>
            <div>
              <Label>Activity Type</Label>
              <Select value={form.task_type} onValueChange={v => setForm(p => ({ ...p, task_type: v }))}>
                <SelectTrigger data-testid="select-ts-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Project (optional)</Label>
              <Select value={form.project_id} onValueChange={v => setForm(p => ({ ...p, project_id: v }))}>
                <SelectTrigger data-testid="select-ts-project"><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                rows={2} placeholder="What did you work on?" data-testid="textarea-ts-notes" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="billable" checked={form.is_billable}
                onChange={e => setForm(p => ({ ...p, is_billable: e.target.checked }))} className="h-4 w-4 rounded" data-testid="checkbox-billable" />
              <Label htmlFor="billable" className="cursor-pointer">Billable hours</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.date} data-testid="btn-save-hours">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {editEntry ? 'Update' : 'Log Hours'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Reject / Revision Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!rejectDialog} onOpenChange={open => { if (!open) { setRejectDialog(null); setRejectComment(''); setReviewAction(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{reviewAction === 'revision' ? 'Request Revision' : 'Reject Timesheet'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {reviewAction === 'revision'
                ? `Request ${rejectDialog?.name} to revise their timesheet.`
                : `Reject timesheet from ${rejectDialog?.name}.`}
            </p>
            <div>
              <Label>
                Comment{' '}
                {reviewAction === 'rejected'
                  ? <span className="text-red-500 ml-0.5">* Required</span>
                  : <span className="text-muted-foreground ml-1">(optional)</span>}
              </Label>
              <Textarea value={rejectComment} onChange={e => setRejectComment(e.target.value)}
                rows={3} placeholder={reviewAction === 'rejected' ? 'Explain why this timesheet is being rejected…' : 'What needs to be revised?'}
                data-testid="textarea-reject-comment" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectDialog(null); setRejectComment(''); setReviewAction(null); }}>Cancel</Button>
            <Button
              variant={reviewAction === 'rejected' ? 'destructive' : 'default'}
              onClick={() => {
                if (rejectDialog && reviewAction) {
                  handleRejectOrRevision(rejectDialog.id, reviewAction);
                }
              }}
              data-testid="btn-confirm-reject"
            >
              {reviewAction === 'revision' ? <RotateCcw className="h-4 w-4 mr-1" /> : <X className="h-4 w-4 mr-1" />}
              {reviewAction === 'revision' ? 'Request Revision' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Week View ─────────────────────────────────────────────────────────────────

function WeekView({
  weekStart, weekEnd, weekDays, entries, weekTotal, weekStatus, weeklyTimesheet,
  canEdit, canSubmit, loading, submittingWeek,
  onPrevWeek, onNextWeek, onAddEntry, onEditEntry, onDeleteEntry, onSubmitWeek,
}: {
  weekStart: Date; weekEnd: Date; weekDays: Date[];
  entries: (TimesheetEntry & { project_name?: string })[];
  weekTotal: number; weekStatus: string;
  weeklyTimesheet: WeeklyTimesheet | null;
  canEdit: boolean; canSubmit: boolean; loading: boolean; submittingWeek: boolean;
  onPrevWeek: () => void; onNextWeek: () => void;
  onAddEntry: (date?: string) => void;
  onEditEntry: (e: TimesheetEntry) => void;
  onDeleteEntry: (id: string) => void;
  onSubmitWeek: () => void;
}) {
  const stCfg = STATUS_CFG[weekStatus] ?? STATUS_CFG.draft;

  return (
    <div className="space-y-4">
      {/* Week nav + status */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-white dark:bg-slate-900 border rounded-xl px-2 py-1.5 shadow-sm">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onPrevWeek} data-testid="btn-prev-week">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-semibold min-w-[210px] text-center">
              {format(weekStart, 'dd MMM')} – {format(weekEnd, 'dd MMM yyyy')}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onNextWeek} data-testid="btn-next-week">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {weekStatus !== 'empty' && (
            <span className={cn('flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full', stCfg.badge)}>
              {stCfg.icon}{stCfg.label}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => onAddEntry()} className="gap-1.5" data-testid="btn-log-hours">
              <Plus className="h-3.5 w-3.5" />Log Hours
            </Button>
          )}
          {canSubmit && (
            <Button size="sm" onClick={onSubmitWeek} disabled={submittingWeek} className="gap-1.5 bg-[#0F2041] hover:bg-[#1D3461] text-white" data-testid="btn-submit-week">
              {submittingWeek ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Submit Week
            </Button>
          )}
        </div>
      </div>

      {/* Status banners */}
      {weekStatus === 'pending' && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 text-sm text-amber-800 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <p>This week's timesheet has been submitted and is awaiting approval.</p>
        </div>
      )}
      {weekStatus === 'approved' && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/40 text-sm text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-500" />
          <p>This week's timesheet has been approved.</p>
        </div>
      )}
      {weekStatus === 'rejected' && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800/40 text-sm text-red-800 dark:text-red-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
          <div>
            <p>This week's timesheet was rejected.</p>
            {weeklyTimesheet?.reject_comment && (
              <p className="mt-1 font-medium">Reason: {weeklyTimesheet.reject_comment}</p>
            )}
          </div>
        </div>
      )}
      {weekStatus === 'revision' && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-violet-200 bg-violet-50 dark:bg-violet-950/20 dark:border-violet-800/40 text-sm text-violet-800 dark:text-violet-200">
          <RotateCcw className="h-4 w-4 mt-0.5 shrink-0 text-violet-500" />
          <div>
            <p>Revision requested. Update your entries and resubmit.</p>
            {weeklyTimesheet?.reject_comment && (
              <p className="mt-1 font-medium">Feedback: {weeklyTimesheet.reject_comment}</p>
            )}
          </div>
        </div>
      )}

      {/* Daily grid */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map(day => {
          const dayStr = format(day, 'yyyy-MM-dd');
          const dayEntries = entries.filter(e => isSameDay(parseISO(e.date), day));
          const dayHours = dayEntries.reduce((s, e) => s + Number(e.hours), 0);
          return (
            <div
              key={day.toISOString()}
              className={cn(
                'rounded-xl border p-2 text-center transition-colors min-h-[72px] flex flex-col items-center justify-between',
                isToday(day) ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-700' : 'bg-white dark:bg-slate-900 border-border',
              )}
              data-testid={`day-cell-${dayStr}`}
            >
              <div>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{format(day, 'EEE')}</p>
                <p className={cn('text-sm font-bold', isToday(day) && 'text-blue-600 dark:text-blue-400')}>{format(day, 'd')}</p>
              </div>
              <p className={cn('text-xs font-semibold mt-1',
                dayHours >= 8 ? 'text-emerald-600' : dayHours > 0 ? 'text-amber-600' : 'text-muted-foreground'
              )}>
                {dayHours > 0 ? `${dayHours.toFixed(1)}h` : '—'}
              </p>
              {canEdit && (
                <button onClick={() => onAddEntry(dayStr)}
                  className="mt-1 text-[10px] text-muted-foreground hover:text-blue-600 transition-colors"
                  data-testid={`btn-add-day-${dayStr}`}>
                  <Plus className="h-3 w-3 mx-auto" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Week summary */}
      <div className="flex items-center gap-4 px-1">
        <span className="text-sm text-muted-foreground">
          Week total:{' '}
          <span className={cn('font-bold',
            weekTotal >= 40 ? 'text-emerald-600' : weekTotal > 0 ? 'text-amber-600' : 'text-muted-foreground'
          )}>
            {weekTotal.toFixed(1)}h
          </span>
        </span>
        {weekTotal < 40 && weekTotal > 0 && (
          <span className="text-xs text-muted-foreground">({(40 - weekTotal).toFixed(1)}h remaining)</span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
        </span>
      </div>

      {/* Entry list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-10 w-10" />}
          msg="No entries logged for this week."
          action={canEdit ? <Button variant="outline" onClick={() => onAddEntry()} className="gap-1.5"><Plus className="h-3.5 w-3.5" />Log Hours</Button> : undefined}
        />
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              canEdit={canEdit}
              onEdit={() => onEditEntry(entry)}
              onDelete={() => onDeleteEntry(entry.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Entry Card ────────────────────────────────────────────────────────────────

function EntryCard({
  entry, canEdit, onEdit, onDelete,
}: {
  entry: TimesheetEntry & { project_name?: string };
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 bg-white dark:bg-slate-900 border rounded-xl px-4 py-3 shadow-sm group"
      data-testid={`entry-card-${entry.id}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold">{format(parseISO(entry.date), 'EEE, dd MMM')}</span>
          <span className="text-xs text-muted-foreground">
            {TASK_TYPES.find(t => t.value === entry.task_type)?.label ?? entry.task_type}
          </span>
          {entry.project_name && entry.project_name !== '—' && (
            <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
              <Briefcase className="h-3 w-3" />{entry.project_name}
            </span>
          )}
          {entry.is_billable && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-medium">
              Billable
            </span>
          )}
        </div>
        {entry.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{entry.description}</p>
        )}
        {entry.start_time && entry.end_time && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {entry.start_time} – {entry.end_time}
            {entry.break_minutes > 0 && ` (${entry.break_minutes}min break)`}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={cn(
          'text-sm font-bold w-12 text-right',
          Number(entry.hours) >= 8 ? 'text-emerald-600' : 'text-[#0F2041] dark:text-white'
        )}>
          {Number(entry.hours).toFixed(1)}h
        </span>
        {canEdit && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} data-testid={`btn-edit-entry-${entry.id}`}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600" onClick={onDelete} data-testid={`btn-delete-entry-${entry.id}`}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── History List ──────────────────────────────────────────────────────────────

function HistoryList({ timesheets }: { timesheets: WeeklyTimesheet[] }) {
  return (
    <div className="space-y-2">
      {timesheets.map(ts => {
        const stCfg = STATUS_CFG[ts.status] ?? STATUS_CFG.draft;
        const weekEnd = format(
          endOfWeek(parseISO(ts.week_start), { weekStartsOn: 1 }),
          'dd MMM yyyy'
        );
        return (
          <div
            key={ts.id}
            className="flex items-center gap-4 bg-white dark:bg-slate-900 border rounded-xl px-4 py-3 shadow-sm"
            data-testid={`history-row-${ts.id}`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {format(parseISO(ts.week_start), 'dd MMM')} – {weekEnd}
              </p>
              {ts.submitted_at && (
                <p className="text-xs text-muted-foreground">
                  Submitted {format(parseISO(ts.submitted_at), 'dd MMM yyyy')}
                </p>
              )}
              {ts.reject_comment && (
                <p className="text-xs text-red-500 mt-0.5">Feedback: {ts.reject_comment}</p>
              )}
            </div>
            <span className={cn('flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full', stCfg.badge)}>
              {stCfg.icon}{stCfg.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Review Card ───────────────────────────────────────────────────────────────

function ReviewCard({
  timesheet, onApprove, onReject, onRevision,
}: {
  timesheet: WeeklyTimesheet;
  onApprove: () => void;
  onReject: () => void;
  onRevision: () => void;
}) {
  const stCfg = STATUS_CFG[timesheet.status] ?? STATUS_CFG.draft;
  const weekEnd = format(
    endOfWeek(parseISO(timesheet.week_start), { weekStartsOn: 1 }),
    'dd MMM yyyy'
  );

  return (
    <div
      className="bg-white dark:bg-slate-900 border rounded-xl px-4 py-3 shadow-sm space-y-3"
      data-testid={`review-card-${timesheet.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{timesheet.user_name ?? 'Unknown'}</p>
          <p className="text-xs text-muted-foreground">
            {format(parseISO(timesheet.week_start), 'dd MMM')} – {weekEnd}
          </p>
          {timesheet.submitted_at && (
            <p className="text-xs text-muted-foreground">
              Submitted {format(parseISO(timesheet.submitted_at), 'dd MMM yyyy HH:mm')}
            </p>
          )}
        </div>
        <span className={cn('flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0', stCfg.badge)}>
          {stCfg.icon}{stCfg.label}
        </span>
      </div>
      {timesheet.reject_comment && (
        <div className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg px-3 py-2 text-amber-800 dark:text-amber-200">
          <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{timesheet.reject_comment}</span>
        </div>
      )}
      <div className="flex items-center gap-2 justify-end">
        <Button size="sm" variant="outline" className="gap-1.5 text-violet-700 border-violet-300 hover:bg-violet-50 h-8"
          onClick={onRevision} data-testid={`btn-revision-${timesheet.id}`}>
          <RotateCcw className="h-3.5 w-3.5" />Revision
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 h-8"
          onClick={onReject} data-testid={`btn-reject-${timesheet.id}`}>
          <X className="h-3.5 w-3.5" />Reject
        </Button>
        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
          onClick={onApprove} data-testid={`btn-approve-${timesheet.id}`}>
          <CheckCircle2 className="h-3.5 w-3.5" />Approve
        </Button>
      </div>
    </div>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────

function EmptyState({ icon, msg, action }: { icon: JSX.Element; msg: string; action?: JSX.Element }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <div className="opacity-30">{icon}</div>
      <p className="text-sm">{msg}</p>
      {action && action}
    </div>
  );
}
