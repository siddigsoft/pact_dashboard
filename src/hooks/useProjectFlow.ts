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
  /** Manual % complete override (0-100). If null, derived from checklist. */
  percentComplete?: number | null;
}

export interface UseProjectFlowReturn {
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
  /** Complete a specific stage (handles parallel groups) */
  completeStage: (stageId: string, notes: string) => Promise<void>;
  /** Backward-compat: completes first current stage */
  advanceStage: (notes: string) => Promise<void>;
  updateCustomStages: (customStages: CustomStageEntry[]) => Promise<void>;
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
  teamMembers: string[],
  advancedByName: string,
  advancedById: string,
  isMilestone = false,
) {
  if (!teamMembers.length) return;

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('full_name', teamMembers)
    .eq('status', 'approved');

  if (!profiles?.length) return;

  const recipientIds = profiles.map((p: any) => p.id);

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
      action_url: `/projects/${projectId}`,
      send_email: true,
    },
  }).catch(() => {});

  const notifications = profiles.map((p: any) => ({
    recipient_id: p.id,
    user_id: p.id,
    title_en: titleEn,
    title_ar: titleAr,
    message_en: msgEn,
    message_ar: msgAr,
    priority: isMilestone ? 'high' : 'normal',
    action_url: `/projects/${projectId}`,
    entity_id: projectId,
    entity_type: 'project',
    event_type: eventType,
    status: 'pending',
    email_sent: false,
  }));

  await supabase.from('notifications').insert(notifications);
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useProjectFlow(project: Project): UseProjectFlowReturn {
  const { currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  const queryClient = useQueryClient();

  const defaultFlow = getProjectFlow(project.projectType);
  const allDefaultStages = defaultFlow.stages;

  const customEntries: CustomStageEntry[] = (project.customFlowStages as CustomStageEntry[]) ?? [];
  const hasCustom = customEntries.length > 0;

  const effectiveStages: FlowStage[] = hasCustom
    ? customEntries
        .map(ce => ({ entry: ce, stage: allDefaultStages.find(s => s.id === ce.id) }))
        .filter((x): x is { entry: CustomStageEntry; stage: FlowStage } => !!x.stage)
        .filter(x => !x.entry.skipped)
        .map(x => x.stage)
    : allDefaultStages;

  const skippedIds = new Set(customEntries.filter(e => e.skipped).map(e => e.id));

  const historyQuery = useQuery({
    queryKey: ['project_flow_log', project.id],
    queryFn: () => fetchFlowLog(project.id),
    staleTime: 30 * 1000,
  });

  const stageHistory = historyQuery.data ?? [];
  const completedStageIds = new Set(stageHistory.map(h => h.stageId));

  // Build parallel groups
  const groups = buildGroups(effectiveStages, customEntries);

  // Find which group is currently active
  const currentStageId = project.currentFlowStage ?? effectiveStages[0]?.id;
  const currentGroupIdx = Math.max(
    0,
    groups.findIndex(g => g.some(s => s.id === currentStageId)),
  );
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

      // Check if ALL stages in the current group are now complete
      const nowCompletedIds = new Set([...completedStageIds, stageId]);
      const allGroupDone = currentGroupSafe.every(s => nowCompletedIds.has(s.id));

      if (allGroupDone && !isLastGroup) {
        // Advance to the first stage of the next group
        const nextGroup = groups[currentGroupIdx + 1];
        const nextStage = nextGroup?.[0];
        if (!nextStage) return;

        const { error: updateError } = await supabase.rpc('update_project_flow_stage', {
          p_id: project.id,
          p_stage: nextStage.id,
          p_custom_stages: project.customFlowStages ?? null,
        });
        if (updateError) throw new Error(updateError.message);

        const teamNames = [
          project.team?.projectManager,
          ...(project.team?.members ?? []),
          ...(project.team?.teamComposition?.map(m => m.name) ?? []),
        ].filter((n): n is string => !!n && n !== currentUser.fullName);

        sendStageNotifications(
          project.id,
          project.name,
          nextStage.label,
          [...new Set(teamNames)],
          currentUser.fullName ?? 'A team member',
          currentUser.id,
          false,
        ).catch(() => {});
      }

      // Send milestone notification if this stage is a milestone
      if (isMilestone) {
        const teamNames = [
          project.team?.projectManager,
          ...(project.team?.members ?? []),
          ...(project.team?.teamComposition?.map(m => m.name) ?? []),
        ].filter((n): n is string => !!n && n !== currentUser.fullName);

        sendStageNotifications(
          project.id,
          project.name,
          stageToComplete.label,
          [...new Set(teamNames)],
          currentUser.fullName ?? 'A team member',
          currentUser.id,
          true,
        ).catch(() => {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_flow_log', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
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

  return {
    flowDef: allDefaultStages,
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
    completeStage,
    advanceStage,
    updateCustomStages,
    getStageStatus,
    isStageCompleted,
    getBlockedBy,
    isStageBlocked,
  };
}
