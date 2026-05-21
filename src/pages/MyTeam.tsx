import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Users, ClipboardList, Calendar, AlertTriangle, ExternalLink } from 'lucide-react';
import { format, parseISO, isAfter } from 'date-fns';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  full_name: string;
  role: string | null;
  avatar_url: string | null;
  department_name: string | null;
  reports_to: string | null;
  isDirect: boolean;
  openTasks: number;
  overdueTasks: number;
  pendingLeave: number;
  onLeaveToday: boolean;
}

export default function MyTeam() {
  const { currentUser } = useAppContext();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'direct' | 'all'>('direct');

  useEffect(() => { if (currentUser?.id) load(); /* eslint-disable-line */ }, [currentUser?.id]);

  async function load() {
    if (!currentUser?.id) return;
    setLoading(true);
    const me = currentUser.id;
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url, reports_to, departments(name)');

    const byId: Record<string, any> = {};
    (profiles ?? []).forEach((p: any) => { byId[p.id] = p; });

    // Build set of all reports (direct + indirect via BFS).
    const direct = new Set<string>();
    const all = new Set<string>();
    (profiles ?? []).forEach((p: any) => { if (p.reports_to === me) direct.add(p.id); });

    let frontier = new Set(direct);
    while (frontier.size) {
      const next = new Set<string>();
      frontier.forEach(id => all.add(id));
      (profiles ?? []).forEach((p: any) => {
        if (p.reports_to && frontier.has(p.reports_to) && !all.has(p.id)) next.add(p.id);
      });
      frontier = next;
    }

    const ids = Array.from(all);
    if (!ids.length) { setMembers([]); setLoading(false); return; }

    const today = format(new Date(), 'yyyy-MM-dd');
    const [tasksRes, leaveRes] = await Promise.all([
      supabase.from('personal_tasks')
        .select('id, primary_assignee_id, status, due_date')
        .in('primary_assignee_id', ids)
        .neq('status', 'completed'),
      supabase.from('leave_requests')
        .select('id, user_id, status, start_date, end_date')
        .in('user_id', ids)
        .in('status', ['pending', 'approved']),
    ]);

    const tCounts: Record<string, { open: number; overdue: number }> = {};
    (tasksRes.data ?? []).forEach((t: any) => {
      const m = (tCounts[t.primary_assignee_id] ||= { open: 0, overdue: 0 });
      m.open += 1;
      if (t.due_date && t.due_date < today) m.overdue += 1;
    });
    const lCounts: Record<string, { pending: number; onLeaveToday: boolean }> = {};
    (leaveRes.data ?? []).forEach((l: any) => {
      const m = (lCounts[l.user_id] ||= { pending: 0, onLeaveToday: false });
      if (l.status === 'pending') m.pending += 1;
      if (l.status === 'approved' && l.start_date <= today && l.end_date >= today) m.onLeaveToday = true;
    });

    const list: Member[] = ids.map(id => {
      const p = byId[id];
      const t = tCounts[id] ?? { open: 0, overdue: 0 };
      const l = lCounts[id] ?? { pending: 0, onLeaveToday: false };
      return {
        id,
        full_name: p?.full_name ?? 'Unknown',
        role: p?.role ?? null,
        avatar_url: p?.avatar_url ?? null,
        department_name: p?.departments?.name ?? null,
        reports_to: p?.reports_to ?? null,
        isDirect: direct.has(id),
        openTasks: t.open,
        overdueTasks: t.overdue,
        pendingLeave: l.pending,
        onLeaveToday: l.onLeaveToday,
      };
    }).sort((a, b) => Number(b.isDirect) - Number(a.isDirect) || a.full_name.localeCompare(b.full_name));

    setMembers(list);
    setLoading(false);
  }

  const visible = useMemo(() => {
    let list = tab === 'direct' ? members.filter(m => m.isDirect) : members;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(m =>
        m.full_name.toLowerCase().includes(q) ||
        (m.role ?? '').toLowerCase().includes(q) ||
        (m.department_name ?? '').toLowerCase().includes(q));
    }
    return list;
  }, [members, tab, search]);

  const kpi = useMemo(() => ({
    direct: members.filter(m => m.isDirect).length,
    total: members.length,
    overdue: members.reduce((a, m) => a + m.overdueTasks, 0),
    onLeave: members.filter(m => m.onLeaveToday).length,
    pendingLeave: members.reduce((a, m) => a + m.pendingLeave, 0),
  }), [members]);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4" data-testid="page-my-team">
      <header className="flex flex-wrap items-center gap-3">
        <Users className="h-5 w-5 text-blue-500" />
        <h1 className="text-xl font-semibold">My Team</h1>
        <p className="text-xs text-muted-foreground ml-1">
          Direct & indirect reports based on your reporting line.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiTile label="Direct reports" value={kpi.direct} />
        <KpiTile label="Total reports" value={kpi.total} />
        <KpiTile label="Overdue tasks" value={kpi.overdue} tone={kpi.overdue ? 'warn' : 'ok'} />
        <KpiTile label="On leave today" value={kpi.onLeave} />
        <KpiTile label="Leave to approve" value={kpi.pendingLeave} tone={kpi.pendingLeave ? 'warn' : 'ok'} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList>
            <TabsTrigger value="direct" data-testid="tab-direct">Direct ({members.filter(m => m.isDirect).length})</TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">All ({members.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <SearchInput
          wrapperClassName="ml-auto w-64"
          data-testid="input-search-team"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, role, department…"
        />
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 className="h-6 w-6 animate-spin opacity-30" /></div>
      ) : visible.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          {tab === 'direct'
            ? "You don't have any direct reports yet. Ask HR to set 'reports to' on profiles."
            : 'No team members match your search.'}
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {visible.map(m => <MemberCard key={m.id} m={m} />)}
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'ok' }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn('text-2xl font-semibold mt-0.5',
          tone === 'warn' && value > 0 && 'text-amber-600 dark:text-amber-400')}>{value}</div>
      </CardContent>
    </Card>
  );
}

