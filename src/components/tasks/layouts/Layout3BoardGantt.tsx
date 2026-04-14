import { useState, useMemo } from 'react';
import { format, addDays, startOfDay, differenceInCalendarDays, parseISO, isValid, isBefore } from 'date-fns';
import {
  CheckCircle2, Clock, CalendarDays, LayoutDashboard, Users,
  Settings, MoreVertical, Plus, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { TaskLayoutProps, PersonalTask, AssignedProjectTask } from './LayoutTypes';

// ── Helpers ──────────────────────────────────────────────────────────────────

function isOverdue(due?: string | null, status?: string) {
  if (!due || status === 'done' || status === 'cancelled') return false;
  try { const d = parseISO(due); return isValid(d) && isBefore(startOfDay(d), startOfDay(new Date())); }
  catch { return false; }
}

function getTypeColor(category?: string | null) {
  if (category === 'project-task') return 'bg-teal-500';
  if (category === 'collaborative') return 'bg-purple-500';
  return 'bg-blue-500';
}

function getTypeBg(category?: string | null) {
  if (category === 'project-task') return 'bg-teal-50 border-teal-200 hover:border-teal-400';
  if (category === 'collaborative') return 'bg-purple-50 border-purple-200 hover:border-purple-400';
  return 'bg-blue-50 border-blue-200 hover:border-blue-400';
}

function priorityDot(priority: string) {
  if (priority === 'critical') return 'bg-red-500';
  if (priority === 'high') return 'bg-amber-500';
  if (priority === 'medium') return 'bg-blue-500';
  return 'bg-slate-400';
}

function initials(name?: string | null) {
  if (!name) return 'ME';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── Left Nav ─────────────────────────────────────────────────────────────────

function LeftNav() {
  return (
    <div className="w-16 flex-shrink-0 bg-[#0F2041] flex flex-col items-center py-4 border-r border-[#1a365d]">
      <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mb-8 select-none">
        <span className="text-white font-bold text-xs">P</span>
      </div>
      <div className="flex flex-col gap-4 flex-1 w-full px-2">
        {[
          { icon: CheckCircle2, label: 'Tasks', active: true },
          { icon: CalendarDays,  label: 'Calendar' },
          { icon: Users,         label: 'Team' },
          { icon: LayoutDashboard, label: 'Planning' },
        ].map((item, i) => (
          <button
            key={i}
            title={item.label}
            className={cn(
              'w-full aspect-square flex items-center justify-center rounded-xl transition-colors relative',
              item.active ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white hover:bg-white/10',
            )}
          >
            <item.icon className="w-5 h-5" />
            {item.active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-400 rounded-r-full" />}
          </button>
        ))}
      </div>
      <div className="mt-auto px-2">
        <button title="Settings" className="w-full aspect-square flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

// ── Gantt Zone ────────────────────────────────────────────────────────────────

interface GanttProps {
  tasks: PersonalTask[];
  projectTasks: AssignedProjectTask[];
}
function GanttZone({ tasks, projectTasks }: GanttProps) {
  const today = startOfDay(new Date());
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  // Build bars from tasks with due dates
  const bars = useMemo(() => {
    const result: { title: string; category?: string | null; startDiff: number; duration: number }[] = [];
    const allItems = [
      ...tasks.map(t => ({ title: t.title, category: t.category, due: t.dueDate, created: t.createdAt })),
      ...projectTasks.map(pt => ({ title: String(pt.title ?? ''), category: 'project-task', due: pt.dueDate ? String(pt.dueDate) : null, created: null })),
    ];
    allItems.forEach(item => {
      if (!item.due) return;
      try {
        const dueDate = parseISO(item.due);
        if (!isValid(dueDate)) return;
        const endDiff = differenceInCalendarDays(startOfDay(dueDate), today);
        if (endDiff < 0 || endDiff >= 14) return;
        const startDiff = Math.max(0, endDiff - 1);
        const duration = Math.max(1, endDiff - startDiff + 1);
        result.push({ title: item.title, category: item.category, startDiff, duration });
      } catch {}
    });
    return result.slice(0, 8);
  }, [tasks, projectTasks, today]);

  return (
    <div className="h-[38%] min-h-[220px] border-b border-slate-200 bg-white flex flex-col overflow-hidden">
      <div className="px-5 py-2.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
        <h2 className="font-semibold text-[#0F2041] flex items-center gap-2 text-sm">
          <Clock className="w-4 h-4 text-slate-400" />
          14-Day Outlook
        </h2>
        <div className="flex gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-slate-600"><div className="w-2 h-2 rounded-full bg-blue-500" />Personal</span>
          <span className="flex items-center gap-1.5 text-slate-600"><div className="w-2 h-2 rounded-full bg-teal-500" />Project</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="min-w-[900px] flex flex-col" style={{ height: '100%' }}>
            {/* Days header */}
            <div className="flex border-b border-slate-100 bg-white sticky top-0 z-10 shrink-0">
              {days.map((day, i) => (
                <div key={i} className="flex-1 min-w-[60px] py-1.5 text-center border-r border-slate-100 last:border-r-0">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">{format(day, 'EEE')}</div>
                  <div className={cn('text-sm font-medium', i === 0 ? 'text-blue-600' : 'text-slate-700')}>{format(day, 'd')}</div>
                </div>
              ))}
            </div>
            {/* Grid & bars */}
            <div className="flex-1 relative flex" style={{ minHeight: '120px' }}>
              {days.map((_, i) => (
                <div key={i} className={cn('flex-1 min-w-[60px] border-r border-slate-50 last:border-r-0', i === 0 && 'bg-blue-50/30')} />
              ))}
              <div className="absolute inset-0 p-2 flex flex-col gap-1.5">
                {bars.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-xs text-slate-400">No tasks due in the next 14 days</div>
                ) : bars.map((bar, i) => (
                  <div
                    key={i}
                    className={cn(
                      'h-7 rounded flex items-center px-2.5 text-xs font-medium text-white shadow-sm hover:opacity-90 transition-opacity cursor-pointer truncate',
                      bar.category === 'project-task' ? 'bg-teal-500' : bar.category === 'collaborative' ? 'bg-purple-500' : 'bg-blue-500',
                    )}
                    style={{
                      marginLeft: `${(bar.startDiff / 14) * 100}%`,
                      width: `${(bar.duration / 14) * 100}%`,
                    }}
                    title={bar.title}
                  >
                    {bar.title}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}

// ── Kanban Board ──────────────────────────────────────────────────────────────

type LaneKey = 'personal' | 'project' | 'collaborative';
type ColKey = 'todo' | 'inprogress' | 'done';

const LANES: { id: LaneKey; label: string }[] = [
  { id: 'personal', label: 'Personal' },
  { id: 'project', label: 'Project' },
  { id: 'collaborative', label: 'Collaborative' },
];
const COLS: { id: ColKey; label: string }[] = [
  { id: 'todo', label: 'TO DO' },
  { id: 'inprogress', label: 'IN PROGRESS' },
  { id: 'done', label: 'DONE' },
];

function laneKey(task: PersonalTask): LaneKey {
  if (task.category === 'project-task') return 'project';
  if (task.category === 'collaborative' || (task.coAssignees && (task.coAssignees as unknown[]).length > 0)) return 'collaborative';
  return 'personal';
}

interface KanbanCardProps {
  task: PersonalTask;
  onEdit: () => void;
  onToggleDone: () => void;
}
function KanbanCard({ task, onEdit, onToggleDone }: KanbanCardProps) {
  const due = task.dueDate ? (() => {
    try { const d = parseISO(task.dueDate!); return isValid(d) ? format(d, 'MMM d') : null; } catch { return null; }
  })() : null;
  return (
    <div
      className="bg-white rounded-lg border border-slate-200 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer p-3 group"
      onClick={onEdit}
      data-testid={`kanban-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-slate-800 leading-snug line-clamp-2">{task.title}</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              onClick={e => e.stopPropagation()}
            >
              <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onEdit(); }}>Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={e => { e.stopPropagation(); onToggleDone(); }}>
              {task.status === 'done' ? 'Reopen' : 'Mark Done'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={cn('w-2 h-2 rounded-full', priorityDot(task.priority))} />
          {due && (
            <span className={cn('text-[10px]', isOverdue(task.dueDate, task.status) ? 'text-red-500 font-semibold' : 'text-slate-400')}>
              {due}
            </span>
          )}
        </div>
        <Avatar className="h-5 w-5">
          <AvatarFallback className="text-[9px] bg-slate-200 text-slate-600">ME</AvatarFallback>
        </Avatar>
      </div>
    </div>
  );
}

interface KanbanProps {
  tasks: PersonalTask[];
  onEdit: (task: PersonalTask) => void;
  onToggleDone: (task: PersonalTask) => void;
  onAdd: () => void;
  isLoading: boolean;
}
function KanbanBoard({ tasks, onEdit, onToggleDone, onAdd, isLoading }: KanbanProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
      <div className="px-5 py-2.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-[#0F2041] text-sm">Board View</h2>
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs bg-[#0F2041] hover:bg-[#1a365d]" onClick={onAdd}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New Task
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-5 min-w-[900px]">
            {/* Column headers */}
            <div className="flex mb-3 ml-28">
              {COLS.map(col => (
                <div key={col.id} className="flex-1 px-2">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    {col.label}
                    <span className="ml-2 font-normal text-slate-400">
                      {tasks.filter(t => t.status === col.id || (col.id === 'inprogress' && t.status === 'inprogress')).length}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {/* Swim lanes */}
            <div className="flex flex-col gap-5">
              {LANES.map(lane => {
                const laneTasks = tasks.filter(t => laneKey(t) === lane.id);
                return (
                  <div key={lane.id} className="flex">
                    <div className="w-28 flex-shrink-0 pr-3 pt-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className={cn('w-2 h-2 rounded-full', getTypeColor(lane.id === 'project' ? 'project-task' : lane.id === 'collaborative' ? 'collaborative' : null))} />
                        <h3 className="font-semibold text-xs text-slate-700">{lane.label}</h3>
                      </div>
                      <p className="text-xs text-slate-400">{laneTasks.length} tasks</p>
                    </div>
                    <div className="flex-1 flex gap-3 bg-white/60 rounded-xl p-2 border border-slate-100">
                      {COLS.map(col => {
                        const colTasks = laneTasks.filter(t =>
                          col.id === 'inprogress' ? t.status === 'inprogress' :
                          col.id === 'done' ? t.status === 'done' :
                          t.status === 'todo'
                        );
                        return (
                          <div key={col.id} className="flex-1 flex flex-col gap-2 min-h-[60px]">
                            {colTasks.map(task => (
                              <KanbanCard
                                key={task.id}
                                task={task}
                                onEdit={() => onEdit(task)}
                                onToggleDone={() => onToggleDone(task)}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function Layout3BoardGantt({ tasks, projectTasks, isLoading, isUpdating, onToggleDone, onEdit, onAdd }: TaskLayoutProps) {
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden">
      <LeftNav />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <GanttZone tasks={tasks} projectTasks={projectTasks} />
        <KanbanBoard tasks={tasks} onEdit={onEdit} onToggleDone={onToggleDone} onAdd={onAdd} isLoading={isLoading} />
      </div>
    </div>
  );
}
