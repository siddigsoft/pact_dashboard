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

export interface StageAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSize: number | null;
  uploadedByName: string | null;
  createdAt: string;
}

// ── Assignees ──────────────────────────────────────────────────────────────

export function useStageAssignees(projectId: string, stageId: string) {
  const qc = useQueryClient();
  const key = ['stage_assignees', projectId, stageId];

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<StageAssignee[]> => {
      const { data, error } = await supabase
        .from('project_stage_assignees')
        .select('id, user_id, assigned_at, profiles:user_id(full_name, role, avatar_url)')
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

  return {
    assignees: query.data ?? [],
    isLoading: query.isLoading,
    addAssignee: (userId: string) => addMutation.mutateAsync(userId),
    removeAssignee: (id: string) => removeMutation.mutateAsync(id),
    isAdding: addMutation.isPending,
    isRemoving: removeMutation.isPending,
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
