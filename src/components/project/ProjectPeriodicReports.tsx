import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, subDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuthorization } from '@/hooks/use-authorization';
import { useUser } from '@/context/user/UserContext';
import { exportToExcel } from '@/utils/report-export';
import type { Project } from '@/types/project';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProjectLifecycleDialog } from './ProjectLifecycleDialog';

export function ProjectPeriodicReports({ project }: { project: Project }) {
  const { checkPermission } = useAuthorization();
  const { currentUser } = useUser();
  const qc = useQueryClient();
  const canExport = checkPermission('projects', 'export');
  const canManage = checkPermission('projects', 'update') || [project.team?.projectManager, (project.team as any)?.projectManagerId].includes(currentUser?.id || '');
  const [start, setStart] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [financeOpen, setFinanceOpen] = useState(false);
  const [retryCandidate, setRetryCandidate] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [frequency, setFrequency] = useState('weekly');
  const [first, setFirst] = useState('');
  const [zone, setZone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [email, setEmail] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([]);
  const [selection, setSelected] = useState<any>(null);
  const selected = selection?.project_id === project.id ? selection : null;
  const team = project.team?.teamComposition || [];
  const query = useQuery({
    queryKey: ['project_progress_reports', project.id, page],
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from('project_progress_reports').select('*').eq('project_id', project.id).order('captured_at', { ascending: false }).range(page * 20, page * 20 + 19),
        ...(canManage ? [
          supabase.from('notification_schedules').select('id,report_frequency,scheduled_at,status').eq('report_project_id', project.id).order('scheduled_at', { ascending: false }).limit(20),
          supabase.from('project_report_deliveries').select('*').eq('project_id', project.id).order('due_at', { ascending: false }).limit(20),
          supabase.from('project_report_worker_health').select('last_seen').eq('id', true).maybeSingle(),
        ] : []),
      ]);
      for (const result of results) if (result.error) throw result.error;
      return { reports: results[0].data as any[], schedules: results[1]?.data as any[] || [],
        deliveries: results[2]?.data as any[] || [], heartbeat: (results[3]?.data as any)?.last_seen as string | undefined };
    }, retry: false,
  });
  const run = async (operation: () => PromiseLike<{ error: any }>) => {
    setError(''); setBusy(true);
    try { const result = await operation(); if (result.error) throw result.error; await qc.invalidateQueries({ queryKey: ['project_progress_reports', project.id] }); }
    catch (e: any) { setError(e.message || 'The report operation failed.'); }
    finally { setBusy(false); }
  };
  const generate = () => run(() => supabase.rpc('create_project_progress_report', {
    p_id: project.id, p_start: new Date(`${start}T00:00:00`).toISOString(),
    p_end: new Date(Math.min(Date.now(), new Date(`${end}T23:59:59.999`).getTime())).toISOString(),
  }));
  const saveSchedule = () => run(() => supabase.rpc('save_project_report_schedule', {
    p_id: project.id, p_frequency: frequency, p_first: new Date(first).toISOString(),
    p_timezone: zone, p_recipients: recipients, p_email: email,
  }));
  const exportReport = (report: any) => {
    if (!checkPermission('projects', 'export')) { setError('Project export permission is required.'); return; }
    const payload = report.payload;
    const context = { Project: project.name, 'Period starts': report.period_start, 'Period ends': report.period_end,
      'Captured at': report.captured_at, Basis: payload.basis, 'Period history complete': payload.periodHistoryComplete ? 'Yes' : 'No — incomplete history' };
    const rows = [
      { ...context, 'Record type': 'Summary', Details: JSON.stringify(payload.periodActivity) },
      ...(payload.tasksAtCapture || []).map((task: any) => ({ ...context, 'Record type': 'Task snapshot', Task: task.title,
        Status: task.status, 'Required review': task.reviewRequired ? 'Yes' : 'No', Accepted: task.accepted ? 'Yes' : 'No',
        'Main owner': task.assignedTo, 'Co-assignees': (task.coAssigneeIds || []).join(', '),
        'Estimated hours': task.estimatedHours ?? '', 'Actual hours': task.actualHours ?? '' })),
      ...(payload.periodReviews || []).flatMap((review: any) => Object.entries(review.contributions || {}).map(([id, contribution]) =>
        ({ ...context, 'Record type': 'Individual reviewed output', Task: review.taskId, Person: id, Decision: review.decision,
          Contribution: String(contribution), Reviewer: review.reviewerId, 'Reviewed at': review.at, Details: review.note }))),
    ];
    exportToExcel(rows, 'Period progress', `PACT_Project_Progress_${report.id}.xlsx`);
  };
  const workerReady = query.data?.heartbeat && Date.now() - new Date(query.data.heartbeat).getTime() < 15 * 60_000;
  return <section className="rounded-lg border p-4 space-y-3">
    <h3 className="font-semibold">Periodic progress, acceptance and delivery history</h3>
    {checkPermission('cost_submissions', 'approve') && <Button type="button" variant="outline" onClick={() => setFinanceOpen(true)}>Finance close clearance</Button>}
    <ProjectLifecycleDialog open={financeOpen} mode="finance" projectId={project.id} projectName={project.name} onClose={() => setFinanceOpen(false)} />
    {retryCandidate && <div className="rounded border border-amber-400 p-3 text-sm">
      <p>The previous delivery may have succeeded. Check in-app/email history first; retrying can duplicate a message.</p>
      <Button type="button" variant="outline" disabled={busy} onClick={() => {
        const id = retryCandidate; setRetryCandidate(null); void run(() => supabase.rpc('retry_project_report_delivery', { p_delivery: id }));
      }}>I checked — retry delivery</Button>
      <Button type="button" variant="ghost" onClick={() => setRetryCandidate(null)}>Cancel</Button>
    </div>}
    <p className="text-xs text-muted-foreground">An immutable report records task state at capture time and actual events in the chosen period. Done and accepted are separate. Shared-task participation is not counted as full individual output. Earlier periods may have incomplete history.</p>
    <div className="flex gap-2 flex-wrap">
      <label className="text-xs">From<Input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label className="text-xs">Through<Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      {canExport && <Button type="button" disabled={busy || !start || end < start} onClick={generate}>Capture period report</Button>}
      <Button type="button" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh / Retry</Button>
    </div>
    {(error || query.error) && <p role="alert" className="text-sm text-destructive">{error || (query.error as Error).message}. Missing tables or functions require the project-module migrations.</p>}
    {query.isFetching && <p role="status">Loading report history…</p>}
    <div className="flex flex-wrap gap-2">{query.data?.reports.map(report => <Button key={report.id} type="button" size="sm" variant="outline" onClick={() => setSelected(report)}>
      {new Date(report.period_end).toLocaleDateString()} · captured {new Date(report.captured_at).toLocaleString()}
    </Button>)}</div>
    {query.data?.reports.length === 0 && <p className="text-sm">No saved reports on this page.</p>}
    <div className="flex gap-2"><Button type="button" size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button type="button" size="sm" variant="ghost" disabled={(query.data?.reports.length || 0) < 20} onClick={() => setPage(page + 1)}>Older reports</Button></div>
    {selected && <article className="rounded border p-3 space-y-2 text-sm">
      <p>{selected.payload.basis}</p>
      <p>Period activity: {JSON.stringify(selected.payload.periodActivity)}. Recorded from: {selected.payload.historyAvailableFrom || 'no recorded events yet'}.</p>
      {!selected.payload.periodHistoryComplete && <p className="text-amber-700">History is incomplete for this period. Do not treat missing earlier activity as zero performance.</p>}
      <p>Tasks at capture: {selected.payload.tasksAtCapture.length}; Done: {selected.payload.tasksAtCapture.filter((t: any) => t.status === 'done').length}; Accepted: {selected.payload.tasksAtCapture.filter((t: any) => t.accepted).length}; Changes requested in period: {selected.payload.periodReviews.filter((r: any) => r.decision === 'changes_requested').length}.</p>
      {selected.payload.periodReviews.map((r: any, i: number) => <div key={i} className="border-t pt-2"><strong>{r.decision.replaceAll('_', ' ')}</strong><p>{r.note}</p>{Object.entries(r.contributions || {}).map(([id, note]) => <p key={id}>{id}: {String(note)}</p>)}</div>)}
      {canExport && <Button type="button" variant="outline" onClick={() => exportReport(selected)}>Export this report to Excel</Button>}
    </article>}
    {canManage && canExport && <details className="border-t pt-3">
      <summary className="cursor-pointer font-medium text-sm">Weekly / monthly delivery</summary>
      <p className={`text-xs my-2 ${workerReady ? 'text-muted-foreground' : 'text-amber-700'}`}>{workerReady ? `Worker last checked ${new Date(query.data!.heartbeat!).toLocaleString()}.` : 'Scheduled delivery is not confirmed. Deploy the report worker and configure its poll schedule; saving a schedule alone does not activate delivery.'}</p>
      <div className="flex gap-2 flex-wrap text-xs">
        <label>Frequency<select className="block border rounded p-2" value={frequency} onChange={e => setFrequency(e.target.value)}><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
        <label>First send in your browser’s local time<Input type="datetime-local" value={first} onChange={e => setFirst(e.target.value)} /></label>
        <label>Recurrence time zone<Input value={zone} onChange={e => setZone(e.target.value)} placeholder="Africa/Nairobi" /></label>
      </div>
      <div className="flex flex-wrap gap-3 text-xs my-3">{team.map(member => <label key={member.userId}><input type="checkbox" checked={recipients.includes(member.userId)} onChange={e => setRecipients(ids => e.target.checked ? [...ids, member.userId] : ids.filter(id => id !== member.userId))} /> {member.name || member.userId}</label>)}</div>
      <label className="text-xs"><input type="checkbox" checked={email} onChange={e => setEmail(e.target.checked)} /> Also request email delivery; in-app notifications are always included.</label>
      <Button type="button" className="ml-2" disabled={busy || !first || !recipients.length || !!project.archived} onClick={saveSchedule}>Save schedule</Button>
      <p className="text-xs text-muted-foreground my-2">Only registered current team members can receive reports. Month-end dates are preserved. An uncertain delivery needs verification before retrying to avoid duplicate messages.</p>
      {query.data?.schedules.map(schedule => <div key={schedule.id} className="text-xs flex gap-3 py-1">
        <span>{schedule.report_frequency} · {new Date(schedule.scheduled_at).toLocaleString()} · {schedule.status === 'project_report_pending' ? 'scheduled' : schedule.status}</span>
        {schedule.status === 'project_report_pending' && <button type="button" disabled={busy} className="underline" onClick={() => void run(() => supabase.rpc('cancel_project_report_schedule', { p_schedule: schedule.id }))}>Stop</button>}
      </div>)}
      {query.data?.deliveries.map(delivery => <div key={delivery.id} className="text-xs border-t py-2">
        {new Date(delivery.due_at).toLocaleString()} · {delivery.status === 'sent' ? 'Dispatcher accepted' : delivery.status} · attempts {delivery.attempts}
        {delivery.result && <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(delivery.result)}</pre>}
        {['failed', 'uncertain'].includes(delivery.status) && <button type="button" disabled={busy} className="underline" onClick={() => {
          if (delivery.status === 'uncertain') { setRetryCandidate(delivery.id); return; }
          void run(() => supabase.rpc('retry_project_report_delivery', { p_delivery: delivery.id }));
        }}>Retry delivery</button>}
      </div>)}
    </details>}
  </section>;
}
