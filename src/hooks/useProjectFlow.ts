import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { useAuthorization } from '@/hooks/use-authorization';
import { getProjectFlow, type FlowStage } from '@/config/projectFlows';
import type { Project } from '@/types/project';

export interface FlowLogEntry {
  id: string;
  projectId: string;
  stageId: string;
  stageLabel: string;
  advancedBy: string | null;
  advancedByName?: string;
  advancedAt: string;
  notes: string | null;
}

export interface CustomStageEntry {
  id: string;
  skipped?: boolean;
  customLabel?: string;
  customDescription?: string;
  customOutputs?: string[];
  /** Stages sharing the same parallelGroup number run concurrently */
  parallelGroup?: number | null;
  /** ISO date strings for timeline / Gantt */
  plannedStart?: string | null;
  plannedEnd?: string | null;
  dueDate?: string | null;
  /** IDs of stages that must be completed before this stage can start */
  dependencies?: string[];
  /** Mark this stage as a project milestone */
  isMilestone?: boolean;
  /** Removed from flow via Edit Flow trash button — hides from stage list entirely (not the same as runtime-skip) */
  removedFromTemplate?: boolean;
  /** Manual % complete override (0-100). If null, derived from checklist. */
  percentComplete?: number | null;
  /** Optional section name — stages sharing a sectionLabel within the same parallel group appear under a bold sub-group header row (MS Project "summary task" concept) */
  sectionLabel?: string | null;
}

export type StageStatusAction = 'mark-complete' | 'set-current' | 'toggle-skip' | 'reopen';

export interface UseProjectFlowReturn {
  /** Canonical default stages plus any user-added custom stages, in display order. */
  flowDef: FlowStage[];
  activeStages: FlowStage[];
  /** All parallel groups in order, each is an array of stages */
  groups: FlowStage[][];
  /** Stages in the currently active group (may be > 1 for parallel) */
  currentStages: FlowStage[];
  /** Primary current stage (first in current group, for backward compat) */
  currentStage: FlowStage | null;
  currentStageIndex: number;
  currentGroupIdx: number;
  stageHistory: FlowLogEntry[];
  isLastGroup: boolean;
  /** @deprecated use isLastGroup */
  isLastStage: boolean;
  canAdvance: boolean;
  canEditFlow: boolean;
  isLoading: boolean;
  isAdvancing: boolean;
  isSavingCustom: boolean;
  isMutatingStageStatus: boolean;
  /** Complete a specific stage (handles parallel groups) */
  completeStage: (stageId: string, notes: string) => Promise<void>;
  /** Backward-compat: completes first current stage */
  advanceStage: (notes: string) => Promise<void>;
  updateCustomStages: (customStages: CustomStageEntry[]) => Promise<void>;
  /**
   * Manually flip a stage's status. Unlike `completeStage`, this is an
   * explicit override — no checklist guard, no auto-advance, no notifications.
   * Caller is expected to be an editor (canEditFlow).
   */
  setStageStatus: (stageId: string, action: StageStatusAction) => Promise<void>;
  getStageStatus: (stageId: string) => 'completed' | 'current' | 'skipped' | 'upcoming';
  isStageCompleted: (stageId: string) => boolean;
  /**
   * Returns labels of incomplete dependency stages that are blocking this stage.
   * Empty array = not blocked.
   */
  getBlockedBy: (stageId: string) => string[];
  isStageBlocked: (stageId: string) => boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

export interface StageOverrideRow {
  stage_id: string;
  label_en: string | null;
  label_ar: string | null;
  description_en: string | null;
  description_ar: string | null;
  typical_duration_days: number | null;
  key_outputs_en: string[] | null;
  key_outputs_ar: string[] | null;
  is_disabled: boolean;
}

async function fetchStageOverrides(projectType: string): Promise<StageOverrideRow[]> {
  // Always query by the canonical flow type (getProjectFlow handles legacy aliases
  // like survey/monitoring/training -> their canonical id), so a project stored
  // with a legacy/aliased type still picks up overrides keyed against the
  // canonical type the admin page exposes.
  const canonicalType = getProjectFlow(projectType).type;
  const { data, error } = await supabase
    .from('project_flow_stage_overrides')
    .select('stage_id, label_en, label_ar, description_en, description_ar, typical_duration_days, key_outputs_en, key_outputs_ar, is_disabled')
    .eq('project_type', canonicalType);
  if (error) {
    // Only swallow the "table does not exist" cases (env where the SQL has not
    // been pasted yet). Surface every other error (RLS / network / data) so we
    // do not silently hide bugs.
    const code = (error as { code?: string }).code;
    const msg = (error as { message?: string }).message?.toLowerCase() ?? '';
    const isMissingTable =
      code === 'PGRST205' ||
      code === '42P01' ||
      msg.includes('does not exist') ||
      msg.includes('could not find the table');
    if (isMissingTable) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as StageOverrideRow[];
}

/** Apply admin overrides on top of the hard-coded flow stages. */
function applyOverrides(stages: FlowStage[], overrides: StageOverrideRow[]): FlowStage[] {
  if (!overrides.length) return stages;
  const byId = new Map(overrides.map(o => [o.stage_id, o]));
  return stages
    .filter(s => !byId.get(s.id)?.is_disabled)
    .map(s => {
      const ov = byId.get(s.id);
      if (!ov) return s;
      return {
        ...s,
        label: ov.label_en?.trim() || s.label,
        description: ov.description_en?.trim() || s.description,
        keyOutputs: ov.key_outputs_en?.length ? ov.key_outputs_en : s.keyOutputs,
        typicalDurationDays: ov.typical_duration_days ?? s.typicalDurationDays,
      };
    });
}

async function fetchFlowLog(projectId: string): Promise<FlowLogEntry[]> {
  const { data, error } = await supabase
    .from('project_flow_log')
    .select(`
      id,
      project_id,
      stage_id,
      stage_label,
      advanced_by,
      advanced_at,
      notes,
      profiles:advanced_by ( full_name )
    `)
    .eq('project_id', projectId)
    .order('advanced_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    projectId: row.project_id,
    stageId: row.stage_id,
    stageLabel: row.stage_label,
    advancedBy: row.advanced_by,
    advancedByName: row.profiles?.full_name ?? undefined,
    advancedAt: row.advanced_at,
    notes: row.notes,
  }));
}

