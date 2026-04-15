/**
 * Vibe A — "Field Dispatch"
 * Emotional register: Urgency, operational authority, no-nonsense command-room tension.
 * Sharp corners, near-black surfaces, high-contrast amber/red signals,
 * monospace metadata, uppercase labelling — reads like a tactical ops dashboard.
 */
import { useState } from "react";
import {
  Search, Calendar as CalendarIcon, Clock, MoreHorizontal,
  CheckCircle2, Plus, Bell, Settings, Sparkles,
  ChevronLeft, ChevronRight, Mail, AlertCircle, GripVertical,
  UserPlus, Radio, Target, Zap, Shield
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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

const QUADRANTS = [
  {
    key: "doNow" as const,
    label: "EXECUTE NOW",
    sub: "CRITICAL // IMMEDIATE ACTION",
    accent: "#ef4444",
    accentFaint: "rgba(239,68,68,0.08)",
    icon: Target,
  },
  {
    key: "schedule" as const,
    label: "QUEUE & PLAN",
    sub: "STRATEGIC // SCHEDULE FORWARD",
    accent: "#3b82f6",
    accentFaint: "rgba(59,130,246,0.08)",
    icon: CalendarIcon,
  },
  {
    key: "delegate" as const,
    label: "FORWARD TO FIELD",
    sub: "TACTICAL // ASSIGN & TRACK",
    accent: "#f59e0b",
    accentFaint: "rgba(245,158,11,0.08)",
    icon: Radio,
  },
  {
    key: "eliminate" as const,
    label: "DEPRIORITIZE",
    sub: "LOW SIGNAL // DEFER OR DROP",
    accent: "#64748b",
    accentFaint: "rgba(100,116,139,0.06)",
    icon: Shield,
  },
];

export function PriorityMatrixVibeA() {
  const [activeFilter, setActiveFilter] = useState("Mine");
  const [orgView, setOrgView] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden font-mono" style={{ background: "#0d1117", color: "#e6edf3" }}>

      {/* LEFT SIDEBAR */}
      <aside className="w-1/5 min-w-[260px] flex flex-col h-full border-r" style={{ borderColor: "#21262d", background: "#0d1117" }}>
        <div className="p-5 border-b" style={{ borderColor: "#21262d" }}>
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-6">
            <div className="h-7 w-7 flex items-center justify-center font-bold text-sm" style={{ background: "#f59e0b", color: "#0d1117" }}>P</div>
            <span className="font-bold text-sm tracking-widest uppercase text-white">PACT OPS</span>
            <div className="ml-auto flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] text-emerald-400 font-bold tracking-widest">LIVE</span>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-5">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              placeholder="SEARCH TASKS..."
              className="w-full text-xs pl-9 pr-3 py-2 rounded-none outline-none font-mono placeholder:text-slate-600"
              style={{ background: "#161b22", border: "1px solid #30363d", color: "#c9d1d9" }}
            />
          </div>

          {/* Filters */}
          <div className="mb-5">
            <p className="text-[9px] font-bold tracking-widest text-slate-500 mb-2">// FILTER BY SCOPE</p>
            <div className="flex flex-wrap gap-1.5">
              {["All", "Mine", "Team", "Overdue"].map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className="text-[10px] font-bold tracking-wider px-2.5 py-1 uppercase transition-all"
                  style={{
                    background: activeFilter === f ? "#f59e0b" : "transparent",
                    color: activeFilter === f ? "#0d1117" : "#8b949e",
                    border: activeFilter === f ? "1px solid #f59e0b" : "1px solid #30363d",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Daily briefing */}
          <div className="mb-3 p-3" style={{ background: "#161b22", border: "1px solid #30363d", borderLeft: "3px solid #f59e0b" }}>
            <div className="flex justify-between items-start mb-1.5">
              <span className="text-[9px] font-bold tracking-widest text-slate-500">// DAILY BRIEF</span>
              <span className="text-[9px] text-slate-500">OCT 24</span>
            </div>
            <p className="text-xs font-bold text-white mb-2 leading-snug">Focus: Finalize Q4 Security Protocols</p>
            <div className="flex justify-between text-[9px] text-slate-500 mb-1">
              <span>PROGRESS</span><span className="text-amber-400 font-bold">68%</span>
            </div>
            <div className="h-1" style={{ background: "#21262d" }}>
              <div className="h-full" style={{ width: "68%", background: "#f59e0b" }} />
            </div>
          </div>

          {/* AI hint */}
          <button className="w-full p-3 flex items-start gap-2.5 transition-all text-left" style={{ background: "#161b22", border: "1px solid #30363d" }}>
            <Zap className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="text-[10px] font-bold text-amber-400 mb-0.5">NEXT ACTION REQUIRED</p>
              <p className="text-[10px] text-slate-500 leading-relaxed">2 urgent approvals pending. Review now to unblock Logistics.</p>
            </div>
          </button>
        </div>

        <div className="mt-auto p-5 border-t" style={{ borderColor: "#21262d" }}>
          <div className="flex items-center gap-2.5">
            <Avatar className="h-8 w-8 rounded-none">
              <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704d" />
              <AvatarFallback style={{ background: "#161b22", color: "#f59e0b", fontFamily: "monospace", fontSize: 11 }}>AK</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-bold text-white truncate">Ahmed Kamal</p>
              <p className="text-[9px] text-slate-500 tracking-widest uppercase truncate">Country Director</p>
            </div>
            <button style={{ color: "#8b949e" }}><Settings className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </aside>

      {/* CENTER */}
      <main className="w-1/2 flex flex-col h-full border-r" style={{ borderColor: "#21262d", background: "#0d1117" }}>
        {/* Header */}
        <header className="h-14 border-b flex items-center justify-between px-5 shrink-0" style={{ borderColor: "#21262d" }}>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white tracking-wider uppercase">Priority Matrix</span>
            <span className="text-[9px] font-bold tracking-widest px-2 py-0.5 border text-slate-400" style={{ borderColor: "#30363d" }}>EISENHOWER</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setOrgView(false)}
                className="text-[10px] font-bold tracking-wider px-2.5 py-1 uppercase transition-all"
                style={{ background: !orgView ? "#f59e0b" : "transparent", color: !orgView ? "#0d1117" : "#8b949e", border: !orgView ? "1px solid #f59e0b" : "1px solid #30363d" }}
              >MY VIEW</button>
              <button
                onClick={() => setOrgView(true)}
                className="text-[10px] font-bold tracking-wider px-2.5 py-1 uppercase transition-all"
                style={{ background: orgView ? "#f59e0b" : "transparent", color: orgView ? "#0d1117" : "#8b949e", border: orgView ? "1px solid #f59e0b" : "1px solid #30363d" }}
              >ORG VIEW</button>
            </div>
            <button className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 transition-all" style={{ background: "#f59e0b", color: "#0d1117" }}>
              <Plus className="h-3 w-3" />ADD TASK
            </button>
          </div>
        </header>

        <div className="px-5 py-2 border-b flex items-center shrink-0" style={{ borderColor: "#21262d" }}>
          <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold tracking-widest">
            <GripVertical className="h-3 w-3 opacity-40" />
            // DRAG TASKS BETWEEN QUADRANTS TO REPRIORITIZE
          </div>
        </div>

        <div className="flex-1 p-4 overflow-hidden" style={{ background: "#0d1117" }}>
          <div className="grid grid-cols-2 grid-rows-2 gap-3 h-full">
            {QUADRANTS.map(q => (
              <div key={q.key} className="flex flex-col overflow-hidden" style={{ background: q.accentFaint, border: `1px solid ${q.accent}22`, borderLeft: `3px solid ${q.accent}` }}>
                <div className="px-3 py-2.5 border-b flex items-center justify-between shrink-0" style={{ borderColor: `${q.accent}22` }}>
                  <div className="flex items-center gap-2">
                    <q.icon className="h-3.5 w-3.5" style={{ color: q.accent }} />
                    <span className="text-[11px] font-bold tracking-wider" style={{ color: q.accent }}>{q.label}</span>
                  </div>
                  <span className="text-[8px] font-bold tracking-widest text-slate-600">{q.sub.split("//")[0].trim()}</span>
                </div>
                <ScrollArea className="flex-1 p-2">
                  <div className="space-y-2">
                    {(MOCK_TASKS[q.key] as any[]).map((task: any) => (
                      <TacticalCard key={task.id} task={task} accent={q.accent} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* RIGHT PANEL */}
      <aside className="w-[30%] min-w-[300px] flex flex-col h-full overflow-hidden" style={{ background: "#0d1117" }}>
        <header className="h-14 border-b flex items-center justify-end px-5 shrink-0" style={{ borderColor: "#21262d" }}>
          <button className="relative p-1.5" style={{ color: "#8b949e" }}>
            <Bell className="h-4 w-4" />
            <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-red-500" />
          </button>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-6">

            {/* Calendar */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-bold tracking-widest text-slate-500">// OCTOBER 2024</span>
                <div className="flex gap-1">
                  <button className="p-1 text-slate-500 hover:text-white transition-colors"><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button className="p-1 text-slate-500 hover:text-white transition-colors"><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="p-3" style={{ background: "#161b22", border: "1px solid #30363d" }}>
                <div className="grid grid-cols-7 text-center text-[9px] font-bold tracking-wider text-slate-500 mb-2">
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 text-center text-xs gap-y-1">
                  <div className="py-1 text-slate-700 font-mono">29</div>
                  <div className="py-1 text-slate-700 font-mono">30</div>
                  {[...Array(31)].map((_, i) => {
                    const day = i + 1;
                    const isToday = day === 24;
                    const hasTask = [3, 8, 12, 15, 20, 24, 28].includes(day);
                    return (
                      <div key={day} className="py-1 relative flex justify-center font-mono">
                        <span className={cn("h-6 w-6 flex items-center justify-center text-[11px]",
                          isToday ? "font-bold text-black" : "text-slate-400 hover:text-white cursor-pointer"
                        )} style={isToday ? { background: "#f59e0b" } : {}}>
                          {day}
                        </span>
                        {hasTask && !isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full" style={{ background: "#3b82f6" }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Agenda */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[9px] font-bold tracking-widest text-slate-500">// TODAY'S OPS SCHEDULE</span>
                <span className="text-[9px] text-slate-600">4 ITEMS</span>
              </div>
              <div className="space-y-1.5">
                {AGENDA.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-2.5" style={{ background: "#161b22", border: "1px solid #30363d", borderLeft: `2px solid ${item.type === "meeting" ? "#f59e0b" : "#3b82f6"}` }}>
                    <span className="text-[10px] font-bold font-mono shrink-0" style={{ color: item.type === "meeting" ? "#f59e0b" : "#3b82f6" }}>{item.time}</span>
                    <p className="text-xs text-slate-300 font-mono flex-1 truncate">{item.title}</p>
                    <span className="text-[8px] font-bold tracking-widest text-slate-600 uppercase shrink-0">{item.type}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Invitation */}
            <section>
              <span className="text-[9px] font-bold tracking-widest text-slate-500 block mb-3">// PENDING INVITATIONS</span>
              <div className="p-3" style={{ background: "#161b22", border: "1px solid #30363d" }}>
                <div className="flex items-start gap-2.5">
                  <Avatar className="h-7 w-7 rounded-none">
                    <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704c" />
                    <AvatarFallback style={{ background: "#0d1117", color: "#f59e0b", fontFamily: "monospace", fontSize: 10 }}>SJ</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-400 mb-0.5"><span className="text-white font-bold">Sarah Jenkins</span> assigned a task:</p>
                    <p className="text-xs font-bold text-white mb-1">Review Q3 Grant Proposal</p>
                    <p className="text-[9px] text-slate-500 font-mono mb-2">DUE: OCT 28</p>
                    <div className="flex gap-2">
                      <button className="flex-1 text-[10px] font-bold py-1.5 uppercase tracking-wider transition-all" style={{ background: "#f59e0b", color: "#0d1117" }}>Accept</button>
                      <button className="flex-1 text-[10px] font-bold py-1.5 uppercase tracking-wider border text-slate-400 hover:text-white transition-all" style={{ borderColor: "#30363d" }}>Decline</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Integration banner */}
            <div className="p-3 flex gap-2.5" style={{ background: "#161b22", border: "1px solid #30363d", borderLeft: "2px solid #f59e0b" }}>
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="text-[10px] font-bold text-amber-400 mb-0.5 uppercase tracking-wider">Connect PACT Mail</p>
                <p className="text-[10px] text-slate-500 leading-relaxed mb-2">Link Exchange to sync meetings and tasks automatically.</p>
                <button className="text-[10px] font-bold py-1 px-2.5 uppercase tracking-wider transition-all w-full" style={{ background: "#f59e0b22", color: "#f59e0b", border: "1px solid #f59e0b44" }}>
                  Connect Account
                </button>
              </div>
            </div>

          </div>
        </ScrollArea>
      </aside>
    </div>
  );
}

function TacticalCard({ task, accent }: { task: any; accent: string }) {
  return (
    <div className="p-2.5 cursor-grab group transition-all" style={{ background: "#0d1117", border: `1px solid #21262d` }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = accent + "55")}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "#21262d")}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[8px] font-bold tracking-widest text-slate-500 uppercase">{task.project}</span>
            {task.priority && (
              <span className="text-[8px] font-bold tracking-wider px-1.5 py-0.5 uppercase" style={{ background: accent + "22", color: accent }}>
                {task.priority}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-200 leading-snug font-mono">{task.title}</p>
        </div>
        <button className="text-slate-600 hover:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
        {task.due && <span>{task.due}</span>}
        {task.note && <span className="italic">{task.note}</span>}
        {task.assignee && (
          <span className="px-1.5 py-0.5" style={{ background: "#161b22", border: "1px solid #30363d" }}>{task.assignee}</span>
        )}
      </div>
    </div>
  );
}
