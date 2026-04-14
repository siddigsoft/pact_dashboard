import React, { useState } from "react";
import { 
  Search, Calendar as CalendarIcon, Clock, MoreHorizontal, 
  CheckCircle2, Plus, Bell, Settings, Sparkles,
  ChevronLeft, ChevronRight, Mail, AlertCircle, GripVertical,
  UserPlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

const MOCK_TASKS = {
  doNow: [
    { id: "t1", title: "Review Q3 Khartoum Operational Budget", project: "Finance", due: "Today, 14:00", priority: "High" },
    { id: "t2", title: "Approve pending convoy security permits", project: "Logistics", due: "Today, 16:30", priority: "Urgent" },
  ],
  schedule: [
    { id: "t3", title: "Draft Monthly Donor Report", project: "Reporting", due: "Friday", priority: "Medium" },
    { id: "t4", title: "Plan Q4 Field Team Deployment", project: "Operations", due: "Next Week", priority: "High" },
    { id: "t5", title: "Update Staff Handbook", project: "HR", due: "Oct 15", priority: "Low" },
  ],
  delegate: [
    { id: "t6", title: "Collect weekly fleet fuel receipts", project: "Logistics", assignee: "Omar K.", due: "Tomorrow" },
    { id: "t7", title: "Compile routine partner updates", project: "Comms", assignee: "Sara M.", due: "Thursday" },
  ],
  eliminate: [
    { id: "t8", title: "Review outdated vendor catalog", project: "Procurement", note: "Pending new system" },
    { id: "t9", title: "Sync old archives to cloud", project: "IT", note: "Low priority" },
  ]
};

const AGENDA = [
  { id: 1, time: "09:00", title: "Daily Sync: Field Ops", type: "meeting" },
  { id: 2, time: "11:30", title: "Review Budget Approvals", type: "task" },
  { id: 3, time: "14:00", title: "Security Briefing - Red Sea State", type: "meeting" },
  { id: 4, time: "16:00", title: "Finalize Vendor Contracts", type: "task" },
];

export function PriorityMatrix() {
  const [activeFilter, setActiveFilter] = useState("Mine");
  const [orgView, setOrgView] = useState(false);
  const [emailConnected, setEmailConnected] = useState(false);

  return (
    <div className="flex h-screen w-full bg-slate-50 overflow-hidden font-sans">
      {/* LEFT SIDEBAR - 20% */}
      <aside className="w-1/5 min-w-[280px] bg-[#0F2041] text-white flex flex-col h-full border-r border-slate-800">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="h-8 w-8 bg-blue-500 rounded-md flex items-center justify-center font-bold text-lg">
              P
            </div>
            <span className="font-semibold text-xl tracking-tight">PACT</span>
          </div>

          <div className="relative mb-6">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search tasks..." 
              className="bg-slate-800/50 border-slate-700 text-white placeholder:text-slate-400 pl-9 focus-visible:ring-blue-500"
            />
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Filters</h3>
              <div className="flex flex-wrap gap-2">
                {["All", "Mine", "Team", "Overdue"].map((f) => (
                  <Badge 
                    key={f}
                    variant={activeFilter === f ? "default" : "outline"}
                    className={`cursor-pointer ${
                      activeFilter === f 
                        ? "bg-blue-600 hover:bg-blue-700 border-transparent" 
                        : "bg-transparent text-slate-300 border-slate-700 hover:border-slate-500"
                    }`}
                    onClick={() => setActiveFilter(f)}
                  >
                    {f}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">Planning Tools</h3>
              
              <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/50 mb-3 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div className="text-sm font-medium text-slate-200">Daily Briefing</div>
                  <div className="text-xs text-slate-400">Oct 24</div>
                </div>
                <div className="text-sm font-semibold mb-3 leading-snug">Focus: Finalize Q4 Security Protocols</div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Progress</span>
                    <span>68%</span>
                  </div>
                  <Progress value={68} className="h-1.5 bg-slate-700" />
                </div>
              </div>

              <button className="w-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-xl p-3 flex items-start gap-3 transition-colors text-left group">
                <div className="bg-indigo-500/20 p-1.5 rounded-lg text-indigo-400 group-hover:text-indigo-300 transition-colors">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-indigo-300 mb-0.5">What to do next?</div>
                  <div className="text-xs text-slate-400 leading-relaxed">You have 2 urgent approvals pending. Review now to unblock Logistics.</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-slate-800/50">
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9 border border-slate-700">
              <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704d" />
              <AvatarFallback>AK</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">Ahmed Kamal</div>
              <div className="text-xs text-slate-400 truncate">Country Director</div>
            </div>
            <button className="text-slate-400 hover:text-white transition-colors">
              <Settings className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* CENTER - 50% */}
      <main className="w-1/2 flex flex-col h-full border-r border-slate-200 bg-white">
        <header className="h-16 border-b border-slate-100 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900">Priority Matrix</h1>
            <Badge variant="secondary" className="bg-slate-100 text-slate-600 font-normal">Eisenhower Method</Badge>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="view-mode" className="text-sm text-slate-500">My View</Label>
              <Switch id="view-mode" checked={orgView} onCheckedChange={setOrgView} />
              <Label htmlFor="view-mode" className="text-sm text-slate-500">Org View</Label>
            </div>
            <Button size="sm" className="bg-[#0F2041] hover:bg-[#0F2041]/90 text-white shadow-sm">
              <Plus className="h-4 w-4 mr-1" /> Add Task
            </Button>
          </div>
        </header>

        <div className="p-4 bg-slate-50/50 border-b border-slate-100 shrink-0">
          <div className="flex items-center justify-center text-xs text-slate-500 bg-slate-100/80 rounded-md py-1.5 border border-slate-200 border-dashed">
            <GripVertical className="h-3.5 w-3.5 mr-1.5 opacity-50" />
            Drag and drop tasks between quadrants to reprioritize
          </div>
        </div>

        <div className="flex-1 p-6 overflow-hidden">
          <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
            
            {/* DO NOW */}
            <div className="bg-red-50/30 border border-red-100 rounded-xl flex flex-col overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-red-100 bg-red-50/50 flex items-center justify-between sticky top-0">
                <h2 className="font-semibold text-red-800 flex items-center gap-2">
                  DO NOW 🔴
                </h2>
                <Badge variant="outline" className="bg-white border-red-200 text-red-700 text-[10px] uppercase font-bold">Urgent + Important</Badge>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2.5">
                  {MOCK_TASKS.doNow.map(task => (
                    <TaskCard key={task.id} task={task} quadrant="red" />
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* SCHEDULE */}
            <div className="bg-blue-50/30 border border-blue-100 rounded-xl flex flex-col overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/50 flex items-center justify-between sticky top-0">
                <h2 className="font-semibold text-blue-800 flex items-center gap-2">
                  SCHEDULE 📅
                </h2>
                <Badge variant="outline" className="bg-white border-blue-200 text-blue-700 text-[10px] uppercase font-bold">Not Urgent + Important</Badge>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2.5">
                  {MOCK_TASKS.schedule.map(task => (
                    <TaskCard key={task.id} task={task} quadrant="blue" />
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* DELEGATE */}
            <div className="bg-amber-50/30 border border-amber-100 rounded-xl flex flex-col overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-amber-100 bg-amber-50/50 flex items-center justify-between sticky top-0">
                <h2 className="font-semibold text-amber-800 flex items-center gap-2">
                  DELEGATE 👤
                </h2>
                <Badge variant="outline" className="bg-white border-amber-200 text-amber-700 text-[10px] uppercase font-bold">Urgent + Not Important</Badge>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2.5">
                  {MOCK_TASKS.delegate.map(task => (
                    <TaskCard key={task.id} task={task} quadrant="amber" />
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* ELIMINATE */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-slate-200 bg-slate-100/50 flex items-center justify-between sticky top-0">
                <h2 className="font-semibold text-slate-700 flex items-center gap-2">
                  ELIMINATE 🗑️
                </h2>
                <Badge variant="outline" className="bg-white border-slate-200 text-slate-600 text-[10px] uppercase font-bold">Not Urgent + Not Important</Badge>
              </div>
              <ScrollArea className="flex-1 p-3">
                <div className="space-y-2.5">
                  {MOCK_TASKS.eliminate.map(task => (
                    <TaskCard key={task.id} task={task} quadrant="slate" />
                  ))}
                </div>
              </ScrollArea>
            </div>

          </div>
        </div>
      </main>

      {/* RIGHT PANEL - 30% */}
      <aside className="w-[30%] min-w-[320px] bg-slate-50 flex flex-col h-full overflow-hidden">
        <header className="h-16 border-b border-slate-200 flex items-center justify-end px-6 shrink-0 bg-white">
          <div className="flex items-center gap-3 text-slate-500">
            <button className="p-2 hover:bg-slate-100 rounded-full transition-colors relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full ring-2 ring-white"></span>
            </button>
          </div>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-6 space-y-8">
            
            {/* Mini Calendar Section */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-900">October 2024</h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7"><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7"><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
                <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-400 mb-2">
                  <div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div>
                </div>
                <div className="grid grid-cols-7 text-center text-sm gap-y-1">
                  {/* Empty cells for offset */}
                  <div className="py-1.5 text-slate-300">29</div>
                  <div className="py-1.5 text-slate-300">30</div>
                  {/* Days */}
                  {[...Array(31)].map((_, i) => {
                    const day = i + 1;
                    const isToday = day === 24;
                    const hasTask = [3, 8, 12, 15, 20, 24, 28].includes(day);
                    return (
                      <div key={day} className="py-1.5 relative flex justify-center">
                        <span className={`h-7 w-7 flex items-center justify-center rounded-full ${
                          isToday ? "bg-[#0F2041] text-white font-medium shadow-sm" : "text-slate-700 hover:bg-slate-100 cursor-pointer"
                        }`}>
                          {day}
                        </span>
                        {hasTask && !isToday && (
                          <span className="absolute bottom-1 h-1 w-1 bg-blue-500 rounded-full"></span>
                        )}
                        {hasTask && isToday && (
                          <span className="absolute bottom-1 h-1 w-1 bg-white rounded-full"></span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </section>

            {/* Today's Agenda */}
            <section>
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center justify-between">
                <span>Today's Agenda</span>
                <span className="text-xs font-normal text-slate-500">4 Items</span>
              </h3>
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                {AGENDA.map((item, i) => (
                  <div key={item.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-slate-50 bg-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 text-slate-500 z-10">
                      {item.type === "meeting" ? <UserPlus className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                    </div>
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-white p-3 rounded-xl border border-slate-200 shadow-sm ml-4 md:ml-0 group-hover:border-blue-200 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-blue-600">{item.time}</span>
                        <Badge variant="secondary" className="text-[10px] bg-slate-100 h-5 px-1.5">{item.type}</Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-800 line-clamp-1">{item.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Pending Invitations */}
            <section>
              <h3 className="font-semibold text-slate-900 mb-4">Pending Invitations</h3>
              <div className="space-y-3">
                <Card className="shadow-sm border-slate-200 bg-white">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704c" />
                        <AvatarFallback>SJ</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm text-slate-800"><span className="font-medium">Sarah Jenkins</span> invited you to a task:</p>
                        <p className="text-sm font-medium text-slate-900 mt-1">Review Q3 Grant Proposal</p>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1"><CalendarIcon className="h-3 w-3" /> Due Oct 28</p>
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" className="h-8 text-xs bg-blue-600 hover:bg-blue-700 flex-1">Accept</Button>
                          <Button size="sm" variant="outline" className="h-8 text-xs flex-1">Decline</Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* Integration Banner */}
            {!emailConnected && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 shadow-sm">
                <div className="mt-0.5 text-amber-600">
                  <AlertCircle className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-800 mb-1">Connect PACT Email</h4>
                  <p className="text-xs text-amber-700/80 mb-3 leading-relaxed">Link your PACT Exchange account to automatically sync meetings and email tasks.</p>
                  <Button size="sm" className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white w-full shadow-sm">
                    <Mail className="h-3 w-3 mr-1.5" /> Connect Account
                  </Button>
                </div>
              </div>
            )}

          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}

function TaskCard({ task, quadrant }: { task: any, quadrant: 'red' | 'blue' | 'amber' | 'slate' }) {
  const styles = {
    red: "bg-white border-red-100 hover:border-red-300",
    blue: "bg-white border-blue-100 hover:border-blue-300",
    amber: "bg-white border-amber-100 hover:border-amber-300",
    slate: "bg-white border-slate-200 hover:border-slate-300",
  };

  const badgeStyles = {
    High: "bg-orange-100 text-orange-700 hover:bg-orange-100",
    Urgent: "bg-red-100 text-red-700 hover:bg-red-100",
    Medium: "bg-blue-100 text-blue-700 hover:bg-blue-100",
    Low: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  };

  return (
    <div className={`p-3 rounded-lg border shadow-sm transition-all cursor-grab active:cursor-grabbing group ${styles[quadrant]}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{task.project}</span>
            {task.priority && (
              <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 h-4 font-semibold ${badgeStyles[task.priority as keyof typeof badgeStyles] || badgeStyles.Low}`}>
                {task.priority}
              </Badge>
            )}
          </div>
          <h3 className="text-sm font-medium text-slate-900 leading-snug">{task.title}</h3>
        </div>
        <button className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      
      <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
        <div className="flex items-center gap-3">
          {task.due && (
            <div className="flex items-center gap-1 text-slate-600">
              <CalendarIcon className="h-3 w-3" />
              <span>{task.due}</span>
            </div>
          )}
          {task.note && (
            <span className="italic text-slate-400">{task.note}</span>
          )}
        </div>
        
        {task.assignee && (
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
            <Avatar className="h-4 w-4">
              <AvatarFallback className="text-[8px] bg-indigo-100 text-indigo-700">{task.assignee.split(' ').map((n: string) => n[0]).join('')}</AvatarFallback>
            </Avatar>
            <span className="text-[10px] font-medium text-slate-600">{task.assignee}</span>
          </div>
        )}
        
        {!task.assignee && !task.note && (
          <Avatar className="h-5 w-5">
            <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704d" />
            <AvatarFallback>AK</AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