/** Build ordered list of parallel groups from effective stages */
function buildGroups(effectiveStages: FlowStage[], customEntries: CustomStageEntry[]): FlowStage[][] {
  const groups: FlowStage[][] = [];
  let currentGroupNum: number | null | undefined = undefined;

  effectiveStages.forEach(stage => {
    const entry = customEntries.find(e => e.id === stage.id);
    const groupNum = entry?.parallelGroup ?? null;

    if (groupNum !== null && groupNum === currentGroupNum) {
      groups[groups.length - 1].push(stage);
    } else {
      groups.push([stage]);
      currentGroupNum = groupNum;
    }
  });

  return groups;
}

async function sendStageNotifications(
  projectId: string,
  projectName: string,
  nextStageLabel: string,
  teamMembers: string[],  // may contain UUIDs or full names (legacy)
  advancedByName: string,
  advancedById: string,
  isMilestone = false,
) {
  if (!teamMembers.length) return;

  // Split members into UUIDs (stored as IDs in modern projects) vs names (legacy)
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = teamMembers.filter(m => uuidRx.test(m));
  const names = teamMembers.filter(m => !uuidRx.test(m));

  const profileResults: any[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', ids)
      .eq('status', 'approved');
    if (data) profileResults.push(...data);
  }
  if (names.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('full_name', names)
      .eq('status', 'approved');
    if (data) {
      const existingIds = new Set(profileResults.map(r => r.id));
      profileResults.push(...data.filter((d: any) => !existingIds.has(d.id)));
    }
  }

  if (!profileResults.length) return;

  const recipientIds = profileResults.map((p: any) => p.id);
  const eventType = isMilestone ? 'project_milestone_reached' : 'project_stage_advanced';
  const titleEn = isMilestone
    ? `Milestone Reached: ${projectName}`
    : `Project Stage Advanced: ${projectName}`;
  const titleAr = isMilestone
    ? `تم الوصول إلى مرحلة رئيسية: ${projectName}`
    : `تقدم مرحلة المشروع: ${projectName}`;
  const msgEn = isMilestone
    ? `${advancedByName} completed milestone "${nextStageLabel}" in "${projectName}"`
    : `${advancedByName} advanced "${projectName}" to stage: ${nextStageLabel}`;
  const msgAr = isMilestone
    ? `أكمل ${advancedByName} المرحلة الرئيسية "${nextStageLabel}" في "${projectName}"`
    : `قام ${advancedByName} بتقديم "${projectName}" إلى المرحلة: ${nextStageLabel}`;

  // dispatch-notification handles in-app + email AND fans out to send-whatsapp
  // (see supabase/functions/dispatch-notification/index.ts) — calling
  // send-whatsapp directly here would deliver duplicate WA messages.
  supabase.functions.invoke('dispatch-notification', {
    body: {
      event_type: eventType,
      entity_type: 'project',
      entity_id: projectId,
      priority: isMilestone ? 'high' : 'normal',
      recipient_ids: recipientIds,
      title_en: titleEn,
      title_ar: titleAr,
      message_en: msgEn,
      message_ar: msgAr,
      triggered_by: advancedById,
      triggered_by_name: advancedByName,
      workflow_stage: nextStageLabel,
      action_url: `/projects/${projectId}?tab=flow`,
      send_email: true,
      metadata: {
        project_name: projectName,
        stage: nextStageLabel,
        advanced_by: advancedByName,
      },
    },
  }).catch(() => {});
}

