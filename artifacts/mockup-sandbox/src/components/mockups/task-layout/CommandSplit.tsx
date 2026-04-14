import React, { useState } from "react";
import { 
  Calendar, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  Clock, 
  Filter, 
  LayoutDashboard, 
  ListTodo, 
  MessageSquare, 
  MoreHorizontal, 
  Plus, 
  Search, 
  Settings, 
  Users, 
  AlertCircle,
  Briefcase,
  User,
  ChevronUp,
  ChevronDown
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// --- Mock Data ---

const STATS = [
  { label: "All", value: 42, active: true },
  { label: "Todo", value: 15, active: false },
  { label: "In Progress", value: 18, active: false },
  { label: "Overdue", value: 4, active: false, alert: true },
  { label: "Pending Invites", value: 5, active: false },
];

const SIDEBAR_NAV = [
  { icon: LayoutDashboard, label: "Dashboard", active: false },
  { icon: ListTodo, label: "Tasks", active: true },
  { icon: Calendar, label: "Calendar", active: false },
  { icon: Users, label: "Team", active: false },
  { icon: MessageSquare, label: "Messages", active: false },
];

const TIMELINE_DAYS = Array.from({ length: 7 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return {
    day: d.toLocaleDateString("en-US", { weekday: "short" }),
    date: d.getDate(),
    isToday: i === 0,
  };
});

type TaskType = "personal" | "project" | "collaborative";
type Priority = "urgent" | "high" | "normal";

interface Task {
  id: string;
  title: string;
  type: TaskType;
  priority: Priority;
  dueDate: string;
  assignee: { name: string; initials: string; avatar?: string };
  status: "todo" | "in-progress" | "done";
  project?: string;
  dayOffset: number; // 0-6
  rowOffset: number; // 0-2
  span: number; // 1-3 days
}

const TASKS: Task[] = [
  {
    id: "t1",
    title: "Submit MMP Report – Kassala",
    type: "project",
    priority: "urgent",
    dueDate: "Today",
    assignee: { name: "Ahmed", initials: "AH" },
    status: "todo",
    project: "Kassala Hub",
    dayOffset: 0,
    rowOffset: 0,
    span: 2,
  },
  {
    id: "t2",
    title: "Site Visit: El-Fasher Hub",
    type: "collaborative",
    priority: "high",
    dueDate: "Tomorrow",
    assignee: { name: "Fatima", initials: "FA" },
    status: "in-progress",
    project: "El-Fasher",
    dayOffset: 1,
    rowOffset: 1,
    span: 1,
  },
  {
    id: "t3",
    title: "Review Budget - Q2",
    type: "personal",
    priority: "normal",
    dueDate: "Next Week",
    assignee: { name: "You", initials: "ME" },
    status: "todo",
    project: "Finance",
    dayOffset: 3,
    rowOffset: 0,
    span: 3,
  },
  {
    id: "t4",
    title: "Update Field Operations Protocol",
    type: "project",
    priority: "high",
    dueDate: "Today",
    assignee: { name: "You", initials: "ME" },
    status: "in-progress",
    project: "Operations",
    dayOffset: 0,
    rowOffset: 2,
    span: 1,
  },
  {
    id: "t5",
    title: "Approve Vehicle Requisition",
    type: "personal",
    priority: "urgent",
    dueDate: "Yesterday",
    assignee: { name: "Sarah", initials: "SA" },
    status: "todo",
    project: "Logistics",
    dayOffset: 0,
    rowOffset: 1,
    span: 1,
  },
  {
    id: "t6",
    title: "Weekly Coordination Meeting",
    type: "collaborative",
    priority: "normal",
    dueDate: "Friday",
    assignee: { name: "Team", initials: "TM" },
    status: "todo",
    dayOffset: 4,
    rowOffset: 2,
    span: 1,
  }
];

const PRIORITY_CONFIG = {
  urgent: { icon: AlertCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", label: "Urgent" },
  high: { icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20", label: "High" },
  normal: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20", label: "Normal" },
};

const TYPE_CONFIG = {
  personal: { color: "bg-blue-500", label: "Personal", icon: User },
  project: { color: "bg-teal-500", label: "Project", icon: Briefcase },
  collaborative: { color: "bg-purple-500", label: "Collaborative", icon: Users },
};

// --- Components ---

export function CommandSplit() {
  const [teamView, setTeamView] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(true);

  // Group tasks by priority for the right panel
  const sortedTasks = [...TASKS].sort((a, b) => {
    const order = { urgent: 0, high: 1, normal: 2 };
    return order[a.priority] - order[b.priority];
  });

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans text-slate-900">
      {/* 1. Dark Navy Sidebar (Far Left) */}
      <aside className="w-16 h-full flex flex-col items-center py-4 bg-[#0F2041] border-r border-slate-800 z-20 shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg mb-8 shadow-lg">
          P
        </div>
        
        <nav className="flex-1 flex flex-col gap-4 w-full px-2">
          {SIDEBAR_NAV.map((item, i) => (
            <button
              key={i}
              className={cn(
                "p-3 rounded-xl flex items-center justify-center transition-all duration-200 group relative",
                item.active 
                  ? "bg-[#1D3461] text-white shadow-inner" 
                  : "text-slate-400 hover:bg-[#1D3461]/50 hover:text-slate-200"
              )}
              title={item.label}
            >
              <item.icon className="w-5 h-5" />
              {item.active && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-400 rounded-r-full" />
              )}
            </button>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4 w-full px-2">
          <button className="p-3 rounded-xl flex items-center justify-center text-slate-400 hover:bg-[#1D3461]/50 hover:text-slate-200 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <Avatar className="w-10 h-10 border-2 border-[#1D3461] cursor-pointer">
            <AvatarFallback className="bg-slate-700 text-xs text-slate-300">ME</AvatarFallback>
          </Avatar>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        
        {/* 2. Top Full-Width Bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-semibold tracking-tight text-[#0F2041]">Command Center</h1>
            
            <div className="h-6 w-px bg-slate-200 hidden md:block" />
            
            <div className="hidden lg:flex items-center gap-2">
              {STATS.map((stat, i) => (
                <button
                  key={i}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                    stat.active 
                      ? "bg-slate-900 text-white" 
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                    stat.alert && !stat.active && "bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"
                  )}
                >
                  {stat.label}
                  <span className={cn(
                    "px-1.5 py-0.5 rounded-full text-xs",
                    stat.active ? "bg-white/20" : (stat.alert ? "bg-red-100" : "bg-white")
                  )}>
                    {stat.value}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center space-x-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
              <Switch 
                id="team-view" 
                checked={teamView} 
                onCheckedChange={setTeamView}
                className="data-[state=checked]:bg-[#1D3461]"
              />
              <Label htmlFor="team-view" className="text-sm font-medium cursor-pointer text-slate-700">Team View</Label>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="text-slate-500 border-slate-200">
                <Search className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon" className="text-slate-500 border-slate-200">
                <Filter className="w-4 h-4" />
              </Button>
              <Button className="bg-[#1D3461] hover:bg-[#0F2041] text-white shadow-sm">
                <Plus className="w-4 h-4 mr-2" />
                Quick Add
              </Button>
            </div>
          </div>
        </header>

        {/* 3. Split Screen Workspace */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* Left 60%: Timeline & Planning */}
          <div className="w-[60%] flex flex-col h-full border-r border-slate-200 bg-white relative">
            
            {/* Timeline Header */}
            <div className="h-14 border-b border-slate-100 flex items-center justify-between px-6 shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-4">
                <h2 className="font-semibold text-slate-800">Timeline</h2>
                <div className="flex items-center gap-3 text-xs font-medium">
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div>Personal</div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-teal-500"></div>Project</div>
                  <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-purple-500"></div>Collaborative</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700"><ChevronLeft className="w-4 h-4" /></Button>
                <span className="text-sm font-medium text-slate-600 min-w-[100px] text-center">Oct 12 - 18</span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-700"><ChevronRight className="w-4 h-4" /></Button>
              </div>
            </div>

            {/* Timeline Grid */}
            <ScrollArea className="flex-1">
              <div className="min-w-[800px] p-6">
                
                {/* Days Header */}
                <div className="grid grid-cols-7 gap-4 mb-4">
                  {TIMELINE_DAYS.map((day, i) => (
                    <div key={i} className="flex flex-col items-center gap-1">
                      <span className={cn("text-xs font-medium uppercase tracking-wider", day.isToday ? "text-blue-600" : "text-slate-400")}>
                        {day.day}
                      </span>
                      <span className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold",
                        day.isToday ? "bg-blue-600 text-white shadow-sm" : "text-slate-700"
                      )}>
                        {day.date}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Grid Area */}
                <div className="relative h-[400px] border border-slate-100 rounded-xl bg-slate-50/30 overflow-hidden">
                  {/* Vertical grid lines */}
                  <div className="absolute inset-0 grid grid-cols-7 gap-0">
                    {Array.from({ length: 7 }).map((_, i) => (
                      <div key={i} className={cn("border-r border-slate-100 h-full", i === 6 && "border-r-0")} />
                    ))}
                  </div>
                  
                  {/* Today highlight */}
                  <div className="absolute top-0 bottom-0 left-0 w-[14.28%] bg-blue-50/30 border-x border-blue-100" />

                  {/* Horizontal Rows */}
                  <div className="absolute inset-0 flex flex-col">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex-1 border-b border-slate-100 border-dashed" />
                    ))}
                  </div>

                  {/* Task Pills */}
                  <div className="absolute inset-0 p-2">
                    {TASKS.map((task) => {
                      const typeConfig = TYPE_CONFIG[task.type];
                      const left = `${(task.dayOffset / 7) * 100}%`;
                      const width = `calc(${(task.span / 7) * 100}% - 8px)`;
                      const top = `${task.rowOffset * 64 + 16}px`;

                      return (
                        <div
                          key={task.id}
                          className={cn(
                            "absolute h-12 rounded-lg p-2 flex flex-col justify-center shadow-sm border transition-all hover:shadow-md cursor-pointer group hover:z-10",
                            task.type === 'personal' ? 'bg-blue-50 border-blue-200 hover:border-blue-400' :
                            task.type === 'project' ? 'bg-teal-50 border-teal-200 hover:border-teal-400' :
                            'bg-purple-50 border-purple-200 hover:border-purple-400'
                          )}
                          style={{ left, width, top, marginLeft: '4px' }}
                        >
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", typeConfig.color)} />
                            <span className="text-xs font-semibold truncate text-slate-800 group-hover:text-slate-900">
                              {task.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 px-3">
                             <Avatar className="w-4 h-4 border border-white shrink-0">
                               <AvatarFallback className="text-[8px] bg-slate-200 text-slate-700">{task.assignee.initials}</AvatarFallback>
                             </Avatar>
                             {task.project && <span className="text-[10px] text-slate-500 truncate">{task.project}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ScrollArea>

            {/* Bottom-left: Collapsible Planning Tools */}
            <div className={cn(
              "absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 transition-all duration-300 ease-in-out z-10 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]",
              planningOpen ? "h-64" : "h-12"
            )}>
              <button 
                onClick={() => setPlanningOpen(!planningOpen)}
                className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white border border-slate-200 rounded-full p-1 shadow-sm text-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {planningOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
              
              <div className="h-12 px-6 flex items-center justify-between cursor-pointer" onClick={() => !planningOpen && setPlanningOpen(true)}>
                <h3 className="font-semibold text-sm text-[#0F2041] flex items-center gap-2">
                  <LayoutDashboard className="w-4 h-4 text-slate-400" />
                  Planning Tools
                </h3>
                {!planningOpen && <span className="text-xs text-slate-500 font-medium">Daily Briefing & Matrix</span>}
              </div>

              {planningOpen && (
                <div className="px-6 pb-6 h-[calc(100%-48px)] flex gap-6">
                  <Card className="flex-1 shadow-none border-slate-200 bg-slate-50/50">
                    <CardContent className="p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Daily Briefing</h4>
                      <ul className="space-y-3">
                        <li className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span className="text-slate-700">2 urgent tasks require your attention today.</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                          <span className="text-slate-700">Budget review is approaching deadline.</span>
                        </li>
                        <li className="flex items-start gap-2 text-sm">
                          <Users className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                          <span className="text-slate-700">Team meeting at 14:00 (Kassala Hub).</span>
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                  
                  <Card className="flex-1 shadow-none border-slate-200 bg-slate-50/50">
                    <CardContent className="p-4 h-full flex flex-col">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Priority Matrix</h4>
                        <Button variant="link" className="h-auto p-0 text-xs text-blue-600 h-auto">View Full</Button>
                      </div>
                      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-2">
                        <div className="bg-red-50 border border-red-100 rounded flex flex-col items-center justify-center p-2">
                          <span className="text-[10px] font-semibold text-red-600 uppercase">Do Now</span>
                          <span className="text-xl font-bold text-red-700">2</span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded flex flex-col items-center justify-center p-2">
                          <span className="text-[10px] font-semibold text-amber-600 uppercase">Schedule</span>
                          <span className="text-xl font-bold text-amber-700">3</span>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded flex flex-col items-center justify-center p-2">
                          <span className="text-[10px] font-semibold text-blue-600 uppercase">Delegate</span>
                          <span className="text-xl font-bold text-blue-700">1</span>
                        </div>
                        <div className="bg-slate-100 border border-slate-200 rounded flex flex-col items-center justify-center p-2">
                          <span className="text-[10px] font-semibold text-slate-500 uppercase">Eliminate</span>
                          <span className="text-xl font-bold text-slate-600">0</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </div>

          {/* Right 40%: Task Card Stack */}
          <div className="w-[40%] bg-slate-50 flex flex-col h-full">
            <div className="h-14 border-b border-slate-200 flex items-center justify-between px-6 shrink-0 bg-white">
              <h2 className="font-semibold text-slate-800">Action Items</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="text-xs h-8">Sort: Priority</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400"><MoreHorizontal className="w-4 h-4" /></Button>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-6 flex flex-col gap-4">
                {/* Priority Group Headers & Cards */}
                
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600">
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Urgent</h3>
                  <div className="h-px flex-1 bg-slate-200 ml-2" />
                </div>

                {sortedTasks.filter(t => t.priority === 'urgent').map(task => (
                  <TaskCard key={task.id} task={task} />
                ))}

                <div className="flex items-center gap-2 mt-4 mb-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 text-amber-600">
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">High Priority</h3>
                  <div className="h-px flex-1 bg-slate-200 ml-2" />
                </div>

                {sortedTasks.filter(t => t.priority === 'high').map(task => (
                  <TaskCard key={task.id} task={task} />
                ))}

                <div className="flex items-center gap-2 mt-4 mb-2">
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700">Normal</h3>
                  <div className="h-px flex-1 bg-slate-200 ml-2" />
                </div>

                {sortedTasks.filter(t => t.priority === 'normal').map(task => (
                  <TaskCard key={task.id} task={task} />
                ))}
                
                {/* Empty State spacer */}
                <div className="h-12" />
              </div>
            </ScrollArea>
          </div>
        </div>
      </main>
    </div>
  );
}

function TaskCard({ task }: { task: Task }) {
  const priority = PRIORITY_CONFIG[task.priority];
  const typeInfo = TYPE_CONFIG[task.type];
  const TypeIcon = typeInfo.icon;

  return (
    <Card className={cn(
      "border transition-all hover:shadow-md cursor-pointer overflow-hidden bg-white group",
      task.priority === 'urgent' ? 'border-red-200 hover:border-red-300' : 'border-slate-200 hover:border-slate-300'
    )}>
      {/* Left accent border */}
      <div className="flex h-full">
        <div className={cn(
          "w-1 shrink-0", 
          task.priority === 'urgent' ? 'bg-red-500' : 
          task.priority === 'high' ? 'bg-amber-500' : 'bg-emerald-500'
        )} />
        
        <CardContent className="p-4 flex-1">
          <div className="flex justify-between items-start mb-2">
            <Badge variant="outline" className={cn("text-[10px] uppercase font-bold px-1.5 py-0 rounded", priority.color, priority.bg, priority.border)}>
              {priority.label}
            </Badge>
            
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Clock className="w-3.5 h-3.5" />
              {task.dueDate}
            </div>
          </div>
          
          <h4 className="font-semibold text-slate-900 text-base mb-1.5 group-hover:text-blue-600 transition-colors">
            {task.title}
          </h4>
          
          {task.project && (
            <p className="text-sm text-slate-500 mb-4 line-clamp-1">
              {task.project}
            </p>
          )}

          <Separator className="mb-3 bg-slate-100" />

          <div className="flex items-center justify-between mt-auto">
            <div className="flex items-center gap-2">
               <div className={cn("w-6 h-6 rounded flex items-center justify-center text-white", typeInfo.color)}>
                 <TypeIcon className="w-3.5 h-3.5" />
               </div>
               <span className="text-xs font-medium text-slate-600">{typeInfo.label}</span>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className={cn(
                "font-normal",
                task.status === 'todo' ? 'bg-slate-100 text-slate-600' : 
                task.status === 'in-progress' ? 'bg-blue-50 text-blue-700 border-blue-100' : 'bg-emerald-50 text-emerald-700'
              )}>
                {task.status.replace('-', ' ')}
              </Badge>
              <Avatar className="w-7 h-7 border border-slate-200">
                <AvatarFallback className="bg-slate-800 text-white text-[10px]">{task.assignee.initials}</AvatarFallback>
              </Avatar>
            </div>
          </div>
        </CardContent>
      </div>
    </Card>
  );
}
