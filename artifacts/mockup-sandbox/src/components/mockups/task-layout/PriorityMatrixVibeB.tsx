/**
 * Vibe B — "Warm Workspace"
 * Emotional register: Calm, personal, grounded. Like a well-loved notebook.
 * Warm cream/sand background, terracotta accents, humanized language,
 * generous whitespace, soft rounded shapes — feels personal, not corporate.
 */
import { useState } from "react";
import {
  Search, Calendar as CalendarIcon, MoreHorizontal,
  CheckCircle2, Plus, Bell, Settings, Sparkles,
  ChevronLeft, ChevronRight, Mail, AlertCircle, GripVertical,
  UserPlus, Leaf, Heart, Coffee
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const WARM = {
  bg: "#fdf6ec",
  sidebar: "#f5ebe0",
  sidebarBorder: "#e8d5c0",
  text: "#4a3728",
  textMuted: "#9a8070",
  terracotta: "#c26b4a",
  terracottaFaint: "#fdf0eb",
  sage: "#7c9e82",
  sageFaint: "#f0f5f0",
  sand: "#d4a96a",
  sandFaint: "#fdf5e6",
  muted: "#9a8070",
  mutedFaint: "#f5f0eb",
  white: "#fffcf7",
  border: "#e8d5c0",
  cardBorder: "#e8d5c0",
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
  {
    key: "doNow" as const,
    label: "Tackle Today",
    sub: "These need your attention now",
    bg: "#fdf0eb",
    border: "#e8c4b4",
    accent: "#c26b4a",
    headerBg: "#fae8de",
  },
  {
    key: "schedule" as const,
    label: "Plan Ahead",
    sub: "Important, but not urgent yet",
    bg: "#f0f5f0",
    border: "#c0d8c4",
    accent: "#5a8a62",
    headerBg: "#e4f0e6",
  },
  {
    key: "delegate" as const,
    label: "Pass Along",
    sub: "Someone else handles this well",
    bg: "#fdf5e0",
    border: "#e0c880",
    accent: "#a07830",
    headerBg: "#f8eccc",
  },
  {
    key: "eliminate" as const,
    label: "Let It Go",
    sub: "Not worth the energy right now",
    bg: "#f5f0eb",
    border: "#d8ccc0",
    accent: "#9a8070",
    headerBg: "#ede6df",
  },
];

export function PriorityMatrixVibeB() {
  const [activeFilter, setActiveFilter] = useState("Mine");
  const [orgView, setOrgView] = useState(false);

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: WARM.bg, color: WARM.text, fontFamily: "'Georgia', 'Times New Roman', serif" }}>

      {/* LEFT SIDEBAR */}
      <aside className="w-1/5 min-w-[260px] flex flex-col h-full border-r" style={{ borderColor: WARM.sidebarBorder, background: WARM.sidebar }}>
        <div className="p-5 border-b" style={{ borderColor: WARM.sidebarBorder }}>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-7">
            <div className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-base" style={{ background: WARM.terracotta, color: WARM.white }}>P</div>
            <span className="font-bold text-base tracking-tight" style={{ color: WARM.text }}>PACT</span>
          </div>

          {/* Search */}
          <div className="relative mb-5">
            <Search className="absolute left-3 top-2.5 h-4 w-4" style={{ color: WARM.textMuted }} />
            <input
              placeholder="Find a task…"
              className="w-full text-sm pl-9 pr-3 py-2 rounded-xl outline-none"
              style={{ background: WARM.white, border: `1px solid ${WARM.border}`, color: WARM.text }}
            />
          </div>

          {/* Filters */}
          <div className="mb-5">
            <p className="text-xs font-semibold mb-2" style={{ color: WARM.textMuted }}>Show me</p>
            <div className="flex flex-wrap gap-1.5">
              {["All", "Mine", "Team", "Overdue"].map(f => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className="text-xs px-3 py-1 rounded-full transition-all"
                  style={{
                    background: activeFilter === f ? WARM.terracotta : WARM.white,
                    color: activeFilter === f ? WARM.white : WARM.textMuted,
                    border: `1px solid ${activeFilter === f ? WARM.terracotta : WARM.border}`,
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Daily briefing */}
          <div className="mb-3 p-4 rounded-2xl" style={{ background: WARM.white, border: `1px solid ${WARM.border}` }}>
            <div className="flex justify-between items-start mb-1.5">
              <span className="text-xs font-semibold" style={{ color: WARM.text }}>Today's focus</span>
              <span className="text-xs" style={{ color: WARM.textMuted }}>Oct 24</span>
            </div>
            <p className="text-sm font-semibold mb-3 leading-snug" style={{ color: WARM.text }}>Finalize Q4 Security Protocols</p>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: WARM.textMuted }}>
              <span>Progress</span><span style={{ color: WARM.terracotta, fontWeight: 600 }}>68%</span>
            </div>
            <div className="h-2 rounded-full" style={{ background: WARM.terracottaFaint }}>
              <div className="h-full rounded-full transition-all" style={{ width: "68%", background: WARM.terracotta }} />
            </div>
          </div>

          {/* AI hint */}
          <button className="w-full p-3.5 rounded-2xl flex items-start gap-3 transition-all text-left" style={{ background: WARM.terracottaFaint, border: `1px solid #e8c4b4` }}>
            <Coffee className="h-4 w-4 shrink-0 mt-0.5" style={{ color: WARM.terracotta }} />
            <div>
              <p className="text-sm font-semibold mb-0.5" style={{ color: WARM.terracotta }}>Heads up</p>
              <p className="text-xs leading-relaxed" style={{ color: WARM.text }}>You have 2 urgent approvals pending. Take care of those first.</p>
            </div>
          </button>
        </div>

        <div className="mt-auto p-5 border-t" style={{ borderColor: WARM.sidebarBorder }}>
          <div className="flex items-center gap-3">
            <Avatar className="h-9 w-9">
              <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704d" />
              <AvatarFallback style={{ background: WARM.terracottaFaint, color: WARM.terracotta, fontSize: 12 }}>AK</AvatarFallback>
            </Avatar>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold truncate" style={{ color: WARM.text }}>Ahmed Kamal</p>
              <p className="text-xs truncate" style={{ color: WARM.textMuted }}>Country Director</p>
            </div>
            <button style={{ color: WARM.textMuted }}><Settings className="h-4 w-4" /></button>
          </div>
        </div>
      </aside>

      {/* CENTER */}
      <main className="w-1/2 flex flex-col h-full border-r" style={{ borderColor: WARM.border, background: WARM.bg }}>
        <header className="h-16 border-b flex items-center justify-between px-6 shrink-0" style={{ borderColor: WARM.border, background: WARM.white }}>
          <div className="flex items-center gap-3">
            <h1 className="text-base font-bold" style={{ color: WARM.text }}>Priority Matrix</h1>
            <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: WARM.mutedFaint, color: WARM.textMuted, border: `1px solid ${WARM.border}` }}>Eisenhower Method</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex rounded-full overflow-hidden border" style={{ borderColor: WARM.border }}>
              {["My View", "Org View"].map((v, i) => (
                <button key={v} onClick={() => setOrgView(i === 1)}
                  className="text-xs px-3 py-1 transition-all"
                  style={{ background: (orgView ? i === 1 : i === 0) ? WARM.terracotta : WARM.white, color: (orgView ? i === 1 : i === 0) ? WARM.white : WARM.textMuted }}>
                  {v}
                </button>
              ))}
            </div>
            <button className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-full transition-all font-semibold" style={{ background: WARM.terracotta, color: WARM.white }}>
              <Plus className="h-3.5 w-3.5" />Add task
            </button>
          </div>
        </header>

        <div className="px-6 py-2.5 border-b shrink-0" style={{ borderColor: WARM.border, background: WARM.bg }}>
          <div className="flex items-center gap-2 text-xs rounded-full px-3 py-1.5 w-fit" style={{ background: WARM.white, border: `1px dashed ${WARM.border}`, color: WARM.textMuted }}>
            <GripVertical className="h-3.5 w-3.5 opacity-50" />
            Drag tasks between sections to reprioritize
          </div>
        </div>

        <div className="flex-1 p-4 overflow-hidden">
          <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
            {QUADRANTS.map(q => (
              <div key={q.key} className="flex flex-col overflow-hidden rounded-2xl" style={{ background: q.bg, border: `1px solid ${q.border}` }}>
                <div className="px-4 py-3 border-b flex items-center justify-between shrink-0 rounded-t-2xl" style={{ borderColor: q.border, background: q.headerBg }}>
                  <div>
                    <p className="text-sm font-bold" style={{ color: q.accent }}>{q.label}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: WARM.textMuted }}>{q.sub}</p>
                  </div>
                  <span className="text-lg" aria-hidden>
                    {q.key === "doNow" ? "🔴" : q.key === "schedule" ? "📅" : q.key === "delegate" ? "🤝" : "💨"}
                  </span>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-2.5">
                    {(MOCK_TASKS[q.key] as any[]).map((task: any) => (
                      <WarmCard key={task.id} task={task} accent={q.accent} bg={q.bg} border={q.border} />
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* RIGHT PANEL */}
      <aside className="w-[30%] min-w-[300px] flex flex-col h-full" style={{ background: WARM.sidebar }}>
        <header className="h-16 border-b flex items-center justify-end px-6 shrink-0" style={{ borderColor: WARM.sidebarBorder, background: WARM.white }}>
          <button className="relative p-2 rounded-full transition-all hover:bg-amber-50" style={{ color: WARM.textMuted }}>
            <Bell className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-400 ring-2" style={{ ringColor: WARM.white }} />
          </button>
        </header>

        <ScrollArea className="flex-1">
          <div className="p-5 space-y-7">

            {/* Calendar */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold" style={{ color: WARM.text }}>October 2024</h3>
                <div className="flex gap-1">
                  <button className="p-1 rounded-full transition-all" style={{ color: WARM.textMuted }}><ChevronLeft className="h-4 w-4" /></button>
                  <button className="p-1 rounded-full transition-all" style={{ color: WARM.textMuted }}><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: WARM.white, border: `1px solid ${WARM.border}` }}>
                <div className="grid grid-cols-7 text-center text-xs font-medium mb-2" style={{ color: WARM.textMuted }}>
                  {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7 text-center text-sm gap-y-1">
                  <div className="py-1" style={{ color: WARM.border }}>29</div>
                  <div className="py-1" style={{ color: WARM.border }}>30</div>
                  {[...Array(31)].map((_, i) => {
                    const day = i + 1;
                    const isToday = day === 24;
                    const hasTask = [3, 8, 12, 15, 20, 24, 28].includes(day);
                    return (
                      <div key={day} className="py-1 relative flex justify-center">
                        <span className="h-7 w-7 flex items-center justify-center rounded-full text-sm cursor-pointer transition-all"
                          style={isToday ? { background: WARM.terracotta, color: WARM.white, fontWeight: 700 } : { color: WARM.text }}>
                          {day}
                        </span>
                        {hasTask && !isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full" style={{ background: WARM.sage }} />}
                        {hasTask && isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-white" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Today's Agenda */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold" style={{ color: WARM.text }}>Today's Agenda</h3>
                <span className="text-xs" style={{ color: WARM.textMuted }}>4 items</span>
              </div>
              <div className="space-y-2.5">
                {AGENDA.map(item => (
                  <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl transition-all" style={{ background: WARM.white, border: `1px solid ${WARM.border}` }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: item.type === "meeting" ? WARM.terracottaFaint : WARM.sageFaint }}>
                      {item.type === "meeting"
                        ? <UserPlus className="h-3.5 w-3.5" style={{ color: WARM.terracotta }} />
                        : <CheckCircle2 className="h-3.5 w-3.5" style={{ color: WARM.sage }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-semibold block" style={{ color: WARM.terracotta }}>{item.time}</span>
                      <p className="text-sm truncate" style={{ color: WARM.text }}>{item.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Invitation */}
            <section>
              <h3 className="text-sm font-bold mb-4" style={{ color: WARM.text }}>Pending Invitations</h3>
              <div className="p-4 rounded-2xl" style={{ background: WARM.white, border: `1px solid ${WARM.border}` }}>
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="https://i.pravatar.cc/150?u=a042581f4e29026704c" />
                    <AvatarFallback style={{ background: WARM.sageFaint, color: WARM.sage, fontSize: 11 }}>SJ</AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-sm mb-0.5" style={{ color: WARM.text }}><span className="font-semibold">Sarah Jenkins</span> invited you:</p>
                    <p className="text-sm font-bold mb-1" style={{ color: WARM.text }}>Review Q3 Grant Proposal</p>
                    <p className="text-xs mb-3" style={{ color: WARM.textMuted }}>Due Oct 28</p>
                    <div className="flex gap-2">
                      <button className="flex-1 text-sm py-2 rounded-xl font-semibold transition-all" style={{ background: WARM.terracotta, color: WARM.white }}>Accept</button>
                      <button className="flex-1 text-sm py-2 rounded-xl font-semibold transition-all" style={{ background: WARM.white, color: WARM.textMuted, border: `1px solid ${WARM.border}` }}>Decline</button>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Integration */}
            <div className="p-4 rounded-2xl flex gap-3" style={{ background: WARM.sandFaint, border: `1px solid #e0c880` }}>
              <Leaf className="h-5 w-5 shrink-0 mt-0.5" style={{ color: WARM.sand }} />
              <div>
                <h4 className="text-sm font-bold mb-1" style={{ color: WARM.text }}>Connect PACT Email</h4>
                <p className="text-xs mb-3 leading-relaxed" style={{ color: WARM.textMuted }}>Link your Exchange account to sync meetings and tasks automatically.</p>
                <button className="text-sm font-semibold py-2 w-full rounded-xl transition-all" style={{ background: WARM.sand, color: WARM.white }}>
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

function WarmCard({ task, accent, bg, border }: { task: any; accent: string; bg: string; border: string }) {
  const WARM = { text: "#4a3728", textMuted: "#9a8070", white: "#fffcf7" };
  return (
    <div className="p-3 rounded-xl cursor-grab group transition-all" style={{ background: WARM.white, border: `1px solid ${border}` }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: WARM.textMuted }}>{task.project}</span>
            {task.priority && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: accent + "22", color: accent }}>
                {task.priority}
              </span>
            )}
          </div>
          <p className="text-sm leading-snug" style={{ color: WARM.text }}>{task.title}</p>
        </div>
        <button className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: WARM.textMuted }}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
      <div className="flex items-center justify-between text-xs" style={{ color: WARM.textMuted }}>
        <div className="flex items-center gap-1">
          {task.due && <><CalendarIcon className="h-3 w-3" /><span>{task.due}</span></>}
          {task.note && <span className="italic">{task.note}</span>}
        </div>
        {task.assignee && (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: accent + "15", color: accent }}>{task.assignee}</span>
        )}
      </div>
    </div>
  );
}
