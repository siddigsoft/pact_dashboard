import { useState, useMemo } from 'react';
import {
  Search, Calendar as CalendarIcon, Clock, MoreHorizontal,
  Plus, Bell, Sparkles, ChevronLeft, ChevronRight, AlertCircle, Loader2, CheckCircle2, User,
} from 'lucide-react';
import { format, parseISO, isValid, isBefore, startOfDay, getDaysInMonth, getDay, isToday, addMonths, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskLayoutProps, PersonalTask } from './LayoutTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverdue(due?: string | null, status?: string) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  try { const d = parseISO(due); return isValid(d) && isBefore(startOfDay(d), startOfDay(new Date())); }
  catch { return false; }
}

function dueFmt(due?: string | null) {
  if (!due) return null;
  try {
    const d = parseISO(due);
    if (!isValid(d)) return null;
    if (isToday(d)) return 'Today';
    return format(d, 'MMM d');
  } catch { return null; }
}

function initials(name?: string | null) {
  if (!name) return 'ME';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

type QuadrantKey = 'doNow' | 'schedule' | 'delegate' | 'eliminate';

function classify(tasks: PersonalTask[]): Record<QuadrantKey, PersonalTask[]> {
  const out: Record<QuadrantKey, PersonalTask[]> = { doNow: [], schedule: [], delegate: [], eliminate: [] };
  tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').forEach(t => {
    const overdue = isOverdue(t.dueDate, t.status);
    if (t.priority === 'critical' || overdue) out.doNow.push(t);
    else if (t.priority === 'high') out.schedule.push(t);
    else if (t.priority === 'medium') out.delegate.push(t);
    else out.eliminate.push(t);
  });
  return out;
}

// ── Mini Calendar ─────────────────────────────────────────────────────────────

