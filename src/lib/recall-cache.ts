import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const CACHE_TIME = 5 * 60 * 1000;
const STALE_TIME = 30 * 1000;

export const recallQueryKeys = {
  all: ['recalls'] as const,
  pending: () => [...recallQueryKeys.all, 'pending'] as const,
  byMmp: (mmpId: string) => [...recallQueryKeys.all, 'mmp', mmpId] as const,
  history: (mmpId: string) => [...recallQueryKeys.byMmp(mmpId), 'history'] as const,
  approvals: () => [...recallQueryKeys.all, 'approvals'] as const,
  recovery: () => [...recallQueryKeys.all, 'recovery'] as const,
  recoveryByMmp: (mmpId: string) => [...recallQueryKeys.recovery(), mmpId] as const,
};

export function usePendingRecalls(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: recallQueryKeys.pending(),
    queryFn: async () => {
      const { data: mmpFiles, error } = await supabase
        .from('mmp_files')
        .select('id, name, logs, workflow')
        .not('logs', 'is', null);

      if (error) throw error;

      const pendingRecalls: any[] = [];
      
      for (const mmp of mmpFiles || []) {
        const logs = (mmp.logs as any[]) || [];
        const initiatedRecalls = logs.filter(
          (log: any) => log.action === 'recall_initiated' && !log.resolvedAt
        );
        
        for (const recall of initiatedRecalls) {
          const approval = logs.find(
            (log: any) => 
              (log.action === 'recall_approved' || log.action === 'recall_rejected') &&
              log.recallEventId === recall.recallEventId
          );
          
          if (!approval) {
            pendingRecalls.push({
              ...recall,
              mmpId: mmp.id,
              mmpName: mmp.name,
            });
          }
        }
      }

      return pendingRecalls;
    },
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    enabled: options?.enabled !== false,
  });
}

export function useRecallHistory(mmpId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: recallQueryKeys.history(mmpId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mmp_files')
        .select('logs')
        .eq('id', mmpId)
        .single();

      if (error) throw error;

      const logs = (data?.logs as any[]) || [];
      return logs.filter((log: any) => 
        ['recall_initiated', 'recall_approved', 'recall_rejected', 'recall_completed'].includes(log.action)
      ).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    },
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    enabled: options?.enabled !== false && !!mmpId,
  });
}

export function useRecoveryRecords(mmpId?: string, status?: 'pending' | 'completed', options?: { enabled?: boolean }) {
  const queryKey = mmpId 
    ? recallQueryKeys.recoveryByMmp(mmpId)
    : recallQueryKeys.recovery();

  return useQuery({
    queryKey: [...queryKey, status],
    queryFn: async () => {
      let query = supabase
        .from('mmp_site_entries')
        .select(`
          id,
          mmp_id,
          site_name,
          assigned_to,
          claimed_by,
          transport_advance_amount,
          transport_advance_recovered,
          recall_recovery_method,
          recall_recovery_status,
          recall_recovery_notes,
          recalled_at
        `)
        .not('recalled_at', 'is', null)
        .gt('transport_advance_amount', 0);

      if (mmpId) {
        query = query.eq('mmp_id', mmpId);
      }

      if (status === 'pending') {
        query = query.in('recall_recovery_status', ['pending', 'in_progress', null]);
      } else if (status === 'completed') {
        query = query.in('recall_recovery_status', ['recovered', 'written_off', 'cancelled']);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: STALE_TIME,
    gcTime: CACHE_TIME,
    enabled: options?.enabled !== false,
  });
}

export function useInvalidateRecallCache() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => queryClient.invalidateQueries({ queryKey: recallQueryKeys.all }),
    invalidatePending: () => queryClient.invalidateQueries({ queryKey: recallQueryKeys.pending() }),
    invalidateByMmp: (mmpId: string) => queryClient.invalidateQueries({ queryKey: recallQueryKeys.byMmp(mmpId) }),
    invalidateRecovery: () => queryClient.invalidateQueries({ queryKey: recallQueryKeys.recovery() }),
  };
}

export async function prefetchRecallData(mmpId: string, queryClient: any) {
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: recallQueryKeys.history(mmpId),
      staleTime: STALE_TIME,
    }),
    queryClient.prefetchQuery({
      queryKey: recallQueryKeys.recoveryByMmp(mmpId),
      staleTime: STALE_TIME,
    }),
  ]);
}

export async function batchUpdateRecoveryStatus(
  siteEntryIds: string[],
  status: string,
  processedBy: string
): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const { error, count } = await supabase
      .from('mmp_site_entries')
      .update({
        recall_recovery_status: status,
        recall_recovery_processed_by: processedBy,
        recall_recovery_processed_at: new Date().toISOString()
      })
      .in('id', siteEntryIds);

    if (error) throw error;
    return { success: true, count: count || 0 };
  } catch (error: any) {
    console.error('Batch update failed:', error);
    return { success: false, count: 0, error: error.message };
  }
}
