/**
 * Vibe C — "Crystal"
 * Emotional register: Clarity, stillness, quiet authority.
 * Pure white canvas, radical whitespace, hairline borders, near-invisible structure.
 * One accent colour (deep navy #0F2041). Typography does all the work.
 * Visual quietness so intense it forces focus on content.
 */
import { useState } from "react";
import {
  Search, Calendar as CalendarIcon, MoreHorizontal,
  CheckCircle2, Plus, Bell, Settings, ChevronLeft, ChevronRight,
  Mail, AlertCircle, GripVertical, UserPlus
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const C = {
  bg: "#ffffff",
  sidebar: "#f8f9fb",
  navy: "#0F2041",
  navyFaint: "#f0f3f8",
  text: "#1a1f2e",
  muted: "#94a3b8",
  hairline: "#e8ecf2",
  dot: {
    urgent: "#ef4444",
    High: "#f97316",
    Medium: "#3b82f6",
    Low: "#94a3b8",
  },
};

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
  { key: "doNow" as const, label: "Do Now", sub: "Urgent & important" },
  { key: "schedule" as const, label: "Schedule", sub: "Important, not urgent" },
  { key: "delegate" as const, label: "Delegate", sub: "Urgent, not important" },
  { key: "eliminate" as const, label: "Eliminate", sub: "Neither" },
];

