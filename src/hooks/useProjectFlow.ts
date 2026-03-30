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

export interface UseProjectFlowReturn {
  flowDef: FlowStage[];
  currentStage: FlowStage | null;
  currentStageIndex: number;
  stageHistory: FlowLogEntry[];
  isLastStage: boolean;
  canAdvance: boolean;
  isLoading: boolean;
  isAdvancing: boolean;
  advanceStage: (notes: string) => Promise<void>;
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

export function useProjectFlow(project: Project): UseProjectFlowReturn {
  const { currentUser } = useUser();
  const { hasAnyRole } = useAuthorization();
  const queryClient = useQueryClient();

  const flow = getProjectFlow(project.projectType);
  const stages = flow.stages;

  const historyQuery = useQuery({
    queryKey: ['project_flow_log', project.id],
    queryFn: () => fetchFlowLog(project.id),
    staleTime: 30 * 1000,
  });

  const stageHistory = historyQuery.data ?? [];

  // Determine current stage from project record (authoritative source)
  const currentStageId = project.currentFlowStage ?? stages[0]?.id;
  const currentStageIndex = stages.findIndex(s => s.id === currentStageId);
  const resolvedIndex = currentStageIndex >= 0 ? currentStageIndex : 0;
  const currentStage = stages[resolvedIndex] ?? null;
  const isLastStage = resolvedIndex >= stages.length - 1;

  // Permission: super_admin, admin, fom can advance; also PM on the project team
  const isPrivilegedRole = hasAnyRole(['super_admin', 'admin', 'fom']);
  const isProjectManager =
    !!currentUser?.id &&
    !!project.team?.projectManager &&
    project.team.projectManager === currentUser.fullName;
  const canAdvance = (isPrivilegedRole || isProjectManager) && !isLastStage;

  const advanceMutation = useMutation({
    mutationFn: async (notes: string) => {
      if (!currentUser?.id) throw new Error('Not authenticated');
      if (isLastStage) throw new Error('Already at the final stage');

      const nextIndex = resolvedIndex + 1;
      const nextStage = stages[nextIndex];
      if (!nextStage) throw new Error('No next stage found');

      const { error: logError } = await supabase.from('project_flow_log').insert({
        project_id: project.id,
        stage_id: nextStage.id,
        stage_label: nextStage.label,
        advanced_by: currentUser.id,
        notes: notes || null,
      });
      if (logError) throw new Error(logError.message);

      const { error: updateError } = await supabase
        .from('projects')
        .update({ current_flow_stage: nextStage.id })
        .eq('id', project.id);
      if (updateError) throw new Error(updateError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project_flow_log', project.id] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const advanceStage = useCallback(
    async (notes: string) => {
      await advanceMutation.mutateAsync(notes);
    },
    [advanceMutation],
  );

  return {
    flowDef: stages,
    currentStage,
    currentStageIndex: resolvedIndex,
    stageHistory,
    isLastStage,
    canAdvance,
    isLoading: historyQuery.isLoading,
    isAdvancing: advanceMutation.isPending,
    advanceStage,
  };
}
