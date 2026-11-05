import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/context/user/UserContext';
import { projectTaskUrl } from '@/utils/projectIdentity';
import { Button } from '@/components/ui/button';

interface ReviewRequest {
  id: string; project_id: string; project_name: string; title: string;
  due_date: string | null; submitted_at: string;
}
export function ProjectReviewQueue() {
  const { currentUser } = useUser();
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['project_review_queue', currentUser?.id, page],
    enabled: !!currentUser?.id,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase.rpc('get_my_project_review_queue', {
        p_offset: page * 20, p_limit: 20,
      }).abortSignal(signal);
      if (error) throw error;
      return data as { total: number; items: ReviewRequest[] };
    }, retry: false, staleTime: 15_000, refetchInterval: 60_000,
  });
  if (!currentUser) return null;
  return <details open className="w-full rounded-lg border p-4 space-y-3" data-testid="project-review-queue">
    <summary className="font-semibold cursor-pointer">Project work awaiting my acceptance {query.data ? `(${query.data.total})` : ''}</summary>
    <p className="text-xs text-muted-foreground">These requests are assigned to you as an independent reviewer, not as a task assignee. Open the task to inspect evidence and accept it or request changes.</p>
    {query.isPending && <p role="status">Checking review requests…</p>}
    {query.error && <p role="alert" className="text-sm text-destructive">Review requests could not be loaded: {(query.error as Error).message}. If the function is missing, apply 20261106100000_project_review_queue.sql.</p>}
    <Button type="button" size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh review requests</Button>
    {query.data?.items.map(task => <article key={task.id} className="border-t py-2 flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-sm font-medium">{task.title}</p><p className="text-xs text-muted-foreground">{task.project_name}{task.due_date ? ` · Due ${task.due_date.slice(0, 10)}` : ''}</p></div>
      <Button type="button" variant="outline" size="sm" asChild><Link to={projectTaskUrl(task.project_id, task.id)}>Review task</Link></Button>
    </article>)}
    {query.data?.total === 0 && <p className="text-sm text-muted-foreground">No project work is waiting for your acceptance.</p>}
    {query.data && (query.data.total > 20 || page > 0) && <div className="flex gap-2">
      <Button type="button" size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous reviews</Button>
      <Button type="button" size="sm" variant="ghost" disabled={(page + 1) * 20 >= query.data.total} onClick={() => setPage(page + 1)}>More reviews</Button>
    </div>}
  </details>;
}
