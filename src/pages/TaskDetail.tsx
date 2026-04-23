import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import {
  ArrowLeft, Calendar, Clock, User as UserIcon, Users, Tag, MessageSquare, FileText,
  MessageCircle, ListChecks, Plus, X, Check, Trash2, Send, History, Loader2,
  PlayCircle, Lock, ShieldCheck, Target,
} from 'lucide-react';
import { StartTaskDialog, type StartTaskPayload } from '@/components/tasks/StartTaskDialog';
import type { StartDependencyRecord } from '@/hooks/usePersonalTasks';
import { useTaskNotifications } from '@/hooks/useTaskNotifications';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { TaskRichEditor } from '@/components/tasks/TaskRichEditor';
import { TaskStatusMenu } from '@/components/tasks/TaskStatusMenu';
import {
  useTaskStatusHistory, useTaskActivity, useAddActivity,
  useTaskElements, useAddElement, useToggleElement, useDeleteElement,
} from '@/hooks/useTaskActivity';
import { STATUS_LABELS, STATUS_COLORS, type PersonalTaskStatus } from '@/hooks/usePersonalTasks';
import { useToast } from '@/hooks/use-toast';
import { ApprovalPendingCard } from '@/components/ApprovalPendingCard';
import { ApprovalHistoryPanel } from '@/components/ApprovalHistoryPanel';
import { TaskDependenciesView } from '@/components/TaskDependenciesView';
import { canTaskStart } from '@/services/task-dependencies.service';

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser, hasRole } = useUser();
  const { toast } = useToast();
  const { notify } = useTaskNotifications();

  const isAdmin = hasRole('admin') || hasRole('super_admin');

  const [activeTab, setActiveTab] = useState<'message' | 'log_note' | 'whatsapp' | 'activity'>('message');
  const [draft, setDraft] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [outputDraft, setOutputDraft] = useState<string | null>(null);
  const [savingOutput, setSavingOutput] = useState(false);

  // ---------- Fetch task ----------
  const { data: task, isLoading } = useQuery({
    queryKey: ['task-detail', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('personal_tasks')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // ---------- Fetch status history & activity & elements ----------
  const { data: history = [] } = useTaskStatusHistory(id);
  const { data: activity = [] } = useTaskActivity(id);
  const { data: elements = [] } = useTaskElements(id);

  // ---------- Dependency gate (task_dependencies table) ----------
  // Blocks the Start button when any predecessor task isn't done yet.
  // Fail-closed: while loading or on error, treat as blocked so the user
  // cannot bypass via timing or a transient service failure.
  const depGateQuery = useQuery({
    queryKey: ['task-can-start', id],
    queryFn: async () => {
      if (!id) return { canStart: true, blockingTasks: [] as any[], errored: false };
      const res = await canTaskStart(id);
      return {
        canStart: res.canStart,
        blockingTasks: res.blockingTasks ?? [],
        errored: !!res.error,
      };
    },
    enabled: !!id,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    retry: 1,
  });
  const depGate = depGateQuery.data;
  const depGateLoading = depGateQuery.isLoading || depGateQuery.isFetching;
  const depGateErrored = depGateQuery.isError || !!depGate?.errored;
  // True whenever we can't prove the task is unblocked.
  const depBlocked =
    depGateLoading ||
    depGateErrored ||
    !!(depGate && !depGate.canStart);

  // ---------- Mutations ----------
  const addActivity = useAddActivity();
  const addElement = useAddElement();
  const toggleElement = useToggleElement();
  const deleteElement = useDeleteElement();

  const updateTask = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from('personal_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task-detail', id] });
      qc.invalidateQueries({ queryKey: ['personal_tasks'] });
      qc.invalidateQueries({ queryKey: ['task-status-history', id] });
    },
  });

  // Recipient set for lifecycle notifications (owner + assignee + co-assignees, minus actor)
  const lifecycleRecipients = useMemo(() => {
    if (!task) return [] as string[];
    const set = new Set<string>();
    if (task.user_id) set.add(task.user_id as string);
    if (task.assigned_to) set.add(task.assigned_to as string);
    ((task.co_assignees as Array<{ id: string }> | undefined) ?? []).forEach(c => { if (c?.id) set.add(c.id); });
    if (currentUser?.id) set.delete(currentUser.id);
    return Array.from(set);
  }, [task, currentUser?.id]);

  // ---------- Acknowledge ("I've seen it") — does NOT auto-start ----------
  // Updates the right column depending on who is acknowledging:
  //   • Primary assignee / owner → top-level `acknowledged_at` / `_by`
  //   • Co-assignee              → that user's slot inside `co_assignees` JSON
  // This way every collaborator can independently confirm they've seen the task.
  const acknowledgeTask = useMutation({
    mutationFn: async () => {
      const now = new Date().toISOString();
      const uid = currentUser?.id ?? null;
      if (!uid) throw new Error('Not signed in');
      const isPrimary =
        task?.assigned_to === uid || (task?.user_id === uid && !task?.assigned_to);
      const patch: Record<string, unknown> = { updated_at: now };
      if (isPrimary) {
        patch.acknowledged_at = now;
        patch.acknowledged_by = uid;
      } else {
        // Co-assignee path: stamp the matching slot inside co_assignees.
        const co = (task?.co_assignees as Array<Record<string, unknown>> | undefined) ?? [];
        patch.co_assignees = co.map(c =>
          c?.id === uid ? { ...c, acknowledged_at: now, acknowledged_by: uid } : c,
        );
      }
      const { error } = await supabase.from('personal_tasks').update(patch).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: ['task-detail', id] });
      qc.invalidateQueries({ queryKey: ['personal_tasks'] });
      try {
        await addActivity.mutateAsync({
          taskId: id!, kind: 'system',
          body: `Task acknowledged by ${currentUser?.fullName ?? 'assignee'} — they have seen and accepted it.`,
        });
        for (const rid of lifecycleRecipients) {
          notify({
            event: 'task_acknowledged',
            taskId: id!,
            taskTitle: task?.title as string,
            recipientUserId: rid,
            dueDate: (task?.due_date as string) ?? null,
          });
        }
      } catch { /* non-critical */ }
      toast({ title: 'Acknowledged', description: 'Now click Start the task when you\'re ready to begin.' });
    },
    onError: (e: Error) => toast({ title: 'Could not acknowledge', description: e.message, variant: 'destructive' }),
  });

  // ---------- Start the task ----------
  const startTask = useMutation({
    mutationFn: async (payload: StartTaskPayload) => {
      // Authoritative re-check at mutation time. Prevents bypass via
      // stale UI state, race conditions, or a transient gate-query error.
      if (id) {
        const recheck = await canTaskStart(id);
        if (recheck.error) {
          throw new Error(`Could not verify dependencies: ${recheck.error}. Try again in a moment.`);
        }
        if (!recheck.canStart) {
          const names = (recheck.blockingTasks ?? []).map((t: any) => t.title || 'Untitled').slice(0, 3).join(', ');
          throw new Error(
            names
              ? `Cannot start: predecessor task(s) not done yet — ${names}.`
              : 'Cannot start: predecessor tasks must be completed first.'
          );
        }
      }
      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status: 'inprogress',
        started_at: now,
        estimated_hours: payload.estimatedHours,
        start_estimated_days: payload.estimatedDays,
        start_requirements: payload.requirements || null,
        start_dependencies: payload.dependencies,
        updated_at: now,
      };
      const { error } = await supabase.from('personal_tasks').update(patch).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: async (_d, payload) => {
      qc.invalidateQueries({ queryKey: ['task-detail', id] });
      qc.invalidateQueries({ queryKey: ['personal_tasks'] });
      qc.invalidateQueries({ queryKey: ['task-status-history', id] });
      setStartDialogOpen(false);
      try {
        await addActivity.mutateAsync({
          taskId: id!, kind: 'system',
          body: `Task started by ${currentUser?.fullName ?? 'assignee'}: ${payload.estimatedHours}h over ${payload.estimatedDays}d. Fields are now locked.`,
        });
        for (const rid of lifecycleRecipients) {
          notify({
            event: 'task_started',
            taskId: id!,
            taskTitle: task?.title as string,
            recipientUserId: rid,
            dueDate: (task?.due_date as string) ?? null,
            extra: {
              estimated_hours: String(payload.estimatedHours),
              estimated_days: String(payload.estimatedDays),
              dependencies_count: String(payload.dependencies.length),
            },
          });
        }
      } catch { /* non-critical */ }
      toast({ title: 'Task started', description: 'Details are now locked. Track your progress in Output.' });
    },
    onError: (e: Error) => toast({ title: 'Could not start task', description: e.message, variant: 'destructive' }),
  });

  // ---------- Confirm a dependency you own ----------
  const confirmDependency = useMutation({
    mutationFn: async (depIndex: number) => {
      const list: StartDependencyRecord[] = Array.isArray(task?.start_dependencies)
        ? (task!.start_dependencies as StartDependencyRecord[])
        : [];
      if (depIndex < 0 || depIndex >= list.length) throw new Error('Invalid dependency');
      const next = list.map((d, i) =>
        i === depIndex
          ? {
              ...d,
              confirmed: true,
              confirmed_at: new Date().toISOString(),
              confirmed_by: currentUser?.id ?? undefined,
              confirmed_by_name: currentUser?.fullName ?? undefined,
            }
          : d,
      );
      const { error } = await supabase
        .from('personal_tasks')
        .update({ start_dependencies: next, updated_at: new Date().toISOString() })
        .eq('id', id!);
      if (error) throw error;
      return next[depIndex];
    },
    onSuccess: async (dep) => {
      qc.invalidateQueries({ queryKey: ['task-detail', id] });
      try {
        await addActivity.mutateAsync({
          taskId: id!, kind: 'system',
          body: `Dependency confirmed by ${currentUser?.fullName ?? 'someone'}: "${dep.label}"`,
        });
        for (const rid of lifecycleRecipients) {
          notify({
            event: 'task_status_changed',
            taskId: id!,
            taskTitle: task?.title as string,
            recipientUserId: rid,
            extra: { reason: `Dependency confirmed: ${dep.label}` },
          });
        }
      } catch { /* non-critical */ }
      toast({ title: 'Dependency confirmed' });
    },
    onError: (e: Error) => toast({ title: 'Could not confirm', description: e.message, variant: 'destructive' }),
  });

  // ---------- Save Output ----------
  const saveOutput = async (text: string) => {
    setSavingOutput(true);
    try {
      const { error } = await supabase
        .from('personal_tasks')
        .update({ output_text: text, updated_at: new Date().toISOString() })
        .eq('id', id!);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ['task-detail', id] });
      await addActivity.mutateAsync({
        taskId: id!, kind: 'log_note',
        body: `Output updated by ${currentUser?.fullName ?? 'assignee'}.`,
      });
      for (const rid of lifecycleRecipients) {
        notify({
          event: 'task_status_changed',
          taskId: id!,
          taskTitle: task?.title as string,
          recipientUserId: rid,
          extra: { reason: 'Output updated' },
        });
      }
      toast({ title: 'Output saved' });
      setOutputDraft(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save output';
      toast({ title: 'Save failed', description: msg, variant: 'destructive' });
    } finally {
      setSavingOutput(false);
    }
  };

  // ---------- Description save ----------
  const saveDescription = async (html: string) => {
    setSavingDesc(true);
    try {
      await updateTask.mutateAsync({ description_html: html });
    } finally {
      setSavingDesc(false);
    }
  };

  // ---------- Status change ----------
  const handleStatusChange = async (next: PersonalTaskStatus, reason?: string) => {
    // Guard: once started, only admin/super_admin can move to todo / cancelled / rescheduled.
    const restrictedAfterStart: PersonalTaskStatus[] = ['todo', 'cancelled', 'rescheduled'];
    if (task?.started_at && restrictedAfterStart.includes(next) && !isAdmin) {
      toast({
        title: 'Locked',
        description: 'Only an admin can revert, cancel, or reschedule a started task.',
        variant: 'destructive',
      });
      return;
    }
    const patch: Record<string, unknown> = { status: next };
    const now = new Date().toISOString();
    if (next === 'inprogress' && !task?.started_at) patch.started_at = now;
    if (next === 'on_hold') patch.on_hold_at = now;
    if (next === 'rescheduled') patch.rescheduled_at = now;
    if (next === 'cancelled') patch.cancelled_at = now;
    if (next === 'done' && !task?.completed_at) patch.completed_at = now;
    await updateTask.mutateAsync(patch);

    // Fan out lifecycle notification to all participants
    try {
      const event =
        next === 'inprogress' ? 'task_started' as const :
        next === 'done'       ? 'task_completed' as const :
        next === 'cancelled'  ? 'task_cancelled' as const :
        'task_status_changed' as const;
      for (const rid of lifecycleRecipients) {
        notify({
          event,
          taskId: id!,
          taskTitle: task?.title as string,
          recipientUserId: rid,
          dueDate: (task?.due_date as string) ?? null,
          extra: reason ? { reason: `${STATUS_LABELS[next]}: ${reason}` } : { reason: STATUS_LABELS[next] },
        });
      }
      // Admin override audit trail
      if (task?.started_at && restrictedAfterStart.includes(next) && isAdmin) {
        await addActivity.mutateAsync({
          taskId: id!, kind: 'system',
          body: `🛡️ Admin override: ${currentUser?.fullName ?? 'Admin'} changed status to ${STATUS_LABELS[next]}${reason ? ` — ${reason}` : ''}.`,
        });
      }
    } catch { /* non-critical */ }

    toast({ title: 'Status updated', description: STATUS_LABELS[next] + (reason ? ` — ${reason}` : '') });
  };

  // ---------- Send WhatsApp ----------
  const sendWhatsApp = useMutation({
    mutationFn: async (message: string) => {
      const recipients = [task?.assigned_to, task?.user_id, ...((task?.co_assignees as Array<{ id: string }> | undefined) ?? []).map(c => c.id)]
        .filter(Boolean) as string[];
      const uniq = Array.from(new Set(recipients));
      if (uniq.length === 0) throw new Error('No recipients');
      const { error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          user_ids: uniq,
          event_type: 'task_message',
          message: { en: message, ar: message },
          priority: 'urgent', // bypass quiet hours / category gate
        },
      });
      if (error) throw error;
      return uniq.length;
    },
    onSuccess: async (count) => {
      await addActivity.mutateAsync({ taskId: id!, kind: 'whatsapp', body: draft, meta: { recipients: count } });
      setDraft('');
      toast({ title: 'WhatsApp sent', description: `Delivered to ${count} recipient(s)` });
    },
    onError: (e: Error) => toast({ title: 'WhatsApp failed', description: e.message, variant: 'destructive' }),
  });

  // ---------- Send / log handler ----------
  const handleSubmit = async () => {
    const text = draft.trim();
    if (!text && activeTab !== 'activity') return;
    if (activeTab === 'whatsapp') {
      sendWhatsApp.mutate(text);
      return;
    }
    if (activeTab === 'activity') {
      if (!scheduledFor) { toast({ title: 'Pick a date', variant: 'destructive' }); return; }
      await addActivity.mutateAsync({ taskId: id!, kind: 'activity', body: text || 'Activity scheduled', scheduledFor });
      setDraft(''); setScheduledFor('');
      toast({ title: 'Activity scheduled' });
      return;
    }
    await addActivity.mutateAsync({ taskId: id!, kind: activeTab, body: text });
    setDraft('');
    toast({ title: activeTab === 'log_note' ? 'Note logged' : 'Message sent' });
  };

  // ---------- Profiles for co-assignee picker ----------
  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-min'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .order('full_name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string }>;
    },
  });

  const updateCoAssignees = useMutation({
    mutationFn: async (next: Array<{ id: string; name: string; hours?: number | null }>) => {
      // T03: prefer the atomic RPC; fall back to direct update if the RPC
      // hasn't been deployed yet so the UI still works on older environments.
      const { error: rpcErr } = await supabase.rpc('update_task_co_assignees', {
        p_task_id: id!,
        p_co_assignees: next,
      });
      if (rpcErr && !/function .* does not exist/i.test(rpcErr.message ?? '')) {
        throw rpcErr;
      }
      if (rpcErr) {
        const { error } = await supabase
          .from('personal_tasks')
          .update({ co_assignees: next, updated_at: new Date().toISOString() })
          .eq('id', id!);
        if (error) throw error;
      }
      return next;
    },
    onSuccess: async (next, _vars, ctx: any) => {
      qc.invalidateQueries({ queryKey: ['task-detail', id] });
      qc.invalidateQueries({ queryKey: ['personal_tasks'] });
      await addActivity.mutateAsync({
        taskId: id!, kind: 'system',
        body: `Co-assignees updated (${next.length})`,
      });
      // Fire in-app + email + WhatsApp notification to any newly added co-assignees
      const previousIds: Set<string> = ctx?.previousIds ?? new Set();
      const added = next.filter(c => !previousIds.has(c.id));
      let notifyOk = 0;
      let notifyFail = 0;
      for (const a of added) {
        try {
          await notify({
            event: 'task_assigned',
            taskId: id!,
            taskTitle: (task?.title as string) ?? 'Task',
            recipientUserId: a.id,
            recipientName: a.name,
            dueDate: (task?.due_date as string | null) ?? null,
            priority: (task?.priority as string | null) ?? null,
          });
          notifyOk++;
        } catch (err) {
          notifyFail++;
          console.error('[TaskDetail] co-assignee notify failed:', err);
        }
      }
      if (added.length > 0) {
        // T11 — Surface notification failures so users know if delivery silently broke.
        if (notifyFail === 0) {
          toast({
            title: `Notified ${notifyOk} co-assignee${notifyOk === 1 ? '' : 's'}`,
            description: 'In-app, email and WhatsApp messages sent.',
          });
        } else if (notifyOk === 0) {
          toast({
            title: 'Co-assignees added — notifications failed',
            description: `Could not deliver notifications to ${notifyFail} user(s). Try resending from the task page.`,
            variant: 'destructive',
          });
        } else {
          toast({
            title: `Notified ${notifyOk} of ${added.length} co-assignees`,
            description: `${notifyFail} delivery failure(s); the rest received in-app, email and WhatsApp.`,
            variant: 'destructive',
          });
        }
      }
    },
    onMutate: (next) => {
      const prev = (task?.co_assignees as Array<{ id: string }> | undefined) ?? [];
      return { previousIds: new Set(prev.map(p => p.id)) };
    },
  });

  const addCoAssignee = (uid: string, uname: string) => {
    const existing = (task?.co_assignees as Array<{ id: string; name: string }> | undefined) ?? [];
    if (existing.find(c => c.id === uid)) return;
    if (task?.assigned_to === uid) {
      toast({ title: 'Already the primary assignee', description: 'This person is already assigned to the task.' });
      return;
    }
    updateCoAssignees.mutate([...existing, { id: uid, name: uname }]);
  };
  const removeCoAssignee = (uid: string) => {
    const existing = (task?.co_assignees as Array<{ id: string; name: string }> | undefined) ?? [];
    updateCoAssignees.mutate(existing.filter(c => c.id !== uid));
  };
  // T04 — Update a single co-assignee's allocated hours.
  const setCoAssigneeHours = (uid: string, hours: number | null) => {
    const existing = (task?.co_assignees as Array<{ id: string; name: string; hours?: number | null }> | undefined) ?? [];
    if (!existing.some(c => c.id === uid)) return;
    updateCoAssignees.mutate(existing.map(c => c.id === uid ? { ...c, hours } : c));
  };

  // ---------- Assignees list (with per-user hours + acknowledgment) ----------
  type EnrichedAssignee = {
    id: string;
    name: string;
    hours: number | null;
    acknowledgedAt: string | null;
    role: 'primary' | 'co';
  };
  const allAssignees = useMemo<EnrichedAssignee[]>(() => {
    if (!task) return [];
    const out: EnrichedAssignee[] = [];
    if (task.assigned_to && task.assigned_to_name) {
      out.push({
        id: task.assigned_to as string,
        name: task.assigned_to_name as string,
        hours: (task.estimated_hours as number | null) ?? null,
        acknowledgedAt: (task.acknowledged_at as string | null) ?? null,
        role: 'primary',
      });
    }
    const co = (task.co_assignees as Array<{
      id: string;
      name: string;
      hours?: number | null;
      acknowledged_at?: string | null;
    }> | undefined) ?? [];
    co.forEach(c => {
      if (!out.find(x => x.id === c.id)) {
        out.push({
          id: c.id,
          name: c.name,
          hours: c.hours ?? null,
          acknowledgedAt: c.acknowledged_at ?? null,
          role: 'co',
        });
      }
    });
    if (out.length === 0 && task.user_id) {
      // Owner-only task (no separate assignee picked). Show their real name
      // when we know it, otherwise fall back to "Owner".
      const ownerId = task.user_id as string;
      const ownerName =
        (currentUser?.id === ownerId ? currentUser?.fullName : null) ??
        (profiles?.[ownerId]?.full_name as string | undefined) ??
        'Owner';
      out.push({
        id: ownerId,
        name: ownerName,
        hours: (task.estimated_hours as number | null) ?? null,
        acknowledgedAt: (task.acknowledged_at as string | null) ?? null,
        role: 'primary',
      });
    }
    return out;
  }, [task, currentUser?.id, currentUser?.fullName, profiles]);

  // ---------- Elements progress ----------
  const elementProgress = useMemo(() => {
    if (elements.length === 0) return null;
    const done = elements.filter(e => e.done).length;
    return { done, total: elements.length, pct: Math.round((done / elements.length) * 100) };
  }, [elements]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>;
  }
  if (!task) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <p className="text-slate-500">Task not found.</p>
        <Link to="/my-tasks" className="text-[#1D3461] underline mt-2 inline-block">Back to My Tasks</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4" data-testid="page-task-detail">
      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100" data-testid="btn-back">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Task</p>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 truncate" data-testid="text-task-title">{task.title}</h1>
        </div>
        <TaskStatusMenu
          taskId={id!}
          current={task.status as PersonalTaskStatus}
          onChange={handleStatusChange}
          size="md"
          disabledStatuses={
            task.started_at && !isAdmin
              ? (['todo', 'cancelled', 'rescheduled'] as PersonalTaskStatus[])
              : []
          }
          lockedHint="Locked after Start — admin/super-admin only"
        />
      </div>

      {/* ── Acknowledge banner — per user. Primary uses task.acknowledged_at;
          each co-assignee uses their own slot in co_assignees. ── */}
      {(() => {
        const uid = currentUser?.id;
        if (!uid) return null;
        const isPrimary = task.assigned_to === uid || (task.user_id === uid && !task.assigned_to);
        const myCoSlot = ((task.co_assignees as Array<{ id: string; acknowledged_at?: string | null }> | undefined) ?? [])
          .find(c => c.id === uid);
        const isCo = !!myCoSlot;
        const isMine = isPrimary || isCo;
        const ackAt = (isPrimary
          ? (task.acknowledged_at as string | null | undefined)
          : (myCoSlot?.acknowledged_at ?? null));
        if (!isMine) return null;
        if (ackAt) {
          return (
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs"
              data-testid="banner-acknowledged"
            >
              <Check className="w-4 h-4" />
              <span>
                You acknowledged this task on {format(parseISO(ackAt), 'dd MMM yyyy, HH:mm')}.
              </span>
            </div>
          );
        }
        return (
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200"
            data-testid="banner-acknowledge"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">This task is waiting for your acknowledgment</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Please confirm you've seen and accepted it. After this, you'll review the details and click <b>Start the task</b> when you're ready to begin.
              </p>
            </div>
            <button
              type="button"
              onClick={() => acknowledgeTask.mutate()}
              disabled={acknowledgeTask.isPending}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-sm font-semibold transition-colors"
              data-testid="btn-acknowledge"
            >
              {acknowledgeTask.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              I acknowledge & accept
            </button>
          </div>
        );
      })()}

      {/* ── Start banner: shown to current participant after they've acknowledged.
          Gating rule: when the task has dependencies AND more than one participant,
          everyone must acknowledge before any of them can press Start. A solo
          assignee (no co-assignees) can always start once they have acknowledged. ── */}
      {(() => {
        const uid = currentUser?.id;
        if (!uid) return null;
        const isPrimary = task.assigned_to === uid || (task.user_id === uid && !task.assigned_to);
        const coList = (task.co_assignees as Array<{ id: string; name: string; acknowledged_at?: string | null }> | undefined) ?? [];
        const myCoSlot = coList.find(c => c.id === uid);
        const isMine = isPrimary || !!myCoSlot;
        const myAck = isPrimary
          ? (task.acknowledged_at as string | null | undefined)
          : (myCoSlot?.acknowledged_at ?? null);
        const startedAt = task.started_at as string | null | undefined;
        if (!isMine || !myAck || startedAt) return null;

        // Dependencies were defined at task creation step → require all-acknowledged.
        const deps = Array.isArray(task.dependencies) ? (task.dependencies as unknown[]) : [];
        const hasDeps = deps.length > 0;
        const participantsCount = (task.assigned_to ? 1 : 0) + coList.length || 1;
        const requireAllAck = hasDeps && participantsCount > 1;

        // Build the list of participants still missing an acknowledgment.
        const pending: string[] = [];
        if (requireAllAck) {
          if (task.assigned_to && !task.acknowledged_at && task.assigned_to !== uid) {
            pending.push((task.assigned_to_name as string) || 'Primary assignee');
          }
          coList.forEach(c => {
            if (!c.acknowledged_at && c.id !== uid) pending.push(c.name);
          });
        }
        const blocked = pending.length > 0;

        // ── Predecessor-task gate (task_dependencies table) — independent of ack gate.
        // If another task must finish first, block Start regardless of acks.
        if (depBlocked) {
          const names = (depGate?.blockingTasks ?? []).map((t: any) => t.title || 'Untitled').slice(0, 3);
          const more = (depGate?.blockingTasks?.length ?? 0) - names.length;
          return (
            <div
              className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200"
              data-testid="banner-start-blocked-by-deps"
            >
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> Waiting on predecessor task{(depGate?.blockingTasks?.length ?? 0) > 1 ? 's' : ''}
              </p>
              <p className="text-xs text-amber-800">
                This task can't start until: <span className="font-semibold">{names.join(', ')}</span>
                {more > 0 ? ` and ${more} more` : ''} {(depGate?.blockingTasks?.length ?? 0) > 1 ? 'are' : 'is'} marked done.
              </p>
              <button
                type="button"
                disabled
                className="shrink-0 self-start inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-300 text-white text-sm font-semibold cursor-not-allowed"
                data-testid="btn-open-start-dialog"
              >
                <PlayCircle className="w-4 h-4" /> Start the task
              </button>
            </div>
          );
        }

        if (blocked) {
          return (
            <div
              className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-slate-50 border border-slate-200"
              data-testid="banner-start-blocked"
            >
              <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> Waiting for everyone to acknowledge
              </p>
              <p className="text-xs text-slate-600">
                This task has dependencies, so it can only be started once every assignee has confirmed they've seen it. Still pending:
                {' '}<span className="font-semibold">{pending.join(', ')}</span>.
              </p>
              <button
                type="button"
                disabled
                className="shrink-0 self-start inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-300 text-white text-sm font-semibold cursor-not-allowed"
                data-testid="btn-open-start-dialog"
              >
                <PlayCircle className="w-4 h-4" /> Start the task
              </button>
            </div>
          );
        }

        return (
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200"
            data-testid="banner-start"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-900 flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4" /> Ready to begin?
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Review the details below. When ready, click <b>Start the task</b> to lock the plan and begin tracking. You'll be asked to confirm hours, days, requirements, and dependencies.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStartDialogOpen(true)}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#1D3461] hover:bg-[#0F2041] text-white text-sm font-semibold transition-colors"
              data-testid="btn-open-start-dialog"
            >
              <PlayCircle className="w-4 h-4" /> Start the task
            </button>
          </div>
        );
      })()}

      {/* ── Locked banner: shown after start so everyone knows fields are locked ── */}
      {task.started_at && (
        <div
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 text-xs"
          data-testid="banner-locked"
        >
          <Lock className="w-3.5 h-3.5 text-slate-500" />
          <span>
            Locked since {format(parseISO(task.started_at as string), 'dd MMM yyyy, HH:mm')}.
            {' '}Title, description, due date, priority, assignee, and dependencies can only be changed by an admin.
            {isAdmin && <span className="ml-1 font-semibold text-[#1D3461]"><ShieldCheck className="inline w-3 h-3 -mt-0.5" /> Admin override available.</span>}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Left column: Description + Activity feed ── */}
        <div className="lg:col-span-2 space-y-4">
          {/* Description */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Description
              </h2>
              {savingDesc && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>}
            </div>
            {task.started_at && !isAdmin ? (
              <div
                className="prose prose-sm max-w-none p-4 text-slate-700"
                data-testid="text-description-locked"
                dangerouslySetInnerHTML={{
                  __html:
                    (task.description_html as string) ||
                    (task.description ? `<p>${task.description}</p>` : '<p class="italic text-slate-400">No description.</p>'),
                }}
              />
            ) : (
              <TaskRichEditor
                value={(task.description_html as string) || (task.description ? `<p>${task.description}</p>` : '')}
                onChange={(html) => {
                  // Debounce save
                  if ((window as unknown as { __taskDescTimer?: number }).__taskDescTimer) {
                    clearTimeout((window as unknown as { __taskDescTimer?: number }).__taskDescTimer);
                  }
                  (window as unknown as { __taskDescTimer?: number }).__taskDescTimer = window.setTimeout(() => saveDescription(html), 800);
                }}
                minHeight={220}
                className="border-0 rounded-none"
              />
            )}
          </div>

          {/* Output / Accomplishments — appears once task is started.
              Editable by the primary assignee, any co-assignee, the task
              creator/owner, or an admin. */}
          {task.started_at && (() => {
            const uid = currentUser?.id;
            const isMine = !!uid && (
              task.assigned_to === uid ||
              task.user_id === uid ||
              ((task.co_assignees as Array<{ id: string }> | undefined) ?? []).some(c => c.id === uid)
            );
            const canEditOutput = isMine || isAdmin;
            const stored = (task.output_text as string | null) ?? '';
            const draftValue = outputDraft ?? stored;
            const dirty = outputDraft !== null && outputDraft !== stored;
            return (
              <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden" data-testid="card-output">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-100 bg-emerald-50/50">
                  <h2 className="text-sm font-bold text-emerald-800 flex items-center gap-2">
                    <Target className="w-4 h-4" /> Output / Accomplishments
                  </h2>
                  {savingOutput && <span className="text-[10px] text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Saving…</span>}
                </div>
                <div className="p-4 space-y-2">
                  {canEditOutput ? (
                    <>
                      {!stored && (
                        <p className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5">
                          Type below what you accomplished, then click <b>Save output</b>.
                        </p>
                      )}
                      <textarea
                        value={draftValue}
                        onChange={e => setOutputDraft(e.target.value)}
                        rows={5}
                        placeholder="Describe what you accomplished, decisions made, links to deliverables…"
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-300/50 resize-y"
                        data-testid="input-output-text"
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] text-slate-400">
                          {task.proof_file_url ? (
                            <a href={task.proof_file_url as string} target="_blank" rel="noreferrer" className="underline hover:text-slate-700">
                              View attached proof file
                            </a>
                          ) : 'Tip: attach a proof file from the activity composer.'}
                        </p>
                        <button
                          type="button"
                          onClick={() => saveOutput((outputDraft ?? '').trim())}
                          disabled={!dirty || savingOutput}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold"
                          data-testid="btn-save-output"
                        >
                          {savingOutput ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Save output
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap">
                      {stored || <span className="italic text-slate-400">No output recorded yet.</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Start-time dependencies (people / depts / items) — appears once started */}
          {task.started_at && Array.isArray(task.start_dependencies) && (task.start_dependencies as StartDependencyRecord[]).length > 0 && (() => {
            const deps = task.start_dependencies as StartDependencyRecord[];
            const confirmedCount = deps.filter(d => d.confirmed).length;
            return (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden" data-testid="card-start-deps">
              <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/50 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                    <ListChecks className="w-4 h-4" /> Dependencies requested at Start
                    <span className="text-[9px] font-normal text-slate-400 normal-case tracking-normal ml-1">(blockers — confirm when ready)</span>
                  </h2>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    These are people / depts / items needed before the work can move. Each row is confirmed by the listed person (or by the owner for item-type rows). They are <i>not</i> co-doers and don't share hours.
                  </p>
                  {(task.start_requirements as string | null) && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      <b>Requirements:</b> {task.start_requirements as string}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    'shrink-0 text-[10px] font-bold px-2 py-1 rounded-full',
                    confirmedCount === deps.length ? 'bg-emerald-100 text-emerald-700'
                    : confirmedCount > 0 ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700',
                  )}
                >
                  {confirmedCount} / {deps.length} confirmed
                </span>
              </div>
              <ul className="divide-y divide-slate-100">
                {(task.start_dependencies as StartDependencyRecord[]).map((d, i) => {
                  const canConfirm =
                    !d.confirmed &&
                    (isAdmin ||
                      (d.userId && d.userId === currentUser?.id) ||
                      // Owner / assignee can also confirm "item" deps (no specific person)
                      (d.kind === 'item' &&
                        (task.assigned_to === currentUser?.id ||
                          task.user_id === currentUser?.id)));
                  return (
                    <li key={`${d.label}-${i}`} className="flex items-center gap-2 px-4 py-2 text-xs" data-testid={`dep-confirm-row-${i}`}>
                      <span
                        className={cn(
                          'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                          d.kind === 'person' ? 'bg-blue-100 text-blue-700'
                          : d.kind === 'department' ? 'bg-purple-100 text-purple-700'
                          : 'bg-slate-200 text-slate-600',
                        )}
                      >
                        {d.kind}
                      </span>
                      <span className="flex-1 text-slate-700">{d.label}</span>
                      {d.confirmed ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                          <Check className="w-3.5 h-3.5" /> {d.confirmed_by_name ?? 'Confirmed'}
                        </span>
                      ) : canConfirm ? (
                        <button
                          type="button"
                          onClick={() => confirmDependency.mutate(i)}
                          disabled={confirmDependency.isPending}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[11px] font-semibold"
                          data-testid={`btn-confirm-dep-${i}`}
                        >
                          <Check className="w-3 h-3" /> Confirm
                        </button>
                      ) : (
                        <span className="text-amber-600 font-semibold">Pending</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            );
          })()}

          {/* Activity feed */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center gap-1 px-3 pt-3 border-b border-slate-100">
              {[
                { key: 'message' as const,  label: 'Send Message', Icon: MessageSquare, color: 'text-purple-700 border-purple-700' },
                { key: 'log_note' as const, label: 'Log Note',     Icon: FileText,      color: 'text-amber-700 border-amber-700' },
                { key: 'whatsapp' as const, label: 'WhatsApp',     Icon: MessageCircle, color: 'text-emerald-700 border-emerald-700' },
                { key: 'activity' as const, label: 'Activities',   Icon: Calendar,      color: 'text-sky-700 border-sky-700' },
              ].map(t => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => { setActiveTab(t.key); setDraft(''); setScheduledFor(''); }}
                    data-testid={`tab-${t.key}`}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-colors',
                      active ? t.color + ' bg-slate-50/50' : 'border-transparent text-slate-500 hover:text-slate-700',
                    )}
                  >
                    <t.Icon className="w-3.5 h-3.5" /> {t.label}
                  </button>
                );
              })}
            </div>
            {/* Composer */}
            <div className="p-3 space-y-2">
              {activeTab === 'activity' && (
                <input
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={e => setScheduledFor(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20"
                  data-testid="input-schedule"
                />
              )}
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                placeholder={
                  activeTab === 'message' ? 'Send a message visible to assignees…'
                  : activeTab === 'log_note' ? 'Log an internal note (not sent as a message)…'
                  : activeTab === 'whatsapp' ? 'Type WhatsApp message — will be sent to all assignees'
                  : 'Note about the activity…'
                }
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 resize-none"
                data-testid="textarea-draft"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSubmit}
                  disabled={(!draft.trim() && activeTab !== 'activity') || sendWhatsApp.isPending || addActivity.isPending}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50',
                    activeTab === 'whatsapp' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#1D3461] hover:bg-[#0F2041]',
                  )}
                  data-testid="btn-submit-activity"
                >
                  {sendWhatsApp.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  {activeTab === 'message' ? 'Send' : activeTab === 'log_note' ? 'Log' : activeTab === 'whatsapp' ? 'Send WhatsApp' : 'Schedule'}
                </button>
              </div>
            </div>
            {/* Feed */}
            <div className="border-t border-slate-100 divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
              {activity.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-8">No activity yet.</p>
              ) : (
                activity.map(a => <ActivityItem key={a.id} a={a} />)
              )}
            </div>
          </div>
        </div>

        {/* ── Right column: Meta + Assignees + Elements + Status timeline ── */}
        <div className="space-y-4">
          {/* Meta card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">Details</h3>
            <MetaRow icon={Tag} label="Priority" value={<PriorityBadge p={task.priority as string} />} />
            {task.due_date && <MetaRow icon={Calendar} label="Due" value={format(parseISO(task.due_date as string), 'PP')} />}
            {task.started_at && <MetaRow icon={Clock} label="Started" value={format(parseISO(task.started_at as string), 'PP p')} />}
            {task.completed_at && <MetaRow icon={Check} label="Completed" value={format(parseISO(task.completed_at as string), 'PP p')} />}
            {task.estimated_hours != null && <MetaRow icon={Clock} label="Estimated" value={`${task.estimated_hours}h total`} />}
            {task.hours_per_day != null && <MetaRow icon={Clock} label="Per day" value={`${task.hours_per_day}h / day`} />}
            {task.actual_hours != null && <MetaRow icon={Clock} label="Actual" value={`${task.actual_hours}h`} />}
            {task.recurrence && task.recurrence !== 'none' && (
              <MetaRow icon={History} label="Recurrence" value={String(task.recurrence)} />
            )}
          </div>

          {/* Assignee's Start Commitment — visible to creator + everyone after Start */}
          {task.started_at && (() => {
            const deps: StartDependencyRecord[] = Array.isArray(task.start_dependencies)
              ? (task.start_dependencies as StartDependencyRecord[])
              : [];
            const confirmedCount = deps.filter(d => d.confirmed).length;
            const allConfirmed = deps.length > 0 && confirmedCount === deps.length;
            const anyPending = deps.length > 0 && confirmedCount < deps.length;
            const assigneeName = (task.assigned_to_name as string | null) ?? 'The assignee';
            return (
              <div className="bg-white rounded-2xl border border-blue-200 p-4 space-y-2.5" data-testid="card-start-commitment">
                <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5" /> Start Commitment
                </h3>
                <p className="text-[11px] text-slate-500 -mt-1">
                  What {assigneeName} committed to when starting this task.
                </p>
                {task.estimated_hours != null && (
                  <MetaRow icon={Clock} label="Hours requested" value={`${task.estimated_hours}h`} />
                )}
                {task.start_estimated_days != null && (
                  <MetaRow icon={Calendar} label="Days needed" value={`${task.start_estimated_days}d`} />
                )}
                {(task.start_requirements as string | null) && (
                  <div className="text-xs">
                    <p className="text-slate-500 flex items-center gap-1.5 mb-0.5">
                      <ListChecks className="w-3.5 h-3.5" /> Requirements
                    </p>
                    <p className="text-slate-700 whitespace-pre-wrap pl-5">
                      {task.start_requirements as string}
                    </p>
                  </div>
                )}
                {deps.length > 0 && (
                  <div className="pt-1.5 mt-1 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <Users className="w-3.5 h-3.5" /> Dependencies
                      </span>
                      <span
                        className={cn(
                          'font-bold px-2 py-0.5 rounded-full text-[10px]',
                          allConfirmed ? 'bg-emerald-100 text-emerald-700'
                          : anyPending ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600',
                        )}
                        data-testid="text-deps-count"
                      >
                        {confirmedCount} / {deps.length} confirmed
                      </span>
                    </div>
                    {anyPending && (
                      <ul className="mt-1.5 space-y-1 text-[11px]">
                        {deps.filter(d => !d.confirmed).slice(0, 4).map((d, i) => (
                          <li key={`pending-${i}`} className="flex items-center gap-1.5 text-amber-700" data-testid={`text-pending-dep-${i}`}>
                            <span className="w-1 h-1 rounded-full bg-amber-500" />
                            <span className="font-medium">{d.label}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500 capitalize">{d.kind}{d.userName ? ` · ${d.userName}` : ''}</span>
                          </li>
                        ))}
                        {deps.filter(d => !d.confirmed).length > 4 && (
                          <li className="text-slate-400 italic pl-2.5">
                            + {deps.filter(d => !d.confirmed).length - 4} more pending…
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Assignees & Elements */}
          <AssigneesPanel
            taskId={id!}
            assignees={allAssignees}
            primaryAssigneeId={task?.assigned_to ?? undefined}
            profiles={profiles}
            onAddCoAssignee={addCoAssignee}
            onRemoveCoAssignee={removeCoAssignee}
            onSetCoAssigneeHours={setCoAssigneeHours}
            elements={elements}
            onAddElement={(assigneeId, assigneeName, label) =>
              addElement.mutate({ taskId: id!, assigneeId, assigneeName, label, position: elements.length })}
            onToggleElement={(elementId, done) => toggleElement.mutate({ id: elementId, taskId: id!, done })}
            onDeleteElement={(elementId) => deleteElement.mutate({ id: elementId, taskId: id! })}
            progress={elementProgress}
            currentUserId={currentUser?.id}
          />

          {/* Status timeline */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Status Timeline
            </h3>
            {history.length === 0 ? (
              <p className="text-xs text-slate-400">No status changes yet.</p>
            ) : (
              <ol className="space-y-2">
                {history.map(h => (
                  <li key={h.id} className="flex items-start gap-2 text-xs" data-testid={`hist-${h.id}`}>
                    <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', STATUS_COLORS[h.to_status as PersonalTaskStatus]?.split(' ')[0] ?? 'bg-slate-300')} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-700">
                        {h.from_status ? `${STATUS_LABELS[h.from_status as PersonalTaskStatus] ?? h.from_status} → ` : ''}
                        {STATUS_LABELS[h.to_status as PersonalTaskStatus] ?? h.to_status}
                      </p>
                      <p className="text-slate-400 text-[10px]">
                        {h.changed_by_name ?? 'Someone'} • {format(parseISO(h.created_at), 'PP p')}
                      </p>
                      {h.reason && <p className="text-slate-500 italic mt-0.5">"{h.reason}"</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Approvals Section */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <ApprovalPendingCard onApprovalComplete={() => {
              qc.invalidateQueries({ queryKey: ['task-detail', id] });
              toast({ title: 'Approval processed', description: 'Task approval status updated.' });
            }} />
          </div>

          {/* Task Dependencies Section */}
          <TaskDependenciesView taskId={id!} />

          {/* Approval History Section */}
          <ApprovalHistoryPanel taskId={id!} />
        </div>
      </div>

      {/* Start-the-task confirmation dialog */}
      <StartTaskDialog
        open={startDialogOpen}
        onOpenChange={setStartDialogOpen}
        taskTitle={(task.title as string) ?? ''}
        defaultEstimatedHours={(task.estimated_hours as number | null) ?? null}
        prefillDependencies={Array.isArray(task.dependencies)
          ? (task.dependencies as Array<{ label: string; type?: string; userId?: string; userName?: string; deptId?: string; deptName?: string }>)
          : []}
        isPending={startTask.isPending}
        onConfirm={(payload) => startTask.mutateAsync(payload)}
      />
    </div>
  );
}

// ---------- Sub-components ----------

function MetaRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-slate-500"><Icon className="w-3.5 h-3.5" /> {label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, string> = {
    critical: 'bg-rose-100 text-rose-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-blue-100 text-blue-700',
    low: 'bg-slate-100 text-slate-600',
  };
  return <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold capitalize', map[p] ?? 'bg-slate-100 text-slate-600')}>{p}</span>;
}

function ActivityItem({ a }: { a: import('@/hooks/useTaskActivity').ActivityRow }) {
  const meta = {
    message:  { Icon: MessageSquare,  bg: 'bg-purple-50',  ring: 'ring-purple-200',  label: 'Message' },
    log_note: { Icon: FileText,       bg: 'bg-amber-50',   ring: 'ring-amber-200',   label: 'Log note' },
    whatsapp: { Icon: MessageCircle,  bg: 'bg-emerald-50', ring: 'ring-emerald-200', label: 'WhatsApp' },
    activity: { Icon: Calendar,       bg: 'bg-sky-50',     ring: 'ring-sky-200',     label: 'Activity' },
    system:   { Icon: History,        bg: 'bg-slate-50',   ring: 'ring-slate-200',   label: 'System' },
  }[a.kind];
  return (
    <div className="flex gap-3 p-3" data-testid={`activity-${a.id}`}>
      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0 ring-2', meta.bg, meta.ring)}>
        <meta.Icon className="w-3.5 h-3.5 text-slate-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs">
          <span className="font-semibold text-slate-700">{a.user_name ?? 'Someone'}</span>
          <span className="text-slate-400"> • {meta.label} • {format(parseISO(a.created_at), 'PP p')}</span>
        </p>
        {a.scheduled_for && (
          <p className="text-[10px] text-sky-600 mt-0.5">Scheduled for {format(parseISO(a.scheduled_for), 'PP p')}</p>
        )}
        {a.body && (
          <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap break-words">{a.body}</div>
        )}
      </div>
    </div>
  );
}

function AssigneesPanel({
  assignees, elements, onAddElement, onToggleElement, onDeleteElement, progress, currentUserId,
  primaryAssigneeId, profiles, onAddCoAssignee, onRemoveCoAssignee, onSetCoAssigneeHours,
}: {
  taskId: string;
  assignees: Array<{
    id: string;
    name: string;
    hours?: number | null;
    acknowledgedAt?: string | null;
    role?: 'primary' | 'co';
  }>;
  elements: import('@/hooks/useTaskActivity').ElementRow[];
  onAddElement: (assigneeId: string, assigneeName: string, label: string) => void;
  onToggleElement: (id: string, done: boolean) => void;
  onDeleteElement: (id: string) => void;
  progress: { done: number; total: number; pct: number } | null;
  currentUserId?: string;
  primaryAssigneeId?: string;
  profiles: Array<{ id: string; full_name: string }>;
  onAddCoAssignee: (uid: string, uname: string) => void;
  onRemoveCoAssignee: (uid: string) => void;
  onSetCoAssigneeHours?: (uid: string, hours: number | null) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const assignedIds = new Set(assignees.map(a => a.id));
  const pickable = profiles
    .filter(p => !assignedIds.has(p.id))
    .filter(p => !pickerSearch || p.full_name?.toLowerCase().includes(pickerSearch.toLowerCase()))
    .slice(0, 12);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Assignees & Elements
          <span className="text-[9px] font-normal text-slate-400 normal-case tracking-normal ml-1">(co-doers — share hours & ack)</span>
        </h3>
        {progress && (
          <span className="text-[10px] font-semibold text-slate-500" data-testid="text-elements-progress">
            {progress.done}/{progress.total} • {progress.pct}%
          </span>
        )}
      </div>
      {progress && (
        <div className="h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress.pct}%` }} />
        </div>
      )}
      <div className="mb-3">
        {pickerOpen ? (
          <div className="border border-slate-200 rounded-lg p-2 bg-slate-50">
            <input
              autoFocus
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              placeholder="Search teammate…"
              className="w-full h-7 px-2 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20 mb-1.5"
              data-testid="input-coassignee-search"
            />
            <div className="max-h-44 overflow-y-auto space-y-0.5">
              {pickable.length === 0 ? (
                <p className="text-[10px] text-slate-400 px-1 py-1">No matches</p>
              ) : pickable.map(p => (
                <button
                  key={p.id}
                  onClick={() => { onAddCoAssignee(p.id, p.full_name); setPickerSearch(''); setPickerOpen(false); }}
                  className="w-full text-left px-2 py-1 text-xs rounded hover:bg-white hover:shadow-sm flex items-center gap-2"
                  data-testid={`pick-coassignee-${p.id}`}
                >
                  <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold">
                    {(p.full_name ?? '?')[0]?.toUpperCase()}
                  </div>
                  <span className="truncate">{p.full_name}</span>
                </button>
              ))}
            </div>
            <button onClick={() => { setPickerOpen(false); setPickerSearch(''); }} className="mt-1.5 text-[10px] text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setPickerOpen(true)}
            className="text-[11px] font-semibold text-[#1D3461] hover:underline flex items-center gap-1"
            data-testid="button-add-coassignee"
          >
            <Plus className="w-3 h-3" /> Add co-assignee
          </button>
        )}
      </div>
      {assignees.length === 0 ? (
        <p className="text-xs text-slate-400">No assignees</p>
      ) : (
        <div className="space-y-3">
          {assignees.map(a => {
            const myElements = elements.filter(e => e.assignee_id === a.id);
            const isMine = currentUserId === a.id;
            const isPrimary = primaryAssigneeId === a.id;
            return (
              <div key={a.id} className="border border-slate-100 rounded-xl p-2.5">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-7 h-7 rounded-full bg-[#1D3461] text-white flex items-center justify-center text-[11px] font-bold">
                    {(a.name ?? '?')[0]?.toUpperCase()}
                  </div>
                  <p className="text-xs font-semibold text-slate-700 flex-1 truncate">
                    {a.name}
                    {isPrimary && <span className="text-[10px] text-[#1D3461] ml-1">(primary)</span>}
                    {isMine && <span className="text-[10px] text-emerald-600 ml-1">(you)</span>}
                  </p>
                  {a.acknowledgedAt ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"
                      title={`Acknowledged ${a.acknowledgedAt}`}
                      data-testid={`ack-badge-${a.id}`}
                    >
                      <Check className="w-2.5 h-2.5" /> Ack
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                      title="Has not acknowledged yet"
                      data-testid={`ack-pending-${a.id}`}
                    >
                      Pending
                    </span>
                  )}
                  {/* T04 — primary shows static badge; co-assignees get editable hours input */}
                  {isPrimary ? (
                    a.hours != null && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700"
                        title="Hours allocated"
                        data-testid={`hours-${a.id}`}
                      >
                        <Clock className="w-2.5 h-2.5" /> {a.hours}h
                      </span>
                    )
                  ) : (
                    onSetCoAssigneeHours && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-500" title="Hours allocated to this co-assignee">
                        <Clock className="w-2.5 h-2.5" />
                        <input
                          type="number"
                          min={0}
                          step={0.25}
                          defaultValue={a.hours ?? ''}
                          onBlur={e => {
                            const raw = e.currentTarget.value.trim();
                            const next = raw === '' ? null : Number(raw);
                            const current = a.hours ?? null;
                            if (next === current) return;
                            if (next != null && (!Number.isFinite(next) || next < 0)) return;
                            onSetCoAssigneeHours(a.id, next);
                          }}
                          className="w-12 h-5 px-1 text-[10px] text-right border border-slate-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-[#1D3461]/40"
                          data-testid={`input-hours-${a.id}`}
                          aria-label={`Hours for ${a.name}`}
                        />
                        <span className="text-slate-400">h</span>
                      </span>
                    )
                  )}
                  {!isPrimary && (
                    <button
                      onClick={() => onRemoveCoAssignee(a.id)}
                      className="opacity-60 hover:opacity-100 text-slate-400 hover:text-rose-500"
                      title="Remove co-assignee"
                      data-testid={`remove-coassignee-${a.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {myElements.length > 0 && (
                  <ul className="space-y-1 mb-1.5">
                    {myElements.map(e => (
                      <li key={e.id} className="flex items-center gap-1.5 group" data-testid={`element-${e.id}`}>
                        <button
                          onClick={() => onToggleElement(e.id, !e.done)}
                          className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0',
                            e.done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-slate-400')}
                          data-testid={`toggle-element-${e.id}`}
                        >
                          {e.done && <Check className="w-2.5 h-2.5 text-white" />}
                        </button>
                        <span className={cn('flex-1 text-xs', e.done && 'line-through text-slate-400')}>{e.label}</span>
                        <button onClick={() => onDeleteElement(e.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500" data-testid={`del-element-${e.id}`}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {adding === a.id ? (
                  <div className="flex gap-1.5">
                    <input
                      autoFocus
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && label.trim()) {
                          onAddElement(a.id, a.name, label.trim());
                          setLabel(''); setAdding(null);
                        }
                        if (e.key === 'Escape') { setAdding(null); setLabel(''); }
                      }}
                      placeholder="Element to do…"
                      className="flex-1 h-7 px-2 text-xs border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-[#1D3461]/20"
                      data-testid={`input-element-${a.id}`}
                    />
                    <button onClick={() => { if (label.trim()) { onAddElement(a.id, a.name, label.trim()); setLabel(''); setAdding(null); } }} className="px-2 rounded bg-[#1D3461] text-white text-xs font-semibold" data-testid={`save-element-${a.id}`}>
                      <Check className="w-3 h-3" />
                    </button>
                    <button onClick={() => { setAdding(null); setLabel(''); }} className="px-2 rounded bg-slate-100 text-slate-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setAdding(a.id)} className="text-[10px] text-slate-400 hover:text-[#1D3461] flex items-center gap-1" data-testid={`add-element-${a.id}`}>
                    <Plus className="w-3 h-3" /> Add element
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