function MemberCard({ m }: { m: Member }) {
  return (
    <Card data-testid={`card-team-member-${m.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={m.avatar_url ?? undefined} />
            <AvatarFallback>{m.full_name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm truncate">{m.full_name}</CardTitle>
            <div className="text-xs text-muted-foreground truncate">
              {m.role ?? '—'} {m.department_name ? `· ${m.department_name}` : ''}
            </div>
          </div>
          {m.isDirect ? (
            <Badge variant="outline" className="text-[10px]">Direct</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] opacity-60">Indirect</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-2 space-y-2 text-xs">
        <div className="grid grid-cols-3 gap-2">
          <Stat icon={<ClipboardList className="h-3 w-3" />} label="Open" value={m.openTasks} />
          <Stat icon={<AlertTriangle className="h-3 w-3" />} label="Overdue" value={m.overdueTasks} warn={m.overdueTasks > 0} />
          <Stat icon={<Calendar className="h-3 w-3" />} label="Leave" value={m.pendingLeave} warn={m.pendingLeave > 0} />
        </div>
        {m.onLeaveToday && (
          <div className="text-amber-600 dark:text-amber-400 text-[11px] flex items-center gap-1">
            <Calendar className="h-3 w-3" /> On leave today
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <Button asChild size="sm" variant="outline" className="text-xs h-7">
            <Link to={`/team-tasks?user=${m.id}`} data-testid={`link-tasks-${m.id}`}>
              <ClipboardList className="h-3 w-3 mr-1" /> Tasks
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="text-xs h-7">
            <Link to={`/leave-requests?user=${m.id}`} data-testid={`link-leave-${m.id}`}>
              <Calendar className="h-3 w-3 mr-1" /> Leave
            </Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-xs h-7 ml-auto">
            <Link to={`/users/${m.id}`} data-testid={`link-profile-${m.id}`}>
              <ExternalLink className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value, warn }: { icon: React.ReactNode; label: string; value: number; warn?: boolean }) {
  return (
    <div className={cn('rounded border px-2 py-1.5 bg-slate-50 dark:bg-slate-900',
      warn && 'border-amber-300 bg-amber-50 dark:bg-amber-900/20')}>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">{icon}{label}</div>
      <div className={cn('text-sm font-semibold', warn && 'text-amber-700 dark:text-amber-400')}>{value}</div>
    </div>
  );
}
