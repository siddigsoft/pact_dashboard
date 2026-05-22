import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const LEAVE_COLORS: Record<string, string> = {
  annual:    'bg-blue-500',
  sick:      'bg-red-400',
  emergency: 'bg-orange-400',
  maternity: 'bg-pink-400',
  paternity: 'bg-indigo-400',
  unpaid:    'bg-slate-400',
};
const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', emergency: 'Emergency',
  maternity: 'Maternity', paternity: 'Paternity', unpaid: 'Unpaid',
};

function datesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function LeaveCalendar() {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all'|'approved'|'pending'>('all');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['leave-calendar-requests', year, month],
    queryFn: async () => {
      const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDay  = new Date(year, month + 1, 0).toISOString().slice(0, 10);
      const { data } = await supabase
        .from('leave_requests')
        .select('id, user_id, leave_type, start_date, end_date, status, reason, duration_days, profiles:user_id(full_name, role)')
        .gte('start_date', firstDay)
        .lte('end_date',   lastDay)
        .in('status', ['approved', 'pending'])
        .order('start_date');
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => requests.filter((r: any) => {
    if (filterStatus !== 'all' && r.status !== filterStatus) return false;
    if (filterType   !== 'all' && r.leave_type !== filterType) return false;
    return true;
  }), [requests, filterStatus, filterType]);

  const dayMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of filtered) {
      for (const d of datesInRange(r.start_date, r.end_date)) {
        if (!map[d]) map[d] = [];
        map[d].push(r);
      }
    }
    return map;
  }, [filtered]);

  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const startDow     = firstOfMonth.getDay(); // 0=Sun

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayStr = today.toISOString().slice(0, 10);

  const leaveTypes = [...new Set(requests.map((r: any) => r.leave_type))];

  const totalApproved = filtered.filter((r: any) => r.status === 'approved').length;
  const totalPending  = filtered.filter((r: any) => r.status === 'pending').length;
  const uniqueStaff   = new Set(filtered.map((r: any) => r.user_id)).size;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Staff on Leave (this view)', value: uniqueStaff,    color: 'text-blue-700 dark:text-blue-300',   accent: 'bg-blue-500'  },
          { label: 'Approved Requests',           value: totalApproved,  color: 'text-green-700 dark:text-green-300', accent: 'bg-green-500' },
          { label: 'Pending Requests',             value: totalPending,   color: 'text-amber-700 dark:text-amber-300', accent: 'bg-amber-500' },
        ].map(k => (
          <Card key={k.label} className="overflow-hidden">
            <div className={`h-1 ${k.accent}`} />
            <CardContent className="pt-3 pb-3">
              <p className="text-xs text-muted-foreground">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{isLoading ? '—' : k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Calendar Card */}
      <Card>
        <CardHeader className="pb-0 pt-4 px-5">
          {/* Navigation row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="text-base font-bold min-w-[140px] text-center">
                {firstOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Status filter */}
              {(['all','approved','pending'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={cn('text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all', filterStatus === s ? 'bg-[#0F2041] text-white border-[#0F2041]' : 'border-border hover:bg-muted')}>
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
              {/* Type filter */}
              <select value={filterType} onChange={e => setFilterType(e.target.value)}
                className="text-xs border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring">
                <option value="all">All types</option>
                {leaveTypes.map(t => <option key={t} value={t}>{LEAVE_LABELS[t] ?? t}</option>)}
              </select>
            </div>
          </div>

          {/* Legend */}
          <div className="flex gap-3 flex-wrap pt-3 pb-1">
            {Object.entries(LEAVE_LABELS).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className={`w-2.5 h-2.5 rounded-full ${LEAVE_COLORS[k]}`} />
                {v}
              </div>
            ))}
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground ml-4">
              <span className="w-2.5 h-2.5 rounded-sm border-2 border-dashed border-amber-400" />Pending
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-3 pt-3 pb-4">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">Loading leave data…</div>
          ) : (
            <>
              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[11px] font-bold text-muted-foreground py-1">{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startDow }).map((_, i) => (
                  <div key={`blank-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const entries = dayMap[dateStr] ?? [];
                  const isToday = dateStr === todayStr;
                  return (
                    <div key={day} className={cn(
                      'min-h-[70px] rounded-lg p-1 border transition-colors',
                      isToday ? 'border-[#0F2041] bg-blue-50/40 dark:bg-blue-950/20' : 'border-border hover:bg-muted/30',
                    )}>
                      <p className={cn('text-[11px] font-bold mb-0.5 text-right pr-0.5', isToday ? 'text-[#0F2041] dark:text-blue-400' : 'text-muted-foreground')}>{day}</p>
                      <div className="space-y-0.5">
                        {entries.slice(0, 3).map((r: any, ri: number) => {
                          const name = (r.profiles?.full_name ?? r.user_id ?? '?').split(' ')[0];
                          const color = LEAVE_COLORS[r.leave_type] ?? 'bg-slate-400';
                          return (
                            <div key={ri} title={`${r.profiles?.full_name} — ${LEAVE_LABELS[r.leave_type] ?? r.leave_type} (${r.status})`}
                              className={cn('text-[9px] font-semibold text-white rounded px-1 py-0.5 truncate leading-tight', color, r.status === 'pending' ? 'opacity-60 border border-dashed border-white/60' : '')}>
                              {name}
                            </div>
                          );
                        })}
                        {entries.length > 3 && (
                          <div className="text-[9px] text-muted-foreground font-semibold pl-0.5">+{entries.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* List view below calendar */}
      {filtered.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Leave Requests This Month</p>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-2">
              {filtered.map((r: any) => {
                const name = r.profiles?.full_name ?? r.user_id ?? '—';
                const color = LEAVE_COLORS[r.leave_type] ?? 'bg-slate-400';
                return (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl border px-4 py-2.5">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{name}</p>
                      <p className="text-xs text-muted-foreground">{LEAVE_LABELS[r.leave_type] ?? r.leave_type} · {r.start_date} – {r.end_date}</p>
                    </div>
                    <span className={cn(
                      'text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
                      r.status === 'approved' ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400'
                        : 'bg-amber-100 dark:bg-amber-900/40 text-amber-700',
                    )}>{r.status}</span>
                    <span className="text-xs font-bold text-muted-foreground shrink-0">{r.duration_days ?? 1}d</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <CalendarDays className="h-10 w-10 opacity-30" />
          <p className="text-sm">No leave requests for this month.</p>
        </div>
      )}
    </div>
  );
}
