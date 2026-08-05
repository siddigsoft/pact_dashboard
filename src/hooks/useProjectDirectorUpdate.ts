import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { dispatchNotification } from '@/lib/notify';

/** Roles that may validate / return a submitted director update (UI check; normalizeRole-friendly). */
export const PDU_VALIDATOR_ROLES = [
  'admin', 'Admin', 'super_admin', 'superAdmin', 'Super Admin', 'SuperAdmin',
  'fom', 'Field Operation Manager (FOM)',
  'countryDirector', 'Country Director',
  'ict', 'ICT',
];

/** Exact role strings stored in user_roles — used for dispatchNotification recipientRoles. */
const PDU_NOTIFY_ROLES = ['admin', 'Admin', 'superAdmin', 'super_admin', 'fom', 'countryDirector'];

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

// ── Reporting cycle (ISO week; biweekly = odd+even week pair) ─────────────────

export type ReportingCadence = 'weekly' | 'biweekly';

function isoWeekParts(now = new Date()) {
  const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const year = t.getUTCFullYear();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return { year, week, monday };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Current reporting window for a project cadence. */
export function currentCycle(cadence: ReportingCadence = 'weekly') {
  const { year, week, monday } = isoWeekParts();
  if (cadence === 'biweekly') {
    // Pair weeks 1–2, 3–4, … (odd week starts the biweek)
    const startWeek = week % 2 === 1 ? week : week - 1;
    const endWeek = startWeek + 1;
    const startMonday = new Date(monday);
    if (week % 2 === 0) startMonday.setDate(monday.getDate() - 7);
    const endSunday = new Date(startMonday);
    endSunday.setDate(startMonday.getDate() + 13);
    return {
      period: `${year}-W${String(startWeek).padStart(2, '0')}/${String(endWeek).padStart(2, '0')}`,
      start: isoDate(startMonday),
      end: isoDate(endSunday),
      label: `Weeks ${startWeek}–${endWeek}, ${year}`,
      cadence: 'biweekly' as const,
    };
  }
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    period: `${year}-W${String(week).padStart(2, '0')}`,
    start: isoDate(monday),
    end: isoDate(sunday),
    label: `Week ${week}, ${year}`,
    cadence: 'weekly' as const,
  };
}

