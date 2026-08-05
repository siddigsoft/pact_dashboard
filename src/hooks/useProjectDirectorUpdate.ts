import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Types ────────────────────────────────────────────────────────────────────

export type RiskFlag = 'green' | 'yellow' | 'orange' | 'red';
export type UpdateStatus = 'draft' | 'submitted' | 'validated' | 'returned';
export type ActionStatus = 'pending' | 'in_progress' | 'resolved' | 'escalated';

export interface ProgressSnapshot {
  stage_id: string | null;
  overall_progress: number;
  planned_progress: number | null;
  milestones_total: number;
  milestones_completed: number;
  milestones_remaining: number;
  milestones_delayed: number;
  milestone_rate: number;
  breakdown_completed: number;
  breakdown_in_progress: number;
  breakdown_not_started: number;
  open_high_risks: number;
  open_critical_risks: number;
  risk_flag_suggested: RiskFlag;
  activity_count: number;
}

export interface UpdateAction {
  id?: string;
  action_required: string;
  responsible_unit: string | null;
  deadline: string | null;
  status: ActionStatus;
  resolution_date?: string | null;
}

export interface DirectorUpdate {
  id: string;
  project_id: string;
  reporting_period: string;
  cycle_start: string;
  cycle_end: string;
  stage_id: string | null;
  overall_progress: number | null;
  planned_progress: number | null;
  milestones_total: number | null;
  milestones_completed: number | null;
  milestones_remaining: number | null;
  milestones_delayed: number | null;
  breakdown_completed: number | null;
  breakdown_in_progress: number | null;
  breakdown_not_started: number | null;
  overall_progress_override: number | null;
  override_reason: string | null;
  risk_flag: RiskFlag | null;
  risk_flag_suggested: string | null;
  risk_flag_reason: string | null;
  main_challenge: string | null;
  challenge_category: string | null;
  challenge_effect: string[] | null;
  support_needed: string | null;
  responsible_unit: string | null;
  summary_progress: string | null;
  summary_issue: string | null;
  summary_support: string | null;
  status: UpdateStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  validated_by: string | null;
  validated_at: string | null;
  returned_reason: string | null;
  updated_at: string;
}

// ── Reporting cycle (ISO week; biweekly is Phase 4) ──────────────────────────

export function currentCycle() {
  const now = new Date();
  // ISO week number
  const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  // Monday..Sunday of the current week
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    period: `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`,
    start: iso(monday),
    end: iso(sunday),
    label: `Week ${week}, ${t.getUTCFullYear()}`,
  };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useProjectDirectorUpdate(projectId: string) {
  const qc = useQueryClient();
  const cycle = useMemo(() => currentCycle(), []);

  const snapshot = useQuery({
    queryKey: ['pdu_snapshot', projectId],
    queryFn: async (): Promise<ProgressSnapshot> => {
      const { data, error } = await supabase.rpc('get_project_progress_snapshot', { p_project_id: projectId });
      if (error) throw error;
      return data as unknown as ProgressSnapshot;
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const current = useQuery({
    queryKey: ['pdu_current', projectId, cycle.period],
    queryFn: async (): Promise<DirectorUpdate | null> => {
      const { data, error } = await supabase
        .from('project_director_updates')
        .select('*')
        .eq('project_id', projectId)
        .eq('reporting_period', cycle.period)
        .maybeSingle();
      if (error) throw error;
      return (data as DirectorUpdate) ?? null;
    },
    enabled: !!projectId,
  });

  const history = useQuery({
    queryKey: ['pdu_history', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('project_director_updates')
        .select('id, reporting_period, cycle_end, overall_progress, risk_flag, status')
        .eq('project_id', projectId)
        .eq('status', 'validated')
        .order('cycle_end', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; reporting_period: string; cycle_end: string; overall_progress: number | null; risk_flag: RiskFlag | null; status: UpdateStatus }>;
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const actions = useQuery({
    queryKey: ['pdu_actions', current.data?.id],
    queryFn: async (): Promise<UpdateAction[]> => {
      if (!current.data?.id) return [];
      const { data, error } = await supabase
        .from('project_update_actions')
        .select('id, action_required, responsible_unit, deadline, status, resolution_date')
        .eq('update_id', current.data.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UpdateAction[];
    },
    enabled: !!current.data?.id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pdu_current', projectId, cycle.period] });
    qc.invalidateQueries({ queryKey: ['pdu_history', projectId] });
  };

  // Upsert the draft for this cycle (create or update the single row per project+period)
  const save = useMutation({
    mutationFn: async (patch: Partial<DirectorUpdate> & { _submit?: boolean; _actions?: UpdateAction[] }) => {
      const { _submit, _actions, ...fields } = patch;
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;

      const row: Record<string, unknown> = {
        project_id: projectId,
        reporting_period: cycle.period,
        cycle_start: cycle.start,
        cycle_end: cycle.end,
        ...fields,
        updated_at: new Date().toISOString(),
      };
      if (_submit) {
        row.status = 'submitted';
        row.submitted_by = uid;
        row.submitted_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from('project_director_updates')
        .upsert(row, { onConflict: 'project_id,reporting_period' })
        .select()
        .single();
      if (error) throw error;
      const updateId = (data as DirectorUpdate).id;

      // Replace the open-actions set for this update, if provided
      if (_actions) {
        await supabase.from('project_update_actions').delete().eq('update_id', updateId);
        const rows = _actions
          .filter(a => a.action_required.trim())
          .map(a => ({
            update_id: updateId,
            project_id: projectId,
            action_required: a.action_required,
            responsible_unit: a.responsible_unit || null,
            deadline: a.deadline || null,
            status: a.status || 'pending',
            resolution_date: a.resolution_date || null,
          }));
        if (rows.length) await supabase.from('project_update_actions').insert(rows);
      }
      return data as DirectorUpdate;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['pdu_actions'] });
    },
  });

  return {
    cycle,
    snapshot: snapshot.data,
    snapshotLoading: snapshot.isLoading,
    current: current.data ?? null,
    actions: actions.data ?? [],
    history: history.data ?? [],
    isLoading: current.isLoading,
    saveDraft: (patch: Partial<DirectorUpdate> & { _actions?: UpdateAction[] }) => save.mutateAsync(patch),
    submit: (patch: Partial<DirectorUpdate> & { _actions?: UpdateAction[] }) => save.mutateAsync({ ...patch, _submit: true }),
    isSaving: save.isPending,
  };
}