export function PriorityMatrixVibeC() {
  const [activeFilter, setActiveFilter] = useState("Mine");
  const [orgView, setOrgView] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: C.bg, color: C.text, fontFamily: "'Inter', 'Helvetica Neue', system-ui, sans-serif" }}>

      {/* LEFT SIDEBAR */}
      <aside className="w-1/5 min-w-[240px] flex flex-col h-full border-r" style={{ borderColor: C.hairline, background: C.sidebar }}>
        <div className="p-5">
          {/* Logo */}
          <div className="flex items-center gap-2.5 mb-8">
            <div className="h-7 w-7 flex items-center justify-center font-bold text-sm" style={{ background: C.navy, color: "#fff", borderRadius: 6 }}>P</div>
            <span className="font-semibold text-sm tracking-tight" style={{ color: C.navy }}>PACT</span>
          </div>

          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5" style={{ color: C.muted }} />
            <input
              placeholder="Search…"
              className="w-full text-sm pl-8 pr-3 py-2 outline-none rounded-lg transition-all"
              style={{ background: C.bg, border: `1px solid ${C.hairline}`, color: C.text }}
            />
          </div>

          {/* Filters */}
          <div className="mb-6">
            <p className="text-[11px] font-medium mb-2.5 tracking-wide uppercase" style={{ color: C.muted }}>Scope</p>
            <div className="flex flex-col gap-0.5">
              {["All", "Mine", "Team", "Overdue"].map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className="text-sm text-left px-3 py-2 rounded-lg transition-all"
                  style={{
                    background: activeFilter === f ? C.navyFaint : "transparent",
                    color: activeFilter === f ? C.navy : C.muted,
                    fontWeight: activeFilter === f ? 600 : 400,
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Daily briefing — ultra minimal */}
          <div className="mb-4 px-3 py-3 rounded-lg" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-medium" style={{ color: C.muted }}>Today's focus</span>
              <span className="text-[11px]" style={{ color: C.muted }}>Oct 24</span>
            </div>
            <p className="text-sm font-semibold mb-3 leading-snug" style={{ color: C.text }}>Q4 Security Protocols</p>
            <div className="h-px w-full" style={{ background: C.hairline }}>
              <div className="h-px transition-all" style={{ width: "68%", background: C.navy }} />
            </div>
            <p className="text-[11px] mt-1.5 text-right" style={{ color: C.muted }}>68%</p>
          </div>

          {/* AI hint */}
          <div className="px-3 py-3 rounded-lg" style={{ background: C.navyFaint }}>
            <p className="text-xs font-semibold mb-1" style={{ color: C.navy }}>Suggestion</p>
            <p className="text-xs leading-relaxed" style={{ color: C.muted }}>2 urgent approvals need your attention to unblock Logistics.</p>
          </div>
        </div>

        <div className="mt-auto p-5 border-t" style={{ borderColor: C.hairline }}>
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704d" />
              <AvatarFallback style={{ background: C.navyFaint, color: C.navy, fontSize: 11 }}>AK</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold truncate" style={{ color: C.text }}>Ahmed Kamal</p>
              <p className="text-xs truncate" style={{ color: C.muted }}>Country Director</p>
            </div>
            <button style={{ color: C.muted }}><Settings className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      {/* CENTER */}
      <main className="w-1/2 flex flex-col h-full border-r" style={{ borderColor: C.hairline, background: C.bg }}>
        <header className="h-16 border-b flex items-center justify-between px-6 shrink-0" style={{ borderColor: C.hairline }}>
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold" style={{ color: C.text }}>Priority Matrix</h1>
            <span className="text-xs" style={{ color: C.muted }}>Eisenhower Method</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: C.sidebar, border: `1px solid ${C.hairline}` }}>
              {["My View", "Org View"].map((v, i) => (
                <button key={v} onClick={() => setOrgView(i === 1)}
                  className="text-xs px-3 py-1 rounded-md transition-all"
                  style={{
                    background: (orgView ? i === 1 : i === 0) ? C.bg : "transparent",
                    color: (orgView ? i === 1 : i === 0) ? C.navy : C.muted,
                    fontWeight: (orgView ? i === 1 : i === 0) ? 600 : 400,
                    boxShadow: (orgView ? i === 1 : i === 0) ? `0 1px 3px ${C.hairline}` : "none",
                  }}>
                  {v}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-lg font-medium transition-all" style={{ background: C.navy, color: "#fff" }}>
              <Plus className="h-3.5 w-3.5" />Add Task
            </button>
          </div>
        </header>

        <div className="px-6 py-2.5 border-b shrink-0 flex items-center" style={{ borderColor: C.hairline }}>
          <p className="text-xs flex items-center gap-1.5" style={{ color: C.muted }}>
            <GripVertical className="h-3.5 w-3.5 opacity-40" />
            Drag tasks between quadrants to reprioritize
          </p>
        </div>

        <div className="flex-1 p-5 overflow-hidden">
          <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
            {QUADRANTS.map((q, qi) => (
              <div key={q.key} className="flex flex-col overflow-hidden rounded-xl" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
                {/* Quadrant header — minimal */}
                <div className="px-4 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: C.hairline }}>
                  <div className="flex items-center gap-2.5">
                    {/* Tiny quadrant indicator */}
                    <div className="grid grid-cols-2 gap-0.5 w-4 h-4">
                      {[0, 1, 2, 3].map(i => (
                        <div key={i} className="rounded-[1px]" style={{ background: i === qi ? C.navy : C.hairline }} />
                      ))}
                    </div>
                    <div>
                      <p className="text-xs font-semibold" style={{ color: C.text }}>{q.label}</p>
                    </div>
                  </div>
                  <p className="text-[11px]" style={{ color: C.muted }}>{q.sub}</p>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-1.5">
                    {(MOCK_TASKS[q.key] as any[]).map((task: any) => (
                      <CrystalCard key={task.id} task={task} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* RIGHT PANEL */}
      <aside className="w-[30%] min-w-[300px] flex flex-col h-full" style={{ background: C.sidebar }}>
        <header className="h-16 border-b flex items-center justify-end px-6 shrink-0" style={{ borderColor: C.hairline, background: C.bg }}>
          <button className="relative p-2 rounded-lg transition-all hover:bg-slate-50" style={{ color: C.muted }}>
            <Bell className="h-4.5 w-4.5" />
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-red-500" />
          </button>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-7">

            {/* Calendar — borderless, just spacing */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: C.text }}>October 2024</h3>
                <div className="flex gap-0.5">
                  <button className="p-1 rounded transition-all" style={{ color: C.muted }}><ChevronLeft className="h-3.5 w-3.5" /></button>
                  <button className="p-1 rounded transition-all" style={{ color: C.muted }}><ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <div className="rounded-xl p-3" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
                <div className="grid grid-cols-7 text-center text-[11px] font-medium mb-2" style={{ color: C.muted }}>
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 text-center text-xs gap-y-1">
                  <div className="py-1.5" style={{ color: C.hairline }}>29</div>
                  <div className="py-1.5" style={{ color: C.hairline }}>30</div>
                  {[...Array(31)].map((_, i) => {
                    const day = i + 1;
                    const isToday = day === 24;
                    const hasTask = [3, 8, 12, 15, 20, 24, 28].includes(day);
                    return (
                      <div key={day} className="py-1.5 relative flex justify-center">
                        <span className="h-6 w-6 flex items-center justify-center rounded-full text-xs cursor-pointer transition-all"
                          style={isToday ? { background: C.navy, color: "#fff", fontWeight: 600 } : { color: C.text }}>
                          {day}
                        </span>
                        {hasTask && !isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full" style={{ background: C.navy, opacity: 0.3 }} />}
                        {hasTask && isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-white" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Agenda — very stripped */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold" style={{ color: C.text }}>Today's Agenda</h3>
                <span className="text-xs" style={{ color: C.muted }}>4 items</span>
              </div>
              <div className="space-y-px">
                {AGENDA.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-4 py-2.5 px-1 transition-all group cursor-pointer"
                    style={{ borderBottom: i < AGENDA.length - 1 ? `1px solid ${C.hairline}` : "none" }}>
                    <span className="text-xs font-mono font-semibold w-12 shrink-0 tabular-nums" style={{ color: C.navy }}>{item.time}</span>
                    <p className="text-xs flex-1 truncate" style={{ color: C.text }}>{item.title}</p>
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.type === "meeting" ? C.navy : C.muted, opacity: 0.5 }} />
                  </div>
                ))}
              </div>
            </section>

            {/* Invitation */}
            <section>
              <h3 className="text-sm font-semibold mb-3" style={{ color: C.text }}>Pending Invitations</h3>
              <div className="rounded-xl p-4" style={{ background: C.bg, border: `1px solid ${C.hairline}` }}>
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704c" />
                    <AvatarFallback style={{ background: C.navyFaint, color: C.navy, fontSize: 11 }}>SJ</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-xs mb-0.5" style={{ color: C.muted }}><span className="font-semibold" style={{ color: C.text }}>Sarah Jenkins</span> invited you</p>
                    <p className="text-sm font-semibold mb-1" style={{ color: C.text }}>Review Q3 Grant Proposal</p>
                    <p className="text-xs mb-3" style={{ color: C.muted }}>Due Oct 28</p>
                    <div className="flex gap-2">
                      <button className="flex-1 text-xs py-2 rounded-lg font-semibold transition-all" style={{ background: C.navy, color: "#fff" }}>Accept</button>
                      <button className="flex-1 text-xs py-2 rounded-lg font-semibold transition-all" style={{ border: `1px solid ${C.hairline}`, color: C.muted }}>Decline</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Integration */}
            <div className="rounded-xl p-4 flex gap-3" style={{ background: C.navyFaint, border: `1px solid ${C.navy}18` }}>
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: C.navy, opacity: 0.6 }} />
              <div>
                <h4 className="text-xs font-semibold mb-1" style={{ color: C.navy }}>Connect PACT Email</h4>
                <p className="text-xs leading-relaxed mb-3" style={{ color: C.muted }}>Link your Exchange account to sync meetings and email tasks.</p>
                <button className="text-xs font-semibold py-1.5 px-3 rounded-lg w-full transition-all" style={{ background: C.navy, color: "#fff" }}>
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

function CrystalCard({ task }: { task: any }) {
  const C = { text: "#1a1f2e", muted: "#94a3b8", hairline: "#e8ecf2", navy: "#0F2041" };
  const dotColors: Record<string, string> = { Urgent: "#ef4444", High: "#f97316", Medium: "#3b82f6", Low: "#94a3b8" };
  return (
    <div
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg cursor-grab group transition-all"
      style={{ border: `1px solid transparent` }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = C.hairline)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "transparent")}
    >
      {/* Priority dot */}
      {task.priority && (
        <div className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dotColors[task.priority] || C.muted }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-snug mb-1" style={{ color: C.text }}>{task.title}</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px]" style={{ color: C.muted }}>{task.project}</span>
          {task.due && <span className="text-[10px]" style={{ color: C.muted }}>· {task.due}</span>}
          {task.assignee && <span className="text-[10px]" style={{ color: C.muted }}>· {task.assignee}</span>}
          {task.note && <span className="text-[10px] italic" style={{ color: C.muted }}>{task.note}</span>}
        </div>
      </div>
      <button className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" style={{ color: C.muted }}>
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
