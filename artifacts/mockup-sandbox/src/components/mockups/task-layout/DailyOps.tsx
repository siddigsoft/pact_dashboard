import React, { useState } from "react";
import { format, addDays, subDays } from "date-fns";
import {
  CheckCircle2,
  Circle,
  Play,
  Plus,
  Lock,
  Users,
  Calendar as CalendarIcon,
  Briefcase,
  LayoutGrid,
  Check,
  X,
  ChevronDown,
  Clock,
  AlertTriangle,
  MoreHorizontal
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Mock Data
const personalTasks = [
  { id: 1, title: "Review field safety protocols", time: "09:00 AM", completed: true },
  { id: 2, title: "Submit expense report for Khartoum trip", time: "11:30 AM", completed: false },
  { id: 3, title: "Update emergency contact list", time: "02:00 PM", completed: false },
  { id: 4, title: "Read weekly briefing", time: "04:00 PM", completed: false },
];

const projectTasks = [
  { id: 1, title: "Distribute emergency medical kits", project: "Sudan Relief 2024", priority: "high", time: "10:00 AM", completed: false },
  { id: 2, title: "Coordinate with local partners", project: "WASH Initiative", priority: "medium", time: "01:00 PM", completed: false },
  { id: 3, title: "Monitor supply chain logistics", project: "Sudan Relief 2024", priority: "high", time: "03:30 PM", completed: false },
];

const collaborativeTasks = [
  { id: 1, title: "Draft Q3 Donor Report", status: "pending", sender: "Sarah J.", role: "Lead Coordinator" },
  { id: 2, title: "Camp Alpha Security Assessment", status: "active", sharedWith: 2 },
];

const teamMembers = [
  { id: 1, name: "Ahmed Hassan", role: "Field Coordinator", tasks: 5, overdue: 1, initial: "AH" },
  { id: 2, name: "Fatima Ali", role: "Medical Officer", tasks: 3, overdue: 0, initial: "FA" },
  { id: 3, name: "Dr. Chen", role: "WASH Specialist", tasks: 8, overdue: 2, initial: "DC" },
];

export function DailyOps() {
  const today = new Date();
  const [expandedTeamMember, setExpandedTeamMember] = useState<number | null>(null);

  // Generate 7-day calendar ribbon (3 days before, today, 3 days after)
  const calendarDays = Array.from({ length: 7 }).map((_, i) => {
    const date = addDays(subDays(today, 3), i);
    return {
      date,
      isToday: i === 3,
      hasTasks: [1, 2, 3, 4, 5].includes(i),
    };
  });

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
      {/* TOP BANNER */}
      <header className="bg-[#0F2041] text-white px-6 py-6 flex flex-col md:flex-row justify-between items-start md:items-center shrink-0 shadow-md z-10 relative">
        <div className="flex items-center gap-6 mb-4 md:mb-0">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Good morning, Ibrahim 👋</h1>
            <p className="text-slate-300 font-medium mt-1">{format(today, "EEEE, MMMM do, yyyy")}</p>
          </div>
          
          <div className="hidden md:flex items-center gap-3 ml-4 pl-4 border-l border-white/20">
            <div className="relative w-12 h-12 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3"
                  strokeDasharray="44.4, 100"
                />
              </svg>
              <span className="absolute text-xs font-bold">4/9</span>
            </div>
            <div className="text-sm">
              <div className="font-semibold text-emerald-400">44% Completed</div>
              <div className="text-slate-300">Daily Tasks</div>
            </div>
          </div>
        </div>

        <div className="bg-white/10 rounded-xl p-3 flex items-center gap-4 border border-white/10 w-full md:w-auto backdrop-blur-sm">
          <div>
            <div className="text-xs text-emerald-400 font-bold uppercase tracking-wider mb-1">Today's Focus</div>
            <div className="font-medium text-sm">Finalize Q3 Donor Report Draft</div>
            <div className="text-xs text-slate-300 mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Due at 17:00
            </div>
          </div>
          <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold gap-1 ml-auto shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
            <Play className="w-4 h-4 fill-current" /> START
          </Button>
        </div>
      </header>

      {/* MIDDLE SECTION - GRID */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 overflow-y-auto pb-32">
          
          {/* Column 1: Personal */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Circle className="w-4 h-4 text-blue-500" />
                Personal Tasks
              </h2>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-3">
              {personalTasks.map(task => (
                <Card key={task.id} className={`border-l-4 ${task.completed ? 'border-l-emerald-400 opacity-60' : 'border-l-blue-500'} shadow-sm hover:shadow-md transition-shadow`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <button className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-500 transition-colors">
                        {task.completed ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <Circle className="w-5 h-5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.completed ? 'line-through text-slate-500' : 'text-slate-800'} truncate`}>{task.title}</p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {task.time}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              <Button variant="outline" className="w-full text-blue-600 border-blue-200 hover:bg-blue-50 bg-white shadow-sm border-dashed">
                <Plus className="w-4 h-4 mr-2" /> Quick Add
              </Button>
            </div>
          </div>

          {/* Column 2: Project */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-indigo-500" />
                Project Tasks
              </h2>
            </div>
            
            <div className="space-y-3">
              {projectTasks.map(task => (
                <Card key={task.id} className="shadow-sm hover:shadow-md transition-shadow border-t-0 border-r-0 border-b-0 border-l-4 border-l-indigo-500">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <button className="mt-0.5 shrink-0 text-slate-300 hover:text-emerald-500">
                        <Circle className="w-5 h-5" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 mb-1 leading-tight">{task.title}</p>
                        <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700 font-medium px-1.5 py-0 mb-2 truncate max-w-full">
                          {task.project}
                        </Badge>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {task.time}
                          </p>
                          {task.priority === 'high' && (
                            <AlertTriangle className="w-3 h-3 text-red-500" />
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Column 3: Collaborative */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Users className="w-4 h-4 text-violet-500" />
                Collaborative 🤝
              </h2>
            </div>
            
            <div className="space-y-3">
              {collaborativeTasks.map(task => (
                <Card key={task.id} className={`shadow-sm overflow-hidden ${task.status === 'pending' ? 'bg-amber-50/50 border-amber-200' : 'border-slate-200'}`}>
                  {task.status === 'pending' && (
                    <div className="bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider px-3 py-1 text-center border-b border-amber-200">
                      Pending Your Acceptance
                    </div>
                  )}
                  <CardContent className="p-3">
                    <p className="text-sm font-bold text-slate-800 mb-2">{task.title}</p>
                    
                    {task.status === 'pending' ? (
                      <>
                        <div className="flex items-center gap-2 mb-3">
                          <Avatar className="w-5 h-5">
                            <AvatarFallback className="text-[8px] bg-slate-200 text-slate-600">SJ</AvatarFallback>
                          </Avatar>
                          <span className="text-xs text-slate-600">Invited by <strong>{task.sender}</strong></span>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs flex-1 bg-indigo-600 hover:bg-indigo-700">Accept</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs flex-1 border-slate-300">Decline</Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Active
                          </span>
                          <span className="text-xs text-slate-500">Shared with {task.sharedWith} others</span>
                        </div>
                        <div className="flex -space-x-2 mt-2">
                           <Avatar className="w-6 h-6 border-2 border-white">
                            <AvatarFallback className="text-[8px] bg-blue-100 text-blue-700">AH</AvatarFallback>
                          </Avatar>
                          <Avatar className="w-6 h-6 border-2 border-white">
                            <AvatarFallback className="text-[8px] bg-emerald-100 text-emerald-700">FA</AvatarFallback>
                          </Avatar>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Column 4: Team Overview */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-slate-700" />
                Team Overview
              </h2>
              <Badge variant="outline" className="bg-slate-100 text-slate-500 gap-1 rounded-full px-2">
                <Lock className="w-3 h-3" /> Admin
              </Badge>
            </div>
            
            <Card className="shadow-sm border-slate-200 bg-white">
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {teamMembers.map(member => (
                    <Collapsible 
                      key={member.id} 
                      open={expandedTeamMember === member.id}
                      onOpenChange={(isOpen) => setExpandedTeamMember(isOpen ? member.id : null)}
                    >
                      <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="bg-slate-100 text-slate-600 text-xs font-bold">{member.initial}</AvatarFallback>
                          </Avatar>
                          <div className="text-left">
                            <p className="text-sm font-semibold text-slate-800 leading-none">{member.name}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{member.role}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {member.overdue > 0 && (
                            <Badge variant="destructive" className="px-1.5 py-0 h-5 text-[10px] bg-red-100 text-red-700 hover:bg-red-100 border-none">
                              {member.overdue} overdue
                            </Badge>
                          )}
                          <Badge variant="secondary" className="px-1.5 py-0 h-5 text-[10px] bg-slate-100 text-slate-700">
                            {member.tasks} tasks
                          </Badge>
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expandedTeamMember === member.id ? 'rotate-180' : ''}`} />
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="px-3 pb-3 pt-0 bg-slate-50">
                        <div className="text-xs text-slate-600 pt-2 border-t border-slate-200 space-y-1">
                          <div className="flex justify-between"><span>Current:</span> <span>Field Assessment</span></div>
                          <div className="flex justify-between"><span>Next:</span> <span>Submit Report</span></div>
                          <Button variant="link" size="sm" className="h-6 px-0 text-indigo-600 text-xs mt-1">View Full Schedule &rarr;</Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>

      {/* BOTTOM STRIP: Calendar Ribbon */}
      <div className="bg-white border-t border-slate-200 shrink-0 relative z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.02)] pb-16">
        <div className="flex items-center justify-between px-2 py-2 max-w-3xl mx-auto">
          {calendarDays.map((day, idx) => (
            <div 
              key={idx} 
              className={`flex flex-col items-center justify-center w-12 h-14 rounded-xl transition-colors cursor-pointer ${
                day.isToday ? 'bg-[#0F2041] text-white shadow-md' : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              <span className={`text-[10px] font-bold uppercase tracking-wider ${day.isToday ? 'text-blue-200' : 'text-slate-400'}`}>
                {format(day.date, 'EEE')}
              </span>
              <span className={`text-lg font-bold mt-0.5 leading-none ${day.isToday ? 'text-white' : 'text-slate-800'}`}>
                {format(day.date, 'd')}
              </span>
              <div className="h-1 mt-1 flex items-center justify-center">
                {day.hasTasks && <div className={`w-1 h-1 rounded-full ${day.isToday ? 'bg-emerald-400' : 'bg-slate-400'}`} />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* STICKY BOTTOM TOOLBAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#0F2041] text-white p-2 flex items-center justify-center gap-2 shadow-[0_-10px_20px_rgba(15,32,65,0.1)] z-30">
        <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10 rounded-full text-sm font-medium">
          <CalendarIcon className="w-4 h-4 mr-2" /> Planning Tools
        </Button>
        <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10 rounded-full text-sm font-medium">
          <Briefcase className="w-4 h-4 mr-2" /> Briefing
        </Button>
        <Button variant="ghost" className="text-slate-300 hover:text-white hover:bg-white/10 rounded-full text-sm font-medium">
          <LayoutGrid className="w-4 h-4 mr-2" /> Priority Matrix
        </Button>
        <div className="w-px h-6 bg-white/20 mx-1"></div>
        <Button className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold shadow-lg">
          <Plus className="w-4 h-4 mr-1" /> New Task
        </Button>
      </div>
    </div>
  );
}
