import { useState, useMemo } from 'react';
import {
  Search, Plus, Calendar as CalendarIcon, CheckCircle2, Circle, Clock, AlertCircle,
  MoreVertical, LayoutDashboard, Users, Target, Info, Loader2,
} from 'lucide-react';
import { format, parseISO, isValid, isBefore, startOfDay, isToday } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskLayoutProps, PersonalTask } from './LayoutTypes';

type TabId = 'my-tasks' | 'project' | 'calendar' | 'planning';
type FilterLabel = 'All' | 'Todo' | 'In Progress' | 'Overdue' | 'Done';

const TABS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'my-tasks', label: 'My Tasks',     icon: LayoutDashboard },
  { id: 'project',  label: 'Project Tasks', icon: Users },
  { id: 'calendar', label: 'Calendar',      icon: CalendarIcon },
  { id: 'planning', label: 'Planning',       icon: Target },
];

function isOverdue(due?: string | null, status?: string) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  try { const d = parseISO(due); return isValid(d) && isBefore(startOfDay(d), startOfDay(new Date())); }
  catch { return false; }
}

function dueBadge(due?: string | null, status?: string) {
  if (!due) return null;
  if (status === 'done' || status === 'cancelled') return null;
  if (isOverdue(due, status)) return { label: 'Overdue', cls: 'bg-red-100 text-red-700' };
  try {
    const d = parseISO(due);
    if (!isValid(d)) return null;
    if (isToday(d)) return { label: 'Today', cls: 'bg-amber-100 text-amber-700' };
    return { label: format(d, 'dd MMM'), cls: 'bg-slate-100 text-slate-600' };
  } catch { return null; }
}

function priorityBorderClass(p: string) {
  if (p === 'critical') return 'border-l-red-500';
  if (p === 'high') return 'border-l-amber-500';
  if (p === 'medium') return 'border-l-blue-500';
  return 'border-l-slate-300';
}

function statusIcon(s: string) {
  if (s === 'done') return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
  if (s === 'inprogress') return <Clock className="w-4 h-4 text-blue-500" />;
  if (s === 'cancelled') return <AlertCircle className="w-4 h-4 text-slate-400" />;
  return <Circle className="w-4 h-4 text-slate-300" />;
}

function initials(name?: string | null) {
  if (!name) return 'ME';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

interface TaskGridCardProps {
  task: PersonalTask;
  onToggleDone: () => void;
  onEdit: () => void;
  isUpdating: boolean;
}
function TaskGridCard({ task, onToggleDone, onEdit, isUpdating }: TaskGridCardProps) {
  const due = dueBadge(task.dueDate, task.status);
  const isDone = task.status === 'done';
  return (
    <div
      className={cn(
        'bg-white rounded-lg border shadow-sm flex flex-col overflow-hidden hover:shadow-md transition-shadow border-l-4 cursor-pointer group',
        priorityBorderClass(task.priority),
        isDone && 'opacity-60',
      )}
      onClick={onEdit}
      data-testid={`card-mission-task-${task.id}`}
    >
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-start gap-2">
            <button
              className="mt-0.5 shrink-0"
              onClick={e => { e.stopPropagation(); onToggleDone(); }}
              disabled={isUpdating}
            >
              {statusIcon(task.status)}
            </button>
            <h3 className={cn('font-medium text-slate-900 leading-snug text-sm', isDone && 'line-through text-slate-500')}>
              {task.title}
            </h3>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="text-slate-400 hover:text-slate-600 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={e => e.stopPropagation()}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</DropdownMenuItem>
              <DropdownMenuItem onClick={e => { e.stopPropagation(); onToggleDone(); }}>
                {isDone ? 'Reopen' : 'Mark Done'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="mt-auto pt-1 flex flex-wrap gap-2 items-center">
          {task.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
              {task.category}
            </span>
          )}
          {due && (
            <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', due.cls)}>
              {due.label}
            </span>
          )}
        </div>
      </div>
      <div className="px-4 py-2.5 bg-slate-50 border-t flex justify-between items-center text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
            ME
          </div>
          <span>Me</span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] px-1.5 py-0 border-0',
            task.priority === 'critical' ? 'bg-red-50 text-red-600' :
            task.priority === 'high' ? 'bg-amber-50 text-amber-600' :
            task.priority === 'medium' ? 'bg-blue-50 text-blue-600' :
            'bg-slate-100 text-slate-500',
          )}
        >
          {task.priority === 'critical' ? 'Urgent' : task.priority === 'high' ? 'High' :
           task.priority === 'medium' ? 'Medium' : 'Low'}
        </Badge>
      </div>
    </div>
  );
}