// Notify team that a single stage was completed (not necessarily advancing the pointer)
async function sendStageCompletedNotification(
  projectId: string,
  projectName: string,
  stageLabel: string,
  recipientIds: string[],
  actorName: string,
  actorId: string,
) {
  if (!recipientIds.length) return;
  supabase.functions.invoke('dispatch-notification', {
    body: {
      event_type: 'project_stage_completed',
      entity_type: 'project',
      entity_id: projectId,
      priority: 'normal',
      recipient_ids: recipientIds,
      title_en: `Stage Completed: ${stageLabel}`,
      title_ar: `اكتملت المرحلة: ${stageLabel}`,
      message_en: `${actorName} completed stage "${stageLabel}" in project "${projectName}"`,
      message_ar: `أكمل ${actorName} مرحلة "${stageLabel}" في مشروع "${projectName}"`,
      triggered_by: actorId,
      triggered_by_name: actorName,
      workflow_stage: stageLabel,
      action_url: `/projects/${projectId}?tab=flow`,
      send_email: true,
      metadata: {
        project_name: projectName,
        stage: stageLabel,
      },
    },
  }).catch(() => {});
}

// Resolve team member profile IDs from a mixed array of UUIDs and/or full names
async function resolveTeamRecipientIds(teamMembers: string[], excludeId?: string): Promise<string[]> {
  if (!teamMembers.length) return [];
  const uuidRx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = teamMembers.filter(m => uuidRx.test(m));
  const names = teamMembers.filter(m => !uuidRx.test(m));
  const results: string[] = [];
  if (ids.length > 0) results.push(...ids);
  if (names.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('full_name', names)
      .eq('status', 'approved');
    if (data) results.push(...data.map((d: any) => d.id));
  }
  const unique = [...new Set(results)];
  return excludeId ? unique.filter(id => id !== excludeId) : unique;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useProjectFlow(project: Project): UseProjectFlowReturn {
  const { currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  const queryClient = useQueryClient();

  const defaultFlow = getProjectFlow(project.projectType);

  const overridesQuery = useQuery({
    queryKey: ['project_flow_stage_overrides', project.projectType],
    queryFn: () => fetchStageOverrides(project.projectType),
    staleTime: 5 * 60 * 1000,
  });
  const overrides = overridesQuery.data ?? [];

  const allDefaultStages = applyOverrides(defaultFlow.stages, overrides);

  const customEntries: CustomStageEntry[] = (project.customFlowStages as CustomStageEntry[]) ?? [];
  const hasCustom = customEntries.length > 0;

  // Custom-added stages are entries that have no matching id in the canonical
  // flow definition. We synthesize a FlowStage from the entry's own custom*
  // fields so they integrate seamlessly with the rest of the rendering code.
  const synthesizeCustomStage = (entry: CustomStageEntry): FlowStage => ({
    id: entry.id,
    label: entry.customLabel?.trim() || 'New Stage',
    description: entry.customDescription ?? '',
    keyOutputs: entry.customOutputs ?? [],
  });

  // Apply any custom* overrides on top of a matching default stage (e.g. a
  // user renamed "Analysis" to "Finance & Fund Approvals" via customLabel).
  // Without this, only the id/order come from the override and every UI spot
  // that reads `.label` directly (flow banner, FlowStrip icons, etc.) would
  // keep showing the stale default label instead of the renamed one.
  const resolveStageForEntry = (entry: CustomStageEntry): FlowStage => {
    const base = allDefaultStages.find(s => s.id === entry.id);
    if (!base) return synthesizeCustomStage(entry);
    return {
      ...base,
      label: entry.customLabel?.trim() || base.label,
      description: entry.customDescription ?? base.description,
      keyOutputs: entry.customOutputs ?? base.keyOutputs,
    };
  };

  // displayStages = everything the UI should iterate over (default + user-added),
  // including runtime-skipped ones but EXCLUDING stages removed in Edit Flow.
  // Order follows customEntries when present, else default.
  const displayStages: FlowStage[] = hasCustom
    ? customEntries.filter(ce => !ce.removedFromTemplate).map(resolveStageForEntry)
    : allDefaultStages;

  // effectiveStages = displayStages minus skipped (used for grouping / pointer math)
  const effectiveStages: FlowStage[] = hasCustom
    ? customEntries.filter(ce => !ce.skipped && !ce.removedFromTemplate).map(resolveStageForEntry)
    : allDefaultStages;

  const skippedIds = new Set(customEntries.filter(e => e.skipped && !e.removedFromTemplate).map(e => e.id));

  const historyQuery = useQuery({
    queryKey: ['project_flow_log', project.id],
    queryFn: () => fetchFlowLog(project.id),
    staleTime: 2 * 60 * 1000,   // 2 min — flow history rarely changes mid-session
    gcTime:   5 * 60 * 1000,
  });

  const stageHistory = historyQuery.data ?? [];
  const completedStageIds = new Set(stageHistory.map(h => h.stageId));

  // Build parallel groups
  const groups = buildGroups(effectiveStages, customEntries);

  // Find which group is currently active
  const currentStageId = project.currentFlowStage ?? effectiveStages[0]?.id;
  const storedGroupIdx = Math.max(
    0,
    groups.findIndex(g => g.some(s => s.id === currentStageId)),
  );

  // Self-healing: the stored `current_flow_stage` pointer can lag behind
  // reality — e.g. a stage was finished via the per-stage "Mark Complete"
  // override (setStageStatusMutation), which logs completion but doesn't
  // move the pointer. Rather than trust the stored value blindly, walk
  // forward past any groups that are already fully completed so the
  // "Active Stage" / "Stage X/N" display always matches the actual
  // completion log.
  let currentGroupIdx = storedGroupIdx;
  while (
    currentGroupIdx < groups.length - 1 &&
    groups[currentGroupIdx].every(s => completedStageIds.has(s.id))
  ) {
    currentGroupIdx += 1;
  }

  const currentGroupSafe = groups[currentGroupIdx] ?? [];
  const currentStages = currentGroupSafe;
  const currentStage = currentGroupSafe[0] ?? null;
  // Legacy index: position of currentStage in effectiveStages
  const currentStageIndex = currentStage ? effectiveStages.findIndex(s => s.id === currentStage.id) : 0;
  const isLastGroup = currentGroupIdx >= groups.length - 1;

  // Permissions
  const isPrivilegedRole = hasAnyRole(['super_admin', 'admin', 'fom']);
  // Match by UUID if available, fall back to fullName comparison for legacy data.
  const isProjectManager =
    !!currentUser?.id &&
    !!project.team?.projectManager &&
    (project.team.projectManager === currentUser.id ||
      project.team.projectManager === currentUser.fullName);
  const canAdvance = (isPrivilegedRole || isProjectManager) && !isLastGroup;
  const canEditFlow = isPrivilegedRole || isProjectManager;

  const isStageCompleted = useCallback(
    (stageId: string) => completedStageIds.has(stageId),
    [completedStageIds],
  );

  /** Returns labels of incomplete dependency stages blocking this stage */
  const getBlockedBy = useCallback(
    (stageId: string): string[] => {
      const entry = customEntries.find(e => e.id === stageId);
      if (!entry?.dependencies?.length) return [];
      return entry.dependencies
        .filter(depId => !completedStageIds.has(depId))
        .map(depId => {
          const depEntry = customEntries.find(e => e.id === depId);
          const depStage = allDefaultStages.find(s => s.id === depId);
          return depEntry?.customLabel || depStage?.label || depId;
        });
    },
    [customEntries, completedStageIds, allDefaultStages],
  );

  const isStageBlocked = useCallback(
    (stageId: string): boolean => getBlockedBy(stageId).length > 0,
    [getBlockedBy],
  );

  const getStageStatus = useCallback(
    (stageId: string): 'completed' | 'current' | 'skipped' | 'upcoming' => {
      if (skippedIds.has(stageId)) return 'skipped';
      if (completedStageIds.has(stageId)) return 'completed';
      if (currentStages.some(s => s.id === stageId)) return 'current';
      return 'upcoming';
    },
    [currentStages, completedStageIds, skippedIds],
  );

  // Patch this project in the cached projects list so the UI updates instantly.
  // NOTE: invalidations below use exact:true — the activities cache keys are
  // children of ['projects'], so a broad invalidate refetches every mounted
  // per-project activities query for no reason.
  const patchProjectInCache = (patch: Partial<Project>) => {
    queryClient.setQueryData<Project[]>(['projects'], (old) =>
      old ? old.map(p => (p.id === project.id ? { ...p, ...patch } : p)) : old,
    );
  };

  // Complete a single stage (handles parallel groups)
  const completeStageMutation = useMutation({
    mutationFn: async ({ stageId, notes }: { stageId: string; notes: string }) => {
      if (!currentUser?.id) throw new Error('Not authenticated');
      if (!canAdvance) throw new Error('You do not have permission');

      // Check dependencies
      const blockedBy = getBlockedBy(stageId);
      if (blockedBy.length > 0) {
        throw new Error(`This stage is blocked. Complete first: ${blockedBy.join(', ')}`);
      }

      const stageToComplete = effectiveStages.find(s => s.id === stageId);
      if (!stageToComplete) throw new Error('Stage not found');

      // T21 — Readiness check: all checklist items for this stage must be completed.
      // If the schema/table is missing we silently skip rather than block.
      try {
        const { data: pending, error: chkErr } = await supabase
          .from('project_stage_checklist')
          .select('id, item_text, completed')
          .eq('project_id', project.id)
          .eq('stage_id', stageId)
          .eq('completed', false);
        if (!chkErr && pending && pending.length > 0) {
          const labels = pending.slice(0, 3).map((r: any) => r.item_text).filter(Boolean).join(', ');
          const more = pending.length > 3 ? ` +${pending.length - 3} more` : '';
          throw new Error(
            `Cannot advance: ${pending.length} checklist item(s) still open${labels ? ` — ${labels}${more}` : ''}.`
          );
        }
      } catch (e: any) {
        // Re-throw our own readiness error; ignore schema-missing errors.
        if (e?.message?.startsWith('Cannot advance:')) throw e;
      }

      const entryForStage = customEntries.find(e => e.id === stageId);
      const isMilestone = entryForStage?.isMilestone ?? false;

      // Mark this stage as complete in the log
      const { error: logError } = await supabase.from('project_flow_log').insert({
        project_id: project.id,
        stage_id: stageToComplete.id,
        stage_label: stageToComplete.label,
        advanced_by: currentUser.id,
        notes: notes || null,
      });
      if (logError) throw new Error(logError.message);

      // Build team member list (UUIDs + legacy names, excluding current user)
      const allTeamMembers = [
        project.team?.projectManager,
        ...(project.team?.members ?? []),
        // Use userId (UUID) — name-based lookup is unreliable due to display name mismatches
        ...(project.team?.teamComposition?.map(m => m.userId).filter(Boolean) ?? []),
      ].filter((n): n is string => !!n && n !== currentUser.id && n !== currentUser.fullName);
      const uniqueTeamMembers = [...new Set(allTeamMembers)];

      // Always notify team that this stage was completed
      resolveTeamRecipientIds(uniqueTeamMembers, currentUser.id).then(recipientIds => {
        sendStageCompletedNotification(
          project.id,
          project.name,
          stageToComplete.label,
          recipientIds,
          currentUser.fullName ?? 'A team member',
          currentUser.id,
        );
      }).catch(() => {});

      // Check if ALL stages in the current group are now complete
      const nowCompletedIds = new Set([...completedStageIds, stageId]);
      const allGroupDone = currentGroupSafe.every(s => nowCompletedIds.has(s.id));

      let advancedToStageId: string | undefined;
      if (allGroupDone && !isLastGroup) {
        // Advance to the first stage of the next group
        const nextGroup = groups[currentGroupIdx + 1];
        const nextStage = nextGroup?.[0];
        if (!nextStage) return undefined;

        const { error: updateError } = await supabase.rpc('update_project_flow_stage', {
          p_id: project.id,
          p_stage: nextStage.id,
          p_custom_stages: project.customFlowStages ?? null,
        });
        if (updateError) throw new Error(updateError.message);
        advancedToStageId = nextStage.id;

        sendStageNotifications(
          project.id,
          project.name,
          nextStage.label,
          uniqueTeamMembers,
          currentUser.fullName ?? 'A team member',
          currentUser.id,
          false,
        ).catch(() => {});
      }

      // Send milestone notification if this stage is a milestone
      if (isMilestone) {
        sendStageNotifications(
          project.id,
          project.name,
          stageToComplete.label,
          uniqueTeamMembers,
          currentUser.fullName ?? 'A team member',
          currentUser.id,
          true,
        ).catch(() => {});
      }
      return advancedToStageId;
    },
    onSuccess: (advancedToStageId) => {
      if (advancedToStageId) patchProjectInCache({ currentFlowStage: advancedToStageId });
      queryClient.invalidateQueries({ queryKey: ['project_flow_log', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
    },
  });

  // Save custom stage config
  const customMutation = useMutation({
    mutationFn: async (customStages: CustomStageEntry[]) => {
      if (!canEditFlow) throw new Error('Permission denied');
      const { error } = await supabase
        .rpc('update_project_custom_stages', { p_id: project.id, p_custom_stages: customStages });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, customStages) => {
      patchProjectInCache({ customFlowStages: customStages });
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
    },
  });

  // Manual status override for a single stage. Bypasses the checklist guard,
  // auto-advance, and notifications that completeStageMutation runs — this is
  // an explicit "I know what I'm doing" admin/PM control surfaced as a
  // per-stage dropdown in the FlowTab.
  const setStageStatusMutation = useMutation({
    mutationFn: async ({ stageId, action }: { stageId: string; action: StageStatusAction }) => {
      if (!currentUser?.id) throw new Error('Not authenticated');
      if (!canEditFlow) throw new Error('You do not have permission to change stage status');

      const stage = displayStages.find(s => s.id === stageId);
      if (!stage) throw new Error('Stage not found');

      if (action === 'mark-complete') {
        // No-op if already marked complete.
        if (completedStageIds.has(stageId)) return;
        const { error } = await supabase.from('project_flow_log').insert({
          project_id: project.id,
          stage_id: stageId,
          stage_label: stage.label,
          advanced_by: currentUser.id,
          notes: 'Marked complete via status override',
        });
        if (error) throw new Error(error.message);

        // Notify team of manual stage completion
        const overrideTeamMembers = [
          project.team?.projectManager,
          ...(project.team?.members ?? []),
          ...(project.team?.teamComposition?.map(m => m.name) ?? []),
        ].filter((n): n is string => !!n && n !== currentUser.id && n !== currentUser.fullName);
        resolveTeamRecipientIds([...new Set(overrideTeamMembers)], currentUser.id).then(recipientIds => {
          sendStageCompletedNotification(
            project.id,
            project.name,
            stage.label,
            recipientIds,
            currentUser.fullName ?? 'A team member',
            currentUser.id,
          );
        }).catch(() => {});

        // Keep the `current_flow_stage` pointer in sync: if marking this
        // stage complete finishes its whole group, advance the pointer to
        // the next group's first stage — same as the normal complete flow.
        // Without this, the DB pointer silently lags behind the completion
        // log (the UI self-heals visually, but the stored value stays stale
        // for anything reading `current_flow_stage` directly, e.g. lists).
        const nowCompletedIds = new Set([...completedStageIds, stageId]);
        const groupIdx = groups.findIndex(g => g.some(s => s.id === stageId));
        const group = groups[groupIdx] ?? [];
        const groupNowDone = group.every(s => nowCompletedIds.has(s.id));
        const nextGroup = groupIdx >= 0 ? groups[groupIdx + 1] : undefined;

        if (groupNowDone && nextGroup?.[0]) {
          const { error: advanceError } = await supabase.rpc('update_project_flow_stage', {
            p_id: project.id,
            p_stage: nextGroup[0].id,
            p_custom_stages: project.customFlowStages ?? null,
          });
          if (advanceError) throw new Error(advanceError.message);
          return { currentFlowStage: nextGroup[0].id };
        }
        return;
      }

      if (action === 'set-current') {
        const { error } = await supabase.rpc('update_project_flow_stage', {
          p_id: project.id,
          p_stage: stageId,
          p_custom_stages: project.customFlowStages ?? null,
        });
        if (error) throw new Error(error.message);
        return { currentFlowStage: stageId };
      }

      if (action === 'toggle-skip') {
        const existing = customEntries.find(e => e.id === stageId);
        const merged: CustomStageEntry[] = existing
          ? customEntries.map(e => e.id === stageId ? { ...e, skipped: !e.skipped } : e)
          : [...customEntries, { id: stageId, skipped: true }];
        const { error } = await supabase.rpc('update_project_custom_stages', {
          p_id: project.id,
          p_custom_stages: merged,
        });
        if (error) throw new Error(error.message);
        return { customFlowStages: merged };
      }

      if (action === 'reopen') {
        // Remove every completion log row for this stage so its status flips
        // back to 'upcoming' (or 'current' if the pointer is on it).
        const { error } = await supabase
          .from('project_flow_log')
          .delete()
          .eq('project_id', project.id)
          .eq('stage_id', stageId);
        if (error) throw new Error(error.message);
        return;
      }
    },
    onSuccess: (cachePatch) => {
      if (cachePatch) patchProjectInCache(cachePatch as Partial<Project>);
      queryClient.invalidateQueries({ queryKey: ['project_flow_log', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'], exact: true });
    },
  });

  const completeStage = useCallback(
    async (stageId: string, notes: string) => {
      await completeStageMutation.mutateAsync({ stageId, notes });
    },
    [completeStageMutation],
  );

  // Backward compat: complete the primary current stage
  const advanceStage = useCallback(
    async (notes: string) => {
      if (!currentStage) throw new Error('No active stage');
      await completeStageMutation.mutateAsync({ stageId: currentStage.id, notes });
    },
    [completeStageMutation, currentStage],
  );

  const updateCustomStages = useCallback(
    async (customStages: CustomStageEntry[]) => {
      await customMutation.mutateAsync(customStages);
    },
    [customMutation],
  );

  const setStageStatus = useCallback(
    async (stageId: string, action: StageStatusAction) => {
      await setStageStatusMutation.mutateAsync({ stageId, action });
    },
    [setStageStatusMutation],
  );

  return {
    // displayStages = canonical defaults + user-added custom stages, so the
    // dialog and main list both see every stage that should render.
    flowDef: displayStages,
    activeStages: effectiveStages,
    groups,
    currentStages,
    currentStage,
    currentStageIndex,
    currentGroupIdx,
    stageHistory,
    isLastGroup,
    isLastStage: isLastGroup,
    canAdvance,
    canEditFlow,
    isLoading: historyQuery.isLoading,
    isAdvancing: completeStageMutation.isPending,
    isSavingCustom: customMutation.isPending,
    isMutatingStageStatus: setStageStatusMutation.isPending,
    completeStage,
    advanceStage,
    updateCustomStages,
    setStageStatus,
    getStageStatus,
    isStageCompleted,
    completedStageIds,
    getBlockedBy,
    isStageBlocked,
  };
}
