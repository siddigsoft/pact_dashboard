import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type DepType = 'FS' | 'SS' | 'FF' | 'SF';

export interface TaskDependency {
  id: string;
  projectId: string;
  predecessorId: string;
  successorId: string;
  depType: DepType;
  lagDays: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface UpsertDependencyInput {
  projectId: string;
  predecessorId: string;
  successorId: string;
  depType?: DepType;
  lagDays?: number;
  notes?: string | null;
  /** Existing row id (omit to create) */
  id?: string;
}

const DEP_TYPE_LABELS: Record<DepType, string> = {
  FS: 'Finish-to-Start',
  SS: 'Start-to-Start',
  FF: 'Finish-to-Finish',
  SF: 'Start-to-Finish',
};

export function depTypeLabel(t: DepType): string {
  return DEP_TYPE_LABELS[t];
}

export function depTypeShort(t: DepType): string {
  return t;
}

interface RawRow {
  id: string;
  project_id: string;
  predecessor_id: string;
  successor_id: string;
  dep_type: DepType;
  lag_days: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

function mapRow(r: RawRow): TaskDependency {
  return {
    id: r.id,
    projectId: r.project_id,
    predecessorId: r.predecessor_id,
    successorId: r.successor_id,
    depType: r.dep_type,
    lagDays: r.lag_days ?? 0,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

/**
 * Returns all typed dependencies for a project. Falls back to an empty
 * array (and never throws) if the underlying table doesn't yet exist —
 * that allows the UI to fall back to the legacy `dependencies` uuid[]
 * column on `project_field_tasks` until the SQL has been applied.
 */
export function useTaskDependencies(projectId: string) {
  const qc = useQueryClient();
  const key = ['project_field_task_dependencies', projectId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TaskDependency[]> => {
      const { data, error } = await supabase
        .from('project_field_task_dependencies')
        .select('*')
        .eq('project_id', projectId);
      if (error) return [];
      return (data ?? []).map(mapRow);
    },
    enabled: !!projectId,
  });

  const upsertMutation = useMutation({
    mutationFn: async (input: UpsertDependencyInput) => {
      // Routed through SECURITY DEFINER RPC — direct table writes are denied
      // by the pftd_no_direct_writes policy. The RPC enforces that the caller
      // can UPDATE the successor task.
      const { error } = await supabase.rpc('upsert_project_field_task_dep', {
        p_predecessor_id: input.predecessorId,
        p_successor_id:   input.successorId,
        p_dep_type:       input.depType ?? 'FS',
        p_lag_days:       input.lagDays ?? 0,
        p_notes:          input.notes ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (input: { predecessorId: string; successorId: string }) => {
      const { error } = await supabase.rpc('delete_project_field_task_dep', {
        p_predecessor_id: input.predecessorId,
        p_successor_id:   input.successorId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  /** Convenience: dependencies WHERE this task is the successor (i.e. its predecessors). */
  const predecessorsOf = (taskId: string) =>
    (query.data ?? []).filter(d => d.successorId === taskId);
  /** Convenience: dependencies WHERE this task is the predecessor (i.e. things it blocks). */
  const successorsOf = (taskId: string) =>
    (query.data ?? []).filter(d => d.predecessorId === taskId);

  return {
    dependencies: query.data ?? [],
    isLoading: query.isLoading,
    upsertDependency: (input: UpsertDependencyInput) => upsertMutation.mutateAsync(input),
    deleteDependency: (input: { predecessorId: string; successorId: string }) =>
      deleteMutation.mutateAsync(input),
    isMutating: upsertMutation.isPending || deleteMutation.isPending,
    predecessorsOf,
    successorsOf,
  };
}
