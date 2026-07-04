/**
 * Hooks for per-stage data: assignees, checklist items, and attachments.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface StageAssignee {
  id: string;
  userId: string;
  fullName: string;
  role: string;
  avatarUrl: string | null;
  assignedAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
}

export interface StageChecklistItem {
  id: string;
  itemText: string;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  sortOrder: number;
}

export interface DeliverableChecklistItem {
  id: string;
  deliverableId: string;
  stageId: string;
  stageLabel: string;
  phase: string;
  label: string;
  completed: boolean;
}

export interface StageAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedByName: string | null;
  createdAt: string;
}

// ── All Assignees (single query for whole project) ─────────────────────────

export interface AllStageAssignee extends StageAssignee {
  stageId: string;
}

export function useAllStageAssignees(projectId: string) {
  return useQuery({
    queryKey: ['all_stage_assignees', projectId],
    queryFn: async (): Promise<AllStageAssignee[]> => {
      const { data, error } = await supabase
        .from('project_stage_assignees')
        .select('id, user_id, stage_id, assigned_at, acknowledged_at, acknowledged_by, profiles:user_id(full_name, role, avatar_url)')
        .eq('project_id', projectId)
        .order('assigned_at');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        stageId: r.stage_id,
        fullName: r.profiles?.full_name ?? 'Unknown',
        role: r.profiles?.role ?? '',
        avatarUrl: r.profiles?.avatar_url ?? null,
        assignedAt: r.assigned_at,
        acknowledgedAt: r.acknowledged_at ?? null,
        acknowledgedBy: r.acknowledged_by ?? null,
      }));
    },
    staleTime: 30_000,
    enabled: !!projectId,
  });
}

// ── Per-stage Assignees ────────────────────────────────────────────────────

export function useStageAssignees(projectId: string, stageId: string) {
  const qc = useQueryClient();
  const key = ['stage_assignees', projectId, stageId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<StageAssignee[]> => {
      const { data, error } = await supabase
        .from('project_stage_assignees')
        .select('id, user_id, assigned_at, acknowledged_at, acknowledged_by, profiles:user_id(full_name, role, avatar_url)')
        .eq('project_id', projectId)
        .eq('stage_id', stageId)
        .order('assigned_at');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        userId: r.user_id,
        fullName: r.profiles?.full_name ?? 'Unknown',
        role: r.profiles?.role ?? '',
        avatarUrl: r.profiles?.avatar_url ?? null,
        assignedAt: r.assigned_at,
        acknowledgedAt: r.acknowledged_at ?? null,
        acknowledgedBy: r.acknowledged_by ?? null,
      }));
    },
    staleTime: 30_000,
    enabled: !!projectId && !!stageId,
  });

  const addMutation = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('project_stage_assignees')
        .insert({ project_id: projectId, stage_id: stageId, user_id: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const removeMutation = useMutation({
    mutationFn: async (assigneeId: string) => {
      const { error } = await supabase
        .from('project_stage_assignees')
        .delete()
        .eq('id', assigneeId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ assigneeId, userId }: { assigneeId: string; userId: string }) => {
      const { error } = await supabase
        .from('project_stage_assignees')
        .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: userId })
        .eq('id', assigneeId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['all_stage_assignees', projectId] });
    },
  });

  return {
    assignees: query.data ?? [],
    isLoading: query.isLoading,
    addAssignee: (userId: string) => addMutation.mutateAsync(userId),
    removeAssignee: (id: string) => removeMutation.mutateAsync(id),
    acknowledgeAssignment: (assigneeId: string, userId: string) =>
      acknowledgeMutation.mutateAsync({ assigneeId, userId }),
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
    isAcknowledging: acknowledgeMutation.isPending,
  };
}

// ── Checklist ──────────────────────────────────────────────────────────────

export function useStageChecklist(projectId: string, stageId: string) {
  const qc = useQueryClient();
  const key = ['stage_checklist', projectId, stageId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<StageChecklistItem[]> => {
      const { data, error } = await supabase
        .from('project_stage_checklist')
        .select('id, item_text, completed, completed_by, completed_at, created_at, sort_order')
        .eq('project_id', projectId)
        .eq('stage_id', stageId)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        itemText: r.item_text,
        completed: r.completed,
        completedBy: r.completed_by,
        completedAt: r.completed_at,
        createdAt: r.created_at,
        sortOrder: r.sort_order,
      }));
    },
    staleTime: 30_000,
    enabled: !!projectId && !!stageId,
  });

  const addMutation = useMutation({
    mutationFn: async ({ text, userId }: { text: string; userId?: string }) => {
      const { error } = await supabase
        .from('project_stage_checklist')
        .insert({ project_id: projectId, stage_id: stageId, item_text: text, created_by: userId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed, userId }: { id: string; completed: boolean; userId?: string }) => {
      const { error } = await supabase
        .from('project_stage_checklist')
        .update({
          completed,
          completed_by: completed ? userId : null,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('project_stage_checklist').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const items = query.data ?? [];
  const doneCount = items.filter(i => i.completed).length;

  return {
    items,
    doneCount,
    totalCount: items.length,
    isLoading: query.isLoading,
    addItem: (text: string, userId?: string) => addMutation.mutateAsync({ text, userId }),
    toggleItem: (id: string, completed: boolean, userId?: string) =>
      toggleMutation.mutateAsync({ id, completed, userId }),
    deleteItem: (id: string) => deleteMutation.mutateAsync(id),
    isAdding: addMutation.isPending,
  };
}

// ── Deliverables (Overview tab) ─────────────────────────────────────────────
// The "Required Deliverables" list on the Overview tab is backed by the same
// project_stage_checklist table used by the Stages tab, so ticking a
// deliverable there is the same as ticking it in the stage checklist.

export function useProjectDeliverablesChecklist(
  projectId: string,
  deliverableDefs: { id: string; label: string; phase: string; stageId: string; stageLabel: string }[],
) {
  const qc = useQueryClient();
  const key = ['deliverables_checklist', projectId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<DeliverableChecklistItem[]> => {
      const { data: existing, error } = await supabase
        .from('project_stage_checklist')
        .select('id, stage_id, item_text, completed, deliverable_id')
        .eq('project_id', projectId)
        .eq('source', 'deliverable');
      if (error) throw error;

      const existingByDeliverableId = new Map((existing ?? []).map((r: any) => [r.deliverable_id, r]));
      const missing = deliverableDefs.filter(d => !existingByDeliverableId.has(d.id));

      if (missing.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from('project_stage_checklist')
          .insert(
            missing.map((d, i) => ({
              project_id: projectId,
              stage_id: d.stageId,
              item_text: d.label,
              source: 'deliverable',
              deliverable_id: d.id,
              sort_order: i,
            })),
          )
          .select('id, stage_id, item_text, completed, deliverable_id');
        if (insertError) throw insertError;
        for (const r of inserted ?? []) {
          existingByDeliverableId.set((r as any).deliverable_id, r);
        }
      }

      return deliverableDefs.map(d => {
        const row: any = existingByDeliverableId.get(d.id);
        return {
          id: row?.id ?? d.id,
          deliverableId: d.id,
          stageId: d.stageId,
          stageLabel: d.stageLabel,
          phase: d.phase,
          label: d.label,
          completed: row?.completed ?? false,
        };
      });
    },
    staleTime: 15_000,
    enabled: !!projectId && deliverableDefs.length > 0,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed, userId }: { id: string; completed: boolean; userId?: string }) => {
      const { error } = await supabase
        .from('project_stage_checklist')
        .update({
          completed,
          completed_by: completed ? userId : null,
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: key });
      const item = (query.data ?? []).find(i => i.id === variables.id);
      if (item) {
        qc.invalidateQueries({ queryKey: ['stage_checklist', projectId, item.stageId] });
      }
    },
  });

  const items = query.data ?? [];

  return {
    items,
    isLoading: query.isLoading,
    toggleItem: (id: string, completed: boolean, userId?: string) =>
      toggleMutation.mutateAsync({ id, completed, userId }),
    isToggling: toggleMutation.isPending,
  };
}

// ── Attachments ────────────────────────────────────────────────────────────

export function useStageAttachments(projectId: string, stageId: string) {
  const qc = useQueryClient();
  const key = ['stage_attachments', projectId, stageId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<StageAttachment[]> => {
      const { data, error } = await supabase
        .from('project_stage_attachments')
        .select('id, file_name, file_url, file_type, file_size, created_at, profiles:uploaded_by(full_name)')
        .eq('project_id', projectId)
        .eq('stage_id', stageId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        fileName: r.file_name,
        fileUrl: r.file_url,
        fileType: r.file_type,
        fileSize: r.file_size,
        uploadedByName: r.profiles?.full_name ?? null,
        createdAt: r.created_at,
      }));
    },
    staleTime: 30_000,
    enabled: !!projectId && !!stageId,
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ file, userId }: { file: File; userId?: string }) => {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${projectId}/${stageId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { error: uploadError } = await supabase.storage
        .from('project-attachments')
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('project-attachments')
        .getPublicUrl(path);

      const { error: dbError } = await supabase.from('project_stage_attachments').insert({
        project_id: projectId,
        stage_id: stageId,
        file_name: file.name,
        file_url: urlData.publicUrl,
        file_type: file.type || ext,
        file_size: file.size,
        uploaded_by: userId,
      });
      if (dbError) throw dbError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const attachment = (query.data ?? []).find(a => a.id === id);
      if (attachment) {
        const url = new URL(attachment.fileUrl);
        const storagePath = url.pathname.split('/project-attachments/').at(-1);
        if (storagePath) {
          await supabase.storage.from('project-attachments').remove([storagePath]);
        }
      }
      const { error } = await supabase.from('project_stage_attachments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return {
    attachments: query.data ?? [],
    isLoading: query.isLoading,
    uploadFile: (file: File, userId?: string) => uploadMutation.mutateAsync({ file, userId }),
    deleteAttachment: (id: string) => deleteMutation.mutateAsync(id),
    isUploading: uploadMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