/** Both period keys that may be "current" across the portfolio today. */
export function activeCyclePeriods() {
  return [currentCycle('weekly').period, currentCycle('biweekly').period];
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useProjectDirectorUpdate(projectId: string) {
  const qc = useQueryClient();

  const projectMeta = useQuery({
    queryKey: ['pdu_project_meta', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('reporting_cadence, name, project_code')
        .eq('id', projectId)
        .single();
      if (error) throw error;
      return data as { reporting_cadence: ReportingCadence | null; name: string; project_code: string | null };
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });

  const cadence: ReportingCadence = projectMeta.data?.reporting_cadence === 'biweekly' ? 'biweekly' : 'weekly';
  const cycle = useMemo(() => currentCycle(cadence), [cadence]);

  const setCadence = useMutation({
    mutationFn: async (next: ReportingCadence) => {
      const { error } = await supabase.from('projects').update({ reporting_cadence: next }).eq('id', projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pdu_project_meta', projectId] });
      qc.invalidateQueries({ queryKey: ['pu_projects'] });
      qc.invalidateQueries({ queryKey: ['pdu_current', projectId] });
    },
  });

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
    qc.invalidateQueries({ queryKey: ['pu_cycle_updates'] });
  };

  async function projectLabel() {
    if (projectMeta.data) {
      return projectMeta.data.project_code
        ? `${projectMeta.data.name} (${projectMeta.data.project_code})`
        : projectMeta.data.name;
    }
    const { data } = await supabase.from('projects').select('name, project_code').eq('id', projectId).maybeSingle();
    if (!data) return 'a project';
    return data.project_code ? `${data.name} (${data.project_code})` : data.name;
  }

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
        row.returned_reason = null;
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

      if (_submit) {
        const label = await projectLabel();
        void dispatchNotification({
          event: 'project_director_update_submitted',
          recipientRoles: PDU_NOTIFY_ROLES,
          titleEn: 'Director update awaiting validation',
          titleAr: 'تحديث مدير المشروع بانتظار التحقق',
          messageEn: `${label} — ${cycle.label} is ready for Implementation & Management review.`,
          messageAr: `${label} — ${cycle.label} جاهز لمراجعة إدارة التنفيذ.`,
          priority: 'high',
          entityType: 'project_director_update',
          entityId: updateId,
          actionUrl: `/project-updates`,
          metadata: { project_id: projectId, reporting_period: cycle.period },
          triggeredBy: uid ?? undefined,
        });
      }

      return data as DirectorUpdate;
    },
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['pdu_actions'] });
    },
  });

  const decide = useMutation({
    mutationFn: async (opts: { action: 'validate' | 'return'; reason?: string }) => {
      if (!current.data?.id) throw new Error('No update to decide on');
      if (current.data.status !== 'submitted') throw new Error('Only submitted updates can be validated or returned');
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;
      const now = new Date().toISOString();

      if (opts.action === 'return' && !opts.reason?.trim()) {
        throw new Error('A return reason is required');
      }

      const patch =
        opts.action === 'validate'
          ? { status: 'validated' as const, validated_by: uid, validated_at: now, returned_reason: null, updated_at: now }
          : { status: 'returned' as const, returned_reason: opts.reason!.trim(), validated_by: null, validated_at: null, updated_at: now };

      const { data, error } = await supabase
        .from('project_director_updates')
        .update(patch)
        .eq('id', current.data.id)
        .eq('status', 'submitted')
        .select()
        .single();
      if (error) throw error;

      const label = await projectLabel();
      const submitter = current.data.submitted_by;
      if (opts.action === 'validate') {
        void dispatchNotification({
          event: 'project_director_update_validated',
          recipientIds: submitter ? [submitter] : undefined,
          recipientRoles: submitter ? undefined : PDU_NOTIFY_ROLES,
          titleEn: 'Director update validated',
          titleAr: 'تم التحقق من تحديث مدير المشروع',
          messageEn: `${label} — ${cycle.label} is published to the dashboards.`,
          messageAr: `${label} — ${cycle.label} نُشر على لوحات المعلومات.`,
          priority: 'normal',
          entityType: 'project_director_update',
          entityId: current.data.id,
          actionUrl: `/project-updates`,
          metadata: { project_id: projectId, reporting_period: cycle.period },
          triggeredBy: uid ?? undefined,
        });
        // ponytail: escalate via edge notify on orange/red; DB trigger if fan-out must be guaranteed without client
        const flag = (current.data.risk_flag ?? '').toLowerCase();
        if (flag === 'orange' || flag === 'red') {
          void dispatchNotification({
            event: 'project_director_update_escalated',
            recipientRoles: PDU_NOTIFY_ROLES,
            titleEn: `${flag === 'red' ? 'Red' : 'Orange'} risk — director update escalated`,
            titleAr: `تصعيد تحديث مدير المشروع — علم ${flag === 'red' ? 'أحمر' : 'برتقالي'}`,
            messageEn: `${label} — ${cycle.label} validated with a ${flag} risk flag.${current.data.main_challenge ? ` Challenge: ${current.data.main_challenge}` : ''}${current.data.support_needed ? ` Support: ${current.data.support_needed}` : ''}`,
            messageAr: `${label} — ${cycle.label} تم التحقق بعلم مخاطر ${flag}.`,
            priority: flag === 'red' ? 'urgent' : 'high',
            entityType: 'project_director_update',
            entityId: current.data.id,
            actionUrl: `/project-updates`,
            metadata: {
              project_id: projectId,
              reporting_period: cycle.period,
              risk_flag: flag,
              responsible_unit: current.data.responsible_unit,
            },
            triggeredBy: uid ?? undefined,
          });
        }
      } else {
        void dispatchNotification({
          event: 'project_director_update_returned',
          recipientIds: submitter ? [submitter] : undefined,
          recipientRoles: submitter ? undefined : PDU_NOTIFY_ROLES,
          titleEn: 'Director update returned for revision',
          titleAr: 'أُعيد تحديث مدير المشروع للمراجعة',
          messageEn: `${label} — ${cycle.label}: ${opts.reason!.trim()}`,
          messageAr: `${label} — ${cycle.label}: ${opts.reason!.trim()}`,
          priority: 'high',
          entityType: 'project_director_update',
          entityId: current.data.id,
          actionUrl: `/project-updates`,
          metadata: { project_id: projectId, reporting_period: cycle.period, reason: opts.reason!.trim() },
          triggeredBy: uid ?? undefined,
        });
      }

      return data as DirectorUpdate;
    },
    onSuccess: () => invalidate(),
  });

  return {
    cycle,
    cadence,
    setCadence: (next: ReportingCadence) => setCadence.mutateAsync(next),
    isSettingCadence: setCadence.isPending,
    snapshot: snapshot.data,
    snapshotLoading: snapshot.isLoading,
    current: current.data ?? null,
    actions: actions.data ?? [],
    history: history.data ?? [],
    isLoading: current.isLoading,
    saveDraft: (patch: Partial<DirectorUpdate> & { _actions?: UpdateAction[] }) => save.mutateAsync(patch),
    submit: (patch: Partial<DirectorUpdate> & { _actions?: UpdateAction[] }) => save.mutateAsync({ ...patch, _submit: true }),
    validate: () => decide.mutateAsync({ action: 'validate' }),
    returnUpdate: (reason: string) => decide.mutateAsync({ action: 'return', reason }),
    isSaving: save.isPending || decide.isPending,
  };
}
