import React from "react";
import { format, addDays, startOfToday } from "date-fns";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  MoreVertical,
  Settings,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";

// --- Data Models ---
type TaskType = "personal" | "project" | "collaborative" | "dept";
type TaskStatus = "todo" | "in_progress" | "review" | "done";

interface Task {
  id: string;
  title: string;
  type: TaskType;
  status: TaskStatus;
  priority: "high" | "medium" | "low";
  dueDate: Date;
  startDate?: Date; // For Gantt
  duration?: number; // In days, for Gantt
  assignee?: { name: string; initials: string };
}

const today = startOfToday();

const TASKS: Task[] = [
  // Personal
  {
    id: "t1",
    title: "Submit Q3 Expense Report",
    type: "personal",
    status: "todo",
    priority: "medium",
    dueDate: addDays(today, 2),
    startDate: today,
    duration: 3,
  },
  {
    id: "t2",
    title: "Complete Safety Training",
    type: "personal",
    status: "done",
    priority: "high",
    dueDate: addDays(today, -1),
    startDate: addDays(today, -3),
    duration: 2,
  },
  // Project
  {
    id: "t3",
    title: "Site Survey: North District",
    type: "project",
    status: "in_progress",
    priority: "high",
    dueDate: addDays(today, 4),
    startDate: addDays(today, 1),
    duration: 4,
  },
  {
    id: "t4",
    title: "Draft Initial Findings",
    type: "project",
    status: "todo",
    priority: "medium",
    dueDate: addDays(today, 8),
    startDate: addDays(today, 5),
    duration: 4,
  },
  {
    id: "t5",
    title: "Review Contractor Bids",
    type: "project",
    status: "review",
    priority: "high",
    dueDate: addDays(today, 1),
    startDate: addDays(today, -2),
    duration: 4,
  },
  // Collaborative
  {
    id: "t6",
    title: "Weekly Coordination Call",
    type: "collaborative",
    status: "todo",
    priority: "medium",
    dueDate: addDays(today, 3),
    startDate: addDays(today, 3),
    duration: 1,
    assignee: { name: "Sarah Jenkins", initials: "SJ" },
  },
  {
    id: "t7",
    title: "Finalize Vendor Contracts",
    type: "collaborative",
    status: "in_progress",
    priority: "high",
    dueDate: addDays(today, 6),
    startDate: today,
    duration: 7,
    assignee: { name: "Marcus Thorne", initials: "MT" },
  },
  // Dept
  {
    id: "t8",
    title: "Quarterly Audit Prep",
    type: "dept",
    status: "todo",
    priority: "low",
    dueDate: addDays(today, 12),
    startDate: addDays(today, 9),
    duration: 4,
  },
];

const SWIM_LANES: { id: TaskType; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "project", label: "Project" },
  { id: "collaborative", label: "Collaborative" },
  { id: "dept", label: "Department" },
];

const STATUS_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "todo", label: "TO DO" },
  { id: "in_progress", label: "IN PROGRESS" },
  { id: "review", label: "REVIEW" },
  { id: "done", label: "DONE" },
];

const TEAM_MEMBERS = [
  { name: "Alex Chen", initials: "AC", tasks: 4 },
  { name: "Sarah Jenkins", initials: "SJ", tasks: 7 },
  { name: "Marcus Thorne", initials: "MT", tasks: 2 },
  { name: "Elena Rostova", initials: "ER", tasks: 5 },
  { name: "David Kim", initials: "DK", tasks: 1 },
];

// --- Helpers ---
const getTypeColor = (type: TaskType) => {
  switch (type) {
    case "personal":
      return "bg-blue-500";
    case "project":
      return "bg-teal-500";
    case "collaborative":
      return "bg-purple-500";
    case "dept":
      return "bg-amber-500";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "high":
      return "bg-red-500";
    case "medium":
      return "bg-amber-500";
    case "low":
      return "bg-slate-400";
    default:
      return "bg-slate-400";
  }
};

// --- Components ---

