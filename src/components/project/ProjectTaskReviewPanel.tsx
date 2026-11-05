import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FieldTask } from '@/hooks/useProjectTasks';
import { taskAssigneeIds } from '@/utils/projectTaskReporting';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { dispatchNotification } from '@/lib/notify';
import { projectTaskUrl } from '@/utils/projectIdentity';

export function ProjectTaskReviewPanel({ task }: { task: FieldTask }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [contributions, setContributions] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['project_task_review', task.id, task.updatedAt],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('project_task_review_state', { p_task: task.id });
      if (error) throw error;
      return data as { accepted: boolean; can_review: boolean; reviews: any[] };
    }, enabled: task.reviewRequired, retry: false,
  });
  if (!task.reviewRequired) return null;
  const decide = async (decision: string) => {
    setBusy(true); setError('');
    try {
      const { error } = await supabase.rpc('review_project_task', {
        p_task: task.id, p_decision: decision, p_note: note, p_contributions: contributions,
      });
      if (error) throw error;
      void dispatchNotification({
        event: 'project_task_status_changed', recipientIds: taskAssigneeIds(task).filter(id => /^[0-9a-f-]{36}$/i.test(id)),
        titleEn: decision === 'accepted' ? `Work accepted: ${task.title}` : `Changes requested: ${task.title}`,
        titleAr: decision === 'accepted' ? `تم قبول العمل: ${task.title}` : `تعديلات مطلوبة: ${task.title}`,
        messageEn: note, messageAr: note, entityType: 'project_task', entityId: task.id,
        actionUrl: projectTaskUrl(task.projectId, task.id), sendEmail: true,
      }).catch(() => setError('Review saved, but assignee notification delivery could not be confirmed.'));
      setNote(''); setContributions({});
      await qc.invalidateQueries({ queryKey: ['project_task_review', task.id] });
      await qc.invalidateQueries({ queryKey: ['project_field_tasks', task.projectId] });
      await qc.invalidateQueries({ queryKey: ['my_project_field_tasks'] });
      await qc.invalidateQueries({ queryKey: ['project_review_queue'] });
      await qc.invalidateQueries({ queryKey: ['all_project_field_tasks'] });
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="rounded-lg border p-4 space-y-3">
    <h4 className="font-semibold">Acceptance and individual contributions</h4>
    <p className="text-sm">{task.acceptanceCriteria}</p>
    <p className="text-xs">Reviewer: {task.reviewerId}. {query.data?.accepted ? 'Accepted against the current task version.' : 'Not accepted against the current version. Marking Done is a submission, not acceptance.'}</p>
    {(error || query.error) && <p role="alert" className="text-destructive text-sm">{error || (query.error as Error).message}</p>}
    {query.isFetching && <p role="status">Checking acceptance…</p>}
    {query.data?.can_review && <>
      <Textarea aria-label="Review decision note" placeholder="Acceptance evidence, quality observations, or requested rework…" value={note} onChange={e => setNote(e.target.value)} />
      {taskAssigneeIds(task).map(id => <label key={id} className="block text-xs">
        {id === task.assignedTo ? task.assignedToName || id : id} — individual output / changes
        <Textarea value={contributions[id] || ''} onChange={e => setContributions(prev => ({ ...prev, [id]: e.target.value }))} placeholder="Record this person’s contribution; do not copy the whole task credit to everyone." />
      </label>)}
      <div className="flex gap-2">
        <Button type="button" disabled={busy || note.trim().length < 10} onClick={() => void decide('accepted')}>Accept work</Button>
        <Button type="button" variant="outline" disabled={busy || note.trim().length < 10} onClick={() => void decide('changes_requested')}>Request changes</Button>
      </div>
    </>}
    {query.data?.reviews.map(review => <article key={review.id} className="border-t pt-2 text-xs space-y-1">
      <strong>{review.decision.replaceAll('_', ' ')} · {review.reviewer_name || review.reviewer_id}</strong>
      <p>{review.note}</p>
      {Object.entries(review.contributions || {}).map(([id, text]) => <p key={id}>{id}: {String(text)}</p>)}
      <p className="text-muted-foreground">{new Date(review.created_at).toLocaleString()}</p>
    </article>)}
    <p className="text-xs text-muted-foreground">Reviews are append-only. Editing a task invalidates acceptance of its earlier version. Review history remains available.</p>
  </section>;
}
