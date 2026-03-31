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
}

export interface UseProjectFlowReturn {
  flowDef: FlowStage[];
  activeStages: FlowStage[];
  currentStage: FlowStage | null;
  currentStageIndex: number;
  stageHistory: FlowLogEntry[];
  isLastStage: boolean;
  canAdvance: boolean;
  canEditFlow: boolean;
  isLoading: boolean;
  isAdvancing: boolean;
  isSavingCustom: boolean;
  advanceStage: (notes: string) => Promise<void>;
  updateCustomStages: (customStages: CustomStageEntry[]) => Promise<void>;
  getStageStatus: (stageId: string) => 'completed' | 'current' | 'skipped' | 'upcoming';
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

async function sendStageNotifications(
  projectId: string,
  projectName: string,
  nextStageLabel: string,
  teamMembers: string[],
  advancedByName: string,
  advancedById: string,
) {
  if (!teamMembers.length) return;

  // Resolve team member profile IDs from full names
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('full_name', teamMembers)
    .eq('status', 'approved');

  if (!profiles?.length) return;

  const recipientIds = profiles.map((p: any) => p.id);

  // Fire email + enhanced in-app notification via edge function
  supabase.functions.invoke('dispatch-notification', {
    body: {
      event_type: 'project_stage_advanced',
      entity_type: 'project',
      entity_id: projectId,
      priority: 'normal',
      recipient_ids: recipientIds,
      title_en: `Project Stage Advanced: ${projectName}`,
      title_ar: `تقدم مرحلة المشروع: ${projectName}`,
      message_en: `${advancedByName} advanced "${projectName}" to stage: ${nextStageLabel}`,
      message_ar: `قام ${advancedByName} بتقديم "${projectName}" إلى المرحلة: ${nextStageLabel}`,
      triggered_by: advancedById,
      triggered_by_name: advancedByName,
      workflow_stage: nextStageLabel,
      action_url: `/projects/${projectId}`,
      send_email: true,
    },
  }).catch(() => {});

  // Also insert in-app notifications directly (fast path, no email wait)
  const notifications = profiles.map((p: any) => ({
    recipient_id: p.id,
    user_id: p.id,
    title_en: `Project Stage Advanced: ${projectName}`,
    title_ar: `تقدم مرحلة المشروع: ${projectName}`,
    message_en: `${advancedByName} advanced "${projectName}" to stage: ${nextStageLabel}`,
    message_ar: `قام ${advancedByName} بتقديم "${projectName}" إلى المرحلة: ${nextStageLabel}`,
    priority: 'normal',
    action_url: `/projects/${projectId}`,
    entity_id: projectId,
    entity_type: 'project',
    event_type: 'assignments',
    status: 'pending',
    email_sent: false,
  }));

  await supabase.from('notifications').insert(notifications);
}

export function useProjectFlow(project: Project): UseProjectFlowReturn {
  const { currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  const queryClient = useQueryClient();

  const defaultFlow = getProjectFlow(project.projectType);
  const allDefaultStages = defaultFlow.stages;

  // Build effective stage list: apply custom ordering/skips if present
  const customEntries: CustomStageEntry[] = project.customFlowStages ?? [];
  const hasCustom = customEntries.length > 0;

  const effectiveStages: FlowStage[] = hasCustom
    ? customEntries
        .map(ce => ({ entry: ce, stage: allDefaultStages.find(s => s.id === ce.id) }))
        .filter((x): x is { entry: CustomStageEntry; stage: FlowStage } => !!x.stage)
        .filter(x => !x.entry.skipped)
        .map(x => x.stage)
    : allDefaultStages;

  // Include all stages in flowDef (for the editing UI), active = non-skipped
  const skippedIds = new Set(customEntries.filter(e => e.skipped).map(e => e.id));

  const historyQuery = useQuery({
    queryKey: ['project_flow_log', project.id],
    queryFn: () => fetchFlowLog(project.id),
    staleTime: 30 * 1000,
  });

  const stageHistory = historyQuery.data ?? [];

  // Current stage index in the ACTIVE (non-skipped) list
  const currentStageId = project.currentFlowStage ?? effectiveStages[0]?.id;
  const currentStageIndex = effectiveStages.findIndex(s => s.id === currentStageId);
  const resolvedIndex = currentStageIndex >= 0 ? currentStageIndex : 0;
  const currentStage = effectiveStages[resolvedIndex] ?? null;
  const isLastStage = resolvedIndex >= effectiveStages.length - 1;

  // Permissions
  const isPrivilegedRole = hasAnyRole(['super_admin', 'admin', 'fom']);
  const isProjectManager =
    !!currentUser?.id &&
    !!project.team?.projectManager &&
    project.team.projectManager === currentUser.fullName;
  const canAdvance = (isPrivilegedRole || isProjectManager) && !isLastStage;
  const canEditFlow = isPrivilegedRole || isProjectManager;

  // Helper: given a stageId from allDefaultStages, return its status
  const getStageStatus = useCallback(
    (stageId: string): 'completed' | 'current' | 'skipped' | 'upcoming' => {
      if (skippedIds.has(stageId)) return 'skipped';
      const activeIdx = effectiveStages.findIndex(s => s.id === stageId);
      if (activeIdx < 0) return 'upcoming';
      if (activeIdx < resolvedIndex) return 'completed';
      if (activeIdx === resolvedIndex) return 'current';
      return 'upcoming';
    },
    [effectiveStages, resolvedIndex, skippedIds],
  );

  // Advance to next active stage
  const advanceMutation = useMutation({
    mutationFn: async (notes: string) => {
      if (!currentUser?.id) throw new Error('Not authenticated');
      if (!canAdvance) throw new Error('You do not have permission to advance this project stage');
      if (isLastStage) throw new Error('Already at the final stage');

      const nextIndex = resolvedIndex + 1;
      const nextStage = effectiveStages[nextIndex];
      if (!nextStage) throw new Error('No next stage found');

      // Insert log entry recording the stage being COMPLETED (current stage),
      // so each completed stage node can show who advanced it and when.
      const completedStage = effectiveStages[resolvedIndex];
      const { error: logError } = await supabase.from('project_flow_log').insert({
        project_id: project.id,
        stage_id: completedStage.id,
        stage_label: completedStage.label,
        advanced_by: currentUser.id,
        notes: notes || null,
      });
      if (logError) throw new Error(logError.message);

      // Update project record via RPC (bypasses PostgREST schema cache)
      const { error: updateError } = await supabase
        .rpc('update_project_flow_stage', {
          p_id: project.id,
          p_stage: nextStage.id,
          p_custom_stages: project.customFlowStages ?? null,
        });
      if (updateError) throw new Error(updateError.message);

      // Send notifications to all team members (fire and forget)
      const teamNames = [
        project.team?.projectManager,
        ...(project.team?.members ?? []),
        ...(project.team?.teamComposition?.map(m => m.name) ?? []),
      ].filter((n): n is string => !!n && n !== currentUser.fullName);

      const uniqueTeamNames = [...new Set(teamNames)];
      sendStageNotifications(
        project.id,
        project.name,
        nextStage.label,
        uniqueTeamNames,
        currentUser.fullName ?? 'A team member',
        currentUser.id,
      ).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_flow_log', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // Save custom stage order / skip flags
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

  const advanceStage = useCallback(
    async (notes: string) => {
      await advanceMutation.mutateAsync(notes);
    },
    [advanceMutation],
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
    currentStage,
    currentStageIndex: resolvedIndex,
    stageHistory,
    isLastStage,
    canAdvance,
    canEditFlow,
    isLoading: historyQuery.isLoading,
    isAdvancing: advanceMutation.isPending,
    isSavingCustom: customMutation.isPending,
    advanceStage,
    updateCustomStages,
    getStageStatus,
  };
}
