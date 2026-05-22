import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAppContext } from '@/context/AppContext';
import {
  CheckSquare, CalendarOff, Bell, FileText, Folder,
  Sparkles, Calendar, Clock, AlertCircle, TrendingUp,
  ChevronRight, Briefcase, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, parseISO, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';

export function EmployeeZone() {
  const { currentUser } = useAppContext();
  const userId = currentUser?.id;
  const today = new Date();

  const { data: tasks = [] } = useQuery({
    queryKey: ['employee-tasks', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('personal_tasks')
        .select('id, title, status, due_date, priority')
        .eq('user_id', userId)
        .neq('status', 'completed');
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 60_000,
  });

  const { data: leave } = useQuery({
    queryKey: ['employee-leave-balance', userId],
    queryFn: async () => {
      if (!userId) return null;
      const year = today.getFullYear();
      const { data } = await supabase
        .from('leave_entitlements')
        .select('annual_days, sick_days, emergency_days')
        .eq('user_id', userId)
        .eq('year', year)
        .maybeSingle();

      const { data: taken } = await supabase
        .from('leave_requests')
        .select('days_count, leave_type')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .gte('start_date', `${year}-01-01`);

      const takenByType: Record<string, number> = {};
      (taken ?? []).forEach((r: any) => {
        takenByType[r.leave_type] = (takenByType[r.leave_type] ?? 0) + (r.days_count ?? 0);
      });

      return {
        annual: { total: data?.annual_days ?? 21, taken: takenByType['annual'] ?? 0 },
        sick:   { total: data?.sick_days ?? 10,   taken: takenByType['sick'] ?? 0 },
        emergency: { total: data?.emergency_days ?? 3, taken: takenByType['emergency'] ?? 0 },
      };
    },
    enabled: !!userId,
    staleTime: 120_000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['employee-notifications', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('notifications')
        .select('id, title_en, message_en, created_at, is_read, priority')
        .eq('recipient_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      return data ?? [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const overdueTasks = tasks.filter((t: any) => t.due_date && isBefore(parseISO(t.due_date), startOfDay(today)));
  const todayTasks = tasks.filter((t: any) => t.due_date && isAfter(parseISO(t.due_date), startOfDay(today)) && isBefore(parseISO(t.due_date), endOfDay(today)));
  const unreadNotifs = notifications.filter((n: any) => !n.is_read).length;

  const annualRemaining = (leave?.annual.total ?? 21) - (leave?.annual.taken ?? 0);
  const sickRemaining   = (leave?.sick.total ?? 10)   - (leave?.sick.taken ?? 0);

  const quickLinks = [
    { label: 'My Tasks',       url: '/my-tasks',        icon: CheckSquare,  color: 'bg-blue-50 text-blue-700 border-blue-200',    badge: tasks.length || undefined },
    { label: 'Leave Requests', url: '/leave',            icon: CalendarOff,  color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    { label: 'My Payslip',     url: '/hr?tab=payroll',  icon: FileText,     color: 'bg-violet-50 text-violet-700 border-violet-200'   },
    { label: 'Calendar',       url: '/calendar',         icon: Calendar,     color: 'bg-amber-50 text-amber-700 border-amber-200'      },
    { label: 'Workspace Hub',  url: '/workspace',        icon: Folder,       color: 'bg-slate-50 text-slate-700 border-slate-200'      },
    { label: "What's New",     url: '/changelog',        icon: Sparkles,     color: 'bg-pink-50 text-pink-700 border-pink-200'         },
  ];

  const priorityColor = (p: string) =>
    p === 'high' ? 'bg-red-100 text-red-700' : p === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">

      {/* ── Welcome header ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-gradient-to-r from-[#0F2041] to-[#1D3461] p-5 text-white flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Briefcase className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-blue-200 text-xs font-medium">Welcome back</p>
          <h1 className="text-xl font-bold truncate">{currentUser?.name ?? 'Employee'}</h1>
          <p className="text-blue-300 text-xs capitalize">{currentUser?.role ?? 'Employee'} · {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-blue-200 text-[10px] font-medium">Annual Leave Left</p>
          <p className="text-2xl font-bold">{annualRemaining}</p>
          <p className="text-blue-300 text-[10px]">of {leave?.annual.total ?? 21} days</p>
        </div>
      </div>

      {/* ── Stats row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Overdue Tasks',     value: overdueTasks.length, icon: AlertCircle, color: 'text-red-600',     bg: 'bg-red-50 border-red-200',   url: '/my-tasks' },
          { label: 'Due Today',         value: todayTasks.length,   icon: Clock,       color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200', url: '/my-tasks' },
          { label: 'Sick Days Left',    value: sickRemaining,       icon: Star,        color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', url: '/leave' },
          { label: 'Unread Alerts',     value: unreadNotifs,        icon: Bell,        color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',   url: '/notifications' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <Link key={stat.label} to={stat.url}
              className={cn('rounded-xl border p-4 flex flex-col gap-1.5 hover:shadow-md transition-shadow', stat.bg)}
              data-testid={`stat-${stat.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon className={cn('h-4 w-4', stat.color)} />
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className={cn('text-[11px] font-medium', stat.color)}>{stat.label}</p>
            </Link>
          );
        })}
      </div>

      <div className="grid md:grid-cols-2 gap-5">

        {/* ── Quick links ──────────────────────────────────────────── */}
        <div className="space-y-2">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quick Access</h2>
          <div className="grid grid-cols-2 gap-2">
            {quickLinks.map(link => {
              const Icon = link.icon;
              return (
                <Link key={link.url} to={link.url}
                  className={cn('relative flex items-center gap-2.5 p-3 rounded-xl border hover:shadow-md transition-all text-sm font-semibold', link.color)}
                  data-testid={`quicklink-${link.label.toLowerCase().replace(/[\s']+/g, '-')}`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-xs">{link.label}</span>
                  {link.badge !== undefined && link.badge > 0 && (
                    <span className="ml-auto shrink-0 bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Leave balance mini card */}
          <div className="rounded-xl border bg-card p-4 space-y-2 mt-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Leave Balance</p>
              <Link to="/hr?tab=leave-requests" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                View all <ChevronRight className="h-2.5 w-2.5" />
              </Link>
            </div>
            {[
              { label: 'Annual',    taken: leave?.annual.taken ?? 0,    total: leave?.annual.total ?? 21,    color: 'bg-blue-500' },
              { label: 'Sick',      taken: leave?.sick.taken ?? 0,       total: leave?.sick.total ?? 10,      color: 'bg-emerald-500' },
              { label: 'Emergency', taken: leave?.emergency.taken ?? 0,  total: leave?.emergency.total ?? 3,  color: 'bg-amber-500' },
            ].map(({ label, taken, total, color }) => {
              const pct = total > 0 ? Math.min(100, Math.round((taken / total) * 100)) : 0;
              return (
                <div key={label} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">{label}</span>
                    <span className="font-semibold">{total - taken} <span className="text-muted-foreground font-normal">/ {total} days left</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Recent notifications ─────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Recent Notifications</h2>
            <Link to="/notifications" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
              See all <ChevronRight className="h-2.5 w-2.5" />
            </Link>
          </div>
          <div className="rounded-xl border bg-card divide-y overflow-hidden">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="h-6 w-6 text-muted-foreground mx-auto mb-2 opacity-30" />
                <p className="text-xs text-muted-foreground">No notifications yet</p>
              </div>
            ) : notifications.map((n: any) => (
              <div key={n.id} className={cn('px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors', !n.is_read && 'bg-blue-50/50 dark:bg-blue-900/10')}>
                <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', n.is_read ? 'bg-muted-foreground/30' : 'bg-blue-500')} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{n.title_en ?? 'Notification'}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{n.message_en}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {n.priority === 'high' && (
                  <span className="shrink-0 text-[9px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">High</span>
                )}
              </div>
            ))}
          </div>

          {/* Pending tasks preview */}
          {tasks.length > 0 && (
            <div className="rounded-xl border bg-card divide-y overflow-hidden mt-3">
              <div className="px-4 py-2.5 flex items-center justify-between bg-muted/30">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Open Tasks</p>
                <Link to="/my-tasks" className="text-[10px] text-blue-600 hover:underline">View all</Link>
              </div>
              {tasks.slice(0, 4).map((t: any) => (
                <div key={t.id} className="px-4 py-2.5 flex items-center gap-2.5 hover:bg-muted/20 transition-colors">
                  <CheckSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs flex-1 truncate">{t.title}</p>
                  {t.priority && (
                    <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 capitalize', priorityColor(t.priority))}>
                      {t.priority}
                    </span>
                  )}
                  {t.due_date && (
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
