/**
 * Hooks for per-stage data: assignees, checklist items, and attachments.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const DELIVERABLE_TOMBSTONE_PREFIX = '__deleted_deliverable__:';

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
  /** Work-period start within this stage (ISO date) */
  startDate: string | null;
  /** Work-period end within this stage (ISO date) */
  endDate: string | null;
}

export interface StageChecklistItem {
  id: string;
  itemText: string;
  source: 'manual' | 'deliverable';
  deliverableId?: string | null;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
  /** User ID this item is assigned to (shows in My Tasks for that person) */
  assignedTo: string | null;
  /** Planned start date for this checklist task (ISO date, constrained to stage period) */
  plannedStart: string | null;
  /** Planned end / due date for this checklist task (ISO date) */
  plannedEnd: string | null;
  createdAt: string;
  sortOrder: number;
}

export interface MyChecklistTask {
  id: string;
  itemText: string;
  stageId: string;
  projectId: string;
  projectName: string;
  completed: boolean;
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

// ── All Checklist Items (single query for whole project) ───────────────────

export interface AllStageChecklistItem extends StageChecklistItem {
  stageId: string;
}

export function useAllStageChecklist(projectId: string) {
  return useQuery({
    queryKey: ['all_stage_checklist', projectId],
    queryFn: async (): Promise<AllStageChecklistItem[]> => {
      const { data, error } = await supabase
        .from('project_stage_checklist')
        .select('id, stage_id, item_text, source, deliverable_id, completed, completed_by, completed_at, assigned_to, planned_start, planned_end, created_at, sort_order')
        .eq('project_id', projectId)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => !String(r.item_text ?? '').startsWith('__deleted_deliverable__:'))
        .map((r: any) => ({
          id: r.id,
          stageId: r.stage_id,
          itemText: r.item_text,
          source: (r.source ?? 'manual') as 'manual' | 'deliverable',
          deliverableId: r.deliverable_id ?? null,
          completed: r.completed,
          completedBy: r.completed_by ?? null,
          completedAt: r.completed_at ?? null,
          assignedTo: r.assigned_to ?? null,
          plannedStart: r.planned_start ?? null,
          plannedEnd: r.planned_end ?? null,
          createdAt: r.created_at,
          sortOrder: r.sort_order,
        }));
    },
    staleTime: 30_000,
    enabled: !!projectId,
  });
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
        .select('id, user_id, stage_id, assigned_at, acknowledged_at, acknowledged_by, start_date, end_date, profiles:user_id(full_name, role, avatar_url)')
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
        startDate: r.start_date ?? null,
        endDate: r.end_date ?? null,
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
        .select('id, user_id, assigned_at, acknowledged_at, acknowledged_by, start_date, end_date, profiles:user_id(full_name, role, avatar_url)')
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
        startDate: r.start_date ?? null,
        endDate: r.end_date ?? null,
      }));
    },
    staleTime: 30_000,
    enabled: !!projectId && !!stageId,
  });

  const addMutation = useMutation({
    mutationFn: async ({ userId, startDate, endDate }: { userId: string; startDate?: string | null; endDate?: string | null }) => {
      const { error } = await supabase
        .from('project_stage_assignees')
        .insert({
          project_id: projectId,
          stage_id: stageId,
          user_id: userId,
          start_date: startDate ?? null,
          end_date: endDate ?? null,
        });
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
    addAssignee: (userId: string, startDate?: string | null, endDate?: string | null) =>
      addMutation.mutateAsync({ userId, startDate, endDate }),
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
        .select('id, item_text, source, deliverable_id, completed, completed_by, completed_at, assigned_to, planned_start, planned_end, created_at, sort_order')
        .eq('project_id', projectId)
        .eq('stage_id', stageId)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => !String(r.item_text ?? '').startsWith(DELIVERABLE_TOMBSTONE_PREFIX))
        .map((r: any) => ({
        id: r.id,
        itemText: r.item_text,
        source: (r.source ?? 'manual') as 'manual' | 'deliverable',
        deliverableId: r.deliverable_id ?? null,
        completed: r.completed,
        completedBy: r.completed_by,
        completedAt: r.completed_at,
        assignedTo: r.assigned_to ?? null,
        plannedStart: r.planned_start ?? null,
        plannedEnd: r.planned_end ?? null,
        createdAt: r.created_at,
        sortOrder: r.sort_order,
      }));
    },
    staleTime: 30_000,
    enabled: !!projectId && !!stageId,
  });

  const addMutation = useMutation({
    mutationFn: async ({ text, userId }: { text: string; userId?: string }) => {
      const { data, error } = await supabase
        .from('project_stage_checklist')
        .insert({ project_id: projectId, stage_id: stageId, item_text: text, created_by: userId })
        .select('id, item_text, source, completed, completed_by, completed_at, created_at, sort_order')
        .single();
      if (error) throw error;
      return {
        id: data.id,
        itemText: data.item_text,
        source: (data.source ?? 'manual') as 'manual' | 'deliverable',
        completed: data.completed,
        completedBy: data.completed_by,
        completedAt: data.completed_at,
        createdAt: data.created_at,
        sortOrder: data.sort_order,
      } as StageChecklistItem;
    },
    onMutate: async ({ text }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StageChecklistItem[]>(key) ?? [];
      const optimistic: StageChecklistItem = {
        id: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        itemText: text,
        source: 'manual',
        completed: false,
        completedBy: null,
        completedAt: null,
        assignedTo: null,
        createdAt: new Date().toISOString(),
        sortOrder: 0,
      };
      qc.setQueryData<StageChecklistItem[]>(key, [...previous, optimistic]);
      return { previous, optimisticId: optimistic.id };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (saved, _vars, ctx) => {
      qc.setQueryData<StageChecklistItem[]>(key, (curr = []) =>
        curr.map(item => (item.id === ctx?.optimisticId ? saved : item)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
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
    onMutate: async ({ id, completed, userId }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StageChecklistItem[]>(key) ?? [];
      qc.setQueryData<StageChecklistItem[]>(key, (curr = []) =>
        curr.map(item =>
          item.id === id
            ? {
                ...item,
                completed,
                completedBy: completed ? (userId ?? null) : null,
                completedAt: completed ? new Date().toISOString() : null,
              }
            : item,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const assignMutation = useMutation({
    mutationFn: async ({
      itemId, assigneeId, assigneeText, assignedById, assignedByName, projName, stageName,
      plannedStart, plannedEnd,
    }: {
      itemId: string;
      assigneeId: string | null;
      assigneeText: string;
      assignedById: string;
      assignedByName: string;
      projName: string;
      stageName: string;
      plannedStart?: string | null;
      plannedEnd?: string | null;
    }) => {
      const { error } = await supabase
        .from('project_stage_checklist')
        .update({
          assigned_to: assigneeId,
          planned_start: plannedStart ?? null,
          planned_end: plannedEnd ?? null,
        })
        .eq('id', itemId);
      if (error) throw error;
      // Notify the newly assigned person (skip if unassigning)
      if (assigneeId) {
        supabase.functions.invoke('dispatch-notification', {
          body: {
            event_type: 'checklist_item_assigned',
            entity_type: 'project',
            entity_id: projectId,
            priority: 'normal',
            recipient_ids: [assigneeId],
            title_en: `Task assigned: ${assigneeText}`,
            title_ar: `تم تعيين مهمة: ${assigneeText}`,
            message_en: `${assignedByName} assigned you "${assigneeText}" in stage "${stageName}" — ${projName}`,
            message_ar: `قام ${assignedByName} بتعيينك لـ "${assigneeText}" في مرحلة "${stageName}" — ${projName}`,
            triggered_by: assignedById,
            triggered_by_name: assignedByName,
            action_url: `/projects/${projectId}?tab=flow`,
            send_email: true,
            metadata: { project_name: projName, stage: stageName, item_text: assigneeText },
          },
        }).catch(() => {});
      }
    },
    onMutate: async ({ itemId, assigneeId, plannedStart, plannedEnd }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StageChecklistItem[]>(key) ?? [];
      qc.setQueryData<StageChecklistItem[]>(key, (curr = []) =>
        curr.map(item => item.id === itemId
          ? { ...item, assignedTo: assigneeId, plannedStart: plannedStart ?? item.plannedStart, plannedEnd: plannedEnd ?? item.plannedEnd }
          : item,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: { id: string; source: 'manual' | 'deliverable'; deliverableId?: string | null }) => {
      if (item.source === 'deliverable' && item.deliverableId) {
        const { error } = await supabase
          .from('project_stage_checklist')
          .update({ item_text: `${DELIVERABLE_TOMBSTONE_PREFIX}${item.deliverableId}` })
          .eq('id', item.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from('project_stage_checklist').delete().eq('id', item.id);
      if (error) throw error;
    },
    onMutate: async (item: { id: string }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<StageChecklistItem[]>(key) ?? [];
      qc.setQueryData<StageChecklistItem[]>(key, previous.filter(entry => entry.id !== item.id));
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
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
    deleteItem: (item: { id: string; source: 'manual' | 'deliverable'; deliverableId?: string | null }) =>
      deleteMutation.mutateAsync(item),
    assignItem: (
      itemId: string,
      assigneeId: string | null,
      ctx: { assigneeText: string; assignedById: string; assignedByName: string; projName: string; stageName: string; plannedStart?: string | null; plannedEnd?: string | null },
    ) => assignMutation.mutateAsync({ itemId, assigneeId, ...ctx }),
    isAdding: addMutation.isPending,
    isAssigning: assignMutation.isPending,
  };
}

// ── My Checklist Tasks (for My Tasks view) ─────────────────────────────────
// Returns all checklist items assigned to the current user that are not yet
// completed, across every project.

export function useMyChecklistTasks(userId: string | undefined) {
  return useQuery({
    queryKey: ['my_checklist_tasks', userId],
    enabled: !!userId,
    queryFn: async (): Promise<MyChecklistTask[]> => {
      const { data, error } = await supabase
        .from('project_stage_checklist')
        .select('id, item_text, stage_id, project_id, completed, projects!project_id(name)')
        .eq('assigned_to', userId!)
        .eq('completed', false);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        itemText: r.item_text,
        stageId: r.stage_id,
        projectId: r.project_id,
        projectName: (r.projects as any)?.name ?? 'Project',
        completed: r.completed,
      }));
    },
    staleTime: 30_000,
  });
}

// Simple toggle used from the My Tasks view (no optimistic update needed there —
// the item disappears on completion).
export async function toggleMyChecklistTask(itemId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('project_stage_checklist')
    .update({ completed: true, completed_by: userId, completed_at: new Date().toISOString() })
    .eq('id', itemId);
  if (error) throw error;
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

      return deliverableDefs
        .filter(d => {
          const row: any = existingByDeliverableId.get(d.id);
          return !String(row?.item_text ?? '').startsWith(DELIVERABLE_TOMBSTONE_PREFIX);
        })
        .map(d => {
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
    // Optimistic update — checkbox flips instantly; DB write reconciles in background
    onMutate: async ({ id, completed }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DeliverableChecklistItem[]>(key) ?? [];
      qc.setQueryData<DeliverableChecklistItem[]>(key, (curr = []) =>
        curr.map(item => (item.id === id ? { ...item, completed } : item)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSuccess: (_data, variables) => {
      // Invalidate to confirm; UI is already updated via onMutate
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
