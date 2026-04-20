import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import {
  ArrowLeft, Calendar, Clock, User as UserIcon, Users, Tag, MessageSquare, FileText,
  MessageCircle, ListChecks, Plus, X, Check, Trash2, Send, History, Loader2,
} from 'lucide-react';
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

export default function TaskDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser } = useUser();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<'message' | 'log_note' | 'whatsapp' | 'activity'>('message');
  const [draft, setDraft] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

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
    const patch: Record<string, unknown> = { status: next };
    const now = new Date().toISOString();
    if (next === 'inprogress' && !task?.started_at) patch.started_at = now;
    if (next === 'on_hold') patch.on_hold_at = now;
    if (next === 'rescheduled') patch.rescheduled_at = now;
    if (next === 'cancelled') patch.cancelled_at = now;
    if (next === 'done' && !task?.completed_at) patch.completed_at = now;
    await updateTask.mutateAsync(patch);
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
    mutationFn: async (next: Array<{ id: string; name: string }>) => {
      const { error } = await supabase
        .from('personal_tasks')
        .update({ co_assignees: next, updated_at: new Date().toISOString() })
        .eq('id', id!);
      if (error) throw error;
    },
    onSuccess: async (_d, next) => {
      qc.invalidateQueries({ queryKey: ['task-detail', id] });
      qc.invalidateQueries({ queryKey: ['personal_tasks'] });
      await addActivity.mutateAsync({
        taskId: id!, kind: 'system',
        body: `Co-assignees updated (${next.length})`,
      });
    },
  });

  const addCoAssignee = (uid: string, uname: string) => {
    const existing = (task?.co_assignees as Array<{ id: string; name: string }> | undefined) ?? [];
    if (existing.find(c => c.id === uid)) return;
    if (task?.assigned_to === uid) return;
    updateCoAssignees.mutate([...existing, { id: uid, name: uname }]);
  };
  const removeCoAssignee = (uid: string) => {
    const existing = (task?.co_assignees as Array<{ id: string; name: string }> | undefined) ?? [];
    updateCoAssignees.mutate(existing.filter(c => c.id !== uid));
  };

  // ---------- Assignees list ----------
  const allAssignees = useMemo(() => {
    if (!task) return [] as Array<{ id: string; name: string }>;
    const out: Array<{ id: string; name: string }> = [];
    if (task.assigned_to && task.assigned_to_name) out.push({ id: task.assigned_to, name: task.assigned_to_name });
    const co = (task.co_assignees as Array<{ id: string; name: string }> | undefined) ?? [];
    co.forEach(c => { if (!out.find(x => x.id === c.id)) out.push({ id: c.id, name: c.name }); });
    if (out.length === 0 && task.user_id) {
      out.push({ id: task.user_id, name: 'Owner' });
    }
    return out;
  }, [task]);

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
        />
      </div>

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
          </div>

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
            {task.estimated_hours != null && <MetaRow icon={Clock} label="Estimated" value={`${task.estimated_hours}h`} />}
            {task.actual_hours != null && <MetaRow icon={Clock} label="Actual" value={`${task.actual_hours}h`} />}
            {task.recurrence && task.recurrence !== 'none' && (
              <MetaRow icon={History} label="Recurrence" value={String(task.recurrence)} />
            )}
          </div>

          {/* Assignees & Elements */}
          <AssigneesPanel
            taskId={id!}
            assignees={allAssignees}
            primaryAssigneeId={task?.assigned_to ?? undefined}
            profiles={profiles}
            onAddCoAssignee={addCoAssignee}
            onRemoveCoAssignee={removeCoAssignee}
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
  primaryAssigneeId, profiles, onAddCoAssignee, onRemoveCoAssignee,
}: {
  taskId: string;
  assignees: Array<{ id: string; name: string }>;
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