function LeftNav() {
  return (
    <div className="w-16 flex-shrink-0 bg-[#0F2041] flex flex-col items-center py-4 border-r border-[#1a365d]">
      <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mb-8">
        <span className="text-white font-bold text-xs">PACT</span>
      </div>

      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col gap-4 flex-1 w-full px-2">
          <NavItem icon={<CheckCircle2 size={20} />} label="My Tasks" active />
          <NavItem icon={<CalendarDays size={20} />} label="Calendar" />
          <NavItem icon={<Users size={20} />} label="Team" />
          <NavItem icon={<LayoutDashboard size={20} />} label="Planning" />
        </div>

        <div className="mt-auto px-2">
          <NavItem icon={<Settings size={20} />} label="Settings" />
        </div>
      </TooltipProvider>
    </div>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={`w-full aspect-square flex items-center justify-center rounded-xl transition-colors ${
            active ? "bg-white/20 text-white" : "text-slate-400 hover:text-white hover:bg-white/10"
          }`}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="bg-[#0F2041] border-[#1a365d] text-white">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function GanttZone() {
  const days = Array.from({ length: 14 }).map((_, i) => addDays(today, i));

  return (
    <div className="h-[30%] min-h-[250px] border-b border-slate-200 bg-white flex flex-col relative overflow-hidden">
      <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <h2 className="font-semibold text-[#0F2041] flex items-center gap-2">
          <Clock size={16} className="text-slate-400" />
          14-Day Outlook
        </h2>
        <div className="flex gap-4 text-xs font-medium">
          <span className="flex items-center gap-1.5 text-slate-600"><div className="w-2.5 h-2.5 rounded-full bg-blue-500" />Personal</span>
          <span className="flex items-center gap-1.5 text-slate-600"><div className="w-2.5 h-2.5 rounded-full bg-teal-500" />Project</span>
          <span className="flex items-center gap-1.5 text-slate-600"><div className="w-2.5 h-2.5 rounded-full bg-purple-500" />Collaborative</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <ScrollArea className="flex-1" orientation="horizontal">
          <div className="min-w-[1000px] h-full flex flex-col pb-4">
            {/* Days Header */}
            <div className="flex border-b border-slate-100 sticky top-0 bg-white z-10">
              {days.map((day, i) => (
                <div key={i} className="flex-1 min-w-[80px] py-2 text-center border-r border-slate-100 last:border-r-0">
                  <div className="text-[10px] uppercase text-slate-400 font-semibold">{format(day, "EEE")}</div>
                  <div className={`text-sm font-medium ${i === 0 ? "text-blue-600" : "text-slate-700"}`}>
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>

            {/* Grid & Bars */}
            <div className="flex-1 relative flex mt-2">
              {/* Background Grid Lines */}
              {days.map((_, i) => (
                <div key={i} className="flex-1 min-w-[80px] border-r border-slate-50 last:border-r-0" />
              ))}

              {/* Task Bars Layer */}
              <div className="absolute inset-0 p-2 flex flex-col gap-2 overflow-y-auto">
                {TASKS.filter((t) => t.startDate && t.duration).map((task) => {
                  // Calculate position based on start date relative to today
                  const startDiff = Math.max(0, Math.floor((task.startDate!.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                  const duration = task.duration!;
                  
                  // Skip if completely outside the 14-day window
                  if (startDiff >= 14) return null;
                  
                  // Adjust duration if it extends past 14 days
                  const visibleDuration = Math.min(duration, 14 - startDiff);

                  return (
                    <div
                      key={task.id}
                      className="h-8 rounded-md flex items-center px-3 text-xs font-medium text-white shadow-sm hover:opacity-90 cursor-pointer transition-opacity relative group"
                      style={{
                        marginLeft: `${(startDiff / 14) * 100}%`,
                        width: `${(visibleDuration / 14) * 100}%`,
                        backgroundColor: task.type === 'personal' ? '#3b82f6' : task.type === 'project' ? '#14b8a6' : task.type === 'collaborative' ? '#a855f7' : '#f59e0b'
                      }}
                    >
                      <span className="truncate">{task.title}</span>
                      <div className="absolute top-full left-0 mt-1 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none z-50 whitespace-nowrap">
                        {format(task.startDate!, "MMM d")} - {format(addDays(task.startDate!, duration - 1), "MMM d")}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}

function KanbanBoard() {
  return (
    <div className="h-[70%] flex flex-col bg-slate-50/50">
      <div className="px-6 py-3 border-b border-slate-200 bg-white flex items-center justify-between flex-shrink-0">
        <h2 className="font-semibold text-[#0F2041]">Board View</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8">Filter</Button>
          <Button size="sm" className="h-8 bg-[#0F2041] hover:bg-[#1a365d]">New Task</Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 min-w-[1000px]">
          {/* Status Headers */}
          <div className="flex mb-4 ml-32">
            {STATUS_COLUMNS.map((col) => (
              <div key={col.id} className="flex-1 px-2">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  {col.label}
                  <span className="ml-2 text-slate-400 font-normal">
                    {TASKS.filter(t => t.status === col.id).length}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Swim Lanes */}
          <div className="flex flex-col gap-6">
            {SWIM_LANES.map((lane) => {
              const laneTasks = TASKS.filter((t) => t.type === lane.id);
              if (laneTasks.length === 0) return null;

              return (
                <div key={lane.id} className="flex relative">
                  {/* Lane Label */}
                  <div className="w-32 flex-shrink-0 pr-4 pt-2">
                    <div className="sticky top-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${getTypeColor(lane.id as TaskType)}`} />
                        <h3 className="font-semibold text-sm text-slate-700">{lane.label}</h3>
                      </div>
                      <p className="text-xs text-slate-500">{laneTasks.length} tasks</p>
                    </div>
                  </div>

                  {/* Lane Columns */}
                  <div className="flex-1 flex gap-4 bg-white/50 rounded-xl p-2 border border-slate-100">
                    {STATUS_COLUMNS.map((col) => (
                      <div key={col.id} className="flex-1 flex flex-col gap-3 min-h-[100px]">
                        {laneTasks
                          .filter((t) => t.status === col.id)
                          .map((task) => (
                            <TaskCard key={task.id} task={task} />
                          ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Admin Extra Row */}
            <div className="flex relative mt-4 border-t border-slate-200 pt-6">
               <div className="w-32 flex-shrink-0 pr-4 pt-2">
                  <div className="sticky top-4">
                    <h3 className="font-semibold text-sm text-slate-700">Org Overview</h3>
                    <Badge variant="outline" className="mt-1 text-[10px] bg-slate-100">Admin Only</Badge>
                  </div>
                </div>
                <div className="flex-1 bg-white rounded-xl border border-slate-200 p-4">
                    <div className="grid grid-cols-5 gap-4">
                      {TEAM_MEMBERS.map((member, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-slate-300 transition-colors bg-slate-50/50">
                          <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
                            <AvatarFallback className="bg-[#0F2041] text-white text-xs">{member.initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="text-sm font-medium text-slate-700">{member.name}</div>
                            <div className="text-xs text-slate-500">{member.tasks} active tasks</div>
                          </div>
                        </div>
                      ))}
                    </div>
                </div>
            </div>
          </div>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  return (
    <Card className="shadow-sm border-slate-200 hover:border-slate-300 hover:shadow transition-all cursor-pointer group">
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h4 className="text-sm font-medium leading-snug text-slate-800 line-clamp-2">
            {task.title}
          </h4>
          <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 -mr-1 -mt-1 flex-shrink-0">
            <MoreVertical size={14} className="text-slate-400" />
          </Button>
        </div>
        
        <div className="flex items-center justify-between mt-auto pt-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${getPriorityColor(task.priority)}`} />
            <span className={`text-[11px] font-medium ${
              task.dueDate < today ? "text-red-600" : "text-slate-500"
            }`}>
              {format(task.dueDate, "MMM d")}
            </span>
          </div>
          
          {task.assignee && (
            <Avatar className="h-5 w-5 border border-white shadow-sm">
              <AvatarFallback className="text-[9px] bg-slate-200 text-slate-700">
                {task.assignee.initials}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function BoardGantt() {
  return (
    <div className="flex h-screen w-full bg-slate-50 font-sans overflow-hidden">
      <LeftNav />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <GanttZone />
        <KanbanBoard />
      </div>
    </div>
  );
}
