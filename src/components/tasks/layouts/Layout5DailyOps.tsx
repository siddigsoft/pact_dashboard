import { useState } from 'react';
import { format, addDays, subDays, parseISO, isValid, isToday } from 'date-fns';
import {
  CheckCircle2, Circle, Play, Plus, Lock, Users, Calendar as CalendarIcon,
  Briefcase, LayoutGrid, ChevronDown, Clock, AlertTriangle, MoreHorizontal, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskLayoutProps, PersonalTask, AssignedProjectTask } from './LayoutTypes';

// ── Helpers ───────────────────────────────────────────────────────────────────

function dueFmt(due?: string | null) {
  if (!due) return null;
  try { const d = parseISO(due); return isValid(d) ? format(d, 'h:mm a') : null; } catch { return null; }
}

function isHigh(t: PersonalTask) { return t.priority === 'critical' || t.priority === 'high'; }

function initials(name?: string | null) {
  if (!name) return 'ME';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Personal Task Card ────────────────────────────────────────────────────────

interface PersonalCardProps {
  task: PersonalTask;
  onToggle: () => void;
  onEdit: () => void;
}
function PersonalCard({ task, onToggle, onEdit }: PersonalCardProps) {
  const done = task.status === 'done';
  return (
    <Card
      className={cn(
        'border-l-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer group',
        done ? 'border-l-emerald-400 opacity-60' : 'border-l-blue-500',
      )}
      onClick={onEdit}
      data-testid={`dailyops-personal-${task.id}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <button
            className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-500 transition-colors"
            onClick={e => { e.stopPropagation(); onToggle(); }}
          >
            {done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4" />}
          </button>
          <div className="flex-1 min-w-0">
            <p className={cn('text-xs font-medium truncate', done ? 'line-through text-slate-400' : 'text-slate-800')}>
              {task.title}
            </p>
            {task.dueDate && (
              <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                <Clock className="w-2.5 h-2.5" /> {dueFmt(task.dueDate) || format(parseISO(task.dueDate!), 'MMM d')}
              </p>
            )}
          </div>
          {isHigh(task) && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Project Task Card ─────────────────────────────────────────────────────────

function ProjectCard({ task }: { task: AssignedProjectTask }) {
  return (
    <Card className="shadow-sm border-l-4 border-l-indigo-500 hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex items-start gap-2.5">
          <Circle className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-800 leading-snug truncate">{task.title}</p>
            <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700 font-medium px-1.5 py-0 mt-1.5 truncate max-w-full">
              {task.projectName}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Calendar Ribbon ───────────────────────────────────────────────────────────

interface CalendarRibbonProps {
  tasks: PersonalTask[];
  selectedDate: Date;
  onSelectDate: (d: Date) => void;
}
function CalendarRibbon({ tasks, selectedDate, onSelectDate }: CalendarRibbonProps) {
  const today = new Date();
  const calendarDays = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(subDays(today, 3), i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const hasTasks = tasks.some(t => {
      if (!t.dueDate) return false;
      try { return format(parseISO(t.dueDate), 'yyyy-MM-dd') === dateStr; } catch { return false; }
    });
    return { date, isToday: isToday(date), hasTasks, isSelected: format(date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd') };
  });

  return (
    <div className="bg-white border-t border-slate-200 shrink-0 shadow-[0_-4px_10px_rgba(0,0,0,0.03)]">
      <div className="flex items-center justify-center gap-1 px-4 py-2">
        {calendarDays.map((day, idx) => (
          <button
            key={idx}
            onClick={() => onSelectDate(day.date)}
            className={cn(
              'flex flex-col items-center justify-center w-11 h-13 rounded-xl transition-colors py-1.5 px-1',
              day.isSelected
                ? 'bg-[#0F2041] text-white shadow-md'
                : 'hover:bg-slate-100 text-slate-600',
            )}
          >
            <span className={cn('text-[9px] font-bold uppercase tracking-wider', day.isSelected ? 'text-blue-200' : 'text-slate-400')}>
              {format(day.date, 'EEE')}
            </span>
            <span className={cn('text-base font-bold leading-none mt-0.5', day.isSelected ? 'text-white' : 'text-slate-800')}>
              {format(day.date, 'd')}
            </span>
            <div className="h-1 flex items-center justify-center mt-0.5">
              {day.hasTasks && <div className={cn('w-1 h-1 rounded-full', day.isSelected ? 'bg-emerald-400' : 'bg-slate-400')} />}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function Layout5DailyOps({
  tasks, projectTasks, isLoading, isUpdating,
  onToggleDone, onEdit, onAdd, currentUser, stats,
}: TaskLayoutProps) {
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(today);
  const [expandedMember, setExpandedMember] = useState<number | null>(null);

  const ui = initials(currentUser?.fullName);
  const firstName = currentUser?.fullName ? currentUser.fullName.split(' ')[0] : 'there';

  const personal = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const done = tasks.filter(t => t.status === 'done').length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const todayFocus = tasks.find(t => t.priority === 'critical' && t.status !== 'done') ||
                     tasks.find(t => t.priority === 'high' && t.status !== 'done');

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Collaborative: tasks that have co_assignees or are category collaborative
  const collaborative = tasks.filter(t => t.category === 'collaborative');

  // Team members mock
  const TEAM = [
    { id: 1, name: 'Field Team A', role: 'Field Ops', tasks: stats.all, overdue: stats.overdue },
  ];

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Top Banner */}
      <header className="bg-[#0F2041] text-white px-5 py-4 flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 shadow-md z-10 relative gap-4">
        <div className="flex items-center gap-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{greeting}, {firstName} 👋</h1>
            <p className="text-slate-300 text-sm mt-0.5">{format(today, 'EEEE, MMMM do, yyyy')}</p>
          </div>
          {/* Progress ring */}
          <div className="hidden md:flex items-center gap-2 pl-5 border-l border-white/20">
            <div className="relative w-11 h-11">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#10b981" strokeWidth="3"
                  strokeDasharray={`${pct}, 100`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold">{pct}%</span>
            </div>
            <div className="text-sm">
              <div className="font-semibold text-emerald-400">{pct}% Complete</div>
              <div className="text-slate-300 text-xs">Daily Tasks</div>
            </div>
          </div>
        </div>

        {todayFocus ? (
          <div className="bg-white/10 rounded-xl p-3 flex items-center gap-4 border border-white/10 w-full md:w-auto backdrop-blur-sm">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-0.5">Today's Focus</div>
              <div className="font-medium text-sm truncate">{todayFocus.title}</div>
              <div className="text-[10px] text-slate-300 mt-0.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> {todayFocus.priority === 'critical' ? 'Urgent' : 'High priority'}
              </div>
            </div>
            <Button
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold gap-1 shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
              onClick={() => onEdit(todayFocus)}
            >
              <Play className="w-3.5 h-3.5 fill-current" /> START
            </Button>
          </div>
        ) : (
          <div className="bg-emerald-500/20 border border-emerald-400/30 rounded-xl p-3 flex items-center gap-3 w-full md:w-auto">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="text-sm font-medium">All critical tasks complete!</span>
          </div>
        )}
      </header>

      {/* Grid */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-[#1D3461]" />
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-5 pb-4">

              {/* Column 1: Personal */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                    <Circle className="w-4 h-4 text-blue-500" /> Personal Tasks
                  </h2>
                  <button
                    className="h-6 w-6 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full flex items-center justify-center transition-colors"
                    onClick={onAdd}
                    data-testid="button-dailyops-add-personal"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {personal.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                    No pending personal tasks
                  </div>
                ) : (
                  personal.map(task => (
                    <PersonalCard
                      key={task.id}
                      task={task}
                      onToggle={() => onToggleDone(task)}
                      onEdit={() => onEdit(task)}
                    />
                  ))
                )}
                <Button
                  variant="outline"
                  className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 bg-white shadow-sm border-dashed text-xs h-8"
                  onClick={onAdd}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Quick Add
                </Button>
              </div>

              {/* Column 2: Project */}
              <div className="flex flex-col gap-3">
                <h2 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                  <Briefcase className="w-4 h-4 text-indigo-500" /> Project Tasks
                </h2>
                {projectTasks.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">
                    <Briefcase className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    No project tasks assigned
                  </div>
                ) : (
                  projectTasks.map(pt => <ProjectCard key={pt.id} task={pt} />)
                )}
              </div>

              {/* Column 3: Collaborative */}
              <div className="flex flex-col gap-3">
                <h2 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                  <Users className="w-4 h-4 text-violet-500" /> Collaborative
                </h2>
                {collaborative.length === 0 ? (
                  <div className="bg-white rounded-xl border border-dashed border-slate-200 p-4 text-center">
                    <Users className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">No collaborative tasks</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 text-violet-600 border-violet-200 text-xs h-7"
                      onClick={onAdd}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Start One
                    </Button>
                  </div>
                ) : (
                  collaborative.map(task => (
                    <Card key={task.id} className="shadow-sm border-slate-200 bg-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => onEdit(task)}>
                      <CardContent className="p-3">
                        <p className="text-xs font-semibold text-slate-800 mb-1.5 leading-snug">{task.title}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="flex items-center gap-1 text-emerald-600 font-medium">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                          <Badge variant="secondary" className="text-[9px] bg-violet-50 text-violet-700 px-1.5 py-0">
                            Collaborative
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              {/* Column 4: Team Overview */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-slate-800 flex items-center gap-1.5 text-sm">
                    <LayoutGrid className="w-4 h-4 text-slate-700" /> Team Overview
                  </h2>
                  <Badge variant="outline" className="bg-slate-100 text-slate-500 gap-1 rounded-full px-2 text-[10px]">
                    <Lock className="w-2.5 h-2.5" /> Admin
                  </Badge>
                </div>

                <Card className="shadow-sm border-slate-200 bg-white">
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100">
                      {/* Summary stats */}
                      <div className="p-3 grid grid-cols-2 gap-2">
                        {[
                          { label: 'Total Tasks', value: stats.all, cls: 'text-slate-700' },
                          { label: 'Done', value: stats.done, cls: 'text-emerald-600' },
                          { label: 'In Progress', value: stats.inprogress, cls: 'text-blue-600' },
                          { label: 'Overdue', value: stats.overdue, cls: 'text-red-600' },
                        ].map(s => (
                          <div key={s.label} className="bg-slate-50 rounded-lg p-2 text-center">
                            <div className={cn('text-lg font-bold leading-none', s.cls)}>{s.value}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{s.label}</div>
                          </div>
                        ))}
                      </div>

                      {/* Progress */}
                      <div className="p-3">
                        <div className="flex justify-between text-[10px] text-slate-500 mb-1.5">
                          <span>Overall Progress</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Calendar Ribbon */}
      <CalendarRibbon tasks={tasks} selectedDate={selectedDate} onSelectDate={setSelectedDate} />
    </div>
  );
}
