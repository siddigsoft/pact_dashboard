import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { calculateProjectCapacity, CapacityData } from '@/utils/projectCapacity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ProjectCapacityPanel({ projectId, archived = false }: { projectId: string; archived?: boolean }) {
  const [start, setStart] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['project_capacity', projectId, start, end],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('project_capacity_data', { p_id: projectId, p_start: start, p_end: end });
      if (error) throw error;
      return { raw: data as CapacityData, rows: calculateProjectCapacity(data, start, end) };
    }, retry: false,
    enabled: !!start && !!end && end >= start,
  });
  const saveHours = async (id: string, value: string) => {
    const hours = Number(value);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) { setError('Daily hours must be between 0 and 24.'); return; }
    setBusy(id); setError('');
    try {
      const { error } = await supabase.rpc('set_project_member_hours', { p_id: projectId, p_user: id, p_hours: hours });
      if (error) throw error;
      await query.refetch();
    } catch (e: any) { setError(e.message); } finally { setBusy(null); }
  };
  return <section className="rounded-lg border p-4 space-y-3">
    <h3 className="font-semibold">Team capacity by period</h3>
    <p className="text-xs text-muted-foreground">Uses this project’s working calendar, approved leave and dated active project-task allocations across projects. Other project names and leave reasons are not exposed. Unestimated personal work and external members remain outside this calculation.</p>
    <div className="flex gap-2 flex-wrap">
      <label className="text-xs">From<Input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
      <label className="text-xs">Through<Input type="date" value={end} onChange={e => setEnd(e.target.value)} /></label>
      <Button type="button" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>Refresh</Button>
    </div>
    {(error || query.error) && <p role="alert" className="text-sm text-destructive">{error || (query.error as Error).message}. Apply the project-module migrations if a function is missing.</p>}
    {query.isFetching && <p role="status">Loading capacity…</p>}
    {query.data && <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr><th className="text-left">Person</th><th>Hours/day</th><th>Available</th><th>Planned</th><th>Load</th><th>Needs scheduling / allocation</th></tr></thead>
      <tbody>{query.data.rows.map(row => <tr key={row.id} className="border-t">
        <td className="py-2">{row.name}</td>
        <td><Input aria-label={`Daily working hours for ${row.name}`} type="number" min={0} max={24} step={0.5} className="w-20 mx-auto" defaultValue={row.dailyHours} key={`${row.id}-${row.dailyHours}`} disabled={archived || busy === row.id} onBlur={e => { if (Number(e.target.value) !== Number(row.dailyHours)) void saveHours(row.id, e.target.value); }} /></td>
        <td className="text-center">{row.available == null ? 'Leave unavailable' : `${row.available.toFixed(1)}h`}</td>
        <td className="text-center">{row.allocated.toFixed(1)}h</td>
        <td className={`text-center ${row.overloaded ? 'text-destructive font-semibold' : ''}`}>{row.utilization == null ? 'Not measurable' : `${Math.round(row.utilization)}%`}</td>
        <td className="text-center">{row.unscheduled.toFixed(1)}h undated/overdue; {row.unallocatedTasks} without hours</td>
      </tr>)}</tbody>
    </table>{!query.data.rows.length && <p>No registered team members have been configured.</p>}</div>}
    <p className="text-xs text-muted-foreground">This is a planning estimate, not a productivity score. More than 100% is shown as overload, never capped. Missing dates, hours or leave data are not treated as spare capacity.</p>
  </section>;
}
