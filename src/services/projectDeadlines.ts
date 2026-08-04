import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/lib/queryKeys';

export type ActivityDeadlineRow = {
  id: string;
  title: string | null;
  end_date: string;
  status: string | null;
  project_id: string;
};

/** Lean activity end-dates only — no sub-activities / assignees. */
export async function fetchActivityDeadlines(
  projectIds: string[],
  limit = 100
): Promise<ActivityDeadlineRow[]> {
  if (!projectIds.length) return [];

  const { data, error } = await supabase
    .from('project_activities')
    .select('id, title, end_date, status, project_id')
    .in('project_id', projectIds)
    .not('end_date', 'is', null)
    .order('end_date', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn('[fetchActivityDeadlines]', error.message);
    return [];
  }
  return (data ?? []) as ActivityDeadlineRow[];
}

export function useActivityDeadlines(projectIds: string[], enabled = true) {
  const sorted = [...projectIds].filter(Boolean).sort();
  return useQuery({
    queryKey: queryKeys.projects.deadlines(sorted),
    queryFn: () => fetchActivityDeadlines(sorted),
    enabled: enabled && sorted.length > 0,
    staleTime: 60_000,
  });
}