export function Layout2MissionTabs({
  tasks, allTasks, projectTasks, isLoading, isUpdating,
  onToggleDone, onEdit, onAdd, currentUser, stats,
}: TaskLayoutProps) {
  const [activeTab, setActiveTab] = useState<TabId>('my-tasks');
  const [activeFilter, setActiveFilter] = useState<FilterLabel>('All');
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const q = searchQuery.toLowerCase().trim();
  const ui = currentUser?.fullName ? initials(currentUser.fullName) : 'ME';

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(t => {
        if (activeFilter === 'All') return t.status !== 'cancelled';
        if (activeFilter === 'Todo') return t.status === 'todo';
        if (activeFilter === 'In Progress') return t.status === 'inprogress';
        if (activeFilter === 'Overdue') return isOverdue(t.dueDate, t.status);
        if (activeFilter === 'Done') return t.status === 'done';
        return true;
      })
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.category ?? '').toLowerCase().includes(q));
  }, [tasks, activeFilter, q]);

  const FILTERS: FilterLabel[] = ['All', 'Todo', 'In Progress', 'Overdue', 'Done'];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-[#0F2041] text-white shrink-0">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-600 flex items-center justify-center font-bold select-none">P</div>
            <h1 className="text-xl font-semibold tracking-tight">PACT Command Center</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search tasks…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-md py-1.5 pl-9 pr-4 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
                data-testid="input-mission-search"
              />
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-600 border border-white/20 flex items-center justify-center text-sm font-medium">
              {ui}
            </div>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="px-6 bg-white border-b flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 py-3 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300',
              )}
              data-testid={`tab-mission-${tab.id}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Calendar connect banner */}
      {!calendarConnected && (
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-2.5 flex items-center justify-between z-10">
          <div className="flex items-center gap-2 text-blue-800 text-sm">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Connect your PACT email to enable calendar sync and scheduling.</span>
          </div>
          <button
            onClick={() => setCalendarConnected(true)}
            className="text-sm font-medium text-blue-700 bg-white px-3 py-1 rounded border border-blue-200 hover:bg-blue-50 transition-colors whitespace-nowrap"
          >
            Connect Email
          </button>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">

          {/* My Tasks Tab */}
          {activeTab === 'my-tasks' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row justify-between gap-3 sm:items-center">
                <div className="flex gap-2 flex-wrap">
                  {FILTERS.map(f => (
                    <button
                      key={f}
                      onClick={() => setActiveFilter(f)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
                        activeFilter === f
                          ? 'bg-slate-800 text-white'
                          : f === 'Overdue'
                            ? 'bg-red-50 border border-red-100 text-red-600 hover:bg-red-100'
                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
                      )}
                    >
                      {f}
                      <span className="ml-1.5 text-xs">
                        {f === 'All' ? stats.all : f === 'Todo' ? stats.todo : f === 'In Progress' ? stats.inprogress : f === 'Overdue' ? stats.overdue : stats.done}
                      </span>
                    </button>
                  ))}
                </div>
                <Button
                  className="bg-[#1D3461] hover:bg-[#0F2041] text-white shadow-sm"
                  onClick={onAdd}
                  data-testid="button-mission-add"
                >
                  <Plus className="w-4 h-4 mr-1" /> Add Task
                </Button>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
                </div>
              ) : filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-4" />
                  <p className="text-lg font-medium text-slate-600">All clear!</p>
                  <p className="text-sm text-slate-400 mt-1">No tasks match this filter.</p>
                  <Button className="mt-4 bg-[#1D3461] text-white" onClick={onAdd}>
                    <Plus className="w-4 h-4 mr-1" /> Add Task
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredTasks.map(task => (
                    <TaskGridCard
                      key={task.id}
                      task={task}
                      onToggleDone={() => onToggleDone(task)}
                      onEdit={() => onEdit(task)}
                      isUpdating={isUpdating}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Project Tasks Tab */}
          {activeTab === 'project' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">Assigned Project Tasks</h2>
                <Badge variant="outline" className="text-slate-600">{projectTasks.length} tasks</Badge>
              </div>
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
                </div>
              ) : projectTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <Users className="w-12 h-12 text-slate-300 mb-4" />
                  <p className="text-slate-500">No project tasks assigned to you.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projectTasks.map(pt => {
                    const due = pt.dueDate ? dueBadge(String(pt.dueDate), String(pt.status ?? '')) : null;
                    return (
                      <div key={pt.id} className="bg-white rounded-lg border border-l-4 border-l-teal-500 shadow-sm p-4 hover:shadow-md transition-shadow">
                        <p className="font-medium text-slate-900 text-sm leading-snug mb-2">{pt.title}</p>
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-medium">{pt.projectName}</span>
                          {due && (
                            <span className={cn('text-xs px-2 py-0.5 rounded font-medium', due.cls)}>{due.label}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Calendar Tab */}
          {activeTab === 'calendar' && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <CalendarIcon className="w-16 h-16 text-slate-200 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">Schedule View</h3>
              <p className="text-slate-500 max-w-md">Connect your PACT email calendar to see tasks alongside meetings.</p>
              {!calendarConnected && (
                <Button className="mt-5 bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setCalendarConnected(true)}>
                  Connect Calendar
                </Button>
              )}
            </div>
          )}

          {/* Planning Tab */}
          {activeTab === 'planning' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 bg-white rounded-xl border shadow-sm p-5">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2 text-sm">
                  <Target className="w-4 h-4 text-blue-600" /> Daily Briefing
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-sm text-slate-600">
                    You have <strong className="text-slate-900">{stats.overdue}</strong> overdue tasks and{' '}
                    <strong className="text-slate-900">{tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length}</strong> critical priority items.
                  </div>
                  <div className="flex justify-between items-center text-sm border-t pt-3">
                    <span className="text-slate-500">Total Active</span>
                    <span className="font-semibold text-slate-800">{stats.all}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Completed</span>
                    <span className="font-semibold text-emerald-600">{stats.done}</span>
                  </div>
                </div>
              </div>
              <div className="lg:col-span-2 bg-white rounded-xl border shadow-sm p-5">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2 text-sm">
                  <LayoutDashboard className="w-4 h-4 text-indigo-600" /> Priority Matrix
                </h3>
                <div className="grid grid-cols-2 grid-rows-2 gap-3 h-56">
                  {[
                    { label: 'Urgent & Important', cls: 'bg-red-50 border-red-100 text-red-800', count: tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length },
                    { label: 'Important, Not Urgent', cls: 'bg-amber-50 border-amber-100 text-amber-800', count: tasks.filter(t => t.priority === 'high' && t.status !== 'done').length },
                    { label: 'Urgent, Not Important', cls: 'bg-blue-50 border-blue-100 text-blue-800', count: tasks.filter(t => t.priority === 'medium' && t.status !== 'done').length },
                    { label: 'Neither', cls: 'bg-slate-50 border-slate-200 text-slate-600', count: tasks.filter(t => t.priority === 'low' && t.status !== 'done').length },
                  ].map((q, i) => (
                    <div key={i} className={cn('rounded-lg p-3 border flex flex-col', q.cls)}>
                      <span className="text-[10px] font-bold uppercase tracking-wider mb-2 opacity-70">{q.label}</span>
                      <span className="text-2xl font-bold">{q.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