function MiniCalendar({ taskDates }: { taskDates: Set<string> }) {
  const [viewDate, setViewDate] = useState(new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = getDaysInMonth(viewDate);
  const firstDayOfWeek = getDay(new Date(year, month, 1));

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900 text-sm">{format(viewDate, 'MMMM yyyy')}</h3>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setViewDate(d => subMonths(d, 1))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setViewDate(d => addMonths(d, 1))}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-3 shadow-sm">
        <div className="grid grid-cols-7 text-center text-[10px] font-medium text-slate-400 mb-1">
          {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 text-center gap-y-0.5">
          {Array.from({ length: firstDayOfWeek }, (_, i) => (
            <div key={`e${i}`} className="py-1 text-slate-200 text-xs" />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dateStr = format(new Date(year, month, day), 'yyyy-MM-dd');
            const today = isToday(new Date(year, month, day));
            const hasTask = taskDates.has(dateStr);
            return (
              <div key={day} className="py-1 flex justify-center relative">
                <span className={cn(
                  'h-6 w-6 flex items-center justify-center rounded-full text-xs cursor-pointer',
                  today ? 'bg-[#0F2041] text-white font-medium' : 'text-slate-700 hover:bg-slate-100',
                )}>
                  {day}
                </span>
                {hasTask && (
                  <span className={cn('absolute bottom-0 h-1 w-1 rounded-full', today ? 'bg-white' : 'bg-blue-500')} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Task Card (Quadrant) ──────────────────────────────────────────────────────

interface QCardProps {
  task: PersonalTask;
  quadrant: QuadrantKey;
  onEdit: () => void;
  onToggleDone: () => void;
}
const QSTYLES: Record<QuadrantKey, string> = {
  doNow: 'bg-white border-red-100 hover:border-red-300',
  schedule: 'bg-white border-blue-100 hover:border-blue-300',
  delegate: 'bg-white border-amber-100 hover:border-amber-300',
  eliminate: 'bg-white border-slate-200 hover:border-slate-300',
};
function QCard({ task, quadrant, onEdit, onToggleDone }: QCardProps) {
  const due = dueFmt(task.dueDate);
  const overdue = isOverdue(task.dueDate, task.status);
  return (
    <div
      className={cn('p-2.5 rounded-lg border shadow-sm transition-all cursor-pointer group', QSTYLES[quadrant])}
      onClick={onEdit}
      data-testid={`qcard-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-900 leading-snug">{task.title}</p>
          {task.category && (
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{task.category}</span>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={e => e.stopPropagation()}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onToggleDone(); }}>Mark Done</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center justify-between text-[10px] text-slate-500">
        {due && (
          <span className={cn('flex items-center gap-1', overdue && 'text-red-500 font-semibold')}>
            <CalendarIcon className="h-3 w-3" /> {due}
          </span>
        )}
        <Badge
          variant="secondary"
          className={cn(
            'text-[9px] px-1 py-0 h-4 font-semibold ml-auto',
            task.priority === 'critical' ? 'bg-red-100 text-red-700' :
            task.priority === 'high' ? 'bg-orange-100 text-orange-700' :
            task.priority === 'medium' ? 'bg-blue-100 text-blue-700' :
            'bg-slate-100 text-slate-600',
          )}
        >
          {task.priority === 'critical' ? 'Urgent' : task.priority === 'high' ? 'High' :
           task.priority === 'medium' ? 'Medium' : 'Low'}
        </Badge>
      </div>
    </div>
  );
}

// ── Quadrant Box ──────────────────────────────────────────────────────────────

const QUADRANTS: { key: QuadrantKey; title: string; emoji: string; badge: string; bgCls: string; borderCls: string; hdrCls: string; textCls: string; badgeCls: string }[] = [
  { key: 'doNow', title: 'DO NOW', emoji: '🔴', badge: 'Urgent + Important', bgCls: 'bg-red-50/30', borderCls: 'border-red-100', hdrCls: 'bg-red-50/50 border-red-100', textCls: 'text-red-800', badgeCls: 'border-red-200 text-red-700' },
  { key: 'schedule', title: 'SCHEDULE', emoji: '📅', badge: 'Important, Not Urgent', bgCls: 'bg-blue-50/30', borderCls: 'border-blue-100', hdrCls: 'bg-blue-50/50 border-blue-100', textCls: 'text-blue-800', badgeCls: 'border-blue-200 text-blue-700' },
  { key: 'delegate', title: 'DELEGATE', emoji: '👤', badge: 'Urgent, Not Important', bgCls: 'bg-amber-50/30', borderCls: 'border-amber-100', hdrCls: 'bg-amber-50/50 border-amber-100', textCls: 'text-amber-800', badgeCls: 'border-amber-200 text-amber-700' },
  { key: 'eliminate', title: 'ELIMINATE', emoji: '🗑️', badge: 'Not Urgent + Not Important', bgCls: 'bg-slate-50', borderCls: 'border-slate-200', hdrCls: 'bg-slate-100/50 border-slate-200', textCls: 'text-slate-700', badgeCls: 'border-slate-200 text-slate-600' },
];

// ── Main ──────────────────────────────────────────────────────────────────────

export function Layout4EisenhowerMatrix({
  tasks, isLoading, isUpdating, onToggleDone, onEdit, onAdd, currentUser, stats,
}: TaskLayoutProps) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');

  const ui = currentUser?.fullName ? initials(currentUser.fullName) : 'ME';
  const firstName = currentUser?.fullName ? currentUser.fullName.split(' ')[0] : 'there';

  const taskDates = useMemo(() => {
    const s = new Set<string>();
    tasks.forEach(t => {
      if (t.dueDate) {
        try { const d = parseISO(t.dueDate); if (isValid(d)) s.add(format(d, 'yyyy-MM-dd')); } catch {}
      }
    });
    return s;
  }, [tasks]);

  const filtered = useMemo(() => {
    let base = tasks;
    if (activeFilter === 'Mine') base = tasks.filter(t => !t.category || t.category !== 'collaborative');
    if (activeFilter === 'Team') base = tasks.filter(t => t.category === 'collaborative');
    if (activeFilter === 'Overdue') base = tasks.filter(t => isOverdue(t.dueDate, t.status));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      base = base.filter(t => t.title.toLowerCase().includes(q));
    }
    return base;
  }, [tasks, activeFilter, searchQuery]);

  const quadrants = useMemo(() => classify(filtered), [filtered]);

  const todayTasks = useMemo(() =>
    tasks.filter(t => t.dueDate && (() => {
      try { const d = parseISO(t.dueDate!); return isValid(d) && isToday(d); } catch { return false; }
    })()).slice(0, 4),
    [tasks]
  );

  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* Left Sidebar */}
      <aside className="w-[240px] flex-shrink-0 bg-[#0F2041] text-white flex flex-col h-full border-r border-slate-800">
        <div className="p-5 flex-1 flex flex-col gap-5 overflow-y-auto">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 bg-blue-500 rounded-md flex items-center justify-center font-bold text-lg select-none">P</div>
            <span className="font-semibold text-lg tracking-tight">PACT</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              placeholder="Search tasks…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 text-white placeholder:text-slate-400 pl-9 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="input-eisenhower-search"
            />
          </div>

          {/* Filters */}
          <div>
            <h3 className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Filters</h3>
            <div className="flex flex-wrap gap-1.5">
              {['All', 'Mine', 'Team', 'Overdue'].map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                    activeFilter === f
                      ? 'bg-blue-600 border-transparent text-white'
                      : 'bg-transparent text-slate-300 border-slate-700 hover:border-slate-500',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Daily Briefing */}
          <div>
            <h3 className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mb-2">Planning Tools</h3>
            <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50 mb-3">
              <div className="flex justify-between items-start mb-2">
                <div className="text-sm font-medium text-slate-200">Daily Briefing</div>
                <div className="text-xs text-slate-400">{format(new Date(), 'dd MMM')}</div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                {stats.overdue > 0
                  ? `${stats.overdue} overdue task${stats.overdue > 1 ? 's' : ''} need attention.`
                  : 'Looking good — no overdue tasks!'}
              </p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Progress</span>
                  <span>{pct}%</span>
                </div>
                <Progress value={pct} className="h-1.5 bg-slate-700" />
              </div>
            </div>

            <button className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl p-3 flex items-start gap-2.5 transition-colors text-left group">
              <div className="bg-indigo-500/20 p-1.5 rounded-lg text-indigo-400 group-hover:text-indigo-300 transition-colors shrink-0">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div>
                <div className="text-xs font-medium text-indigo-300 mb-0.5">What to do next?</div>
                <div className="text-[11px] text-slate-400 leading-relaxed">
                  {quadrants.doNow.length > 0
                    ? `${quadrants.doNow.length} urgent item${quadrants.doNow.length > 1 ? 's' : ''} in DO NOW.`
                    : 'No urgent items — great work!'}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* User footer */}
        <div className="p-5 border-t border-slate-800/50">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-slate-700">
              <AvatarFallback className="bg-slate-700 text-white text-xs">{ui}</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">{currentUser?.fullName || 'User'}</div>
              <div className="text-xs text-slate-400 truncate capitalize">{currentUser?.role || 'Field Staff'}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Center: Matrix */}
      <main className="flex-1 flex flex-col h-full border-r border-slate-200 bg-white overflow-hidden">
        <header className="h-14 border-b border-slate-100 flex items-center justify-between px-5 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold text-slate-900">Priority Matrix</h1>
            <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal text-xs">Eisenhower Method</Badge>
          </div>
          <Button size="sm" className="bg-[#0F2041] hover:bg-[#0F2041]/90 text-white shadow-sm h-8" onClick={onAdd}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Task
          </Button>
        </header>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
          </div>
        ) : (
          <div className="flex-1 p-4 overflow-hidden">
            <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full">
              {QUADRANTS.map(q => (
                <div key={q.key} className={cn('rounded-xl border flex flex-col overflow-hidden shadow-sm', q.bgCls, q.borderCls)}>
                  <div className={cn('px-3 py-2 border-b flex items-center justify-between', q.hdrCls)}>
                    <h2 className={cn('font-semibold text-sm flex items-center gap-1', q.textCls)}>
                      {q.title} {q.emoji}
                    </h2>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-slate-500">{quadrants[q.key].length}</span>
                      <Badge variant="outline" className={cn('bg-white text-[9px] uppercase font-bold hidden xl:inline-flex', q.badgeCls)}>
                        {q.badge}
                      </Badge>
                    </div>
                  </div>
                  <ScrollArea className="flex-1 p-2.5">
                    <div className="space-y-2">
                      {quadrants[q.key].length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <CheckCircle2 className="w-7 h-7 text-slate-200 mb-2" />
                          <p className="text-xs text-slate-400">No tasks here</p>
                        </div>
                      ) : quadrants[q.key].map(task => (
                        <QCard
                          key={task.id}
                          task={task}
                          quadrant={q.key}
                          onEdit={() => onEdit(task)}
                          onToggleDone={() => onToggleDone(task)}
                        />
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Right panel */}
      <aside className="w-[280px] flex-shrink-0 bg-slate-50 flex flex-col h-full overflow-hidden">
        <header className="h-14 border-b border-slate-200 flex items-center justify-end px-5 shrink-0 bg-white">
          <button className="p-2 hover:bg-slate-100 rounded-full transition-colors relative">
            <Bell className="h-4 w-4 text-slate-500" />
            {stats.overdue > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white" />
            )}
          </button>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            <MiniCalendar taskDates={taskDates} />

            {/* Today's Agenda */}
            <section>
              <h3 className="font-semibold text-slate-900 mb-3 flex items-center justify-between text-sm">
                <span>Today's Tasks</span>
                <span className="text-xs font-normal text-slate-500">{todayTasks.length} items</span>
              </h3>
              {todayTasks.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No tasks due today</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {todayTasks.map(task => (
                    <div
                      key={task.id}
                      className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm hover:border-blue-200 transition-colors cursor-pointer"
                      onClick={() => onEdit(task)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-3 w-3 text-blue-500" />
                        <span className="text-[10px] font-semibold text-blue-600">Today</span>
                        <Badge
                          variant="secondary"
                          className="text-[9px] bg-slate-100 h-4 px-1.5 ml-auto"
                        >
                          {task.status === 'inprogress' ? 'In Progress' : task.status === 'todo' ? 'Todo' : 'Done'}
                        </Badge>
                      </div>
                      <p className="text-xs font-medium text-slate-800 line-clamp-1">{task.title}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Overdue Alert */}
            {stats.overdue > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 shadow-sm">
                <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-amber-800 mb-1">Overdue Tasks</h4>
                  <p className="text-xs text-amber-700/80 leading-relaxed">
                    You have {stats.overdue} overdue task{stats.overdue > 1 ? 's' : ''}. Review the DO NOW quadrant.
                  </p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}
