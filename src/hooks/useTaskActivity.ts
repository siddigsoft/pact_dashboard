import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';

export interface StatusHistoryRow {
  id: string;
  task_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  changed_by_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface ActivityRow {
  id: string;
  task_id: string;
  user_id: string | null;
  user_name: string | null;
  kind: 'message' | 'log_note' | 'whatsapp' | 'activity' | 'system';
  body: string | null;
  meta: Record<string, unknown>;
  scheduled_for: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
}

export interface ElementRow {
  id: string;
  task_id: string;
  assignee_id: string;
  assignee_name: string | null;
  label: string;
  done: boolean;
  done_at: string | null;
  position: number;
  created_at: string;
  // Progressive output tracking (added 2026-04). All nullable;
  // when target_value IS NULL the element behaves as a binary done flag.
  target_value: number | null;
  current_value: number | null;
  unit: string | null;
}

export function useTaskStatusHistory(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-status-history', taskId],
    queryFn: async () => {
      if (!taskId) return [] as StatusHistoryRow[];
      const { data, error } = await supabase
        .from('task_status_history')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StatusHistoryRow[];
    },
    enabled: !!taskId,
  });
}

export function useLogStatusChange() {
  const { currentUser: user } = useUser();
  return useMutation({
    mutationFn: async ({ taskId, fromStatus, toStatus, reason }: { taskId: string; fromStatus: string | null; toStatus: string; reason?: string }) => {
      let userName: string | null = null;
      if (user?.id) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        userName = (prof?.full_name as string) ?? null;
      }
      await supabase.from('task_status_history').insert({
        task_id: taskId,
        from_status: fromStatus,
        to_status: toStatus,
        changed_by: user?.id ?? null,
        changed_by_name: userName,
        reason: reason ?? null,
      });
      await supabase.from('task_activity_log').insert({
        task_id: taskId,
        user_id: user?.id ?? null,
        user_name: userName,
        kind: 'system',
        body: `Status changed from "${fromStatus ?? '—'}" to "${toStatus}"${reason ? ` — ${reason}` : ''}`,
      });
    },
  });
}

export function useTaskActivity(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-activity', taskId],
    queryFn: async () => {
      if (!taskId) return [] as ActivityRow[];
      const { data, error } = await supabase
        .from('task_activity_log')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
    enabled: !!taskId,
  });
}

export function useAddActivity() {
  const qc = useQueryClient();
  const { currentUser: user } = useUser();
  return useMutation({
    mutationFn: async (input: {
      taskId: string;
      kind: ActivityRow['kind'];
      body?: string | null;
      scheduledFor?: string | null;
      meta?: Record<string, unknown>;
    }) => {
      let userName: string | null = null;
      if (user?.id) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
        userName = (prof?.full_name as string) ?? null;
      }
      const { error } = await supabase.from('task_activity_log').insert({
        task_id: input.taskId,
        user_id: user?.id ?? null,
        user_name: userName,
        kind: input.kind,
        body: input.body ?? null,
        scheduled_for: input.scheduledFor ?? null,
        meta: input.meta ?? {},
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['task-activity', vars.taskId] }),
  });
}

export function useTaskElements(taskId: string | undefined) {
  return useQuery({
    queryKey: ['task-elements', taskId],
    queryFn: async () => {
      if (!taskId) return [] as ElementRow[];
      const { data, error } = await supabase
        .from('task_assignee_elements')
        .select('*')
        .eq('task_id', taskId)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ElementRow[];
    },
    enabled: !!taskId,
  });
}

export function useAddElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { taskId: string; assigneeId: string; assigneeName: string | null; label: string; position?: number }) => {
      const { error } = await supabase.from('task_assignee_elements').insert({
        task_id: input.taskId,
        assignee_id: input.assigneeId,
        assignee_name: input.assigneeName,
        label: input.label,
        position: input.position ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['task-elements', vars.taskId] }),
  });
}

export function useToggleElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; taskId: string; done: boolean }) => {
      const { error } = await supabase.from('task_assignee_elements')
        .update({ done: input.done, done_at: input.done ? new Date().toISOString() : null })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['task-elements', vars.taskId] }),
  });
}

export function useDeleteElement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; taskId: string }) => {
      const { error } = await supabase.from('task_assignee_elements').delete().eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['task-elements', vars.taskId] }),
  });
}

// Progressive output tracking ─────────────────────────────────────────────
// Sets / clears the quantitative target & unit on an element.
// target_value = null ⇒ revert to binary done/not-done behaviour.
export function useSetElementTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; taskId: string; target: number | null; unit: string | null }) => {
      const patch: Record<string, unknown> = {
        target_value: input.target,
        unit: input.unit,
      };
      if (input.target === null) {
        patch.current_value = 0;
      }
      const { error } = await supabase
        .from('task_assignee_elements')
        .update(patch)
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['task-elements', vars.taskId] }),
  });
}

// Calls the SECURITY DEFINER RPC `update_task_element_progress` which
// validates range, writes a log row, and auto-sets done/done_at.
export function useUpdateElementProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; taskId: string; value: number; note?: string }) => {
      const { error } = await supabase.rpc('update_task_element_progress', {
        p_element_id: input.id,
        p_value: input.value,
        p_note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['task-elements', vars.taskId] });
      qc.invalidateQueries({ queryKey: ['task-element-progress-log', vars.id] });
    },
  });
}

export interface ElementProgressLogRow {
  id: string;
  element_id: string;
  task_id: string;
  value: number;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
}

export function useElementProgressLog(elementId: string | undefined) {
  return useQuery({
    queryKey: ['task-element-progress-log', elementId],
    queryFn: async () => {
      if (!elementId) return [] as ElementProgressLogRow[];
      const { data, error } = await supabase
        .from('task_element_progress_log')
        .select('*')
        .eq('element_id', elementId)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ElementProgressLogRow[];
    },
    enabled: !!elementId,
  });
}
